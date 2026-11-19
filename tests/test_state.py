
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.state_store import StateStore


class TestState(unittest.TestCase):

    def setUp(self):
        # 固定时间，避免测试时自然增长影响结果
        patcher = patch(
            "core.state_store.time.monotonic",
            return_value=1000.0
        )
        patcher.start()
        self.addCleanup(patcher.stop)

        # 每项测试使用独立状态
        self.store = StateStore()

    def test_energy(self):
        """测试精力消耗、恢复与上下限"""

        start = self.store.get_state()["energy"]

        result = self.store.apply_energy_cost(30)
        expected = max(0, start - 30)
        self.assertEqual(result["energy"], expected)

        result = self.store.apply_energy_recovery(20)
        expected = min(100, expected + 20)
        self.assertEqual(result["energy"], expected)

        result = self.store.apply_energy_recovery(100)
        self.assertEqual(result["energy"], 100)

        result = self.store.apply_energy_cost(200)
        self.assertEqual(result["energy"], 0)

    def test_social(self):
        """测试社交需求增加、减少与上下限"""

        start = self.store.get_state()["social_need"]

        result = self.store.apply_social_need_increase(30)
        expected = min(100, start + 30)
        self.assertEqual(result["social_need"], expected)

        result = self.store.apply_social_need_decrease(40)
        expected = max(0, expected - 40)
        self.assertEqual(result["social_need"], expected)

        result = self.store.apply_social_need_decrease(200)
        self.assertEqual(result["social_need"], 0)

    def test_touch(self):
        """测试摸头对情绪的影响"""

        before = self.store.get_state()

        after, message = self.store.apply_touch(10)

        self.assertEqual(after["emotion"], "happy")
        self.assertEqual(
            after["intensity"],
            min(100, before["intensity"] + 10)
        )
        self.assertIsInstance(message, str)


if __name__ == "__main__":
    unittest.main(verbosity=2)
