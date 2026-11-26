"""Fixed A/B comparison runner for the TianBao companion agent.

Only the four server-side groups below can be requested.  The browser cannot
choose a model path, upstream URL, persona, generation parameters, or target
module.  A and B use separate model clients and receive independently built
message lists; no model's reply is ever inserted into the other model's
prompt.  The comparison route is stateless and uses only the explicitly
supplied history plus one shared emotion snapshot.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

from backend.llm_client import LLMClientError, MiniCPMClient
from core.prompt_builder import (
    build_companion_messages,
    build_messages_from_feedback,
)
from core.response_guard import is_valid_chat_reply, process_model_reply


COMPARE_A_BASE_URL = "http://127.0.0.1:8025"
COMPARE_B_BASE_URL = "http://127.0.0.1:8026"
COMPARE_A_MODEL = "minicpm-o-4_5"
COMPARE_B_MODEL = "tianbao-personality-v4"
COMPARE_B_CONTROL_MODEL = "minicpm-o-4_5"
COMPARE_MAX_TOKENS = 256
COMPARE_MAX_CONTEXT_TOKENS = 2048
COMPARE_TEMPERATURE = 0.0
COMPARE_HISTORY_MESSAGES = 6
COMPARE_MAX_TEXT_LENGTH = 500

COMPARE_BASE_SYSTEM_PROMPT = (
    "请用自然、简洁的中文回复。"
    "不要编造自己未获得的感知、记忆、身份识别或执行权限。"
)

COMPARE_SERVICE_FALLBACK_REPLY = (
    "主人，我现在有点连不上自己的小脑袋，等一会儿再陪我聊聊好吗？"
)

# Fixed server-side mapping.  "mode" selects the prompt profile, not a model.
COMPARE_GROUPS = {
    "A1": {"client": "A", "mode": "base", "model": COMPARE_A_MODEL},
    "A2": {"client": "A", "mode": "agent", "model": COMPARE_A_MODEL},
    "B1": {"client": "B", "mode": "base", "model": COMPARE_B_MODEL},
    "B2": {"client": "B", "mode": "agent", "model": COMPARE_B_MODEL},
}
# Extra control group: same B service and generation settings, but the base
# model without the adapter.  It is not one of the required A1/A2/B1/B2 groups.
COMPARE_CONTROL_GROUPS = {
    "B0": {
        "client": "B_CONTROL",
        "mode": "base",
        "model": COMPARE_B_CONTROL_MODEL,
    },
}
ALL_COMPARE_GROUPS = {**COMPARE_GROUPS, **COMPARE_CONTROL_GROUPS}
DEFAULT_COMPARE_GROUPS = ("A1", "A2", "B1", "B2")


def _new_client(base_url, model):
    return MiniCPMClient(
        base_url=base_url,
        model=model,
        temperature=COMPARE_TEMPERATURE,
        max_tokens=COMPARE_MAX_TOKENS,
        max_context_tokens=COMPARE_MAX_CONTEXT_TOKENS,
    )


def _normalise_usage(usage):
    if not isinstance(usage, dict):
        return None

    def token_count(value):
        if type(value) is int and value >= 0:
            return value
        return None

    return {
        "prompt_tokens": token_count(usage.get("prompt_tokens")),
        "completion_tokens": token_count(usage.get("completion_tokens")),
    }


def _elapsed_ms(started):
    return max(0, int(round((time.perf_counter() - started) * 1000)))


def normalise_compare_history(raw_history):
    """Validate the one explicit history used by every comparison group.

    Accepts only user/assistant turns.  System messages, unknown fields, and
    non-text content are rejected instead of being silently passed through.
    """
    if raw_history is None:
        return []
    if not isinstance(raw_history, list):
        raise ValueError("history 必须是数组.")
    if len(raw_history) > 12:
        raise ValueError("history 最多 12 条消息.")

    cleaned = []
    total_chars = 0
    for message in raw_history:
        if not isinstance(message, dict):
            raise ValueError("history 中每条消息必须是对象.")
        role = message.get("role")
        content = message.get("content")
        if role not in {"user", "assistant"}:
            raise ValueError("history 只允许 user/assistant 消息.")
        if not isinstance(content, str):
            raise ValueError("history 消息内容必须是字符串.")
        content = content.strip()
        if not content:
            raise ValueError("history 消息内容不能为空.")
        if len(content) > COMPARE_MAX_TEXT_LENGTH:
            raise ValueError(
                f"history 单条消息最长 {COMPARE_MAX_TEXT_LENGTH} 个字符."
            )
        total_chars += len(content)
        if total_chars > 3000:
            raise ValueError("history 总长度超过 3000 个字符.")
        cleaned.append({"role": role, "content": content})
    return cleaned


@dataclass
class ComparisonResult:
    group: str
    service: str
    model: str
    mode: str
    reply: str
    guard_passed: bool
    fallback: bool
    truncated: bool
    complete: bool
    finish_reason: str | None
    usage: dict | None
    latency_ms: int
    error: str | None = None

    def as_dict(self):
        return {
            "group": self.group,
            "service": self.service,
            "model": self.model,
            "mode": self.mode,
            "reply": self.reply,
            "guard_passed": self.guard_passed,
            "fallback": self.fallback,
            "truncated": self.truncated,
            "complete": self.complete,
            "finish_reason": self.finish_reason,
            "usage": self.usage,
            "latency_ms": self.latency_ms,
            "error": self.error,
        }


class AgentComparisonRunner:
    """Run fixed A/B groups against one shared feedback snapshot."""

    def __init__(
        self,
        *,
        persona,
        base_system_prompt=COMPARE_BASE_SYSTEM_PROMPT,
        clients=None,
        groups=ALL_COMPARE_GROUPS,
    ):
        self.persona = persona
        self.base_system_prompt = base_system_prompt
        self.clients = clients or {
            "A": _new_client(COMPARE_A_BASE_URL, COMPARE_A_MODEL),
            "B": _new_client(COMPARE_B_BASE_URL, COMPARE_B_MODEL),
            "B_CONTROL": _new_client(
                COMPARE_B_BASE_URL, COMPARE_B_CONTROL_MODEL
            ),
        }
        self.groups = dict(groups)

    def build_messages(self, group, text, history, feedback):
        spec = self.groups[group]
        if spec["mode"] == "base":
            # Neutral prompt profile.  It deliberately contains no TianBao
            # persona or state-derived expression instruction.
            return build_companion_messages(
                self.base_system_prompt,
                "",
                text,
                history,
                max_history_messages=COMPARE_HISTORY_MESSAGES,
            )
        if spec["mode"] == "agent":
            return build_messages_from_feedback(
                self.persona,
                feedback,
                text,
                history,
                max_history_messages=COMPARE_HISTORY_MESSAGES,
            )
        raise ValueError(f"未知比较模式: {spec['mode']}")

    def run_group(self, group, text, history, feedback):
        spec = self.groups[group]
        started = time.perf_counter()
        messages = self.build_messages(group, text, history, feedback)
        try:
            result = self.clients[spec["client"]].chat(messages)
        except LLMClientError as error:
            latency_ms = (
                error.elapsed_ms
                if isinstance(error.elapsed_ms, (int, float))
                else _elapsed_ms(started)
            )
            return ComparisonResult(
                group=group,
                service=spec["client"],
                model=spec["model"],
                mode=spec["mode"],
                reply=COMPARE_SERVICE_FALLBACK_REPLY,
                guard_passed=False,
                fallback=True,
                truncated=False,
                complete=False,
                finish_reason=None,
                usage=None,
                latency_ms=max(0, int(latency_ms or 0)),
                error=f"model_{error.code}",
            )
        except Exception as error:  # defensive: never expose raw exception text
            return ComparisonResult(
                group=group,
                service=spec["client"],
                model=spec["model"],
                mode=spec["mode"],
                reply=COMPARE_SERVICE_FALLBACK_REPLY,
                guard_passed=False,
                fallback=True,
                truncated=False,
                complete=False,
                finish_reason=None,
                usage=None,
                latency_ms=_elapsed_ms(started),
                error=f"client_error_{type(error).__name__}",
            )

        raw_reply = getattr(result, "reply", None)
        latency_ms = getattr(result, "latency_ms", None)
        usage = _normalise_usage(getattr(result, "usage", None))
        finish_reason = getattr(result, "finish_reason", None)
        if not isinstance(finish_reason, str):
            finish_reason = None
        if not isinstance(latency_ms, (int, float)) or latency_ms < 0:
            latency_ms = _elapsed_ms(started)
        else:
            latency_ms = max(0, int(round(latency_ms)))

        if not isinstance(raw_reply, str):
            return ComparisonResult(
                group=group,
                service=spec["client"],
                model=spec["model"],
                mode=spec["mode"],
                reply=COMPARE_SERVICE_FALLBACK_REPLY,
                guard_passed=False,
                fallback=True,
                truncated=False,
                complete=False,
                finish_reason=finish_reason,
                usage=usage,
                latency_ms=latency_ms,
                error="invalid_model_response",
            )

        guard_passed = is_valid_chat_reply(raw_reply)
        safe_reply = process_model_reply(raw_reply)
        truncated = finish_reason == "length"
        fallback = not guard_passed
        if not guard_passed:
            error = "invalid_model_reply"
        elif truncated:
            error = "finish_reason_length"
        else:
            error = None

        return ComparisonResult(
            group=group,
            service=spec["client"],
            model=spec["model"],
            mode=spec["mode"],
            reply=safe_reply,
            guard_passed=guard_passed,
            fallback=fallback,
            truncated=truncated,
            complete=guard_passed and not truncated,
            finish_reason=finish_reason,
            usage=usage,
            latency_ms=latency_ms,
            error=error,
        )

    def run(self, text, history, feedback, groups=None):
        selected = tuple(groups or DEFAULT_COMPARE_GROUPS)
        if not selected:
            raise ValueError("至少选择一个比较组.")
        if len(set(selected)) != len(selected):
            raise ValueError("比较组不能重复.")
        unknown = [group for group in selected if group not in self.groups]
        if unknown:
            raise ValueError(f"未知比较组: {', '.join(unknown)}")

        started = time.perf_counter()
        results = [
            self.run_group(group, text, history, feedback).as_dict()
            for group in selected
        ]
        summary = {
            "groups": len(results),
            "guard_passed": sum(1 for item in results if item["guard_passed"]),
            "fallback": sum(1 for item in results if item["fallback"]),
            "truncated": sum(1 for item in results if item["truncated"]),
            "complete": sum(1 for item in results if item["complete"]),
            "errors": sum(1 for item in results if item["error"]),
        }
        return {
            "results": results,
            "summary": summary,
            "elapsed_ms": _elapsed_ms(started),
        }
