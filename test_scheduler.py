from behavior_scheduler import BehaviorScheduler

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

print("自主行为调度器测试通过！")