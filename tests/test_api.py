import sys
from pathlib import Path

# 允许直接运行: python tests/test_api.py
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app_web
from core.behavior_scheduler import BehaviorScheduler
from core.state_store import StateStore

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
assert first_state["social_need"] == 20

second_state = client.get("/api/state").get_json()
assert second_state["energy"] == 80
assert second_state["social_need"] == 20
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
assert tick_data["state"]["social_need"] == 70
assert tick_data["cooldown_remaining"] > 0

second_tick = client.post(
    "/api/debug/autonomy", headers=headers, json={}
).get_json()
assert second_tick["action"] == "idle"
assert second_tick["state"]["energy"] == 70
assert second_tick["state"]["social_need"] == 70

# 5. 精力不足时手动决策休息
reset_runtime()
app_web.store.apply_energy_cost(60)

rest_tick = client.post("/api/debug/autonomy", headers=headers, json={})
assert rest_tick.status_code == 200
rest_data = rest_tick.get_json()
assert rest_data["action"] == "rest"
assert rest_data["state"]["energy"] == 30

# 6. 条件不满足时保持待机
reset_runtime()
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

print("后端接口集成测试通过！")
