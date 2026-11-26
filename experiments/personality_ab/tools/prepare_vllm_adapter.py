#!/usr/bin/env python3
"""Create a serving-only vLLM projection of the frozen V4 PEFT adapter.

The V4 adapter was trained by wrapping ``MiniCPM-o``'s ``full.llm`` module.
PEFT therefore saved keys as::

    base_model.model.model.layers.0.self_attn.q_proj.lora_A.weight

vLLM names the same language-model modules::

    llm.model.layers.0.self_attn.q_proj

vLLM's MiniCPM-o integration has no ``hf_to_vllm_mapper`` for this prefix, so
a direct ``--lora-modules`` load silently registers an adapter whose module
names never match and produces base-model logits.  This tool does **not**
touch the original adapter and does not merge weights.  It only writes a
separate safetensors file with the ``llm.`` prefix inserted, plus a copy of
``adapter_config.json``.  The tensor values are bit-identical.

The generated directory is a deployment artifact, not a new trained model.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

from safetensors import safe_open
from safetensors.torch import load_file, save_file


SOURCE_PREFIX = "base_model.model.model.layers."
TARGET_PREFIX = "base_model.model.llm.model.layers."


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inspect_source(adapter_dir: Path) -> dict:
    config_path = adapter_dir / "adapter_config.json"
    weights_path = adapter_dir / "adapter_model.safetensors"
    if not config_path.is_file():
        raise FileNotFoundError(config_path)
    if not weights_path.is_file():
        raise FileNotFoundError(weights_path)

    config = json.loads(config_path.read_text(encoding="utf-8"))
    if config.get("peft_type") != "LORA":
        raise ValueError("Only PEFT LoRA adapters are supported.")
    if config.get("r") != 8 or config.get("lora_alpha") != 16:
        raise ValueError("Unexpected V4 rank/alpha; refusing to project.")
    if sorted(config.get("target_modules") or []) != ["q_proj", "v_proj"]:
        raise ValueError("Unexpected V4 target modules; refusing to project.")

    with safe_open(weights_path, framework="pt", device="cpu") as handle:
        keys = list(handle.keys())
        total = sum(handle.get_tensor(key).numel() for key in keys)
        zero_tensors = sum(
            1 for key in keys if int(handle.get_tensor(key).count_nonzero()) == 0
        )
    mapped_keys = [
        key.replace(SOURCE_PREFIX, TARGET_PREFIX, 1)
        if key.startswith(SOURCE_PREFIX)
        else key
        for key in keys
    ]
    if len(set(mapped_keys)) != len(mapped_keys):
        raise ValueError("Key projection produced duplicate names.")
    unmapped = [
        key for key in keys
        if not key.startswith(SOURCE_PREFIX)
    ]
    if unmapped:
        raise ValueError(f"Unexpected adapter keys outside V4 layers: {unmapped[:5]}")
    if zero_tensors:
        raise ValueError(f"{zero_tensors} adapter tensors are entirely zero.")

    return {
        "config": config,
        "keys": keys,
        "mapped_keys": mapped_keys,
        "tensor_count": len(keys),
        "parameter_count": total,
        "zero_tensors": zero_tensors,
        "source_sha256": sha256_file(weights_path),
        "config_sha256": sha256_file(config_path),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("adapter_dir", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument(
        "--force",
        action="store_true",
        help="Replace an existing projection after checking source checksum.",
    )
    args = parser.parse_args()

    adapter_dir = args.adapter_dir.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()
    if output_dir == adapter_dir or adapter_dir in output_dir.parents:
        raise ValueError("Output must not be inside the frozen source adapter.")
    if output_dir.exists() and any(output_dir.iterdir()) and not args.force:
        raise FileExistsError(f"{output_dir} already exists; use --force")

    info = inspect_source(adapter_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    tensors = load_file(str(adapter_dir / "adapter_model.safetensors"), device="cpu")
    projected = {}
    for old_key, new_key in zip(info["keys"], info["mapped_keys"]):
        projected[new_key] = tensors[old_key]
    save_file(projected, str(output_dir / "adapter_model.safetensors"), metadata={
        "format": "pt",
        "source_adapter_sha256": info["source_sha256"],
        "projection": f"{SOURCE_PREFIX} -> {TARGET_PREFIX}",
    })
    shutil.copy2(adapter_dir / "adapter_config.json", output_dir / "adapter_config.json")

    # Re-open the saved projection and prove each tensor value is unchanged.
    with safe_open(
        output_dir / "adapter_model.safetensors", framework="pt", device="cpu"
    ) as handle:
        saved_keys = list(handle.keys())
        if saved_keys != info["mapped_keys"]:
            raise RuntimeError("Projected key order/content changed on save.")
        for old_key, new_key in zip(info["keys"], info["mapped_keys"]):
            if not tensors[old_key].equal(handle.get_tensor(new_key)):
                raise RuntimeError(f"Tensor value changed: {old_key} -> {new_key}")
    source_sha_after = sha256_file(adapter_dir / "adapter_model.safetensors")
    if source_sha_after != info["source_sha256"]:
        raise RuntimeError("Original adapter changed during projection.")

    manifest = {
        "kind": "serving_only_key_projection",
        "not_a_new_model": True,
        "source_adapter": str(adapter_dir),
        "output_adapter": str(output_dir),
        "source_adapter_sha256": info["source_sha256"],
        "source_config_sha256": info["config_sha256"],
        "projected_adapter_sha256": sha256_file(
            output_dir / "adapter_model.safetensors"
        ),
        "tensor_count": info["tensor_count"],
        "parameter_count": info["parameter_count"],
        "zero_tensors": info["zero_tensors"],
        "key_prefix_mapping": {
            "from": SOURCE_PREFIX,
            "to": TARGET_PREFIX,
        },
        "tensor_values_changed": False,
        "tensor_values_verified_by_reopen": True,
        "original_adapter_modified": False,
        "original_adapter_sha256_after": source_sha_after,
        "config": info["config"],
    }
    (output_dir / "mapping_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
