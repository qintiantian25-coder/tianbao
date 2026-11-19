
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.behavior import decide_action
from core.behavior_scheduler import BehaviorScheduler
from core.action_executor import execute_action
from core.state_store import StateStore


class TestBehavior(unittest.TestCase):

    # =========================
    # 1. 行为决策测试
    # =========================

    def test_decision(self):
        """测试不同状态下的行为选择"""

        cases = [
            # 精力不足，优先休息
            (20, 90, "happy", 60, "rest"),

            # 精力充足，社交需求高
            (80, 85, "happy", 60, "interact"),

            # 社交需求低
            (80, 10, "happy", 60, "idle"),

            # 精力不足以普通互动
            (50, 90, "happy", 60, "idle"),

            # 轻微伤心，仍可以互动
            (90, 90, "sad", 30, "interact"),

            # 互动阈值边界
            (70, 70, "happy", 60, "interact"),

            # 明显伤心，优先寻求安慰
            (15, 20, "sad", 85, "seek_comfort"),

            # 精力只有10，优先休息
            (10, 90, "sad", 85, "rest"),

            # 平静时也可以主动互动
            (80, 90, "calm", 0, "interact"),

            # 强烈伤心时，安慰优先于互动
            (80, 90, "sad", 85, "seek_comfort"),
        ]

        for energy, social, emotion, intensity, expected in cases:
            with self.subTest(
                energy=energy,
                social=social,
                emotion=emotion
            ):
                state = {
                    "energy": energy,
                    "social_need": social,
                    "emotion": emotion,
                    "intensity": intensity,
                    "activity": "idle"
                }

                self.assertEqual(
                    decide_action(state),
                    expected
                )

    # =========================
    # 2. 自主行为调度测试
    # =========================

    def test_scheduler_interact(self):
        """测试普通互动冷却时间"""

        scheduler = BehaviorScheduler(
            cooldown_seconds=60
        )

        state = {
            "emotion": "happy",
            "intensity": 60,
            "energy": 80,
            "social_need": 90
        }

        self.assertEqual(
            scheduler.tick(state, 100),
            "interact"
        )

        # 20秒后仍然冷却
        self.assertEqual(
            scheduler.tick(state, 120),
            "idle"
        )

        # 60秒后可以再次互动
        self.assertEqual(
            scheduler.tick(state, 160),
            "interact"
        )

        # 精力不足时应该休息
        state["energy"] = 20

        self.assertEqual(
            scheduler.tick(state, 170),
            "rest"
        )

    def test_scheduler_comfort(self):
        """测试寻求安慰冷却时间"""

        scheduler = BehaviorScheduler()

        state = {
            "emotion": "sad",
            "intensity": 85,
            "energy": 80,
            "social_need": 20
        }

        self.assertEqual(
            scheduler.tick(state, 100),
            "seek_comfort"
        )

        self.assertEqual(
            scheduler.tick(state, 120),
            "idle"
        )

        self.assertEqual(
            scheduler.tick(state, 400),
            "seek_comfort"
        )

    # =========================
    # 3. 行为执行器测试
    # =========================

    def test_executor_interact_and_rest(self):
        """测试互动、休息与待机"""

        with patch(
            "core.state_store.time.monotonic",
            return_value=1000.0
        ):
            store = StateStore()

            store.apply_social_need_increase(70)

            before = store.get_state()

            # 执行普通互动
            result = execute_action("interact", store)

            self.assertEqual(
                result["energy"],
                before["energy"] - 10
            )

            # 只是请求陪伴，社交需求不立即下降
            self.assertEqual(
                result["social_need"],
                before["social_need"]
            )

            self.assertEqual(
                result["activity"],
                "idle"
            )

            # 开始休息
            result = execute_action("rest", store)

            self.assertEqual(
                result["activity"],
                "rest"
            )

            # 不再立即恢复10点精力
            self.assertEqual(
                result["energy"],
                before["energy"] - 10
            )

            # 结束休息，进入待机
            result = execute_action("idle", store)

            self.assertEqual(
                result["activity"],
                "idle"
            )

    def test_executor_seek_comfort(self):
        """测试伤心时主动寻求安慰"""

        with patch(
            "core.state_store.time.monotonic",
            return_value=1000.0
        ):
            store = StateStore()

            # happy -> calm -> sad
            store.apply_sad_event(80)
            store.apply_sad_event(80)

            before = store.get_state()

            self.assertEqual(
                before["emotion"],
                "sad"
            )

            result = execute_action(
                "seek_comfort", store
            )

            # 消耗1点精力
            self.assertEqual(
                result["energy"],
                before["energy"] - 1
            )

            # 请求安慰不直接减少社交需求
            self.assertEqual(
                result["social_need"],
                before["social_need"]
            )

            # 不会立即消除悲伤
            self.assertEqual(
                result["emotion"],
                "sad"
            )

            self.assertEqual(
                result["activity"],
                "idle"
            )
    def test_rest_hysteresis(self):
        """测试开始休息、持续休息和结束休息"""

        state = {
            "emotion": "calm",
            "intensity": 0,
            "energy": 20,
            "social_need": 20,
            "activity": "idle"
        }

        # 精力不足，开始休息
        self.assertEqual(decide_action(state), "rest")

        # 正在休息，精力达到50仍继续休息
        state["activity"] = "rest"
        state["energy"] = 50

        self.assertEqual(decide_action(state), "rest")

        # 精力达到70，可以结束休息
        state["energy"] = 70

        self.assertEqual(decide_action(state), "idle")

    def test_comfort_cooldown_keeps_rest(self):
        """测试安慰冷却不会意外打断休息"""

        scheduler = BehaviorScheduler()

        state = {
            "emotion": "sad",
            "intensity": 85,
            "energy": 80,
            "social_need": 20,
            "activity": "idle"
        }

        # 第一次允许寻求安慰
        self.assertEqual(
            scheduler.tick(state, 100),
            "seek_comfort"
        )

        # 后来进入休息，精力恢复到50
        state["activity"] = "rest"
        state["energy"] = 50

        # 此时安慰还在冷却中，应该继续休息
        self.assertEqual(
            scheduler.tick(state, 120),
            "rest"
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
