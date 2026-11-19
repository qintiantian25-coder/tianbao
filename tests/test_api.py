import os
import sys
import threading
import time
from pathlib import Path
from unittest.mock import Mock, patch

# 允许直接运行: python tests/test_api.py
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app_web
import serve_https
from core.behavior_scheduler import BehaviorScheduler
from core.state_store import StateStore

# 导入 Flask 应用不应自动启动后台线程，后台循环应指向共享决策入口.
assert app_web.autonomy_loop.running is False
assert app_web.autonomy_loop.run_once is app_web._run_autonomy_background

client = app_web.app.test_client()
client.environ_base["REMOTE_ADDR"] = "127.0.0.1"


def reset_runtime():
    """每个接口测试使用新的状态和冷却计时，避免相互影响。"""
    app_web.store = StateStore()
    app_web.autonomy_scheduler = BehaviorScheduler(cooldown_seconds=60)
    app_web.DEBUG_AUTONOMY_API = False


# 1. /api/state 返回真实精力/社交需求，查询本身不触发自主行为
reset_runtime()
first = client.get("/api/state")
assert first.status_code == 200
first_state = first.get_json()
assert first_state["energy"] == 80
assert first_state["social_need"] == 80

second_state = client.get("/api/state").get_json()
assert second_state["energy"] == 80
assert second_state["social_need"] == 80
assert app_web.autonomy_scheduler.last_interact_at is None

# 2. 页面包含新增的调试字段和手动决策按钮
page = client.get("/")
assert page.status_code == 200
html = page.get_data(as_text=True)
for marker in (
    'id="dbgEnergy"',
    'id="dbgSocial"',
    'id="autonomyTick"',
    'data-autonomy-preset="wants_companion"',
    'data-autonomy-preset="low_energy"',
    'data-autonomy-preset="normal_idle"',
    'id="autonomyCooldownReset"',
    'class="service-commands"',
    "服务台",
):
    assert marker in html, marker

styles = client.get("/static/style.css")
assert styles.status_code == 200
assert ".service-commands" in styles.get_data(as_text=True)

script = client.get("/static/app.js")
assert script.status_code == 200
script_text = script.get_data(as_text=True)
assert "/api/debug/autonomy" in script_text
assert "/api/debug/state/preset" in script_text
assert "AUTONOMY_META" in script_text

# 3. 本机 GET 调试状态可用，而且不会触发行为
status = client.get("/api/debug/autonomy")
assert status.status_code == 200
status_data = status.get_json()
assert status_data["enabled"] is True
assert status_data["cooldown_seconds"] == 60
assert status_data["cooldown_remaining"] == 0
assert app_web.autonomy_scheduler.last_interact_at is None

# 4. 手动决策 interact，并验证冷却生效
reset_runtime()
app_web.store.apply_social_need_increase(70)

headers = {"X-Tianbao-Debug": "1"}
first_tick = client.post("/api/debug/autonomy", headers=headers, json={})
assert first_tick.status_code == 200
tick_data = first_tick.get_json()
assert tick_data["action"] == "interact"
assert tick_data["state"]["energy"] == 70
assert tick_data["state"]["social_need"] == 100
assert tick_data["cooldown_remaining"] > 0

second_tick = client.post(
    "/api/debug/autonomy", headers=headers, json={}
).get_json()
assert second_tick["action"] == "idle"
assert second_tick["state"]["energy"] == 70
assert second_tick["state"]["social_need"] == 100

# 5. 精力不足时手动决策休息
reset_runtime()
app_web.store.apply_energy_cost(60)

rest_tick = client.post("/api/debug/autonomy", headers=headers, json={})
assert rest_tick.status_code == 200
rest_data = rest_tick.get_json()
assert rest_data["action"] == "rest"
assert rest_data["state"]["energy"] == 20
assert rest_data["state"]["activity"] == "rest"

# 6. 条件不满足时保持待机
reset_runtime()
app_web.store.apply_social_need_decrease(60)
idle_data = client.post(
    "/api/debug/autonomy", headers=headers, json={}
).get_json()
assert idle_data["action"] == "idle"
assert idle_data["state"]["energy"] == 80
assert idle_data["state"]["social_need"] == 20

# 7. 没有调试请求头时拒绝执行
reset_runtime()
missing_header = client.post("/api/debug/autonomy", json={})
assert missing_header.status_code == 403

# 8. 非本机来源无法访问调试接口
non_local = client.post(
    "/api/debug/autonomy",
    headers=headers,
    json={},
    environ_overrides={"REMOTE_ADDR": "192.168.1.50"},
)
assert non_local.status_code == 403

non_local_status = client.get(
    "/api/debug/autonomy",
    environ_overrides={"REMOTE_ADDR": "192.168.1.50"},
)
assert non_local_status.status_code == 403

# 9. 原有摸头接口仍然正常
reset_runtime()
touch = client.post("/api/touch", json={"amount": 10})
assert touch.status_code == 200
touch_data = touch.get_json()
assert "state" in touch_data and "event" in touch_data
assert touch_data["state"]["energy"] == 80

# 10. 状态预设通过后端 StateStore 生效（不是前端改显示数值）
reset_runtime()
preset = client.post(
    "/api/debug/state/preset",
    headers=headers,
    json={"preset": "wants_companion"},
)
assert preset.status_code == 200
preset_data = preset.get_json()
assert preset_data["preset"] == "wants_companion"
assert preset_data["state"]["energy"] == 80
assert preset_data["state"]["social_need"] == 90
assert preset_data["cooldown_reset"] is False
assert app_web.autonomy_scheduler.last_interact_at is None
assert app_web.store.get_state()["energy"] == 80
assert app_web.store.get_state()["social_need"] == 90

# 11. 其余预设通过已有增减方法到达目标值
low = client.post(
    "/api/debug/state/preset",
    headers=headers,
    json={"preset": "low_energy"},
).get_json()
assert low["state"]["energy"] == 20
assert low["state"]["social_need"] == 20
assert low["cooldown_reset"] is False

normal = client.post(
    "/api/debug/state/preset",
    headers=headers,
    json={"preset": "normal_idle"},
).get_json()
assert normal["state"]["energy"] == 80
assert normal["state"]["social_need"] == 20
assert normal["cooldown_reset"] is False

# 12. 选择预设只改状态，不会自动执行行为
assert app_web.autonomy_scheduler.last_interact_at is None
idle_after_preset = client.post(
    "/api/debug/autonomy", headers=headers, json={}
).get_json()
assert idle_after_preset["action"] == "idle"

# 13. 预设不会清除已有冷却；清除冷却是独立接口
reset_runtime()
app_web.store.apply_social_need_increase(70)

first_interact = client.post(
    "/api/debug/autonomy", headers=headers, json={}
).get_json()
assert first_interact["action"] == "interact"
cooldown_mark = app_web.autonomy_scheduler.last_interact_at
assert cooldown_mark is not None

preset_during_cooldown = client.post(
    "/api/debug/state/preset",
    headers=headers,
    json={"preset": "wants_companion"},
).get_json()
assert preset_during_cooldown["state"]["energy"] == 80
assert preset_during_cooldown["state"]["social_need"] == 90
assert preset_during_cooldown["cooldown_reset"] is False
assert preset_during_cooldown["cooldown_remaining"] > 0
assert app_web.autonomy_scheduler.last_interact_at == cooldown_mark

blocked_tick = client.post(
    "/api/debug/autonomy", headers=headers, json={}
).get_json()
assert blocked_tick["action"] == "idle"

state_before_reset = app_web.store.get_state()
reset_response = client.post(
    "/api/debug/autonomy/reset", headers=headers, json={}
)
assert reset_response.status_code == 200
reset_data = reset_response.get_json()
assert reset_data["reset"] is True
assert reset_data["cooldown_remaining"] == 0
assert app_web.autonomy_scheduler.last_interact_at is None

state_after_reset = app_web.store.get_state()
assert state_after_reset["energy"] == state_before_reset["energy"]
assert state_after_reset["social_need"] == state_before_reset["social_need"]

after_reset_tick = client.post(
    "/api/debug/autonomy", headers=headers, json={}
).get_json()
assert after_reset_tick["action"] == "interact"

# 14. 预设参数与调试接口访问保护
reset_runtime()
unknown = client.post(
    "/api/debug/state/preset",
    headers=headers,
    json={"preset": "unknown"},
)
assert unknown.status_code == 400

invalid_type = client.post(
    "/api/debug/state/preset",
    headers=headers,
    json={"preset": []},
)
assert invalid_type.status_code == 400

missing_header_preset = client.post(
    "/api/debug/state/preset",
    json={"preset": "normal_idle"},
)
assert missing_header_preset.status_code == 403

missing_header_reset = client.post("/api/debug/autonomy/reset", json={})
assert missing_header_reset.status_code == 403

non_local_preset = client.post(
    "/api/debug/state/preset",
    headers=headers,
    json={"preset": "normal_idle"},
    environ_overrides={"REMOTE_ADDR": "192.168.1.50"},
)
assert non_local_preset.status_code == 403

non_local_reset = client.post(
    "/api/debug/autonomy/reset",
    headers=headers,
    json={},
    environ_overrides={"REMOTE_ADDR": "192.168.1.50"},
)
assert non_local_reset.status_code == 403

# 15. 后台决策间隔可通过环境变量配置；无效值回退默认 10 秒
with patch.dict(os.environ, {"TIANBAO_AUTONOMY_INTERVAL": "2.5"}):
    assert app_web._autonomy_interval_from_env() == 2.5

with patch.dict(os.environ, {"TIANBAO_AUTONOMY_INTERVAL": "bad"}):
    with patch.object(app_web.autonomy_logger, "warning") as warning:
        assert app_web._autonomy_interval_from_env() == 10.0
        assert warning.called

# 16. 手动接口和后台入口共用 run_autonomy_once()
reset_runtime()
fake_state = app_web.store.get_state()

with patch.object(
    app_web,
    "run_autonomy_once",
    return_value=("idle", fake_state, 0.0),
) as shared_entry:
    response = client.post("/api/debug/autonomy", headers=headers, json={})
    assert response.status_code == 200
    shared_entry.assert_called_once_with()

with patch.object(
    app_web,
    "run_autonomy_once",
    return_value=("idle", fake_state, 0.0),
) as shared_entry:
    app_web._run_autonomy_background()
    shared_entry.assert_called_once_with(background=True)

# 17. 后台模式不会重复执行已经处于 idle 的 idle
reset_runtime()
app_web.store.apply_social_need_decrease(20)  # 80 -> 60，低于互动阈值
with patch.object(app_web, "execute_action") as execute:
    action, state, _ = app_web.run_autonomy_once(background=True)
    assert action == "idle"
    assert state["activity"] == "idle"
    execute.assert_not_called()

# 18. 后台模式不会重复进入已经处于 rest 的 rest
reset_runtime()
app_web.store.apply_social_need_decrease(60)  # social -> 20
app_web.store.set_activity("rest")
app_web.store.apply_energy_cost(30)  # energy -> 50
with patch.object(app_web, "execute_action") as execute:
    action, state, _ = app_web.run_autonomy_once(background=True)
    assert action == "rest"
    assert state["activity"] == "rest"
    execute.assert_not_called()

# 19. 休息结束条件满足时，后台模式会正常退出 rest
reset_runtime()
app_web.store.apply_social_need_decrease(60)  # social -> 20
app_web.store.set_activity("rest")  # energy 80，已经达到结束休息条件
action, state, _ = app_web.run_autonomy_once(background=True)
assert action == "idle"
assert state["activity"] == "idle"

# 20. 后台模式继续遵守 interact 冷却
reset_runtime()
app_web.store.apply_social_need_increase(20)  # social -> 100
first_background = app_web.run_autonomy_once(background=True)
assert first_background[0] == "interact"
cooldown_mark = app_web.autonomy_scheduler.last_interact_at
assert cooldown_mark is not None

second_background = app_web.run_autonomy_once(background=True)
assert second_background[0] == "idle"
assert app_web.autonomy_scheduler.last_interact_at == cooldown_mark

# 21. 并发调用被同一把非重入锁串行化
reset_runtime()
calls_active = 0
max_active = 0
active_guard = threading.Lock()
thread_errors = []


def fake_execute(action, store):
    global calls_active, max_active

    with active_guard:
        calls_active += 1
        max_active = max(max_active, calls_active)

    time.sleep(0.05)

    with active_guard:
        calls_active -= 1

    return store.get_state()


barrier = threading.Barrier(2)


def worker():
    try:
        barrier.wait(timeout=2)
        app_web.run_autonomy_once(background=True)
    except Exception as exc:
        thread_errors.append(exc)


with patch.object(app_web, "execute_action", side_effect=fake_execute), \
        patch.object(app_web.autonomy_scheduler, "tick", return_value="interact"):
    threads = [
        threading.Thread(target=worker, daemon=True)
        for _ in range(2)
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=3)

assert not thread_errors
assert max_active == 1
assert all(not thread.is_alive() for thread in threads)

# 22. HTTP / HTTPS 入口都会启动并停止同一个后台循环
with patch.object(app_web, "start_autonomy_loop") as start_loop, \
        patch.object(app_web, "stop_autonomy_loop") as stop_loop, \
        patch.object(app_web.app, "run") as run_server:
    app_web.main()

assert start_loop.call_count == 1
assert stop_loop.call_count == 1
assert run_server.call_count == 1

cert_file = Mock()
cert_file.is_file.return_value = True
key_file = Mock()
key_file.is_file.return_value = True

with patch.object(serve_https, "start_autonomy_loop") as start_loop, \
        patch.object(serve_https, "stop_autonomy_loop") as stop_loop, \
        patch.object(serve_https.app, "run") as run_server, \
        patch.object(serve_https, "detect_lan_ip", return_value="127.0.0.1"), \
        patch.object(serve_https, "CERT_PATH", cert_file), \
        patch.object(serve_https, "KEY_PATH", key_file):
    serve_https.main()

assert start_loop.call_count == 1
assert stop_loop.call_count == 1
assert run_server.call_count == 1

# 所有测试结束后仍然没有真实启动后台线程.
assert app_web.autonomy_loop.running is False

print("后端接口集成测试通过！")
