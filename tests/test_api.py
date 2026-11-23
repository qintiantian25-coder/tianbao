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
from backend.autonomy_events import AutonomyEventBuffer
from core.behavior_scheduler import BehaviorScheduler
from core.companion_request import CompanionRequestTracker
from core.state_store import StateStore

# 导入 Flask 应用不应自动启动后台线程，后台循环应指向共享决策入口.
assert app_web.autonomy_loop.running is False
assert app_web.autonomy_loop.run_once is app_web._run_autonomy_background

client = app_web.app.test_client()
client.environ_base["REMOTE_ADDR"] = "127.0.0.1"


def reset_runtime():
    """每个接口测试使用新的状态、冷却、事件队列和请求管理器。"""
    app_web.store = StateStore()
    app_web.autonomy_scheduler = BehaviorScheduler(cooldown_seconds=60)
    app_web.autonomy_events = AutonomyEventBuffer(capacity=100)
    app_web.companion_tracker = CompanionRequestTracker(timeout_seconds=300)
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
    'id="companionRequestStatus"',
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
assert "/api/autonomy/events" in script_text
assert "/api/companion/request" in script_text
assert "AUTONOMY_META" in script_text
assert "seek_comfort" in script_text
assert "autonomyInteractionBusy" in script_text
assert "pendingAutonomyEvent" in script_text
assert "AUTONOMY_EVENT_TTL_MS" in script_text
assert 'appState.interaction.mode !== "idle"' in script_text
assert "voiceResponseActive" in script_text
assert "designPetActive" in script_text
assert "updateCompanionRequest" in script_text
assert "request_accepted" in script_text
assert "isInvitationStillRelevant" in script_text

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
assert touch_data["request_accepted"] is False
assert touch_data["companion_request"] is None

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

assert app_web.autonomy_events.latest_id == 0  # 重复 idle 不产生事件

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

assert app_web.autonomy_events.latest_id == 0  # 持续 rest 不产生事件

# 19. 休息结束条件满足时，后台模式会正常退出 rest
reset_runtime()
app_web.store.apply_social_need_decrease(60)  # social -> 20
app_web.store.set_activity("rest")  # energy 80，已经达到结束休息条件
action, state, _ = app_web.run_autonomy_once(background=True)
assert action == "idle"
assert state["activity"] == "idle"
exit_events = app_web.autonomy_events.read(0)["events"]
assert len(exit_events) == 1
assert exit_events[0]["action"] == "idle"
assert exit_events[0]["source"] == "background"

# 20. 后台模式继续遵守 interact 冷却
reset_runtime()
app_web.store.apply_social_need_increase(20)  # social -> 100
first_background = app_web.run_autonomy_once(background=True)
assert first_background[0] == "interact"
cooldown_mark = app_web.autonomy_scheduler.last_interact_at
assert cooldown_mark is not None

interact_events = app_web.autonomy_events.read(0)["events"]
assert len(interact_events) == 1
assert interact_events[0]["action"] == "interact"
assert "玩" in interact_events[0]["message"]
assert interact_events[0]["request_id"] == 1

second_background = app_web.run_autonomy_once(background=True)
assert second_background[0] == "idle"
assert app_web.autonomy_scheduler.last_interact_at == cooldown_mark
assert app_web.autonomy_events.latest_id == 1  # 冷却期间的 idle 不产生事件

# 20b. 开始休息和寻求安慰也只在真实执行时产生事件
reset_runtime()
app_web.store.apply_energy_cost(60)  # energy -> 20
rest_action, rest_state, _ = app_web.run_autonomy_once(background=True)
assert rest_action == "rest"
assert rest_state["activity"] == "rest"
rest_events = app_web.autonomy_events.read(0)["events"]
assert len(rest_events) == 1
assert rest_events[0]["action"] == "rest"
assert "休息" in rest_events[0]["message"]
assert rest_events[0]["request_id"] is None

reset_runtime()
app_web.store.apply_sad_event(80)
app_web.store.apply_sad_event(80)
comfort_action, comfort_state, _ = app_web.run_autonomy_once(background=True)
assert comfort_action == "seek_comfort"
assert comfort_state["emotion"] == "sad"
comfort_events = app_web.autonomy_events.read(0)["events"]
assert len(comfort_events) == 1
assert comfort_events[0]["action"] == "seek_comfort"
assert "安慰" in comfort_events[0]["message"]
assert comfort_events[0]["request_id"] == 1

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

# 23. 事件缓冲区：编号递增、只读快照、容量上限、首次加载语义
buffer = AutonomyEventBuffer(capacity=3)
assert buffer.latest_id == 0

first_event = buffer.publish("interact", "hello")
assert first_event["id"] == 1
assert first_event["action"] == "interact"
assert first_event["source"] == "background"
assert first_event["request_id"] is None
assert isinstance(first_event["created_at"], float)

buffer.publish("rest", "rest")
buffer.publish("idle", "idle")

snapshot_a = buffer.read(0)
snapshot_b = buffer.read(0)
assert [event["id"] for event in snapshot_a["events"]] == [1, 2, 3]
assert snapshot_a == snapshot_b  # 读取不会删除事件
assert buffer.latest_id == 3

buffer.publish("interact", "four")
buffer.publish("seek_comfort", "five")
overflow = buffer.read(0)
assert [event["id"] for event in overflow["events"]] == [3, 4, 5]
assert overflow["latest_id"] == 5
assert overflow["dropped"] is True
assert buffer.read(5)["events"] == []

ahead = buffer.read(99)
assert ahead["reset"] is True
assert ahead["latest_id"] == 5

buffer.reset()
assert buffer.latest_id == 0
assert buffer.read(0)["events"] == []
assert buffer.read(None) == {
    "events": [],
    "latest_id": 0,
    "oldest_id": 0,
    "dropped": False,
    "reset": False,
}

buffer.publish("rest", "history")
first_load = buffer.read(None)
assert first_load["events"] == []
assert first_load["latest_id"] == 1

# 24. 事件接口：首次加载不回放、游标读取、多客户端互不影响
reset_runtime()
app_web.store.apply_social_need_increase(20)  # social -> 100
app_web.run_autonomy_once(background=True)     # 发布 id=1

first_load = client.get("/api/autonomy/events")
assert first_load.status_code == 200
first_payload = first_load.get_json()
assert first_payload["events"] == []
assert first_payload["latest_id"] == 1

cursor = first_payload["latest_id"]
empty = client.get(f"/api/autonomy/events?after_id={cursor}").get_json()
assert empty["events"] == []

app_web.autonomy_events.publish("rest", "forced rest")

client_a = app_web.app.test_client()
client_b = app_web.app.test_client()
read_a = client_a.get("/api/autonomy/events?after_id=0").get_json()
read_b = client_b.get("/api/autonomy/events?after_id=0").get_json()
assert [event["id"] for event in read_a["events"]] == [1, 2]
assert read_a == read_b
assert client_a.get("/api/autonomy/events?after_id=0").get_json() == read_a

new_events = client.get(f"/api/autonomy/events?after_id={cursor}").get_json()
assert [event["action"] for event in new_events["events"]] == ["rest"]
assert new_events["latest_id"] == 2

# 25. 非法游标、容量溢出和重启后的编号重置
assert client.get("/api/autonomy/events?after_id=abc").status_code == 400
assert client.get("/api/autonomy/events?after_id=-1").status_code == 400

app_web.autonomy_events = AutonomyEventBuffer(capacity=3)
for index in range(5):
    app_web.autonomy_events.publish("interact", f"m{index}")

overflow_payload = client.get("/api/autonomy/events?after_id=0").get_json()
assert [event["id"] for event in overflow_payload["events"]] == [3, 4, 5]
assert overflow_payload["dropped"] is True

app_web.autonomy_events = AutonomyEventBuffer(capacity=10)
restart_payload = client.get("/api/autonomy/events?after_id=5").get_json()
assert restart_payload["reset"] is True
assert restart_payload["latest_id"] == 0
assert restart_payload["events"] == []

app_web.autonomy_events.publish("idle", "after restart")
after_restart = client.get("/api/autonomy/events?after_id=0").get_json()
assert [event["action"] for event in after_restart["events"]] == ["idle"]

# 26. 手动调试不会发布后台事件
reset_runtime()
app_web.store.apply_social_need_increase(20)
manual = client.post("/api/debug/autonomy", headers=headers, json={})
assert manual.status_code == 200
assert manual.get_json()["action"] == "interact"
assert app_web.autonomy_events.latest_id == 0

# 27. 事件接口只读，不触发决策或修改机器人状态
reset_runtime()
before_state = app_web.store.get_state()
with patch.object(app_web, "run_autonomy_once") as shared_entry:
    event_response = client.get("/api/autonomy/events")
    assert event_response.status_code == 200
    shared_entry.assert_not_called()

after_state = app_web.store.get_state()
assert after_state["activity"] == before_state["activity"] == "idle"
assert after_state["energy"] == before_state["energy"] == 80
assert app_web.autonomy_scheduler.last_interact_at is None

# 28. HTTP 与 HTTPS 入口共享同一个只读事件接口
assert serve_https.app is app_web.app
https_client = serve_https.app.test_client()
https_events = https_client.get("/api/autonomy/events")
assert https_events.status_code == 200
assert https_events.get_json()["latest_id"] == 0

# 29. 只读请求状态接口：无请求时明确返回 null，且不创建请求
reset_runtime()
energy_before_request = app_web.store.get_state()["energy"]
with patch.object(app_web, "run_autonomy_once") as shared_entry:
    request_response = client.get("/api/companion/request")
    assert request_response.status_code == 200
    shared_entry.assert_not_called()

request_payload = request_response.get_json()
assert request_payload["request"] is None
assert request_payload["remaining_seconds"] is None
assert request_payload["timeout_seconds"] == 300
assert app_web.store.get_state()["energy"] == energy_before_request
assert app_web.companion_tracker.get_current(time.monotonic()) is None

https_request = serve_https.app.test_client().get("/api/companion/request")
assert https_request.status_code == 200
assert https_request.get_json()["request"] is None

# 30. 后台 interact 创建请求；GET 只读且不重复扣精力
reset_runtime()
app_web.store.apply_social_need_increase(20)  # social -> 100
action, state, _ = app_web.run_autonomy_once(background=True)
assert action == "interact"
energy_after_interact = state["energy"]
event_after_interact = app_web.autonomy_events.latest_id

pending_payload = client.get("/api/companion/request").get_json()
pending = pending_payload["request"]
assert pending is not None
assert pending["id"] == 1
assert pending["action"] == "interact"
assert pending["status"] == "pending"
assert 0 < pending_payload["remaining_seconds"] <= 300

again = client.get("/api/companion/request").get_json()
assert again["request"]["id"] == 1
assert app_web.store.get_state()["energy"] == energy_after_interact
assert app_web.autonomy_events.latest_id == event_after_interact
assert app_web.companion_tracker.next_request_id == 2

# 31. 同类型 pending 请求重复出现时不再扣精力、不再发布邀请事件
reset_runtime()
app_web.store.apply_social_need_increase(20)
first = app_web.run_autonomy_once(background=True)
assert first[0] == "interact"
first_energy = first[1]["energy"]
first_event_id = app_web.autonomy_events.latest_id
first_request_id = app_web.companion_tracker.get_current(time.monotonic())["id"]

# 清掉调度器互动冷却，强制下一次决策仍然是 interact；请求仍然 pending。
app_web.autonomy_scheduler.last_interact_at = None
second = app_web.run_autonomy_once(background=True)
assert second[0] == "interact"  # 决策动作保留，兼容手动调试 API
assert second[1]["energy"] == first_energy
assert app_web.autonomy_events.latest_id == first_event_id

current = app_web.companion_tracker.get_current(time.monotonic())
assert current["id"] == first_request_id
assert current["status"] == "pending"
assert app_web.companion_tracker.next_request_id == 2

# 32. 不同类型的请求可以替换旧的 pending 请求
reset_runtime()
app_web.store.apply_social_need_increase(20)
app_web.run_autonomy_once(background=True)  # interact request id=1

app_web.store.apply_sad_event(80)
app_web.store.apply_sad_event(80)
comfort = app_web.run_autonomy_once(background=True)
assert comfort[0] == "seek_comfort"
replaced = app_web.companion_tracker.get_current(time.monotonic())
assert replaced["id"] == 2
assert replaced["action"] == "seek_comfort"
assert replaced["status"] == "pending"

all_events = app_web.autonomy_events.read(0)["events"]
assert [event["action"] for event in all_events] == [
    "interact",
    "seek_comfort",
]
assert [event["request_id"] for event in all_events] == [1, 2]

# 33. 首次摸头确认请求；后续摸头正常互动但不重复确认
reset_runtime()
app_web.store.apply_social_need_increase(20)
app_web.run_autonomy_once(background=True)
energy_before_touch = app_web.store.get_state()["energy"]

touch1 = client.post("/api/touch", json={"amount": 10})
assert touch1.status_code == 200
touch1_data = touch1.get_json()
assert touch1_data["request_accepted"] is True
assert touch1_data["companion_request"]["id"] == 1
assert touch1_data["companion_request"]["action"] == "interact"
assert touch1_data["companion_request"]["status"] == "responded"
assert "state" in touch1_data and "event" in touch1_data
assert touch1_data["state"]["energy"] == energy_before_touch

touch2 = client.post("/api/touch", json={"amount": 10})
assert touch2.status_code == 200
touch2_data = touch2.get_json()
assert touch2_data["request_accepted"] is False
assert touch2_data["companion_request"] is None
assert "state" in touch2_data and "event" in touch2_data

status_payload = client.get("/api/companion/request").get_json()
assert status_payload["request"]["id"] == 1
assert status_payload["request"]["status"] == "responded"
assert status_payload["remaining_seconds"] == 0

# 34. 过期请求通过只读接口返回 expired，GET 不创建新请求
reset_runtime()
app_web.companion_tracker = CompanionRequestTracker(timeout_seconds=0)
app_web.companion_tracker.start("interact", time.monotonic())

expired_payload = client.get("/api/companion/request").get_json()
assert expired_payload["request"]["action"] == "interact"
assert expired_payload["request"]["status"] == "expired"
assert expired_payload["remaining_seconds"] == 0
assert app_web.companion_tracker.next_request_id == 2

# 35. 手动调试也遵守请求去重，不重复扣精力或发布后台事件
reset_runtime()
app_web.store.apply_social_need_increase(20)
manual_first = client.post(
    "/api/debug/autonomy", headers=headers, json={}
).get_json()
assert manual_first["action"] == "interact"
manual_energy = manual_first["state"]["energy"]
assert app_web.autonomy_events.latest_id == 0

app_web.autonomy_scheduler.last_interact_at = None
manual_second = client.post(
    "/api/debug/autonomy", headers=headers, json={}
).get_json()
assert manual_second["action"] == "interact"  # 决策动作保留
assert manual_second["state"]["energy"] == manual_energy
assert app_web.autonomy_events.latest_id == 0
assert app_web.companion_tracker.get_current(time.monotonic())["id"] == 1
assert app_web.companion_tracker.next_request_id == 2

print("后端接口集成测试通过！")
