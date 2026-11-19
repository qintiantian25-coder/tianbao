
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.state_store import StateStore
from core.state_dynamics import update_state_over_time


class TestDynamics(unittest.TestCase):

    def setUp(self):
        # 每秒变化速率
        self.rates = {
            "happy_decay": 1 / 60,
            "sad_decay": 2 / 60,
            "energy_recovery": 2 / 60,
            "social_need_growth": 1 / 60
        }

    def test_emotion_and_social_growth(self):
        """测试情绪衰减和社交需求自然增长"""

        state = {
            "emotion": "sad",
            "intensity": 80,
            "energy": 80,
            "social_need": 20
        }

        # 模拟经过5分钟
        result = update_state_over_time(
            state, 300, self.rates
        )

        self.assertEqual(result["emotion"], "sad")
        self.assertEqual(result["intensity"], 70)
        self.assertEqual(result["social_need"], 25)

        # 待机状态不自动恢复精力
        self.assertEqual(result["energy"], 80)

    def test_rest_recovery(self):
        """测试休息时精力随时间恢复"""

        state = {
            "emotion": "calm",
            "intensity": 0,
            "energy": 50,
            "social_need": 20
        }

        result = update_state_over_time(
            state,
            300,
            self.rates,
            activity="rest"
        )

        self.assertEqual(result["energy"], 60)
        self.assertEqual(result["social_need"], 25)

    def test_store_time_update(self):
        """测试StateStore调用时间动态系统"""

        with patch(
            "core.state_store.time.monotonic",
            return_value=1000.0
        ) as clock:

            store = StateStore()

            before = store.get_state()

            # 模拟时间前进5分钟
            clock.return_value = 1300.0

            after = store.get_state()

        self.assertEqual(after["emotion"], "happy")
        self.assertEqual(
            after["intensity"],
            before["intensity"] - 5
        )

        # 不依赖固定的初始社交需求
        self.assertEqual(
            after["social_need"],
            min(100, before["social_need"] + 5)
        )

        self.assertEqual(after["energy"], before["energy"])

    def test_activity_switch(self):
        """测试持续休息与退出休息"""

        with patch(
            "core.state_store.time.monotonic",
            return_value=1000.0
        ) as clock:

            store = StateStore()

            # 进入休息
            store.set_activity("rest")

            # 休息5分钟
            clock.return_value = 1300.0
            resting = store.get_state()

            # 退出休息
            store.set_activity("idle")

            # 待机5分钟
            clock.return_value = 1600.0
            idle = store.get_state()

        self.assertEqual(resting["energy"], 90)
        self.assertEqual(resting["activity"], "rest")

        self.assertEqual(idle["energy"], 90)
        self.assertEqual(idle["activity"], "idle")


if __name__ == "__main__":
    unittest.main(verbosity=2)
