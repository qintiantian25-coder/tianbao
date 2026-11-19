import sys
from pathlib import Path

# 允许直接运行: python tests/test_executor.py
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.state_store import StateStore
from core.action_executor import execute_action

store = StateStore()

# 初始精力80，社交需求20
store.apply_social_need_increase(70)

# 模拟成功互动
result = execute_action("interact", store)
assert result["energy"] == 70
assert result["social_need"] == 70

# 模拟休息
result = execute_action("rest", store)
assert result["energy"] == 80

# 模拟待机
result = execute_action("idle", store)
assert result["energy"] == 80

# 测试：主动寻求安慰
sad_store = StateStore()

# 第一次负面事件：开心 -> 平静
sad_store.apply_sad_event(80)

# 第二次负面事件：平静 -> 伤心
sad_store.apply_sad_event(80)

before = sad_store.get_state()

# 确认已经进入悲伤状态
assert before["emotion"] == "sad"

result = execute_action("seek_comfort", sad_store)

# 请求安慰消耗1点精力
assert result["energy"] == before["energy"] - 1

# 主人没有回应，社交需求不应该被请求行为降低
assert result["social_need"] >= before["social_need"]

# 请求安慰本身不能立即消除悲伤
assert result["emotion"] == "sad"

print("行为执行器测试通过！")