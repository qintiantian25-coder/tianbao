# tianbao 多音色语音服务接入

状态：**已接入。** 网页保留原有布局、情绪系统、动画、聊天和浏览器内置语音，新增 MiniCPM-o 远程音色，并在故障时自动降级。

## 1. 结构

```text
浏览器
  └─ 同源请求 /api/tts/status, /api/tts/voices, POST /api/tts
        └─ Flask (app_web.py, backend/tts_proxy.py)
              └─ 127.0.0.1:8030 (tianbao 语音服务)
                    └─ 127.0.0.1:8025 (MiniCPM-o)
```

前端只使用相对路径，**不依赖用户浏览器里的 localhost**。在 Windows 浏览器中打开
`http://localhost:5000/` 时，`localhost` 指的是运行 Flask 的 WSL；`/api/tts` 由 Flask
转发到 WSL 里的 `127.0.0.1:8030`。

## 2. 后端接口

| 方法 | 同源接口 | 转发目标 |
| --- | --- | --- |
| GET | `/api/tts/status` | `http://127.0.0.1:8030/status` |
| GET | `/api/tts/voices` | `http://127.0.0.1:8030/voices` |
| POST | `/api/tts` | `http://127.0.0.1:8030/tts` |

`POST /api/tts` 请求体：

```json
{"text":"当前要说的话","voice_id":"yujie_v1","emotion":"happy","cache":true}
```

成功时原样返回 WAV 音频，并透传：

- `X-Tianbao-Cache`：`HIT` / `MISS`
- `X-Tianbao-Generate-Ms`：服务端推理耗时
- `X-Tianbao-Total-Ms`：服务端总耗时
- `X-Tianbao-Voice-Id`
- `Server-Timing`

失败时返回 JSON `{"error":"...","detail":"..."}`，HTTP 状态为 503/504/4xx（视原因而定）。
前端把任何非 2xx 都当作远程失败并降级。

### 配置

可在启动 Flask 前设置：

```bash
export TIANBAO_TTS_BASE=http://127.0.0.1:8030
export TIANBAO_TTS_STATUS_TIMEOUT=4
export TIANBAO_TTS_TIMEOUT=60
python app_web.py
```

默认值就是上面这组。修改 Python 文件后需要重启 Flask；当前 `app.run(..., use_reloader=False)` 不会自动重载。

## 3. 音色选择

语音面板的“语音服务与音色”中有一个统一选择器：

- **服务器音色**：来自 `/api/tts/voices`。当前有 `yujie_v1`（可用）和 `qinche_v1`
  （`available=false`，显示为不可用且禁止选择）。
- **浏览器内置**：原有 4 个内置音色、语音包和自定义音色，始终可选，不依赖服务器。

行为：

- 音色列表不写死。服务器新增音色目录后，15 秒轮询或页面重新获得焦点时自动出现。
- 用户选择保存在 `localStorage` 的 `tianbao.tts.selection.v2`，刷新网页后保留。
- 保存的远程音色如果暂时不可用，仍会保留在选择器中（标记“不可用”，禁止用户重新选择），
  并在恢复后自动继续使用。
- 打开语音面板也会立即刷新一次服务状态。

## 4. 自动调用与降级

每句话开始时解析一次选择，**不会在一句话播放中途切换音色**。

远程失败包括：8030 未启动、8025 未加载、请求超时、模型生成失败、音色文件缺失、
返回非 WAV、浏览器播放失败、播放开始 15 秒无响应、播放超时等。此时：

- 当前句子改用原有浏览器内置语音（`speechSynthesis`），不会重叠播放。
- 页面显示“正在使用备用语音”；不弹窗，调试日志对相同错误 30 秒内不重复。
- 下一句话会重新尝试远程音色。状态轮询/聚焦刷新确认恢复后，或远程句子成功播放后，
  备用提示消失。
- 用户主动选择“浏览器内置”音色时显示“浏览器语音”，不标成备用。

远程播放使用“最新一句优先”的单声道队列：新句子会取消旧请求、暂停并释放旧
`Audio`/Blob URL，再播放新句子；也支持 `interrupt:false` 的顺序队列模式。

## 5. 情绪映射

| 现有状态 | 发送给语音服务的 emotion |
| --- | --- |
| `sad` | `comfort` |
| `calm` | `neutral` |
| `happy` | `happy` |
| 15 秒内被真实摸头，且当前为 happy | `shy` |

## 6. 时间统计

当前消息气泡内显示一行：

```text
生成 3.12s · 首声 3.25s · 缓存 MISS · 播放 4.20s
```

- **生成**：`X-Tianbao-Generate-Ms`，服务端推理耗时。
- **首声**：`performance.now()` 从决定朗读到音频真正开始播放，包含请求、等待、
  WAV 下载/解码和浏览器启动音频。
- **播放**：从首声到 `ended` 的完整播放耗时。
- **缓存**：`X-Tianbao-Cache` 的 HIT / MISS。

鼠标悬停（`title`）可看到服务端总耗时、WAV 就绪耗时、端到端耗时和音频大小。
使用备用语音时显示：

```text
备用语音 · 首声 0.42s · 播放 2.80s
```

首声仍然从“决定朗读”开始计时，因此包含了远程失败等待的时间；`title` 中会说明。

## 7. 验证方法

### 7.1 服务与代理正常

```bash
curl -s http://127.0.0.1:5000/api/tts/status
curl -s http://127.0.0.1:5000/api/tts/voices
curl -s -D - -o /tmp/t.wav \
  -H 'Content-Type: application/json' \
  -d '{"text":"你好呀","voice_id":"yujie_v1","emotion":"happy","cache":true}' \
  http://127.0.0.1:5000/api/tts
file /tmp/t.wav
```

预期：前两个返回 JSON；第三个返回 `audio/wav`，头里有 `X-Tianbao-*`。

### 7.2 缓存

对同一句话（同一 `voice_id` 和 `emotion`）连续请求两次：

```bash
for i in 1 2; do
  curl -s -D - -o /dev/null \
    -H 'Content-Type: application/json' \
    -d '{"text":"缓存测试呀","voice_id":"yujie_v1","emotion":"happy","cache":true}' \
    http://127.0.0.1:5000/api/tts | grep -i x-tianbao-cache
done
```

预期：第一次 `MISS`，第二次 `HIT`。网页气泡里也会显示对应的“缓存 HIT/MISS”。

### 7.3 8030 关闭 / 恢复

不要直接停用户的服务时，可用测试进程验证代理：

```bash
TIANBAO_TTS_BASE=http://127.0.0.1:65530 python - <<'PY'
from app_web import app
c = app.test_client()
for path in ("/api/tts/status", "/api/tts/voices"):
    r = c.get(path)
    print(path, r.status_code, r.get_json())
r = c.post("/api/tts", json={"text":"测试","voice_id":"yujie_v1","emotion":"neutral","cache":True})
print("/api/tts", r.status_code, r.get_json())
PY
```

浏览器端验证：

1. 暂时让 `8030` 不可达（维护窗口关闭，或改 Flask 的 `TIANBAO_TTS_BASE` 指向空闲端口后重启）。
2. 打开网页，语音面板显示“远程不可用 · 备用语音”，麦克风回应的朗读使用浏览器语音。
3. 气泡显示“备用语音 · 首声 …”，不弹窗。
4. 恢复 8030；等待 15 秒、切回页面或重新打开语音面板。
5. 状态变为“远程就绪”，下一句话自动恢复原来的远程音色。

### 7.4 新增音色

在 8030 的音色目录里增加一个音色后，无需改前端：

- 等待 15 秒，或切走再切回页面（焦点刷新），或重新打开语音面板。
- 选择器中自动出现新音色。
- 若 `available=false`，显示“不可用”并禁止选择。

### 7.5 音色不可用

当前 `qinche_v1` 就是这种情况。选择器中应显示“秦彻风格·低沉男声 · 不可用”，
无法点击；如果它曾被保存为选择，刷新后仍保留但显示不可用，朗读自动走备用语音。

### 7.6 情绪

在语音面板输入文字并朗读时，抓取 `POST /api/tts` 的请求体，可看到：

- 难过状态（`/api/sad_event`）→ `emotion: "comfort"`
- 平静状态 → `emotion: "neutral"`
- 开心状态 → `emotion: "happy"`
- 刚被真实摸头（按住机器人头部）后 15 秒内 → `emotion: "shy"`

## 8. 前端改动位置

- `static/remote-tts.js`：状态轮询、音色列表、WAV 请求、取消、队列、播放、计时。
- `static/app.js`：统一音色选择器、状态 UI、备用逻辑、情绪映射、气泡计时。
- `static/voice.js`：浏览器语音增加首声回调，用于备用语音计时。
- `templates/index.html`：语音服务卡片、选择器、备用提示、气泡计时元素。
- `static/style.css`：选择器、服务状态、备用提示和计时样式。
- `backend/tts_proxy.py` / `app_web.py`：同源代理接口。
