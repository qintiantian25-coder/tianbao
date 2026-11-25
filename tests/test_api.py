import os
import re
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
from core.companion_session import CompanionSession
from core.state_store import StateStore

# 导入 Flask 应用不应自动启动后台线程，后台循环应指向共享决策入口.
assert app_web.autonomy_loop.running is False
assert app_web.autonomy_loop.run_once is app_web._run_autonomy_background

client = app_web.app.test_client()
client.environ_base["REMOTE_ADDR"] = "127.0.0.1"


def reset_runtime():
    """每个接口测试使用新的状态、冷却、事件队列、请求和会话管理器。"""
    app_web.store = StateStore()
    app_web.autonomy_scheduler = BehaviorScheduler(cooldown_seconds=60)
    app_web.autonomy_events = AutonomyEventBuffer(capacity=100)
    app_web.companion_tracker = CompanionRequestTracker(timeout_seconds=300)
    app_web.companion_session = CompanionSession()
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
    'id="companionSessionStatus"',
    'id="skinOpen"',
    'id="skinPanel"',
    'id="home3dCanvas"',
    'id="home3dCameraOverlay"',
    'id="isoChargePad"',
    'id="debugChargeStatus"',
    'id="isoNearbyPrompt"',
    'id="isoNearbyDebug"',
    'data-skin-tab="ai"',
    'data-skin-tab="robot"',
    'data-skin-tab="finish"',
    'id="home3dKeyboardHint"',
    'id="home3dPetButton"',
    'id="cameraButton"',
    'class="service-commands"',
    "服务台",
):
    assert marker in html, marker

# The skin drawer must start collapsed (the default state is part of the UX).
assert re.search(r'id="skinPanel"[^>]*\bhidden\b', html)

styles = client.get("/static/style.css")
assert styles.status_code == 200
styles_text = styles.get_data(as_text=True)
for marker in (
    ".service-commands",
    ".skin-panel",
    ".skin-card",
    ".iso-charge-pad",
    ".iso-nearby-prompt",
    ".home3d-shell",
    ".home3d-camera-overlay",
):
    assert marker in styles_text, marker

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
assert "applySkinTheme" in script_text
assert "wireSkinPanel" in script_text
assert "ALL_SKINS" in script_text
assert "home3d.js?v=0.7.1" in script_text
assert "open3DCamera" in script_text
assert "runFurnitureAction" in script_text
assert "pressEInteraction" in script_text
assert "nearestIsoInteraction" in script_text
assert '"KeyE"' in script_text
assert "isoNearbyPrompt" in script_text
assert "requestReturnDock" in script_text
assert "/api/charge" in script_text
assert "updateCompanionRequest" in script_text
assert "request_accepted" in script_text
assert "isInvitationStillRelevant" in script_text
assert "data.executed === false" in script_text
assert "已有待回应请求，未重复发起" in script_text
assert "/api/companion/session" in script_text
assert "updateCompanionSession" in script_text
assert "companion_session" in script_text
assert "companionSessionStatus" in script_text
assert "applyCompanionPollResults" in script_text
assert "poll-guard.js" in script_text
assert "currentEpoch: backendEpoch" in script_text
assert "isInvitationStillRelevantPure" in script_text

# 2b. V0.7 皮肤 / 3D / 充电静态资源可加载
skins_js = client.get("/static/skins.js")
assert skins_js.status_code == 200
skins_text = skins_js.get_data(as_text=True)
for marker in ("AI_SKINS", "ROBOT_SKINS", "FINISHES", "灵犀", "龙角机", "deepsea"):
    assert marker in skins_text, marker

layout_js = client.get("/static/home-layout.js")
assert layout_js.status_code == 200
layout_text = layout_js.get_data(as_text=True)
for marker in ("横厅 · 客厅", "createNavigationGrid", "chargingStateFor", "charging"):
    assert marker in layout_text, marker

home3d_js = client.get("/static/home3d.js")
assert home3d_js.status_code == 200
home3d_text = home3d_js.get_data(as_text=True)
assert "export class Home3D" in home3d_text
assert "FIRST_PERSON_FOV" in home3d_text
assert "FIRST PERSON" in home3d_text
assert "KeyW" in home3d_text
assert "eye.yaw" in home3d_text
assert "TIANBAO EYE" in html
assert "SIM CAM" in html
furniture_js = client.get("/static/furniture-interactions.js")
assert furniture_js.status_code == 200
furniture_text = furniture_js.get_data(as_text=True)
for marker in ("ISO_FURNITURE_INTERACTIONS", "nearestIsoInteraction", "按 E"):
    assert marker in furniture_text, marker
assert client.get("/static/vendor/three.module.min.js").status_code == 200
assert client.get("/static/vendor/THREE-LICENSE.txt").status_code == 200

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
    return_value=(
        "idle",
        fake_state,
        0.0,
        {"executed": True, "request_created": False},
    ),
) as shared_entry:
    response = client.post("/api/debug/autonomy", headers=headers, json={})
    assert response.status_code == 200
    shared_entry.assert_called_once_with(with_info=True)

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
assert manual_first["executed"] is True
assert manual_first["request_created"] is True
manual_energy = manual_first["state"]["energy"]
assert app_web.autonomy_events.latest_id == 0

app_web.autonomy_scheduler.last_interact_at = None
manual_second = client.post(
    "/api/debug/autonomy", headers=headers, json={}
).get_json()
assert manual_second["action"] == "interact"  # 决策动作保留
assert manual_second["executed"] is False
assert manual_second["request_created"] is False
assert manual_second["state"]["energy"] == manual_energy
assert app_web.autonomy_events.latest_id == 0
assert app_web.companion_tracker.get_current(time.monotonic())["id"] == 1
assert app_web.companion_tracker.next_request_id == 2

# 没有陪伴请求的普通 idle 仍然算“实际执行”，只是没有新建请求.
reset_runtime()
app_web.store.apply_social_need_decrease(60)
idle_debug = client.post(
    "/api/debug/autonomy", headers=headers, json={}
).get_json()
assert idle_debug["action"] == "idle"
assert idle_debug["executed"] is True
assert idle_debug["request_created"] is False

# 36. 持续陪伴会话：首次摸头开始计数 1，后续累加；只读接口不推进会话
reset_runtime()
initial_session = client.get("/api/companion/session")
assert initial_session.status_code == 200
initial_state = initial_session.get_json()
assert initial_state["is_active"] is False
assert initial_state["interaction_count"] == 0
assert initial_state["last_interaction_type"] is None
assert initial_state["started_at"] is None

with patch.object(app_web, "run_autonomy_once") as shared_entry:
    reread = client.get("/api/companion/session").get_json()
    shared_entry.assert_not_called()
assert reread["interaction_count"] == 0

first_touch = client.post("/api/touch", json={"amount": 10})
assert first_touch.status_code == 200
first_data = first_touch.get_json()
assert "state" in first_data and "event" in first_data
assert first_data["companion_session"]["is_active"] is True
assert first_data["companion_session"]["interaction_count"] == 1
assert first_data["companion_session"]["last_interaction_type"] == "touch"

second_touch = client.post("/api/touch", json={"amount": 20})
assert second_touch.status_code == 200
second_data = second_touch.get_json()
assert second_data["companion_session"]["is_active"] is True
assert second_data["companion_session"]["interaction_count"] == 2
assert second_data["companion_session"]["last_interaction_type"] == "touch"

session_state = client.get("/api/companion/session").get_json()
assert session_state["is_active"] is True
assert session_state["interaction_count"] == 2
assert session_state["last_interaction_type"] == "touch"
assert session_state["started_at"] is not None
assert session_state["last_interaction_at"] is not None

https_session = serve_https.app.test_client().get("/api/companion/session")
assert https_session.status_code == 200
assert https_session.get_json()["interaction_count"] == 2

# 37. 邀请回应与持续陪伴会话相互独立
reset_runtime()
app_web.store.apply_social_need_increase(20)
app_web.run_autonomy_once(background=True)  # pending request

before_touch = client.get("/api/companion/session").get_json()
assert before_touch["is_active"] is False
assert before_touch["interaction_count"] == 0

accepted_touch = client.post(
    "/api/touch", json={"amount": 10}
).get_json()
assert accepted_touch["request_accepted"] is True
assert accepted_touch["companion_request"]["status"] == "responded"
assert accepted_touch["companion_session"]["is_active"] is True
assert accepted_touch["companion_session"]["interaction_count"] == 1

next_touch = client.post(
    "/api/touch", json={"amount": 10}
).get_json()
assert next_touch["request_accepted"] is False
assert next_touch["companion_session"]["is_active"] is True
assert next_touch["companion_session"]["interaction_count"] == 2

# 38. 无线充电接口真实提升精力、封顶 100、不触发决策/事件
reset_runtime()
app_web.store.apply_energy_cost(60)  # 80 -> 20
charge_before = app_web.store.get_state()
charge_response = client.post("/api/charge")
assert charge_response.status_code == 200
charge_data = charge_response.get_json()
assert charge_data["rate"] == app_web.CHARGE_ENERGY_PER_TICK
assert charge_data["charged"] > 0
assert charge_data["state"]["energy"] > charge_before["energy"]
assert charge_data["full"] is False
assert app_web.autonomy_scheduler.last_interact_at is None
assert app_web.autonomy_events.latest_id == 0

for _ in range(50):
    final_charge = client.post("/api/charge").get_json()
    if final_charge["full"]:
        break
assert final_charge["state"]["energy"] == 100
assert final_charge["full"] is True
full_again = client.post("/api/charge").get_json()
assert full_again["state"]["energy"] == 100
assert full_again["charged"] == 0
assert full_again["full"] is True
assert app_web.autonomy_scheduler.last_interact_at is None
assert app_web.autonomy_events.latest_id == 0
assert client.get("/api/charge").status_code == 405

https_charge = serve_https.app.test_client().post("/api/charge")
assert https_charge.status_code == 200
assert https_charge.get_json()["state"]["energy"] == 100

# ==========================================================================
# v0.5 互动反馈 API：只读快照 + 会话频率
# ==========================================================================

def configure_feedback_state(*, emotion="calm", energy=80.0,
                             social_need=20.0, intensity=0.0):
    """构造确定性的 StateStore 测试状态，不触碰反馈算法本身。"""
    app_web.store.tianbao.update({
        "emotion": emotion,
        "intensity": intensity,
        "energy": energy,
        "social_need": social_need,
    })
    # 冻结自然衰减/恢复，便于断言 GET 没有额外修改状态。
    app_web.store.rates = {key: 0.0 for key in app_web.store.rates}


def seed_feedback_session(*offsets):
    """用现有 CompanionSession API 准备共享会话，offsets 相对当前 monotonic。"""
    base = time.monotonic()
    session = app_web.companion_session
    session.start(base + offsets[0], "touch")
    for offset in offsets[1:]:
        session.interact(base + offset, "touch")
    return base


# 39. 反馈接口：初始无互动、1 次、2 次、3 次及以上
reset_runtime()
configure_feedback_state()
initial_feedback = client.get("/api/companion/feedback")
assert initial_feedback.status_code == 200
assert initial_feedback.get_json() == {
    "tendency": "neutral",
    "frequency": "none",
    "recent_count": 0,
}
assert app_web.companion_session.get_state()["is_active"] is False
assert app_web.companion_session.get_state()["interaction_count"] == 0

https_feedback = serve_https.app.test_client().get("/api/companion/feedback")
assert https_feedback.status_code == 200
assert https_feedback.get_json()["recent_count"] == 0

# 接口必须委托现有 get_companion_feedback()，并传入全局 session 与 monotonic now。
with patch.object(
    app_web,
    "get_companion_feedback",
    wraps=app_web.get_companion_feedback,
) as feedback_entry:
    delegated = client.get("/api/companion/feedback")
    assert delegated.status_code == 200
    assert feedback_entry.call_count == 1
    call_args, call_kwargs = feedback_entry.call_args
    assert len(call_args) == 3
    assert isinstance(call_args[0], dict)
    assert call_args[1] is app_web.companion_session
    assert isinstance(call_args[2], float)
    assert call_kwargs == {}
assert delegated.get_json() == {
    "tendency": "neutral",
    "frequency": "none",
    "recent_count": 0,
}

base = time.monotonic()
app_web.companion_session.start(base - 4, "touch")
one_feedback = client.get("/api/companion/feedback").get_json()
assert one_feedback == {
    "tendency": "neutral",
    "frequency": "low",
    "recent_count": 1,
}

app_web.companion_session.interact(base - 3, "touch")
two_feedback = client.get("/api/companion/feedback").get_json()
assert two_feedback == {
    "tendency": "neutral",
    "frequency": "low",
    "recent_count": 2,
}

app_web.companion_session.interact(base - 2, "touch")
three_feedback = client.get("/api/companion/feedback").get_json()
assert three_feedback == {
    "tendency": "affectionate",
    "frequency": "frequent",
    "recent_count": 3,
}

app_web.companion_session.interact(base - 1, "touch")
four_feedback = client.get("/api/companion/feedback").get_json()
assert four_feedback == {
    "tendency": "affectionate",
    "frequency": "frequent",
    "recent_count": 4,
}

# 40. 五分钟窗口过期：会话仍 active，但旧互动不再计入反馈
reset_runtime()
configure_feedback_state()
expired_base = time.monotonic()
app_web.companion_session.start(expired_base - 400, "touch")
app_web.companion_session.interact(expired_base - 350, "touch")
app_web.companion_session.interact(expired_base - 301, "touch")
expired_feedback = client.get("/api/companion/feedback").get_json()
assert expired_feedback == {
    "tendency": "neutral",
    "frequency": "none",
    "recent_count": 0,
}
expired_session = app_web.companion_session.get_state()
assert expired_session["is_active"] is True
assert expired_session["interaction_count"] == 3

# 41. 结束会话：历史保留，但反馈按无活动会话返回 0 次
reset_runtime()
configure_feedback_state()
ended_base = time.monotonic()
app_web.companion_session.start(ended_base - 2, "touch")
app_web.companion_session.interact(ended_base - 1, "touch")
app_web.companion_session.interact(ended_base - 0.5, "touch")
assert client.get("/api/companion/feedback").get_json()["recent_count"] == 3

assert app_web.companion_session.end() is True
ended_feedback = client.get("/api/companion/feedback").get_json()
assert ended_feedback == {
    "tendency": "neutral",
    "frequency": "none",
    "recent_count": 0,
}
ended_session = app_web.companion_session.get_state()
assert ended_session["is_active"] is False
assert ended_session["interaction_count"] == 3

# 42. 重新开始会话：只统计新会话的互动
reset_runtime()
configure_feedback_state()
restart_base = time.monotonic()
app_web.companion_session.start(restart_base - 2, "touch")
app_web.companion_session.interact(restart_base - 1, "touch")
app_web.companion_session.interact(restart_base - 0.5, "touch")
assert app_web.companion_session.end() is True
app_web.companion_session.start(time.monotonic(), "touch")
restart_feedback = client.get("/api/companion/feedback").get_json()
assert restart_feedback == {
    "tendency": "neutral",
    "frequency": "low",
    "recent_count": 1,
}
assert app_web.companion_session.get_state()["interaction_count"] == 1

# 43. 伤心 / 疲倦 / 活泼的既有优先级不被频繁互动覆盖
reset_runtime()
configure_feedback_state()
priority_base = time.monotonic()
app_web.companion_session.start(priority_base - 3, "touch")
app_web.companion_session.interact(priority_base - 2, "touch")
app_web.companion_session.interact(priority_base - 1, "touch")

priority_cases = [
    ("sad", 80.0, 80.0, 20.0, "gentle"),
    ("happy", 20.0, 80.0, 20.0, "tired"),
    ("happy", 80.0, 80.0, 20.0, "playful"),
    ("calm", 80.0, 0.0, 80.0, "affectionate"),
]
for emotion, energy, intensity, social_need, expected in priority_cases:
    app_web.store.tianbao.update({
        "emotion": emotion,
        "intensity": intensity,
        "energy": energy,
        "social_need": social_need,
    })
    before_state = dict(app_web.store.tianbao)
    feedback = client.get("/api/companion/feedback").get_json()
    assert feedback == {
        "tendency": expected,
        "frequency": "frequent",
        "recent_count": 3,
    }
    assert app_web.store.tianbao == before_state

# 44. 多次 GET 无副作用：不推进会话、不创建请求、不改状态/事件/冷却
reset_runtime()
configure_feedback_state()
side_base = time.monotonic()
app_web.companion_session.start(side_base - 3, "touch")
app_web.companion_session.interact(side_base - 2, "touch")
app_web.companion_session.interact(side_base - 1, "touch")

session_before = app_web.companion_session.get_state()
snapshot_before = app_web.companion_session.get_feedback_snapshot(time.monotonic())
request_before = app_web.companion_tracker.get_current(time.monotonic())
next_request_id_before = app_web.companion_tracker.next_request_id
events_before = app_web.autonomy_events.latest_id
cooldown_before = app_web.autonomy_scheduler.last_interact_at
state_before = app_web.store.get_state()
store_before = dict(app_web.store.tianbao)

responses = []
with patch.object(app_web, "run_autonomy_once") as shared_entry:
    for _ in range(5):
        response = client.get("/api/companion/feedback")
        assert response.status_code == 200
        responses.append(response.get_json())
    shared_entry.assert_not_called()

assert all(response == responses[0] for response in responses)
assert responses[0] == {
    "tendency": "affectionate",
    "frequency": "frequent",
    "recent_count": 3,
}
assert app_web.store.get_state() == state_before
assert app_web.store.tianbao == store_before
assert app_web.companion_session.get_state() == session_before
assert app_web.companion_session.get_feedback_snapshot(time.monotonic()) == snapshot_before
assert app_web.companion_tracker.get_current(time.monotonic()) == request_before
assert app_web.companion_tracker.next_request_id == next_request_id_before
assert app_web.autonomy_events.latest_id == events_before
assert app_web.autonomy_scheduler.last_interact_at == cooldown_before
assert client.get("/api/companion/feedback").status_code == 200
assert client.post("/api/companion/feedback").status_code == 405

# ==========================================================================
# v0.6 表达策略 API
# ==========================================================================

EXPRESSION_BY_TENDENCY = {
    "gentle": {
        "tone": "soft",
        "response_length": "short",
        "initiative": "low",
    },
    "tired": {
        "tone": "quiet",
        "response_length": "brief",
        "initiative": "low",
    },
    "playful": {
        "tone": "lively",
        "response_length": "normal",
        "initiative": "high",
    },
    "affectionate": {
        "tone": "warm",
        "response_length": "short",
        "initiative": "high",
    },
    "neutral": {
        "tone": "natural",
        "response_length": "normal",
        "initiative": "medium",
    },
}


def expected_expression(tendency, frequency, recent_count):
    return {
        "tendency": tendency,
        "frequency": frequency,
        "recent_count": recent_count,
        "expression": dict(EXPRESSION_BY_TENDENCY[tendency]),
    }


def assert_expression_shape(payload):
    assert set(payload) == {
        "tendency",
        "frequency",
        "recent_count",
        "expression",
    }
    assert set(payload["expression"]) == {
        "tone",
        "response_length",
        "initiative",
    }


# 45. 表达接口：无互动 / 1 次 / 2 次 / 3 次及以上；HTTPS 与 POST 行为
reset_runtime()
configure_feedback_state()
initial_expression = client.get("/api/companion/expression")
assert initial_expression.status_code == 200
initial_payload = initial_expression.get_json()
assert initial_payload == expected_expression("neutral", "none", 0)
assert_expression_shape(initial_payload)
assert app_web.companion_session.get_state()["is_active"] is False
assert app_web.companion_session.get_state()["interaction_count"] == 0

# 既有 feedback 接口结构不能被 expression 集成改变。
feedback_still_flat = client.get("/api/companion/feedback").get_json()
assert feedback_still_flat == {
    "tendency": "neutral",
    "frequency": "none",
    "recent_count": 0,
}

https_expression = serve_https.app.test_client().get(
    "/api/companion/expression"
)
assert https_expression.status_code == 200
assert https_expression.get_json() == initial_payload
assert client.post("/api/companion/expression").status_code == 405

base = time.monotonic()
app_web.companion_session.start(base - 4, "touch")
one_expression = client.get("/api/companion/expression").get_json()
assert one_expression == expected_expression("neutral", "low", 1)
assert_expression_shape(one_expression)

app_web.companion_session.interact(base - 3, "touch")
two_expression = client.get("/api/companion/expression").get_json()
assert two_expression == expected_expression("neutral", "low", 2)
assert_expression_shape(two_expression)

app_web.companion_session.interact(base - 2, "touch")
three_expression = client.get("/api/companion/expression").get_json()
assert three_expression == expected_expression("affectionate", "frequent", 3)
assert_expression_shape(three_expression)

app_web.companion_session.interact(base - 1, "touch")
four_expression = client.get("/api/companion/expression").get_json()
assert four_expression == expected_expression("affectionate", "frequent", 4)
assert_expression_shape(four_expression)

# 46. 300 秒窗口过期：旧互动不再影响反馈/表达，但会话仍保持 active
reset_runtime()
configure_feedback_state()
expired_base = time.monotonic()
app_web.companion_session.start(expired_base - 400, "touch")
app_web.companion_session.interact(expired_base - 350, "touch")
app_web.companion_session.interact(expired_base - 301, "touch")
expired_expression = client.get("/api/companion/expression").get_json()
assert expired_expression == expected_expression("neutral", "none", 0)
assert_expression_shape(expired_expression)
expired_state = app_web.companion_session.get_state()
assert expired_state["is_active"] is True
assert expired_state["interaction_count"] == 3

# 47. 结束会话与重新开始会话
reset_runtime()
configure_feedback_state()
session_base = time.monotonic()
app_web.companion_session.start(session_base - 2, "touch")
app_web.companion_session.interact(session_base - 1, "touch")
app_web.companion_session.interact(session_base - 0.5, "touch")
assert client.get("/api/companion/expression").get_json() == (
    expected_expression("affectionate", "frequent", 3)
)
assert app_web.companion_session.end() is True
ended_expression = client.get("/api/companion/expression").get_json()
assert ended_expression == expected_expression("neutral", "none", 0)
assert_expression_shape(ended_expression)
ended_state = app_web.companion_session.get_state()
assert ended_state["is_active"] is False
assert ended_state["interaction_count"] == 3

app_web.companion_session.start(time.monotonic(), "touch")
restarted_expression = client.get("/api/companion/expression").get_json()
assert restarted_expression == expected_expression("neutral", "low", 1)
assert_expression_shape(restarted_expression)
assert app_web.companion_session.get_state()["interaction_count"] == 1

# 48. 五种倾向及对应的完整表达策略
reset_runtime()
configure_feedback_state()
neutral_expression = client.get("/api/companion/expression").get_json()
assert neutral_expression == expected_expression("neutral", "none", 0)
assert_expression_shape(neutral_expression)

priority_base = time.monotonic()
app_web.companion_session.start(priority_base - 3, "touch")
app_web.companion_session.interact(priority_base - 2, "touch")
app_web.companion_session.interact(priority_base - 1, "touch")

priority_cases = [
    ("sad", 80.0, 80.0, 20.0, "gentle"),
    ("happy", 20.0, 80.0, 20.0, "tired"),
    ("happy", 80.0, 80.0, 20.0, "playful"),
    ("calm", 80.0, 0.0, 80.0, "affectionate"),
]
for emotion, energy, intensity, social_need, tendency in priority_cases:
    app_web.store.tianbao.update({
        "emotion": emotion,
        "intensity": intensity,
        "energy": energy,
        "social_need": social_need,
    })
    before_state = dict(app_web.store.tianbao)
    payload = client.get("/api/companion/expression").get_json()
    assert payload == expected_expression(tendency, "frequent", 3)
    assert_expression_shape(payload)
    assert app_web.store.tianbao == before_state

# 49. 连续 GET 无副作用：不推进会话、不创建邀请、不触发自主决策
reset_runtime()
configure_feedback_state()
side_base = time.monotonic()
app_web.companion_session.start(side_base - 3, "touch")
app_web.companion_session.interact(side_base - 2, "touch")
app_web.companion_session.interact(side_base - 1, "touch")

session_before = app_web.companion_session.get_state()
snapshot_before = app_web.companion_session.get_feedback_snapshot(time.monotonic())
request_before = app_web.companion_tracker.get_current(time.monotonic())
next_request_id_before = app_web.companion_tracker.next_request_id
events_before = app_web.autonomy_events.latest_id
cooldown_before = app_web.autonomy_scheduler.last_interact_at
state_before = app_web.store.get_state()
store_before = dict(app_web.store.tianbao)

expression_responses = []
with patch.object(app_web, "run_autonomy_once") as shared_entry:
    for _ in range(5):
        response = client.get("/api/companion/expression")
        assert response.status_code == 200
        expression_responses.append(response.get_json())
    shared_entry.assert_not_called()

assert all(response == expression_responses[0] for response in expression_responses)
assert expression_responses[0] == expected_expression(
    "affectionate", "frequent", 3
)
assert app_web.store.get_state() == state_before
assert app_web.store.tianbao == store_before
assert app_web.companion_session.get_state() == session_before
assert app_web.companion_session.get_feedback_snapshot(time.monotonic()) == snapshot_before
assert app_web.companion_tracker.get_current(time.monotonic()) == request_before
assert app_web.companion_tracker.next_request_id == next_request_id_before
assert app_web.autonomy_events.latest_id == events_before
assert app_web.autonomy_scheduler.last_interact_at == cooldown_before
assert client.post("/api/companion/expression").status_code == 405

# 50. 验证实际委托两个用户编写的核心函数，而不是在路由里重新实现
reset_runtime()
configure_feedback_state()
sentinel_feedback = {
    "tendency": "playful",
    "frequency": "frequent",
    "recent_count": 9,
}
with patch.object(
    app_web,
    "get_companion_feedback",
    return_value=sentinel_feedback,
) as feedback_entry, patch.object(
    app_web,
    "build_companion_expression",
    wraps=app_web.build_companion_expression,
) as expression_entry:
    delegated_expression = client.get("/api/companion/expression")
    assert delegated_expression.status_code == 200

assert feedback_entry.call_count == 1
feedback_args, feedback_kwargs = feedback_entry.call_args
assert len(feedback_args) == 3
assert isinstance(feedback_args[0], dict)
assert feedback_args[1] is app_web.companion_session
assert isinstance(feedback_args[2], float)
assert feedback_kwargs == {}

assert expression_entry.call_count == 1
expression_args, expression_kwargs = expression_entry.call_args
assert len(expression_args) == 1
assert expression_args[0] is sentinel_feedback
assert expression_kwargs == {}

assert delegated_expression.get_json() == expected_expression(
    "playful", "frequent", 9
)
assert_expression_shape(delegated_expression.get_json())

print("后端接口集成测试通过！")
