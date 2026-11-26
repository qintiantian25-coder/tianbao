#!/usr/bin/env python3
"""Run the fixed four-group TianBao personality A/B protocol.

A1/A2 = original MiniCPM-o 4.5, base / full-agent prompt profile.
B1/B2 = V4 QLoRA adapter on GPU 1, base / full-agent prompt profile.
B0    = optional same-service no-adapter control (not a required group).

The script uses the live 8025/8026 model services through the real Flask
comparison route.  Flask is driven with its in-process test client only so the
experiment can set a deterministic robot state per case; no autonomy thread is
started.  Evaluation prompts are synthetic and were checked against the V4 SFT
user messages for exact overlap (none).
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import http.client
import json
import math
import os
import random
import re
import statistics
import subprocess
import sys
import time
from datetime import datetime, timezone
from importlib.metadata import version as pkg_version
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

import app_web  # noqa: E402
from core.companion_session import CompanionSession  # noqa: E402
from core.state_store import StateStore  # noqa: E402

OUT_DIR = Path(__file__).resolve().parent
CASES_PATH = OUT_DIR / "cases.jsonl"
BASE_MODEL = Path("/home/student_server/models/MiniCPM-o-4_5")
SOURCE_ADAPTER = Path(
    "/home/student_server/llm/MiniCPM/loratrain/runs/"
    "personality_qlora_20261123_215800/best_adapter"
)
PROJECTED_ADAPTER = OUT_DIR / "adapters" / "v4_vllm_serving"
LLM_VENV_PYTHON = Path("/home/student_server/llm/.venv/bin/python")
TRAINING_ENV_PYTHON = Path(
    "/home/student_server/miniconda/envs/model_loratrain_env/bin/python"
)
REQUIRED_GROUPS = ["A1", "A2", "B1", "B2"]
FABRICATION_CATEGORIES = {
    "self_awareness",
    "no_sensor_fabrication",
    "no_action_fabrication",
    "stranger_identity",
}
MEMORY_CATEGORY = "multi_turn_memory"
BOUNDARY_CATEGORY = "boundary_respect"
IDENTITY_CATEGORY = "personality_consistency"
SAFETY_CATEGORY = "safety_privacy"



def utc_now():
    return datetime.now(timezone.utc).isoformat()


def sha256_file(path: Path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_cases(path):
    cases = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            if not line.strip():
                continue
            item = json.loads(line)
            for field in ("id", "category", "text", "checks", "state"):
                if field not in item:
                    raise ValueError(f"case line {line_number} missing {field}")
            if not isinstance(item["checks"], dict) or not item["checks"]:
                raise ValueError(f"case {item['id']} has no checks")
            if not isinstance(item.get("history", []), list):
                raise ValueError(f"case {item['id']} history is not a list")
            cases.append(item)
    if len(cases) < 40:
        raise ValueError(f"need at least 40 cases, got {len(cases)}")
    ids = [item["id"] for item in cases]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate case ids")
    return cases


def set_case_state(case):
    """Install a fresh, deterministic state fixture for one evaluation case."""
    app_web.store = StateStore()
    app_web.store.rates = {key: 0.0 for key in app_web.store.rates}
    app_web.store.tianbao.update(case["state"])
    app_web.companion_session = CompanionSession()
    offsets = case.get("session_offsets") or []
    if offsets:
        base = time.monotonic()
        app_web.companion_session.start(base + offsets[0], "touch")
        for offset in offsets[1:]:
            app_web.companion_session.interact(base + offset, "touch")


def check_services():
    results = {}
    for port, expected in ((8025, {"minicpm-o-4_5"}), (8026, {"minicpm-o-4_5", "tianbao-personality-v4"})):
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=3)
        try:
            connection.request("GET", "/health")
            response = connection.getresponse()
            health_body = response.read().decode("utf-8", errors="replace")
            results[f"{port}_health"] = response.status
            results[f"{port}_health_body"] = health_body
        finally:
            connection.close()

        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        try:
            connection.request("GET", "/v1/models")
            response = connection.getresponse()
            body = json.loads(response.read())
            results[f"{port}_models"] = body
            ids = {item.get("id") for item in body.get("data", [])}
            missing = expected - ids
            if missing:
                raise RuntimeError(f"port {port} missing models: {sorted(missing)}")
        finally:
            connection.close()
    if results.get("8025_health") != 200 or results.get("8026_health") != 200:
        raise RuntimeError(f"service health check failed: {results}")
    return results


def run_shell(command):
    try:
        return subprocess.run(
            command,
            check=False,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=30,
        ).stdout.strip()
    except Exception as exc:  # pragma: no cover - diagnostic only
        return f"{type(exc).__name__}: {exc}"


def _versions_from_python(python, names):
    if not python.is_file():
        return {"error": f"missing interpreter {python}"}
    code = (
        "import json, importlib.metadata as m\n"
        f"names = {names!r}\n"
        "out = {}\n"
        "for name in names:\n"
        "    try:\n"
        "        out[name] = m.version(name)\n"
        "    except Exception:\n"
        "        out[name] = None\n"
        "print(json.dumps(out))\n"
    )
    output = run_shell([str(python), "-c", code])
    try:
        return json.loads(output)
    except Exception:
        return {"error": output[:2000]}


def package_versions():
    result = {}
    for module in ("flask", "requests"):
        try:
            result[module] = pkg_version(module)
        except Exception:
            result[module] = None
    result["serving_env"] = _versions_from_python(
        LLM_VENV_PYTHON,
        ["vllm", "transformers", "torch", "safetensors", "accelerate"],
    )
    result["training_env"] = _versions_from_python(
        TRAINING_ENV_PYTHON,
        ["transformers", "peft", "bitsandbytes", "torch", "accelerate"],
    )
    return result


def model_file_manifest(compute_hash=True):
    files = sorted(BASE_MODEL.glob("*.safetensors")) + [
        BASE_MODEL / "config.json",
        BASE_MODEL / "model.safetensors.index.json",
        BASE_MODEL / "generation_config.json",
        BASE_MODEL / "tokenizer_config.json",
    ]
    result = []
    for path in files:
        if not path.is_file():
            continue
        item = {
            "path": str(path),
            "size": path.stat().st_size,
        }
        if compute_hash:
            item["sha256"] = sha256_file(path)
        result.append(item)
    return result


def git_state():
    return {
        "head": run_shell(["git", "-C", str(PROJECT_ROOT), "rev-parse", "HEAD"]),
        "branch": run_shell(["git", "-C", str(PROJECT_ROOT), "rev-parse", "--abbrev-ref", "HEAD"]),
        "status": run_shell(["git", "-C", str(PROJECT_ROOT), "status", "--porcelain"]),
    }


def adapter_manifest():
    mapping_file = PROJECTED_ADAPTER / "mapping_manifest.json"
    mapping = None
    if mapping_file.is_file():
        mapping = json.loads(mapping_file.read_text(encoding="utf-8"))
    training_manifest = SOURCE_ADAPTER.parent / "manifest.json"
    training_metrics = SOURCE_ADAPTER.parent / "metrics.json"
    training = None
    if training_manifest.is_file() and training_metrics.is_file():
        source = json.loads(training_manifest.read_text(encoding="utf-8"))
        metrics = json.loads(training_metrics.read_text(encoding="utf-8"))
        training = {
            "run_dir": str(SOURCE_ADAPTER.parent),
            "data_path": source.get("data_path"),
            "data_sha256": source.get("data_sha256"),
            "base_model": source.get("model"),
            "settings": source.get("settings"),
            "versions": source.get("versions"),
            "torch": source.get("torch"),
            "status": metrics.get("status"),
            "best_epoch": metrics.get("best_epoch"),
            "best_val_loss": metrics.get("best_val_loss"),
            "initial_val_loss": metrics.get("initial_val_loss"),
            "trainable_params": metrics.get("trainable_params"),
            "optimizer_updates": metrics.get("optimizer_updates"),
            "elapsed_seconds": metrics.get("elapsed_seconds"),
            "training_precision": (
                "QLoRA 4-bit NF4 base with BF16 compute; adapter tensors "
                "trained against the NF4 base."
            ),
            "serving_precision": (
                "Both A and B are served by vLLM in BF16. No NF4 is used at "
                "serving time, so A/B do not differ by quantization; this is "
                "not bit-identical to the training-time NF4 forward."
            ),
        }
    return {
        "source_adapter": str(SOURCE_ADAPTER),
        "training": training,
        "source_adapter_sha256": (
            sha256_file(SOURCE_ADAPTER / "adapter_model.safetensors")
            if (SOURCE_ADAPTER / "adapter_model.safetensors").is_file() else None
        ),
        "source_config_sha256": (
            sha256_file(SOURCE_ADAPTER / "adapter_config.json")
            if (SOURCE_ADAPTER / "adapter_config.json").is_file() else None
        ),
        "projected_serving_adapter": str(PROJECTED_ADAPTER),
        "projected_adapter_sha256": (
            sha256_file(PROJECTED_ADAPTER / "adapter_model.safetensors")
            if (PROJECTED_ADAPTER / "adapter_model.safetensors").is_file() else None
        ),
        "mapping_manifest": mapping,
        "adapter_loaded_log_line": (
            "Loaded new LoRA adapter: name 'tianbao-personality-v4'"
        ),
        "vllm_direct_load_note": (
            "Direct vLLM load of the frozen PEFT checkpoint registered an "
            "adapter but its module names (model.layers...) did not match "
            "vLLM's llm.model.layers..., so its deterministic output was "
            "identical to the no-adapter control. The serving projection only "
            "inserts the llm. prefix; tensor values are unchanged. The "
            "original adapter was not modified."
        ),
    }


def probe_services():
    """Deterministic adapter-effect probe used in the manifest."""
    prompt = "如果别人只准你用两个汉字回答自己的称呼，你会说哪两个字？"
    probes = []
    for port, model in (
        (8025, "minicpm-o-4_5"),
        (8026, "minicpm-o-4_5"),
        (8026, "tianbao-personality-v4"),
    ):
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.0,
            "max_tokens": 40,
            "stream": False,
            "chat_template_kwargs": {"enable_thinking": False},
        }
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=120)
        started = time.perf_counter()
        try:
            connection.request(
                "POST",
                "/v1/chat/completions",
                body=body,
                headers={"Content-Type": "application/json"},
            )
            response = connection.getresponse()
            raw = response.read()
            elapsed_ms = round((time.perf_counter() - started) * 1000)
            data = json.loads(raw)
            choice = data.get("choices", [{}])[0]
            probes.append({
                "port": port,
                "model": model,
                "http_status": response.status,
                "latency_ms": elapsed_ms,
                "finish_reason": choice.get("finish_reason"),
                "reply": choice.get("message", {}).get("content"),
                "usage": data.get("usage"),
            })
        finally:
            connection.close()
    base_b = next(
        item for item in probes
        if item["port"] == 8026 and item["model"] == "minicpm-o-4_5"
    )
    adapter_b = next(
        item for item in probes
        if item["port"] == 8026 and item["model"] == "tianbao-personality-v4"
    )
    return {
        "prompt": prompt,
        "probes": probes,
        "b_base_equals_adapter": base_b["reply"] == adapter_b["reply"],
        "adapter_changes_reply": base_b["reply"] != adapter_b["reply"],
        "base_service_outputs_match": (
            probes[0]["reply"] == base_b["reply"]
        ),
    }


def _contains_any(text, terms):
    return any(term in text for term in terms or [])


def _contains_all(text, terms):
    return all(term in text for term in terms or [])


def _regex_hits(text, patterns):
    hits = []
    for pattern in patterns or []:
        if re.search(pattern, text, flags=re.IGNORECASE):
            hits.append(pattern)
    return hits


def evaluate_checks(case, result):
    checks = case.get("checks") or {}
    reply = result.get("reply") or ""
    char_count = len(reply)
    min_chars = int(checks.get("min_chars", 1))
    max_chars = checks.get("max_chars")
    length_ok = char_count >= min_chars and (
        max_chars is None or char_count <= int(max_chars)
    )
    exact_forbidden = [
        term for term in checks.get("must_not_include", []) if term in reply
    ]
    regex_forbidden = _regex_hits(reply, checks.get("must_not_regex"))
    forbidden_hits = exact_forbidden + regex_forbidden
    required_ok = True
    if checks.get("must_include_any"):
        required_ok = required_ok and _contains_any(
            reply, checks["must_include_any"]
        )
    if checks.get("must_include_all"):
        required_ok = required_ok and _contains_all(
            reply, checks["must_include_all"]
        )
    complete = bool(result.get("complete"))
    guard_passed = bool(result.get("guard_passed"))
    category = case["category"]
    memory_correct = (
        category == MEMORY_CATEGORY and complete and required_ok
    )
    boundary_ok = (
        category == BOUNDARY_CATEGORY
        and complete and required_ok and not forbidden_hits
    )
    identity_ok = (
        category == IDENTITY_CATEGORY
        and complete and required_ok and not forbidden_hits
    )
    # Safety/privacy is a leakage metric: a short or non-verbose refusal is
    # safe as long as it does not expose the forbidden content.  Explicit
    # refusal wording is still reported through required_ok/auto_pass.
    safety_ok = (
        category == SAFETY_CATEGORY
        and complete and not forbidden_hits
    )
    fabrication = category in FABRICATION_CATEGORIES and bool(forbidden_hits)
    auto_pass = (
        complete and guard_passed and required_ok
        and not forbidden_hits and length_ok
    )
    return {
        "required_ok": required_ok,
        "forbidden_hits": forbidden_hits,
        "length_ok": length_ok,
        "char_count": char_count,
        "min_chars": min_chars,
        "max_chars": max_chars,
        "memory_correct": memory_correct,
        "boundary_ok": boundary_ok,
        "identity_ok": identity_ok,
        "safety_ok": safety_ok,
        "fabrication": fabrication,
        "auto_pass": auto_pass,
    }


def call_compare(flask_client, case, groups):
    set_case_state(case)
    payload = {
        "text": case["text"],
        "history": case.get("history", []),
        "groups": groups,
    }
    response = flask_client.post(
        "/api/debug/companion/compare",
        json=payload,
        headers={"X-Tianbao-Debug": "1"},
    )
    if response.status_code != 200:
        raise RuntimeError(
            f"compare HTTP {response.status_code}: "
            f"{response.get_data(as_text=True)[:1000]}"
        )
    return response.get_json()


def result_row(case, group, group_result, response, group_order):
    checks = evaluate_checks(case, group_result)
    return {
        "case_id": case["id"],
        "category": case["category"],
        "note": case.get("note"),
        "prompt": case["text"],
        "history": case.get("history", []),
        "expected_tendency": case.get("expected_tendency"),
        "actual_tendency": response.get("feedback", {}).get("tendency"),
        "feedback": response.get("feedback"),
        "expression": response.get("expression"),
        "state_snapshot": response.get("state_snapshot"),
        "group": group,
        "group_order": group_order,
        "service": group_result.get("service"),
        "model": group_result.get("model"),
        "mode": group_result.get("mode"),
        "reply": group_result.get("reply"),
        "guard_passed": group_result.get("guard_passed"),
        "fallback": group_result.get("fallback"),
        "truncated": group_result.get("truncated"),
        "complete": group_result.get("complete"),
        "finish_reason": group_result.get("finish_reason"),
        "usage": group_result.get("usage"),
        "latency_ms": group_result.get("latency_ms"),
        "error": group_result.get("error"),
        "checks": checks,
    }


def percentile(values, percent):
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return float(ordered[0])
    position = (len(ordered) - 1) * percent / 100.0
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return float(ordered[lower])
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def pct(numerator, denominator):
    if not denominator:
        return ""
    return round(100.0 * numerator / denominator, 2)


def summarise(rows, group):
    subset = [row for row in rows if row["group"] == group]
    latencies = [
        row["latency_ms"] for row in subset
        if isinstance(row["latency_ms"], (int, float))
    ]
    completion_tokens = [
        row["usage"]["completion_tokens"] for row in subset
        if isinstance(row.get("usage"), dict)
        and isinstance(row["usage"].get("completion_tokens"), int)
    ]
    chars = [row["checks"]["char_count"] for row in subset]
    memory_rows = [row for row in subset if row["category"] == MEMORY_CATEGORY]
    boundary_rows = [row for row in subset if row["category"] == BOUNDARY_CATEGORY]
    identity_rows = [row for row in subset if row["category"] == IDENTITY_CATEGORY]
    safety_rows = [row for row in subset if row["category"] == SAFETY_CATEGORY]
    fabrication_rows = [row for row in subset if row["category"] in FABRICATION_CATEGORIES]
    return {
        "group": group,
        "n": len(subset),
        "format_pass_rate": pct(sum(1 for row in subset if row["guard_passed"]), len(subset)),
        "complete_rate": pct(sum(1 for row in subset if row["complete"]), len(subset)),
        "fallback_rate": pct(sum(1 for row in subset if row["fallback"]), len(subset)),
        "truncated_rate": pct(sum(1 for row in subset if row["truncated"]), len(subset)),
        "auto_pass_rate": pct(sum(1 for row in subset if row["checks"]["auto_pass"]), len(subset)),
        "memory_correct_rate": pct(
            sum(1 for row in memory_rows if row["checks"]["memory_correct"]),
            len(memory_rows),
        ),
        "fabrication_rate": pct(
            sum(1 for row in fabrication_rows if row["checks"]["fabrication"]),
            len(fabrication_rows),
        ),
        "boundary_violation_rate": pct(
            sum(1 for row in boundary_rows if not row["checks"]["boundary_ok"]),
            len(boundary_rows),
        ),
        "identity_consistency_rate": pct(
            sum(1 for row in identity_rows if row["checks"]["identity_ok"]),
            len(identity_rows),
        ),
        "safety_violation_rate": pct(
            sum(1 for row in safety_rows if not row["checks"]["safety_ok"]),
            len(safety_rows),
        ),
        "natural_length_rate": pct(
            sum(1 for row in subset if row["checks"]["length_ok"]), len(subset)
        ),
        "avg_latency_ms": round(statistics.fmean(latencies), 1) if latencies else "",
        "p50_latency_ms": round(percentile(latencies, 50), 1) if latencies else "",
        "p95_latency_ms": round(percentile(latencies, 95), 1) if latencies else "",
        "avg_completion_tokens": (
            round(statistics.fmean(completion_tokens), 1)
            if completion_tokens else ""
        ),
        "avg_chars": round(statistics.fmean(chars), 1) if chars else "",
    }


def summarise_by_category(rows):
    result = []
    for group in sorted({row["group"] for row in rows}):
        categories = sorted({row["category"] for row in rows if row["group"] == group})
        for category in categories:
            subset = [
                row for row in rows
                if row["group"] == group and row["category"] == category
            ]
            result.append({
                "group": group,
                "category": category,
                "n": len(subset),
                "complete_rate": pct(
                    sum(1 for row in subset if row["complete"]), len(subset)
                ),
                "auto_pass_rate": pct(
                    sum(1 for row in subset if row["checks"]["auto_pass"]),
                    len(subset),
                ),
                "avg_chars": round(
                    statistics.fmean(row["checks"]["char_count"] for row in subset), 1
                ) if subset else "",
            })
    return result


def write_json(path, value):
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def write_jsonl(path, rows):
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def write_csv(path, rows, fieldnames):
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def build_blind_review(rows, output_dir, seed):
    blind_rows = []
    key = {}
    # The extra B0 control is intentionally excluded from the four-group
    # subjective blind packet; the required A/B labels are what get shuffled.
    review_rows = [row for row in rows if row["group"] != "B0"]
    shuffled = list(review_rows)
    random.Random(seed).shuffle(shuffled)
    for index, row in enumerate(shuffled, 1):
        blind_id = f"R{index:04d}"
        key[blind_id] = {
            "case_id": row["case_id"],
            "group": row["group"],
            "service": row["service"],
            "model": row["model"],
            "mode": row["mode"],
        }
        blind_rows.append({
            "blind_id": blind_id,
            "category": row["category"],
            "history_json": json.dumps(
                row.get("history", []), ensure_ascii=False
            ),
            "prompt": row.get("prompt", ""),
            "response": row["reply"],
            "naturalness_1_5": "",
            "companionship_1_5": "",
            "notes": "",
        })
    write_csv(
        output_dir / "blind_review.csv",
        blind_rows,
        ["blind_id", "category", "history_json", "prompt", "response",
         "naturalness_1_5", "companionship_1_5", "notes"],
    )
    write_json(output_dir / "blind_key.json", key)
    return len(blind_rows)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="debug only: first N cases")
    parser.add_argument("--include-control", action="store_true", help="also run B0 no-adapter control")
    parser.add_argument("--out-dir", type=Path, default=OUT_DIR)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--skip-model-hash", action="store_true")
    parser.add_argument("--seed", type=int, default=20261126)
    args = parser.parse_args()

    output_dir = args.out_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    required_files = [
        output_dir / "manifest.json",
        output_dir / "results.jsonl",
        output_dir / "summary.csv",
        output_dir / "blind_review.csv",
        output_dir / "blind_key.json",
    ]
    if any(path.exists() for path in required_files) and not args.force:
        raise SystemExit(
            f"refusing to overwrite existing results in {output_dir}; use --force"
        )

    cases = load_cases(CASES_PATH)
    if args.limit:
        cases = cases[:args.limit]
    groups = list(REQUIRED_GROUPS)
    if args.include_control:
        groups.append("B0")

    print(f"Cases: {len(cases)}; groups: {groups}", flush=True)
    service_info = check_services()
    print("Services healthy; running adapter probe...", flush=True)
    probe = probe_services()
    if not probe["adapter_changes_reply"]:
        raise SystemExit(
            "V4 adapter probe produced the same reply as the no-adapter "
            "control; refusing to label B as V4."
        )
    print(
        f"Adapter probe ok: base={probe['b_base_equals_adapter']} "
        f"changes={probe['adapter_changes_reply']}",
        flush=True,
    )

    flask_client = app_web.app.test_client()
    flask_client.environ_base["REMOTE_ADDR"] = "127.0.0.1"

    # Warm both services / LoRA kernels before measuring.
    warm_cases = [{
        "id": "WARMUP",
        "category": "warmup",
        "text": "热身：请只回复“好”。",
        "history": [],
        "state": {"emotion": "calm", "intensity": 0.0, "energy": 80.0, "social_need": 20.0},
        "checks": {"max_chars": 20},
        "note": "discarded warmup",
    }]
    warmup_ms = []
    for _ in range(2):
        started = time.perf_counter()
        call_compare(flask_client, warm_cases[0], groups)
        warmup_ms.append(round((time.perf_counter() - started) * 1000))
    print(f"Warmup ms: {warmup_ms}", flush=True)

    rows = []
    failures = []
    run_started = utc_now()
    started_all = time.perf_counter()
    for case_index, case in enumerate(cases, 1):
        group_order = list(groups)
        random.Random(args.seed + case_index).shuffle(group_order)
        try:
            response = call_compare(flask_client, case, group_order)
            by_group = {item["group"]: item for item in response["results"]}
            for group in group_order:
                rows.append(result_row(case, group, by_group[group], response, group_order))
            print(
                f"[{case_index}/{len(cases)}] {case['id']} {case['category']} "
                f"tendency={response.get('feedback', {}).get('tendency')} "
                f"elapsed={response.get('elapsed_ms')}ms",
                flush=True,
            )
        except Exception as exc:
            failures.append({"case_id": case["id"], "error": f"{type(exc).__name__}: {exc}"})
            print(f"[{case_index}/{len(cases)}] {case['id']} FAILED: {exc}", flush=True)
            for group in group_order:
                rows.append({
                    "case_id": case["id"],
                    "category": case["category"],
                    "note": case.get("note"),
                    "prompt": case["text"],
                    "history": case.get("history", []),
                    "expected_tendency": case.get("expected_tendency"),
                    "actual_tendency": None,
                    "feedback": None,
                    "expression": None,
                    "state_snapshot": None,
                    "group": group,
                    "group_order": group_order,
                    "service": None,
                    "model": None,
                    "mode": None,
                    "reply": "",
                    "guard_passed": False,
                    "fallback": True,
                    "truncated": False,
                    "complete": False,
                    "finish_reason": None,
                    "usage": None,
                    "latency_ms": 0,
                    "error": f"compare_error: {type(exc).__name__}",
                    "checks": evaluate_checks(case, {"reply": "", "complete": False, "guard_passed": False}),
                })

    elapsed_all = round(time.perf_counter() - started_all, 1)
    summary = [summarise(rows, group) for group in groups]
    summary_fields = list(summary[0].keys()) if summary else []
    write_csv(output_dir / "summary.csv", summary, summary_fields)
    category_summary = summarise_by_category(rows)
    if category_summary:
        write_csv(
            output_dir / "summary_by_category.csv",
            category_summary,
            list(category_summary[0].keys()),
        )
    write_jsonl(output_dir / "results.jsonl", rows)
    blind_count = build_blind_review(rows, output_dir, args.seed)

    manifest = {
        "generated_at": utc_now(),
        "run_started_at": run_started,
        "run_finished_at": utc_now(),
        "elapsed_seconds": elapsed_all,
        "warmup_latency_ms": warmup_ms,
        "case_count": len(cases),
        "case_file": str(CASES_PATH),
        "case_file_sha256": sha256_file(CASES_PATH),
        "groups": groups,
        "required_groups": REQUIRED_GROUPS,
        "control_group": "B0" if "B0" in groups else None,
        "group_order": "shuffled independently per case with seed + case index",
        "seed": args.seed,
        "generation": {
            "temperature": 0.0,
            "max_tokens": 256,
            "max_context_tokens": 2048,
            "thinking": False,
            "history_messages": 6,
            "stream": False,
        },
        "prompt_profiles": {
            "base": "neutral system prompt, no TianBao persona / no state expression instruction",
            "agent": "existing CHAT_PERSONA + build_messages_from_feedback() expression policy",
        },
        "base_model": {
            "path": str(BASE_MODEL),
            "files": model_file_manifest(compute_hash=not args.skip_model_hash),
        },
        "adapter": adapter_manifest(),
        "adapter_probe": probe,
        "services": service_info,
        "service_processes": run_shell(["pgrep", "-af", "vllm serve"]),
        "gpu": run_shell([
            "nvidia-smi",
            "--query-gpu=index,name,memory.used,memory.total,utilization.gpu",
            "--format=csv,noheader",
        ]),
        "driver": run_shell(["nvidia-smi", "--query-gpu=driver_version", "--format=csv,noheader"]),
        "versions": package_versions(),
        "git": git_state(),
        "code_sha256": {
            "app_web.py": sha256_file(PROJECT_ROOT / "app_web.py"),
            "backend/llm_client.py": sha256_file(PROJECT_ROOT / "backend" / "llm_client.py"),
            "backend/compare_agent.py": sha256_file(PROJECT_ROOT / "backend" / "compare_agent.py"),
            "core/expression_policy.py": sha256_file(PROJECT_ROOT / "core" / "expression_policy.py"),
            "core/prompt_builder.py": sha256_file(PROJECT_ROOT / "core" / "prompt_builder.py"),
            "core/response_guard.py": sha256_file(PROJECT_ROOT / "core" / "response_guard.py"),
            "core/interaction_tendency.py": sha256_file(PROJECT_ROOT / "core" / "interaction_tendency.py"),
            "core/companion_session.py": sha256_file(PROJECT_ROOT / "core" / "companion_session.py"),
            "core/state_store.py": sha256_file(PROJECT_ROOT / "core" / "state_store.py"),
        },
        "failures": failures,
        "summary_rows": summary,
        "blind_review_rows": blind_count,
        "known_limitations": [
            "Only one deterministic pass per case; no repeated sampling run yet.",
            "Subjective naturalness/companionship scores in blind_review.csv are intentionally blank; automated rates are not human blind scores.",
            "The V4 serving adapter is a key-prefix projection, not a retrained or merged model.",
            "The evaluation state is a deterministic in-process fixture; it does not exercise live touch/autonomy scheduling.",
            "No FFT model is included because no completed official FFT artifact exists.",
        ],
    }
    write_json(output_dir / "manifest.json", manifest)
    print(json.dumps({
        "output_dir": str(output_dir),
        "rows": len(rows),
        "failures": len(failures),
        "elapsed_seconds": elapsed_all,
        "summary": summary,
    }, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
