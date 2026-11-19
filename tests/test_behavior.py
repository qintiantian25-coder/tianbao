import sys
from pathlib import Path

# 允许直接运行
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.behavior import decide_action


# 1. 精力不足，优先休息
assert decide_action({
    "energy": 20,
    "social_need": 90,
    "emotion": "happy"
}) == "rest"


# 2. 开心且社交需求高，主动互动
assert decide_action({
    "energy": 80,
    "social_need": 85,
    "emotion": "happy"
}) == "interact"


# 3. 社交需求较低，保持待机
assert decide_action({
    "energy": 80,
    "social_need": 10,
    "emotion": "happy"
}) == "idle"


# 4. 精力不足以进行普通互动
assert decide_action({
    "energy": 50,
    "social_need": 90,
    "emotion": "happy"
}) == "idle"


# 5. 轻微伤心，但社交需求高，仍可以互动
assert decide_action({
    "energy": 90,
    "social_need": 90,
    "emotion": "sad",
    "intensity": 30
}) == "interact"


# 6. 测试普通互动的阈值边界
assert decide_action({
    "energy": 70,
    "social_need": 70,
    "emotion": "happy"
}) == "interact"


# 7. 非常伤心，即使精力较低，也主动寻求安慰
assert decide_action({
    "emotion": "sad",
    "intensity": 85,
    "energy": 15,
    "social_need": 20
}) == "seek_comfort"


# 8. 精力只有10，暂时优先休息
assert decide_action({
    "emotion": "sad",
    "intensity": 85,
    "energy": 10,
    "social_need": 90
}) == "rest"


# 9. 平静状态下，社交需求高，也可以互动
assert decide_action({
    "emotion": "calm",
    "intensity": 0,
    "energy": 80,
    "social_need": 90
}) == "interact"


# 10. 强烈悲伤和高社交需求同时出现时，优先寻求安慰
assert decide_action({
    "emotion": "sad",
    "intensity": 85,
    "energy": 80,
    "social_need": 90
}) == "seek_comfort"


print("多状态行为决策测试通过！")