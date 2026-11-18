from backend.state_store import StateStore
from action_executor import execute_action

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

print("行为执行器测试通过！")