
"""TianBao Virtual - Flask Web Backend.

负责:
1. 提供前端网页
2. 接收和校验 HTTP 请求
3. 调用 StateStore 管理机器人状态
4. 返回 JSON 响应

情绪算法保留在 core/emotion.py 中。
状态管理交给 core/state_store.py。

后台自主行为:
    两个启动入口都会显式启动一个后台循环，默认每 10 秒决策一次.
    TIANBAO_AUTONOMY_INTERVAL 可覆盖间隔（秒）.
"""

import ipaddress
import math
import os
import threading
import time

from flask import Flask, jsonify, render_template, request

from backend.autonomy_events import AutonomyEventBuffer
from backend.autonomy_runner import AutonomyLoop, autonomy_logger
from backend.tts_proxy import tts_bp
from core.action_executor import execute_action
from core.behavior_scheduler import BehaviorScheduler
from core.companion_request import CompanionRequestTracker
from core.companion_session import CompanionSession
from core.state_store import StateStore


# =========================
# 1. 初始化 Flask 和状态管理
# =========================

app = Flask(__name__)

# 整个 Flask 服务共用一个 StateStore 实例
store = StateStore()

# 多音色语音服务同源代理: /api/tts/status, /api/tts/voices, /api/tts
app.register_blueprint(tts_bp)

# 手动调试和后台循环共用同一个调度器与 StateStore.
autonomy_scheduler = BehaviorScheduler(cooldown_seconds=60)

# 后台决策和摸头 HTTP 接口共用同一个请求管理器与 monotonic 时间线.
companion_tracker = CompanionRequestTracker(timeout_seconds=300)

# 持续陪伴会话：只由真实后端摸头推进，不设置自动超时/结束.
companion_session = CompanionSession()

# 非重入锁：保护一次完整的“读取状态 -> 决策 -> 执行”以及请求创建/回应.
# 锁顺序固定为 _autonomy_lock -> StateStore / CompanionRequestTracker /
# CompanionSession 内部锁. 持有这把锁时不要再调用 run_autonomy_once()，
# 否则会死锁.
_autonomy_lock = threading.Lock()

DEFAULT_AUTONOMY_INTERVAL = 10.0

# 自主行为事件缓冲区：只保存展示文案，不保存对话、录音或状态细节.
autonomy_events = AutonomyEventBuffer(capacity=100)

AUTONOMY_EVENT_MESSAGES = {
    "interact": "主人，我想和你玩一会儿~",
    "seek_comfort": "主人，我有点伤心，想要安慰~",
    "rest": "我想休息一下~",
    "idle": "休息好啦，tianbao 又精神啦~",
}

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


def _autonomy_interval_from_env():
    """读取后台决策间隔（秒），默认 10 秒；无效值回退默认值。"""
    raw = os.environ.get("TIANBAO_AUTONOMY_INTERVAL")
    if not raw:
        return DEFAULT_AUTONOMY_INTERVAL

    try:
        interval = float(raw)
    except (TypeError, ValueError):
        interval = 0.0

    if not math.isfinite(interval) or interval <= 0:
        autonomy_logger.warning(
            "TIANBAO_AUTONOMY_INTERVAL=%r 无效，使用默认 %.0f 秒",
            raw,
            DEFAULT_AUTONOMY_INTERVAL,
        )
        return DEFAULT_AUTONOMY_INTERVAL

    return interval


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
# 4b. 主人回应请求状态（只读）
# =========================

@app.get("/api/companion/request")
def get_companion_request():
    """只读：返回当前请求副本和剩余有效时间，不创建/消耗任何请求。"""
    with _autonomy_lock:
        now = time.monotonic()
        current = companion_tracker.get_current(now)

        if current is None:
            remaining = None
        elif current["status"] == "pending":
            remaining = max(0.0, current["expires_at"] - now)
        else:
            remaining = 0.0

        timeout_seconds = companion_tracker.timeout_seconds

    return jsonify({
        "request": current,
        "remaining_seconds": None if remaining is None else round(remaining, 1),
        "timeout_seconds": timeout_seconds,
    })


# =========================
# 4c. 持续陪伴会话状态（只读）
# =========================

@app.get("/api/companion/session")
def get_companion_session():
    """只读：返回当前陪伴会话状态，不启动/结束/推进会话。"""
    with _autonomy_lock:
        state = companion_session.get_state()

    return jsonify(state)


# =========================
# 5. 摸头事件
# =========================

@app.post("/api/touch") # 对应接口，POST：网页向后端提交数据或触发操作
def touch():

    amount, error = read_amount(1, 30)

    if error:
        return jsonify({"error": error}), 400

    # 与后台决策共用锁：保证“摸头状态变化 + 请求确认 + 会话推进”是连贯的.
    # 无论 respond() 返回 True/False，本次摸头都只调用一次 apply_touch.
    with _autonomy_lock:
        current, message = store.apply_touch(amount)

        now = time.monotonic()

        # 第一次摸头开始会话并计为 1 次；后续摸头只累加，不重复计数.
        if not companion_session.start(now, "touch"):
            companion_session.interact(now, "touch")
        session_state = companion_session.get_state()

        request_accepted = companion_tracker.respond(now)
        accepted_request = (
            companion_tracker.get_current(now)
            if request_accepted
            else None
        )

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
        "request_accepted": request_accepted,
        "companion_request": accepted_request,
        "companion_session": session_state,
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
# 7. 自主行为（事件与调试）
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


def _is_new_companion_request(before, after, action):
    """区分 start() 新建请求与返回已有 pending 请求。

    CompanionRequestTracker.start() 只返回请求字典，没有 created 标志；
    这里使用调用前后的快照判断。相同 action 的 pending 请求必须复用，
    不能再次扣精力或发布邀请事件。
    """
    if not isinstance(after, dict) or after.get("status") != "pending":
        return False
    if after.get("action") != action:
        return False
    if before is None:
        return True
    if before.get("status") != "pending" or before.get("action") != action:
        return True

    # 同类型 pending 请求只有 id 变化才算新建（例如恰好过期后重建）。
    return after.get("id") != before.get("id")


def _publish_autonomy_event(action, request_id=None):
    """发布一条后台自主行为事件；只在实际执行成功后调用。"""
    message = AUTONOMY_EVENT_MESSAGES.get(action)
    if message is None:
        return

    try:
        autonomy_events.publish(
            action,
            message,
            source="background",
            request_id=request_id,
        )
    except Exception:
        # 事件通知失败不应影响已经执行完成的行为.
        autonomy_logger.exception("自主行为事件发布失败")


def _log_background_action(action, before, after):
    """只记录真正产生状态变化的后台行为；重复 idle/rest 不经过这里。"""
    if action == "interact":
        autonomy_logger.info(
            "主动请求陪伴: 精力 %.1f -> %.1f, 社交需求 %.1f "
            "(请求不等于主人已回应)",
            before["energy"],
            after["energy"],
            after["social_need"],
        )
    elif action == "seek_comfort":
        autonomy_logger.info(
            "主动寻求安慰: 精力 %.1f -> %.1f, 情绪 %s/%.1f",
            before["energy"],
            after["energy"],
            after["emotion"],
            after["intensity"],
        )
    elif action == "rest":
        autonomy_logger.info("开始休息: 精力 %.1f", after["energy"])
    elif action == "idle":
        autonomy_logger.info("结束休息，进入待机: 精力 %.1f", after["energy"])


def run_autonomy_once(*, background=False, with_info=False):
    """执行一次自主行为决策，手动调试和后台循环共用这个入口。

    background=True 时只跳过“已经是 idle 的 idle”和“已经是 rest 的 rest”，
    避免每 10 秒重复打印/重复进入同一状态；rest -> idle 等真正的状态切换
    仍然会正常执行。

    interact / seek_comfort 还会先经过 CompanionRequestTracker：
    只有创建了新请求才执行动作并扣精力（后台模式才发布邀请事件）；
    同类型 pending 请求重复出现时跳过执行（不扣精力、不发事件），但保留
    decision 作为返回值以兼容手动调试 API。

    with_info=True 时额外返回第四个字典，供调试 API 区分“决策结果”和
    “实际执行结果”；默认仍返回原来的三元组。
    """
    with _autonomy_lock:
        state = store.get_state()
        now = time.monotonic()
        decision = autonomy_scheduler.tick(state, now)

        repeated = (
            background
            and decision == state.get("activity")
            and decision in ("idle", "rest")
        )
        executed = False
        request_created = False

        if repeated:
            # get_state() 已经结算了这段时间的待机/休息恢复.
            action = decision
            result = store.get_state()
            autonomy_logger.debug(
                "自主决策: %s (activity 未变化，跳过执行)",
                action,
            )
        else:
            action = decision
            should_execute = True
            request_id = None

            if decision in ("interact", "seek_comfort"):
                before = companion_tracker.get_current(now)
                request = companion_tracker.start(decision, now)
                request_created = _is_new_companion_request(
                    before,
                    request,
                    decision,
                )
                should_execute = request_created
                request_id = request.get("id") if request else None

                if not should_execute:
                    # 同类型 pending 请求已存在：不扣精力、不重复发布邀请
                    # 事件，也不重复执行动作。保留 decision 作为返回值，
                    # 以兼容手动调试 API；调度器冷却仍然照常更新。
                    result = store.get_state()
                    autonomy_logger.debug(
                        "自主决策: %s (已有同类型待回应请求，跳过执行)",
                        decision,
                    )

            if should_execute:
                result = execute_action(action, store)
                executed = True
                if background:
                    _log_background_action(action, state, result)
                    _publish_autonomy_event(action, request_id)

        cooldown = _cooldown_remaining(time.monotonic())
        execution_info = {
            "executed": executed,
            "request_created": request_created,
        }

    if with_info:
        return action, result, cooldown, execution_info
    return action, result, cooldown


def _run_autonomy_background():
    """后台线程入口：复用与手动调试相同的 run_autonomy_once()。"""
    return run_autonomy_once(background=True)


# 模块导入时只创建对象，不启动线程；由两个启动入口显式 start().
autonomy_loop = AutonomyLoop(
    _run_autonomy_background,
    interval_seconds=_autonomy_interval_from_env(),
    logger=autonomy_logger,
)


def start_autonomy_loop():
    """启动后台循环；同一进程内重复调用不会创建第二个线程。"""
    return autonomy_loop.start()


def stop_autonomy_loop(timeout=5.0):
    """停止后台循环；Event 会让等待立即返回。"""
    return autonomy_loop.stop(timeout=timeout)


@app.get("/api/autonomy/events")
def get_autonomy_events():
    """只读：返回 after_id 之后的后台自主行为事件，不触发任何决策。"""
    raw_after = request.args.get("after_id")

    if raw_after is None:
        after_id = None
    else:
        try:
            after_id = int(raw_after)
        except (TypeError, ValueError):
            return jsonify({"error": "after_id 必须是整数."}), 400

        if after_id < 0:
            return jsonify({"error": "after_id 不能为负数."}), 400

    return jsonify(autonomy_events.read(after_id))


@app.route("/api/debug/autonomy", methods=["GET", "POST"])
def debug_autonomy():
    """仅本地开发：查看冷却状态，或手动执行一次自主决策。

    GET  只返回接口可用状态和冷却剩余时间，不触发任何行为.
    POST 调用与后台循环共用的 run_autonomy_once()，执行一次后立即返回.
    """

    error = _debug_access_error()
    if error:
        return error

    if request.method == "GET":
        with _autonomy_lock:
            now = time.monotonic()
            cooldown_remaining = _cooldown_remaining(now)

        return jsonify({
            "enabled": True,
            "cooldown_seconds": autonomy_scheduler.cooldown_seconds,
            "cooldown_remaining": round(cooldown_remaining, 1),
        })

    # 与后台循环共用 run_autonomy_once()；锁在函数内部统一获取.
    try:
        action, result, cooldown_remaining, execution_info = run_autonomy_once(
            with_info=True,
        )
    except Exception as exc:
        app.logger.exception("自主行为执行失败")
        return jsonify({"error": f"自主行为执行失败: {exc}"}), 500

    return jsonify({
        "action": action,
        "state": result,
        "cooldown_seconds": autonomy_scheduler.cooldown_seconds,
        "cooldown_remaining": round(cooldown_remaining, 1),
        "simulated": True,
        "executed": execution_info["executed"],
        "request_created": execution_info["request_created"],
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

    with _autonomy_lock:
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

    with _autonomy_lock:
        autonomy_scheduler.last_interact_at = None

    return jsonify({
        "reset": True,
        "cooldown_seconds": autonomy_scheduler.cooldown_seconds,
        "cooldown_remaining": 0.0,
    })


# =========================
# 8. 启动服务
# =========================

def main():
    """HTTP 入口：启动 Flask 和后台自主行为循环。"""
    try:
        start_autonomy_loop()
        # use_reloader=False 很重要：否则 reloader 的父子进程会各启动一个循环.
        app.run(
            host="127.0.0.1",
            port=5000,
            debug=True,
            use_reloader=False,
            threaded=True,
        )
    finally:
        stop_autonomy_loop()


if __name__ == "__main__":
    main()
