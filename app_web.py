
"""TianBao Virtual - Flask Web Backend.

负责:
1. 提供前端网页
2. 接收和校验 HTTP 请求
3. 调用 StateStore 管理机器人状态
4. 返回 JSON 响应

情绪算法保留在 emotion.py 中。
状态管理交给 backend/state_store.py。
"""

from flask import Flask, jsonify, render_template, request

from backend.state_store import StateStore
from backend.tts_proxy import tts_bp


# =========================
# 1. 初始化 Flask 和状态管理
# =========================

app = Flask(__name__)

# 整个 Flask 服务共用一个 StateStore 实例
store = StateStore()

# 多音色语音服务同源代理: /api/tts/status, /api/tts/voices, /api/tts
app.register_blueprint(tts_bp)


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

@app.get("/api/state")
def get_state():

    current = store.get_state()

    return jsonify(current)


# =========================
# 5. 摸头事件
# =========================

@app.post("/api/touch")
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
# 7. 启动服务
# =========================

if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True,
        use_reloader=False,
        threaded=True,
    )
