#!/usr/bin/env bash
set -Eeuo pipefail

# TianBao A/B: V4 adapter on physical GPU 1, local port 8026.
# The original best_adapter is never modified.  A serving-only key projection
# is generated when missing; see tools/prepare_vllm_adapter.py.
PROJECT_DIR="/home/student_server/Qtt/tianbao/experiments/personality_ab"
MODEL_DIR="/home/student_server/models/MiniCPM-o-4_5"
SOURCE_ADAPTER="/home/student_server/llm/MiniCPM/loratrain/runs/personality_qlora_20261123_215800/best_adapter"
SERVING_ADAPTER="${PROJECT_DIR}/adapters/v4_vllm_serving"
VENV_DIR="/home/student_server/llm/.venv"
PYTHON="${VENV_DIR}/bin/python"

if [[ ! -f "${SERVING_ADAPTER}/adapter_model.safetensors" ]]; then
    "${PYTHON}" "${PROJECT_DIR}/tools/prepare_vllm_adapter.py" \
        "${SOURCE_ADAPTER}" "${SERVING_ADAPTER}" --force
fi

export CUDA_VISIBLE_DEVICES=1
export VLLM_WSL2_ENABLE_PIN_MEMORY=1

source "${VENV_DIR}/bin/activate"
exec vllm serve "${MODEL_DIR}" \
    --served-model-name minicpm-o-4_5 \
    --tensor-parallel-size 1 \
    --dtype auto \
    --gpu-memory-utilization 0.92 \
    --max-model-len 2048 \
    --max-num-batched-tokens 2048 \
    --max-num-seqs 1 \
    --enforce-eager \
    --trust-remote-code \
    --host 127.0.0.1 \
    --port 8026 \
    --enable-lora \
    --max-lora-rank 8 \
    --lora-modules "tianbao-personality-v4=${SERVING_ADAPTER}"
