import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.state_store import StateStore


with patch(
    "core.state_store.time.monotonic",
    side_effect=[1000, 1000, 1300, 1300, 1600]
):
    store = StateStore()

    # 开始休息
    store.set_activity("rest")

    # 经过5分钟
    resting = store.get_state()

    # 结束休息，进入待机
    store.set_activity("idle")

    # 待机5分钟
    idle = store.get_state()


# 休息5分钟，精力从80恢复到90
assert resting["energy"] == 90
assert resting["activity"] == "rest"

# 待机不再继续恢复精力
assert idle["energy"] == 90
assert idle["activity"] == "idle"

print("持续活动状态测试通过！")