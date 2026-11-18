import sys
from pathlib import Path

# 允许直接运行: python tests/test_behavior.py
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.behavior import decide_action

# 1. 精力不足，优先休息
assert decide_action({
    "energy": 20,
    "social_need": 90,
    "emotion": "happy"
}) == "rest"

# 2. 三个条件都满足，可以互动
assert decide_action({
    "energy": 80,
    "social_need": 85,
    "emotion": "happy"
}) == "interact"

# 3. 社交需求不足，保持待机
assert decide_action({
    "energy": 80,
    "social_need": 10,
    "emotion": "happy"
}) == "idle"

# 4. 精力不足以主动互动
assert decide_action({
    "energy": 50,
    "social_need": 90,
    "emotion": "happy"
}) == "idle"

# 5. 当前情绪不满足互动规则
assert decide_action({
    "energy": 90,
    "social_need": 90,
    "emotion": "sad"
}) == "idle"

# 6. 测试互动阈值边界
assert decide_action({
    "energy": 70,
    "social_need": 70,
    "emotion": "happy"
}) == "interact"

print("多状态行为决策测试通过！")