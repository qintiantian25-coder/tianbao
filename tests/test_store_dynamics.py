import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.state_store import StateStore


# 用模拟时间代替真实等待5分钟
with patch(
    "core.state_store.time.monotonic",
    side_effect=[1000.0, 1300.0]
):
    store = StateStore()
    state = store.get_state()


# 初始开心60，经过5分钟减少5点
assert state["emotion"] == "happy"
assert state["intensity"] == 55

# 初始社交需求20，经过5分钟增加5点
assert state["social_need"] == 25

# 精力的自然恢复尚未接入
assert state["energy"] == 80

print("StateStore状态动态集成测试通过！")