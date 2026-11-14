"""TianBao Virtual V0.1 - Flask web entry.

Keep this file alongside the user's existing emotion.py. It does not import
main.py: the terminal's input loop should not be started by the web server.
"""

import threading
import time

from flask import Flask, jsonify, render_template, request

from emotion import (
    emotion_decay,
    event_expression,
    head_touch,
    sad_event,
    state_expression,
)

app = Flask(__name__)

# The web edition owns one in-memory state. It is independent from main.py.
tianbao = {"emotion": "happy", "intensity": 60}
personality = {"happy_decay": 1, "sad_decay": 4}

_last_update = time.monotonic()
_state_lock = threading.Lock()


def update_elapsed_time():
    """Apply decay once for the time since the previous state update.

    Called while holding _state_lock so GET and POST requests cannot
    accidentally update the same interval at the same time.
    """
    global _last_update
    now = time.monotonic()
    elapsed = max(0.0, now - _last_update)
    _last_update = now
    emotion_decay(tianbao, elapsed, personality)


def state_data():
    """Return JSON-serializable state. Caller must hold _state_lock."""
    return {
        "emotion": tianbao["emotion"],
        "intensity": round(float(tianbao["intensity"]), 2),
        "description": state_expression(tianbao),
    }


def read_amount(minimum, maximum):
    """Return (amount, error). Reject non-integers and out-of-range values."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None, "请求需要 JSON 对象."
    value = data.get("amount")
    if type(value) is not int:
        return None, "请输入整数形式的强度."
    if not minimum <= value <= maximum:
        return None, f"强度必须在 {minimum}-{maximum} 之间."
    return value, None


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/state")
def get_state():
    with _state_lock:
        update_elapsed_time()
        return jsonify(state_data())


@app.post("/api/touch")
def touch():
    amount, error = read_amount(1, 30)
    if error:
        return jsonify({"error": error}), 400

    with _state_lock:
        update_elapsed_time()
        head_touch(tianbao, amount)
        current = state_data()
        message = event_expression(tianbao, "touch")

    if amount <= 10:
        title = "轻轻摸摸头"
    elif amount <= 20:
        title = "温柔摸摸头"
    else:
        title = "亲昵摸摸头"

    return jsonify({
        "state": current,
        "event": {"type": "touch", "title": title, "message": message},
    })


@app.post("/api/sad_event")
def sad_event_api():
    amount, error = read_amount(0, 100)
    if error:
        return jsonify({"error": error}), 400

    with _state_lock:
        update_elapsed_time()
        if amount > 0:
            sad_event(tianbao, amount)
            message = event_expression(tianbao, "sad_event")
        else:
            message = "嘿嘿~好像没有发生什么不开心的事情呢!"
        current = state_data()

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
        "event": {"type": "sad", "title": title, "message": message},
    })


if __name__ == "__main__":
    # Development only; keep it local, do not expose the debug server publicly.
    app.run(host="127.0.0.1", port=5000, debug=True, use_reloader=False)
