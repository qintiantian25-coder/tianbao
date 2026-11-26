"""Local MiniCPM-o chat client.

The browser never talks to the model service directly. The Flask app calls a
fixed, server-configured local endpoint; request JSON cannot choose the model
URL, model id, system prompt, or sampling parameters.

The client deliberately uses ``http.client`` rather than urllib so:

- system ``http_proxy`` / ``https_proxy`` settings are not used;
- connection and response-read socket timeouts are configured separately.

Only metadata (latency, token usage, finish reason, safe error code) is logged.
Prompt text and model replies are never written to ordinary logs.
"""

from __future__ import annotations

import http.client
import json
import logging
import os
import socket
import time
from dataclasses import dataclass
from urllib.parse import urlsplit


DEFAULT_BASE_URL = "http://127.0.0.1:8025"
DEFAULT_MODEL = "minicpm-o-4_5"
CHAT_COMPLETIONS_PATH = "/v1/chat/completions"
DEFAULT_TEMPERATURE = 0.7
DEFAULT_MAX_TOKENS = 256
DEFAULT_MAX_CONTEXT_TOKENS = 2048
DEFAULT_CONNECT_TIMEOUT = 3.0
DEFAULT_REQUEST_TIMEOUT = 30.0


def _env_float(name, default):
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return default
    return value if value > 0 else default


def _env_int(name, default):
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return default
    return value if value > 0 else default


LLM_BASE_URL = (
    os.environ.get("TIANBAO_LLM_BASE") or DEFAULT_BASE_URL
).strip().rstrip("/")
LLM_MODEL = (
    os.environ.get("TIANBAO_LLM_MODEL") or DEFAULT_MODEL
).strip()
LLM_TEMPERATURE = _env_float("TIANBAO_LLM_TEMPERATURE", DEFAULT_TEMPERATURE)
LLM_MAX_TOKENS = _env_int("TIANBAO_LLM_MAX_TOKENS", DEFAULT_MAX_TOKENS)
LLM_MAX_CONTEXT_TOKENS = _env_int(
    "TIANBAO_LLM_MAX_CONTEXT_TOKENS", DEFAULT_MAX_CONTEXT_TOKENS
)
LLM_CONNECT_TIMEOUT = _env_float(
    "TIANBAO_LLM_CONNECT_TIMEOUT", DEFAULT_CONNECT_TIMEOUT
)
LLM_REQUEST_TIMEOUT = _env_float(
    "TIANBAO_LLM_REQUEST_TIMEOUT", DEFAULT_REQUEST_TIMEOUT
)

_LOGGER = logging.getLogger("tianbao.llm")


class LLMClientError(Exception):
    """A model communication error that is safe to map to a user-facing code."""

    def __init__(self, code, *, upstream_status=None, elapsed_ms=None):
        super().__init__(code)
        self.code = code
        self.upstream_status = upstream_status
        self.elapsed_ms = elapsed_ms


@dataclass(frozen=True)
class LLMResult:
    """Parsed successful model response plus observability metadata."""

    reply: str
    latency_ms: int
    usage: dict
    finish_reason: str | None = None


def _coerce_token_count(value):
    if type(value) is int and value >= 0:
        return value
    if isinstance(value, float) and value.is_integer() and value >= 0:
        return int(value)
    return None


def _body_suggests_context_overflow(raw_body):
    """Detect common context-length errors without retaining/returning content."""
    if not raw_body:
        return False
    try:
        text = raw_body[:8192].decode("utf-8", errors="replace").lower()
    except Exception:  # pragma: no cover - defensive only
        return False
    markers = (
        "context length",
        "context_length",
        "maximum context",
        "max context",
        "too many tokens",
        "token limit",
        "prompt is too long",
        "input is too long",
        "上下文",
    )
    return any(marker in text for marker in markers)


class MiniCPMClient:
    """Small OpenAI-compatible client for the fixed local MiniCPM service."""

    def __init__(
        self,
        *,
        base_url=None,
        model=None,
        temperature=None,
        max_tokens=None,
        max_context_tokens=None,
        connect_timeout=None,
        request_timeout=None,
        transport=None,
    ):
        self.base_url = (base_url or LLM_BASE_URL).strip().rstrip("/")
        self.model = (model or LLM_MODEL).strip()
        self.temperature = (
            DEFAULT_TEMPERATURE if temperature is None else float(temperature)
        )
        self.max_tokens = (
            DEFAULT_MAX_TOKENS if max_tokens is None else int(max_tokens)
        )
        self.max_context_tokens = (
            DEFAULT_MAX_CONTEXT_TOKENS
            if max_context_tokens is None
            else int(max_context_tokens)
        )
        self.connect_timeout = (
            DEFAULT_CONNECT_TIMEOUT
            if connect_timeout is None
            else float(connect_timeout)
        )
        self.request_timeout = (
            DEFAULT_REQUEST_TIMEOUT
            if request_timeout is None
            else float(request_timeout)
        )
        if not self.model:
            raise ValueError("MiniCPM model id must not be empty.")

        parsed = urlsplit(self.base_url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ValueError("MiniCPM base URL must be a fixed http(s) URL.")
        self._scheme = parsed.scheme
        self._host = parsed.hostname
        self._port = parsed.port or (443 if parsed.scheme == "https" else 80)
        self._path = (parsed.path.rstrip("/") or "") + CHAT_COMPLETIONS_PATH
        # Optional test seam. A transport receives (payload, connect_timeout,
        # request_timeout) and returns (status, raw_body).
        self._transport = transport

    def _build_payload(self, messages):
        return {
            "model": self.model,
            "messages": messages,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "stream": False,
            # This is the parameter verified against the local service.
            "chat_template_kwargs": {"enable_thinking": False},
        }

    def _estimated_prompt_tokens(self, messages):
        """Conservative character-based upper bound; no external tokenizer."""
        total = 0
        for message in messages:
            if not isinstance(message, dict):
                return self.max_context_tokens + 1
            text = message.get("content", "")
            if not isinstance(text, str):
                return self.max_context_tokens + 1
            total += len(text) + 12
        return total

    def _http_post(self, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        connection_class = (
            http.client.HTTPSConnection
            if self._scheme == "https"
            else http.client.HTTPConnection
        )
        connection = connection_class(
            self._host,
            self._port,
            timeout=self.connect_timeout,
        )
        try:
            connection.connect()
            if connection.sock is not None:
                # After the connection is established, give the model a
                # separate response-read budget.
                connection.sock.settimeout(self.request_timeout)
            connection.request(
                "POST",
                self._path,
                body=body,
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
            )
            response = connection.getresponse()
            return response.status, response.read()
        finally:
            connection.close()

    def _log_failure(self, code, elapsed_ms, upstream_status=None):
        _LOGGER.warning(
            "MiniCPM chat failed code=%s upstream_status=%s latency_ms=%s model=%s",
            code,
            upstream_status,
            elapsed_ms,
            self.model,
        )

    def chat(self, messages):
        """Send messages to MiniCPM and return parsed reply + metadata.

        This method has no shared mutable state and can be called concurrently
        for different chat sessions. It never logs prompt/reply text.
        """
        if not isinstance(messages, list) or not messages:
            raise LLMClientError("invalid_messages")

        estimated = self._estimated_prompt_tokens(messages)
        # The output budget is part of the 2048-token context window.
        if estimated + self.max_tokens > self.max_context_tokens:
            raise LLMClientError("context_overflow")

        payload = self._build_payload(messages)
        started = time.perf_counter()

        try:
            if self._transport is not None:
                status, raw_body = self._transport(
                    payload,
                    self.connect_timeout,
                    self.request_timeout,
                )
            else:
                status, raw_body = self._http_post(payload)
        except LLMClientError as error:
            elapsed_ms = int(round((time.perf_counter() - started) * 1000))
            error.elapsed_ms = error.elapsed_ms or elapsed_ms
            self._log_failure(
                error.code,
                error.elapsed_ms,
                upstream_status=error.upstream_status,
            )
            raise
        except (TimeoutError, socket.timeout) as error:
            elapsed_ms = int(round((time.perf_counter() - started) * 1000))
            failure = LLMClientError("timeout", elapsed_ms=elapsed_ms)
            self._log_failure("timeout", elapsed_ms)
            raise failure from error
        except (ConnectionError, OSError, http.client.HTTPException) as error:
            elapsed_ms = int(round((time.perf_counter() - started) * 1000))
            failure = LLMClientError("unavailable", elapsed_ms=elapsed_ms)
            self._log_failure("unavailable", elapsed_ms)
            raise failure from error
        except Exception as error:  # defensive: never leak raw exception text
            elapsed_ms = int(round((time.perf_counter() - started) * 1000))
            failure = LLMClientError("client_error", elapsed_ms=elapsed_ms)
            self._log_failure("client_error", elapsed_ms)
            raise failure from error

        elapsed_ms = int(round((time.perf_counter() - started) * 1000))
        if status < 200 or status >= 300:
            code = (
                "context_overflow"
                if _body_suggests_context_overflow(raw_body)
                else "http_error"
            )
            failure = LLMClientError(
                code,
                upstream_status=status,
                elapsed_ms=elapsed_ms,
            )
            self._log_failure(code, elapsed_ms, upstream_status=status)
            raise failure

        try:
            data = json.loads(raw_body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError, AttributeError) as error:
            failure = LLMClientError("invalid_json", elapsed_ms=elapsed_ms)
            self._log_failure("invalid_json", elapsed_ms)
            raise failure from error

        if not isinstance(data, dict):
            failure = LLMClientError("invalid_response", elapsed_ms=elapsed_ms)
            self._log_failure("invalid_response", elapsed_ms)
            raise failure

        choices = data.get("choices")
        if not isinstance(choices, list) or not choices:
            failure = LLMClientError("invalid_response", elapsed_ms=elapsed_ms)
            self._log_failure("invalid_response", elapsed_ms)
            raise failure

        choice = choices[0]
        if not isinstance(choice, dict):
            failure = LLMClientError("invalid_response", elapsed_ms=elapsed_ms)
            self._log_failure("invalid_response", elapsed_ms)
            raise failure

        message = choice.get("message")
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, str):
            failure = LLMClientError("invalid_response", elapsed_ms=elapsed_ms)
            self._log_failure("invalid_response", elapsed_ms)
            raise failure

        usage_data = data.get("usage")
        if not isinstance(usage_data, dict):
            usage_data = {}
        usage = {
            "prompt_tokens": _coerce_token_count(usage_data.get("prompt_tokens")),
            "completion_tokens": _coerce_token_count(
                usage_data.get("completion_tokens")
            ),
        }

        finish_reason = choice.get("finish_reason")
        if not isinstance(finish_reason, str):
            finish_reason = None

        _LOGGER.info(
            "MiniCPM chat ok latency_ms=%s prompt_tokens=%s completion_tokens=%s finish_reason=%s model=%s",
            elapsed_ms,
            usage["prompt_tokens"],
            usage["completion_tokens"],
            finish_reason,
            self.model,
        )
        return LLMResult(
            reply=content,
            latency_ms=elapsed_ms,
            usage=usage,
            finish_reason=finish_reason,
        )
