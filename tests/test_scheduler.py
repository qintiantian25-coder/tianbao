import sys
from pathlib import Path

# 允许直接运行: python tests/test_scheduler.py
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.behavior_scheduler import BehaviorScheduler

scheduler = BehaviorScheduler(cooldown_seconds=60)

state = {
    "emotion": "happy",
    "energy": 80,
    "social_need": 90
}

# 第一次检查：允许互动
assert scheduler.tick(state, 100) == "interact"

# 20秒后：仍在冷却时间内
assert scheduler.tick(state, 120) == "idle"

# 60秒后：允许再次互动
assert scheduler.tick(state, 160) == "interact"

# 精力不足：应该休息
state["energy"] = 20
assert scheduler.tick(state, 170) == "rest"

# 创建独立调度器，避免影响之前的测试
comfort_scheduler = BehaviorScheduler()

sad_state = {
    "emotion": "sad",
    "intensity": 85,
    "energy": 80,
    "social_need": 20
}

# 第一次请求安慰
assert comfort_scheduler.tick(sad_state, 100) == "seek_comfort"

# 20秒后，还在冷却中
assert comfort_scheduler.tick(sad_state, 120) == "idle"

# 300秒后，允许再次请求
assert comfort_scheduler.tick(sad_state, 400) == "seek_comfort"

print("自主行为调度器测试通过！")