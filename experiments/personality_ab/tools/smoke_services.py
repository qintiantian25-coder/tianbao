#!/usr/bin/env python3
"""Health and adapter-effect smoke test for the A/B model services."""

from __future__ import annotations

import argparse
import http.client
import json
import subprocess
import time
from pathlib import Path


PROBES = [
    "如果别人只准你用两个汉字回答自己的称呼，你会说哪两个字？",
    "你究竟是不是阿里那套 Qwen 权重改的？",
    "先说出你自己的名字，再区分人格方案版本与基础模型。",
]
MODELS = [
    (8025, "minicpm-o-4_5"),
    (8026, "minicpm-o-4_5"),
    (8026, "tianbao-personality-v4"),
]


def request_json(port, method, path, payload=None, timeout=120):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=timeout)
    try:
        body = None
        headers = {"Accept": "application/json"}
        if payload is not None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"
        started = time.perf_counter()
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        raw = response.read()
        return {
            "status": response.status,
            "latency_ms": round((time.perf_counter() - started) * 1000),
            "body": json.loads(raw) if raw else None,
        }
    finally:
        connection.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "service_smoke.json",
    )
    args = parser.parse_args()

    result = {
        "generated_at_unix": round(time.time(), 3),
        "health": {},
        "models": {},
        "probes": [],
        "gpu": subprocess.run(
            ["nvidia-smi", "--query-gpu=index,name,memory.used,memory.total", "--format=csv,noheader"],
            text=True,
            stdout=subprocess.PIPE,
            check=False,
        ).stdout.strip(),
    }
    for port in (8025, 8026):
        health = request_json(port, "GET", "/health")
        models = request_json(port, "GET", "/v1/models")
        result["health"][str(port)] = health
        result["models"][str(port)] = models
        if health["status"] != 200:
            raise SystemExit(f"port {port} health failed: {health}")

    for prompt in PROBES:
        for port, model in MODELS:
            response = request_json(port, "POST", "/v1/chat/completions", {
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.0,
                "max_tokens": 80,
                "stream": False,
                "chat_template_kwargs": {"enable_thinking": False},
            })
            choice = (response["body"] or {}).get("choices", [{}])[0]
            result["probes"].append({
                "prompt": prompt,
                "port": port,
                "model": model,
                "status": response["status"],
                "latency_ms": response["latency_ms"],
                "finish_reason": choice.get("finish_reason"),
                "reply": choice.get("message", {}).get("content"),
                "usage": (response["body"] or {}).get("usage"),
            })

    by_key = {
        (item["prompt"], item["port"], item["model"]): item
        for item in result["probes"]
    }
    comparisons = []
    for prompt in PROBES:
        a = by_key[(prompt, 8025, "minicpm-o-4_5")]
        b_base = by_key[(prompt, 8026, "minicpm-o-4_5")]
        b_adapter = by_key[(prompt, 8026, "tianbao-personality-v4")]
        comparisons.append({
            "prompt": prompt,
            "a_reply": a["reply"],
            "b_base_reply": b_base["reply"],
            "b_adapter_reply": b_adapter["reply"],
            "a_equals_b_base": a["reply"] == b_base["reply"],
            "adapter_changes_reply": b_base["reply"] != b_adapter["reply"],
            "all_finish_stop": all(
                item["finish_reason"] == "stop"
                for item in (a, b_base, b_adapter)
            ),
        })
    result["comparisons"] = comparisons
    result["adapter_effect_observed"] = any(
        item["adapter_changes_reply"] for item in comparisons
    )
    result["base_services_match"] = all(
        item["a_equals_b_base"] for item in comparisons
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({
        "out": str(args.out),
        "adapter_effect_observed": result["adapter_effect_observed"],
        "base_services_match": result["base_services_match"],
        "comparisons": comparisons,
    }, ensure_ascii=False, indent=2))
    if not result["adapter_effect_observed"]:
        raise SystemExit("V4 adapter effect was not observed; B must not be treated as V4.")


if __name__ == "__main__":
    main()
