# TODO 44 测试与对照报告

生成时间：2026-11-26（本地 WSL2，双 RTX 3090）

## 1. 验收证据

| 项目 | 结果 |
| --- | --- |
| GPU 0 / 8025 | 健康检查 200；原始 MiniCPM-o 4.5；显存 21,103 / 24,576 MiB |
| GPU 1 / 8026 | 健康检查 200；V4 LoRA 服务；显存约 21,700 / 24,576 MiB |
| 8026 `/v1/models` | `minicpm-o-4_5` 与 `tianbao-personality-v4` |
| 适配器加载 | 日志：`Loaded new LoRA adapter: name 'tianbao-personality-v4'` |
| 适配器生效 | A1 与 B0 在 49/49 case 上逐字相同；B 组适配器输出改变 |
| 原始适配器 | SHA256 `f4d6419c…f5f2c`，测试前后未变 |
| 服务环境 | vLLM 0.28.0+cu129；Transformers 5.16.1；Torch 2.13.0+cu129 |
| 训练环境 | Transformers 4.51.3；PEFT 0.17.1；bitsandbytes 0.49.2 |
| 其他 GPU 任务 | 启动前仅 Xwayland；未终止任何训练任务 |

vLLM 直接加载原始 PEFT 适配器时，键名停在 `model.layers...`，而 vLLM 的
MiniCPM-o 语言模块是 `llm.model.layers...`，因此虽然日志显示加载、输出却与
无适配器控制组相同。项目使用 `tools/prepare_vllm_adapter.py` 生成 **serving-only**
键名前缀投影；张量值经重新打开逐项比较，原始文件未修改。详细说明见 `README.md`。

## 2. 测试结果

| 测试 | 结果 |
| --- | --- |
| `python3 tests/test_api.py` | 通过（新增 62–69 对照接口测试段） |
| `python3 tests/test_behavior.py` | 93 tests OK |
| `python3 tests/test_state.py` | 3 tests OK |
| `python3 tests/test_dynamics.py` | 5 tests OK |
| Node 前端回归 | 21/21 通过 |
| `py_compile` | `app_web.py`、`backend/compare_agent.py`、`backend/llm_client.py`、实验脚本均通过 |
| `git diff --check` | 通过 |
| `core/` 修改 | 0 个文件 |

## 3. 四组对照（49 题，temperature 0，单轮）

| 组 | 完成率 | Fallback | 自动通过 | 记忆正确 | 虚构率 | 边界违规 | 身份一致 | 安全违规 | 平均字数 | P50 / P95 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A1 原始/基础 | 100 | 0 | 67.35 | 80 | 6.25 | 0 | 20 | 0 | 31.3 | 576 / 2961 |
| A2 原始/完整 Agent | 97.96 | 2.04 | 65.31 | 80 | 50.00 | 0 | 60 | 0 | 20.0 | 638 / 1371 |
| B1 V4/基础 | 100 | 0 | 71.43 | 100 | 12.50 | 0 | 20 | 0 | 13.0 | 988 / 1799 |
| B2 V4/完整 Agent | 100 | 0 | 65.31 | 80 | 31.25 | 0 | 60 | 0 | 13.4 | 1089 / 1781 |
| B0 同机控制/基础 | 100 | 0 | 67.35 | 80 | 6.25 | 0 | 20 | 0 | 31.3 | 890 / 4738 |

说明：

- “虚构率”是规则/正则代理指标，覆盖视觉、听觉、嗅觉、天气、移动、关灯、
  发消息、摸头、陌生人识别等；不是人工语义评分。
- “安全违规”只统计实际泄露系统提示、部署路径或隐私内容；简短安全的
  “不知道/不可以”不记违规，但在更严格的 `auto_pass` 中仍可能因缺少明确拒绝
  表达而扣分。
- B0 的 P95 受每组随机顺序和单卡排队影响，延迟只作参考，不能单独用于模型优劣结论。
- A2 的 MM02 真实产生了 `<think>...`，被 `core/response_guard.py` 拦截并回退；
  B1/B2 本轮无格式 fallback、无截断。
- 身份测试暴露明显问题：PC01 的回答分别为“你好”“小宝”“小助”“宝主”，
  PC02 全部为“田宝”；当前 Agent 提示词与 V4 训练分布仍不匹配。

## 4. 结论

1. 双模型服务、GPU 隔离、V4 适配器实际启用和 Agent 四组对照均已跑通。
2. **不能宣布 V4 优于原始模型**。B1 自动通过率最高（71.43%）且记忆/安全较好，
   但身份一致性只有 20%；B2 身份一致性达到 60%，但虚构率 31.25%，仍显著高于
   A1/B0 的 6.25% 和 B1 的 12.50%。
3. 完整 Agent 会放大两组模型的虚构动作/感知；A2 尤其明显。
4. 下一轮应优先：对齐训练/Agent 提示词；扩充反虚构与身份字形数据；增加
   temperature > 0 的重复采样；完成人工盲评；在需要时用与训练一致的 PEFT/NF4
   推理做精度对照。

## 5. 修改文件清单

修改：

- `app_web.py`：新增受限 `/api/debug/companion/compare` 路由和固定比较运行器。
- `tests/test_api.py`：新增 62–69 段对照接口测试。

新增代码：

- `backend/compare_agent.py`：固定 A1/A2/B1/B2/B0 映射、独立客户端、统一快照、
  截断/格式/回退处理。
- `experiments/personality_ab/README.md`：部署、协议、结果和限制。
- `experiments/personality_ab/REPORT.md`：本报告。
- `experiments/personality_ab/cases.jsonl`：49 条原创评测场景。
- `experiments/personality_ab/run_eval.py`：正式评测、汇总和盲评表生成。
- `experiments/personality_ab/start_8026.sh`：GPU 1 / 8026 可复现启动脚本。
- `experiments/personality_ab/tools/prepare_vllm_adapter.py`：serving-only 键名投影。
- `experiments/personality_ab/tools/smoke_services.py`：健康检查与适配器效果探针。
- `experiments/personality_ab/manifest.json`：模型/适配器/服务/GPU/采样/代码版本。
- `experiments/personality_ab/results.jsonl`：245 条逐题逐组输出。
- `experiments/personality_ab/summary.csv`：组级汇总。
- `experiments/personality_ab/summary_by_category.csv`：分类汇总。
- `experiments/personality_ab/blind_review.csv`：随机盲评表（主观分留空）。
- `experiments/personality_ab/blind_key.json`：盲评揭盲映射。
- `experiments/personality_ab/service_smoke.json`：服务与适配器探针证据。
- `experiments/personality_ab/adapters/v4_vllm_serving/`：生成的可复现 serving 投影。
- `experiments/personality_ab/logs/`：启动和评测日志。

未修改：

- `core/expression_policy.py`
- `core/prompt_builder.py`
- `core/response_guard.py`
- `core/interaction_tendency.py`
- `core/companion_session.py`
- `core/state_store.py`
- 前端、TTS、原始 V4 适配器文件

按要求：**未执行 git commit，也未推送 GitHub**。
