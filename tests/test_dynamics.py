import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.state_dynamics import update_state_over_time


# 初始状态
state = {
    "emotion": "sad",
    "intensity": 80,
    "energy": 80,
    "social_need": 20
}

# 每秒变化速率
rates = {
    "happy_decay": 1 / 60,
    "sad_decay": 2 / 60,
    "social_need_growth": 1 / 60
}

# 模拟经过5分钟
result = update_state_over_time(state, 300, rates)

print("更新后的状态：", result)

# 悲伤每分钟减少2点，5分钟减少10点
assert result["emotion"] == "sad"
assert result["intensity"] == 70

# 社交需求每分钟增加1点，5分钟增加5点
assert result["social_need"] == 25

# 还没有接入精力的时间变化，所以精力不变
assert result["energy"] == 80

print("状态动态系统测试通过！")