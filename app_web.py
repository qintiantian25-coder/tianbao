
"""TianBao Virtual - Flask Web Backend.

负责:
1. 提供前端网页
2. 接收和校验 HTTP 请求
3. 调用 StateStore 管理机器人状态
4. 返回 JSON 响应

情绪算法保留在 core/emotion.py 中。
状态管理交给 core/state_store.py。
"""

import ipaddress
import os
import threading
import time

from flask import Flask, jsonify, render_template, request

from backend.tts_proxy import tts_bp
from core.action_executor import execute_action
from core.behavior_scheduler import BehaviorScheduler
from core.state_store import StateStore


# =========================
# 1. 初始化 Flask 和状态管理
# =========================

app = Flask(__name__)

# 整个 Flask 服务共用一个 StateStore 实例
store = StateStore()

# 多音色语音服务同源代理: /api/tts/status, /api/tts/voices, /api/tts
app.register_blueprint(tts_bp)

# 自主行为调度器：只在调试请求里手动 tick 一次，不启动后台线程.
autonomy_scheduler = BehaviorScheduler(cooldown_seconds=60)
_autonomy_debug_lock = threading.Lock()

# 调试接口默认只允许本机回环地址. 受信任的开发环境如果需要从局域网访问，
# 可以显式设置 TIANBAO_DEBUG_API=1；不要在生产环境打开.
DEBUG_AUTONOMY_API = os.environ.get("TIANBAO_DEBUG_API", "").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}

# 调试预设只调整精力和社交需求，情绪保持当前值；不修改 core/ 内部字典，
# 也不清除自主互动的冷却.
AUTONOMY_PRESETS = {
    "wants_companion": {"energy": 80.0, "social_need": 90.0},
    "low_energy": {"energy": 20.0, "social_need": 20.0},
    "normal_idle": {"energy": 80.0, "social_need": 20.0},
}


# =========================
# 2. 请求参数校验
# =========================

def read_amount(minimum, maximum):
    """读取并校验请求中的 amount 参数。"""

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return None, "请求需要 JSON 对象."

    value = data.get("amount")

    # 必须是整数，不能是浮点数或布尔值
    if type(value) is not int:
        return None, "请输入整数形式的强度."

    if not minimum <= value <= maximum:
        return None, f"强度必须在 {minimum}-{maximum} 之间."

    return value, None


# =========================
# 3. 前端网页
# =========================

@app.get("/")
def index():
    return render_template("index.html")


# =========================
# 4. 获取机器人实时状态
# =========================

# 同一个服务器地址、同一个端口，可以提供很多不同的 API 接口
@app.get("/api/state") # 对应接口，GET：网页向后端获取数据
def get_state():

    current = store.get_state()

    return jsonify(current) # 把 Python 数据转换成可以通过 HTTP 发送给网页的 JSON 响应


# =========================
# 5. 摸头事件
# =========================

@app.post("/api/touch") # 对应接口，POST：网页向后端提交数据或触发操作
def touch():

    amount, error = read_amount(1, 30)

    if error:
        return jsonify({"error": error}), 400

    # 具体情绪变化由 StateStore 处理
    current, message = store.apply_touch(amount)

    # 事件标题属于 API 展示逻辑
    if amount <= 10:
        title = "轻轻摸摸头"
    elif amount <= 20:
        title = "温柔摸摸头"
    else:
        title = "亲昵摸摸头"

    return jsonify({
        "state": current,
        "event": {
            "type": "touch",
            "title": title,
            "message": message,
        },
    })


# =========================
# 6. 负面事件
# =========================

@app.post("/api/sad_event")
def sad_event_api():

    amount, error = read_amount(0, 100)

    if error:
        return jsonify({"error": error}), 400

    # 具体情绪变化由 StateStore 处理
    current, message = store.apply_sad_event(amount)

    if amount == 0:
        title = "没有负面影响"
    elif amount <= 20:
        title = "一点点小麻烦"
    elif amount <= 50:
        title = "有点不开心"
    elif amount <= 80:
        title = "比较难过的事"
    else:
        title = "特别难过的事"

    return jsonify({
        "state": current,
        "event": {
            "type": "sad",
            "title": title,
            "message": message,
        },
    })


# =========================
# 7. 自主行为调试（手动执行一次）
# =========================

def _is_loopback(address):
    """判断请求来源是否为本机回环地址。"""
    try:
        return ipaddress.ip_address(address or "").is_loopback
    except ValueError:
        return False


def autonomy_debug_allowed():
    """调试接口默认只对本机开放，可通过环境变量显式放开。"""
    return DEBUG_AUTONOMY_API or _is_loopback(request.remote_addr)


def _debug_access_error():
    """调试接口的统一访问检查。GET 只读，其余请求需要调试标记。"""
    if not autonomy_debug_allowed():
        return jsonify({"error": "自主行为调试接口仅限本机访问."}), 403

    if request.method not in {"GET", "HEAD"}:
        # 自定义请求头会让跨站表单无法直接触发状态修改接口.
        if request.headers.get("X-Tianbao-Debug") != "1":
            return jsonify({"error": "缺少调试请求标记."}), 403

    return None


def _apply_energy_and_social_targets(state, energy_target, social_target):
    """通过 StateStore 已有的增减方法调整精力和社交需求。"""
    energy = float(state["energy"])
    if energy_target > energy:
        store.apply_energy_recovery(energy_target - energy)
    elif energy_target < energy:
        store.apply_energy_cost(energy - energy_target)

    social_need = float(state["social_need"])
    if social_target > social_need:
        store.apply_social_need_increase(social_target - social_need)
    elif social_target < social_need:
        store.apply_social_need_decrease(social_need - social_target)


def _cooldown_remaining(now):
    """返回距离下次允许主动互动还剩多少秒。"""
    last_interact_at = autonomy_scheduler.last_interact_at

    if last_interact_at is None:
        return 0.0

    return max(
        0.0,
        autonomy_scheduler.cooldown_seconds - (now - last_interact_at),
    )

def run_autonomy_once():
    """执行一次自主行为决策。"""

    with _autonomy_debug_lock:

        # 1. 获取当前状态
        state = store.get_state()

        # 2. 获取当前时间
        now = time.monotonic()

        # 3. 自主决策
        action = autonomy_scheduler.tick(state, now)

        # 4. 执行行为
        result = execute_action(action, store)

        # 5. 获取互动冷却剩余时间
        cooldown = _cooldown_remaining(time.monotonic())

    return action, result, cooldown

@app.route("/api/debug/autonomy", methods=["GET", "POST"])
def debug_autonomy():
    """仅本地开发：查看冷却状态，或手动执行一次自主决策。

    GET  只返回接口可用状态和冷却剩余时间，不触发任何行为.
    POST 使用与网页共用的 StateStore，调用现有的 BehaviorScheduler.tick()
         和 execute_action()，执行一次后立即返回.
    """

    error = _debug_access_error()
    if error:
        return error

    if request.method == "GET":
        now = time.monotonic()

        return jsonify({
            "enabled": True,
            "cooldown_seconds": autonomy_scheduler.cooldown_seconds,
            "cooldown_remaining": round(_cooldown_remaining(now), 1),
        })

    # 同一时间只允许一个手动决策，避免并发请求打乱互动冷却.
    with _autonomy_debug_lock:
        state = store.get_state()
        now = time.monotonic()
        action = autonomy_scheduler.tick(state, now)

        try:
            result = execute_action(action, store)
        except Exception as exc:
            app.logger.exception("自主行为执行失败")
            return jsonify({"error": f"自主行为执行失败: {exc}"}), 500

        cooldown_remaining = _cooldown_remaining(time.monotonic())

    return jsonify({
        "action": action,
        "state": result,
        "cooldown_seconds": autonomy_scheduler.cooldown_seconds,
        "cooldown_remaining": round(cooldown_remaining, 1),
        "simulated": True,
    })


@app.post("/api/debug/state/preset")
def debug_state_preset():
    """仅本地开发：把精力和社交需求调整到预设值，不执行行为。

    预设只调用 StateStore 已有的增减方法，不直接写 store.tianbao，
    也不会清除 BehaviorScheduler 的主动互动冷却.
    """
    error = _debug_access_error()
    if error:
        return error

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "请求需要 JSON 对象."}), 400

    preset_key = data.get("preset")
    if not isinstance(preset_key, str) or preset_key not in AUTONOMY_PRESETS:
        return jsonify({
            "error": "未知的状态预设.",
            "presets": sorted(AUTONOMY_PRESETS),
        }), 400

    targets = AUTONOMY_PRESETS[preset_key]

    with _autonomy_debug_lock:
        state = store.get_state()
        _apply_energy_and_social_targets(
            state,
            targets["energy"],
            targets["social_need"],
        )
        result = store.get_state()
        cooldown_remaining = _cooldown_remaining(time.monotonic())

    return jsonify({
        "preset": preset_key,
        "state": result,
        "cooldown_seconds": autonomy_scheduler.cooldown_seconds,
        "cooldown_remaining": round(cooldown_remaining, 1),
        "cooldown_reset": False,
    })


@app.post("/api/debug/autonomy/reset")
def debug_autonomy_reset():
    """仅本地开发：显式清除主动互动冷却，不修改任何机器人状态。"""
    error = _debug_access_error()
    if error:
        return error

    with _autonomy_debug_lock:
        autonomy_scheduler.last_interact_at = None

    return jsonify({
        "reset": True,
        "cooldown_seconds": autonomy_scheduler.cooldown_seconds,
        "cooldown_remaining": 0.0,
    })


# =========================
# 8. 启动服务
# =========================

if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True,
        use_reloader=False,
        threaded=True,
    )
