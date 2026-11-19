
import sys
from pathlib import Path

# 允许直接运行: python3 tests/test_executor.py
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.state_store import StateStore
from core.action_executor import execute_action


# =========================
# 1. 测试普通互动
# =========================

store = StateStore()

# 初始精力80，社交需求20
store.apply_social_need_increase(70)

# 模拟成功互动
result = execute_action("interact", store)

assert result["energy"] == 70
assert result["social_need"] == 70
assert result["activity"] == "idle"


# =========================
# 2. 测试进入持续休息状态
# =========================

result = execute_action("rest", store)

# 休息不再立即恢复10点精力
assert result["energy"] == 70

# 进入持续休息状态
assert result["activity"] == "rest"


# =========================
# 3. 测试退出休息，进入待机
# =========================

result = execute_action("idle", store)

# 待机时不立即改变精力
assert result["energy"] == 70

# 应该退出休息状态
assert result["activity"] == "idle"


# =========================
# 4. 测试主动寻求安慰
# =========================

sad_store = StateStore()

# 第一次负面事件：happy -> calm
sad_store.apply_sad_event(80)

# 第二次负面事件：calm -> sad
sad_store.apply_sad_event(80)

before = sad_store.get_state()

# 确保已经进入伤心状态
assert before["emotion"] == "sad"

result = execute_action("seek_comfort", sad_store)

# 请求安慰消耗1点精力
assert result["energy"] == before["energy"] - 1

# 请求安慰不应该直接降低社交需求
assert result["social_need"] >= before["social_need"]

# 请求安慰本身不能直接消除悲伤
assert result["emotion"] == "sad"

# 请求安慰后进入普通活动状态
assert result["activity"] == "idle"


print("行为执行器测试通过！")
