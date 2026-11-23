
import sys
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.autonomy_runner import AutonomyLoop
from core.behavior import decide_action
from core.behavior_scheduler import BehaviorScheduler
from core.action_executor import execute_action
from core.state_store import StateStore
from core.companion_request import CompanionRequestTracker
from core.companion_session import CompanionSession


# ==========================================
# 1. 自主行为测试
# ==========================================

class TestBehavior(unittest.TestCase):
    """自主行为决策、调度及执行测试。"""

    def test_decision(self):
        cases = [
            (20, 90, "happy", 60, "rest"),
            (80, 85, "happy", 60, "interact"),
            (80, 10, "happy", 60, "idle"),
            (50, 90, "happy", 60, "idle"),
            (90, 90, "sad", 30, "interact"),
            (70, 70, "happy", 60, "interact"),
            (15, 20, "sad", 85, "seek_comfort"),
            (10, 90, "sad", 85, "rest"),
            (80, 90, "calm", 0, "interact"),
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
                self.assertEqual(decide_action(state), expected)

    def test_scheduler_interact(self):
        scheduler = BehaviorScheduler(cooldown_seconds=60)

        state = {
            "emotion": "happy",
            "intensity": 60,
            "energy": 80,
            "social_need": 90
        }

        self.assertEqual(scheduler.tick(state, 100), "interact")
        self.assertEqual(scheduler.tick(state, 120), "idle")
        self.assertEqual(scheduler.tick(state, 160), "interact")

        state["energy"] = 20
        self.assertEqual(scheduler.tick(state, 170), "rest")

    def test_scheduler_comfort(self):
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

    def test_executor_interact_and_rest(self):
        with patch(
            "core.state_store.time.monotonic",
            return_value=1000.0
        ):
            store = StateStore()
            store.apply_social_need_increase(70)

            before = store.get_state()
            result = execute_action("interact", store)

            self.assertEqual(
                result["energy"],
                before["energy"] - 10
            )
            self.assertEqual(
                result["social_need"],
                before["social_need"]
            )
            self.assertEqual(result["activity"], "idle")

            result = execute_action("rest", store)
            self.assertEqual(result["activity"], "rest")
            self.assertEqual(
                result["energy"],
                before["energy"] - 10
            )

            result = execute_action("idle", store)
            self.assertEqual(result["activity"], "idle")

    def test_executor_seek_comfort(self):
        with patch(
            "core.state_store.time.monotonic",
            return_value=1000.0
        ):
            store = StateStore()
            store.apply_sad_event(80)
            store.apply_sad_event(80)

            before = store.get_state()
            self.assertEqual(before["emotion"], "sad")

            result = execute_action(
                "seek_comfort", store
            )

            self.assertEqual(
                result["energy"],
                before["energy"] - 1
            )
            self.assertEqual(
                result["social_need"],
                before["social_need"]
            )
            self.assertEqual(result["emotion"], "sad")
            self.assertEqual(result["activity"], "idle")

    def test_rest_hysteresis(self):
        state = {
            "emotion": "calm",
            "intensity": 0,
            "energy": 20,
            "social_need": 20,
            "activity": "idle"
        }

        self.assertEqual(decide_action(state), "rest")

        state["activity"] = "rest"
        state["energy"] = 50
        self.assertEqual(decide_action(state), "rest")

        state["energy"] = 70
        self.assertEqual(decide_action(state), "idle")

    def test_comfort_cooldown_keeps_rest(self):
        scheduler = BehaviorScheduler()

        state = {
            "emotion": "sad",
            "intensity": 85,
            "energy": 80,
            "social_need": 20,
            "activity": "idle"
        }

        self.assertEqual(
            scheduler.tick(state, 100),
            "seek_comfort"
        )

        state["activity"] = "rest"
        state["energy"] = 50

        self.assertEqual(
            scheduler.tick(state, 120),
            "rest"
        )


# ==========================================
# 2. 自主行为后台线程测试
# ==========================================

class TestAutonomyLoop(unittest.TestCase):

    def test_start_stop_and_single_instance(self):
        calls = []
        first_call = threading.Event()
        logger = Mock()

        def run_once():
            calls.append(1)
            first_call.set()

        loop = AutonomyLoop(
            run_once,
            interval_seconds=0.01,
            logger=logger,
        )

        self.assertFalse(loop.running)
        self.assertFalse(loop.stop())

        self.assertTrue(loop.start())
        self.assertTrue(first_call.wait(1.0))
        self.assertFalse(loop.start())
        self.assertTrue(loop.running)

        self.assertTrue(loop.stop(timeout=1.0))
        self.assertFalse(loop.running)
        self.assertGreaterEqual(len(calls), 1)

    def test_stop_interrupts_wait(self):
        first_call = threading.Event()

        loop = AutonomyLoop(
            lambda: first_call.set(),
            interval_seconds=60,
            logger=Mock(),
        )

        self.assertTrue(loop.start())
        self.assertTrue(first_call.wait(1.0))

        started = time.monotonic()
        self.assertTrue(loop.stop(timeout=1.0))
        self.assertLess(time.monotonic() - started, 1.0)
        self.assertFalse(loop.running)

    def test_exception_does_not_kill_loop(self):
        calls = []
        second_call = threading.Event()
        logger = Mock()

        def run_once():
            calls.append(1)
            if len(calls) == 1:
                raise RuntimeError("boom")
            if len(calls) >= 2:
                second_call.set()

        loop = AutonomyLoop(
            run_once,
            interval_seconds=0.01,
            logger=logger,
        )

        self.assertTrue(loop.start())
        self.assertTrue(second_call.wait(1.0))
        self.assertTrue(loop.running)
        self.assertTrue(loop.stop(timeout=1.0))
        self.assertGreaterEqual(len(calls), 2)
        logger.exception.assert_called()

    def test_rejects_invalid_interval(self):
        with self.assertRaises(ValueError):
            AutonomyLoop(
                lambda: None,
                interval_seconds=0,
                logger=Mock()
            )

        with self.assertRaises(ValueError):
            AutonomyLoop(
                lambda: None,
                interval_seconds=float("nan"),
                logger=Mock()
            )


# ==========================================
# 3. v0.3 主人请求管理器测试
# ==========================================

class TestCompanionRequestTracker(unittest.TestCase):

    def setUp(self):
        self.tracker = CompanionRequestTracker()

    def test_initial_state_and_default_timeout(self):
        self.assertEqual(self.tracker.timeout_seconds, 300)
        self.assertEqual(self.tracker.next_request_id, 1)
        self.assertIsNone(self.tracker.get_current(1000))
        self.assertFalse(self.tracker.respond(1000))

    def test_start_creates_request(self):
        req = self.tracker.start("interact", 1000)

        self.assertEqual(req, {
            "id": 1,
            "action": "interact",
            "created_at": 1000,
            "expires_at": 1300,
            "status": "pending",
        })
        self.assertEqual(self.tracker.next_request_id, 2)

    def test_duplicate_pending_keeps_id_and_expiration(self):
        first = self.tracker.start("interact", 1000)
        second = self.tracker.start("interact", 1200)

        self.assertEqual(first, second)
        self.assertEqual(second["expires_at"], 1300)
        self.assertEqual(self.tracker.next_request_id, 2)

    def test_different_action_replaces_pending(self):
        first = self.tracker.start("interact", 1000)
        second = self.tracker.start("seek_comfort", 1001)

        self.assertEqual(second["id"], first["id"] + 1)
        self.assertEqual(second["action"], "seek_comfort")
        self.assertEqual(second["expires_at"], 1301)
        self.assertEqual(second["status"], "pending")

    def test_refresh_before_and_at_expiration(self):
        self.tracker.start("interact", 1000)

        self.assertEqual(
            self.tracker.get_current(1299)["status"],
            "pending"
        )
        self.assertEqual(
            self.tracker.get_current(1300)["status"],
            "expired"
        )
        self.assertEqual(
            self.tracker.get_current(1400)["status"],
            "expired"
        )

    def test_expired_request_can_be_replaced_with_same_action(self):
        self.tracker.start("interact", 1000)
        req = self.tracker.start("interact", 1300)

        self.assertEqual(req["id"], 2)
        self.assertEqual(req["created_at"], 1300)
        self.assertEqual(req["status"], "pending")

    def test_response_success_and_only_once(self):
        self.tracker.start("interact", 1000)
        self.assertTrue(self.tracker.respond(1100))

        self.assertEqual(
            self.tracker.get_current(1200)["status"],
            "responded"
        )
        self.assertFalse(self.tracker.respond(1200))

        self.assertEqual(
            self.tracker.get_current(1400)["status"],
            "responded"
        )

    def test_response_at_expiration_is_rejected(self):
        self.tracker.start("interact", 1000)

        self.assertFalse(self.tracker.respond(1300))
        self.assertEqual(
            self.tracker.get_current(1300)["status"],
            "expired"
        )

    def test_response_after_expiration_is_rejected(self):
        self.tracker.start("seek_comfort", 1000)

        self.assertFalse(self.tracker.respond(1400))
        self.assertEqual(
            self.tracker.get_current(1400)["status"],
            "expired"
        )

    def test_new_request_after_response(self):
        self.tracker.start("interact", 1000)
        self.assertTrue(self.tracker.respond(1010))

        new = self.tracker.start("interact", 1020)

        self.assertEqual(new["id"], 2)
        self.assertEqual(new["status"], "pending")

    def test_return_values_are_defensive_copies(self):
        result = self.tracker.start("interact", 1000)
        result["status"] = "responded"

        self.assertEqual(
            self.tracker.get_current(1001)["status"],
            "pending"
        )

        duplicate = self.tracker.start("interact", 1002)
        duplicate["status"] = "expired"

        self.assertEqual(
            self.tracker.get_current(1003)["status"],
            "pending"
        )

        snapshot = self.tracker.get_current(1004)
        snapshot["id"] = 9999

        self.assertEqual(
            self.tracker.get_current(1005)["id"],
            1
        )

    def test_concurrent_same_action_does_not_duplicate(self):
        results = []
        errors = []
        gate = threading.Event()

        def start_in_thread():
            gate.wait()
            try:
                results.append(
                    self.tracker.start("interact", 1000)
                )
            except Exception as exc:
                errors.append(exc)

        threads = [
            threading.Thread(
                target=start_in_thread,
                daemon=True
            )
            for _ in range(12)
        ]

        for thread in threads:
            thread.start()

        gate.set()

        for thread in threads:
            thread.join(timeout=2)

        self.assertTrue(
            all(not t.is_alive() for t in threads),
            "疑似线程死锁"
        )
        self.assertFalse(errors, errors)
        self.assertEqual(len(results), 12)
        self.assertEqual(
            {r["id"] for r in results},
            {1}
        )
        self.assertEqual(self.tracker.next_request_id, 2)


# ==========================================
# 4. v0.4 持续陪伴会话测试
# ==========================================

class TestCompanionSession(unittest.TestCase):

    def setUp(self):
        self.session = CompanionSession()

    def test_initial_state(self):
        self.assertEqual(self.session.get_state(), {
            "is_active": False,
            "started_at": None,
            "last_interaction_at": None,
            "last_interaction_type": None,
            "interaction_count": 0
        })

    def test_start_session(self):
        result = self.session.start(1000, "touch")

        self.assertTrue(result)
        self.assertEqual(self.session.get_state(), {
            "is_active": True,
            "started_at": 1000,
            "last_interaction_at": 1000,
            "last_interaction_type": "touch",
            "interaction_count": 1
        })

    def test_repeated_start_does_not_reset(self):
        self.session.start(1000, "touch")
        before = self.session.get_state()

        result = self.session.start(1020, "speech")

        self.assertFalse(result)
        self.assertEqual(self.session.get_state(), before)

    def test_interact_without_active_session(self):
        before = self.session.get_state()
        result = self.session.interact(1020, "touch")

        self.assertFalse(result)
        self.assertEqual(self.session.get_state(), before)

    def test_multiple_interactions(self):
        self.session.start(1000, "touch")

        self.assertTrue(
            self.session.interact(1020, "touch")
        )
        self.assertTrue(
            self.session.interact(1050, "speech")
        )

        state = self.session.get_state()

        self.assertTrue(state["is_active"])
        self.assertEqual(state["started_at"], 1000)
        self.assertEqual(state["last_interaction_at"], 1050)
        self.assertEqual(state["last_interaction_type"], "speech")
        self.assertEqual(state["interaction_count"], 3)

    def test_end_active_session(self):
        self.session.start(1000, "touch")
        self.session.interact(1020, "speech")

        result = self.session.end()
        state = self.session.get_state()

        self.assertTrue(result)
        self.assertFalse(state["is_active"])
        self.assertEqual(state["started_at"], 1000)
        self.assertEqual(state["last_interaction_at"], 1020)
        self.assertEqual(state["last_interaction_type"], "speech")
        self.assertEqual(state["interaction_count"], 2)

    def test_repeated_end_does_not_change_state(self):
        self.assertFalse(self.session.end())

        self.session.start(1000, "touch")
        self.assertTrue(self.session.end())

        before = self.session.get_state()
        self.assertFalse(self.session.end())

        self.assertEqual(self.session.get_state(), before)

    def test_interact_after_end_is_ignored(self):
        self.session.start(1000, "touch")
        self.session.end()

        before = self.session.get_state()
        result = self.session.interact(1050, "speech")

        self.assertFalse(result)
        self.assertEqual(self.session.get_state(), before)

    def test_restart_after_end(self):
        self.session.start(1000, "touch")
        self.session.interact(1020, "speech")
        self.session.end()

        result = self.session.start(2000, "call")
        state = self.session.get_state()

        self.assertTrue(result)
        self.assertTrue(state["is_active"])
        self.assertEqual(state["started_at"], 2000)
        self.assertEqual(state["last_interaction_at"], 2000)
        self.assertEqual(state["last_interaction_type"], "call")
        self.assertEqual(state["interaction_count"], 1)

    def test_long_gap_and_state_snapshot(self):
        self.session.start(1000, "touch")

        state = self.session.get_state()
        self.assertTrue(state["is_active"])

        self.assertTrue(
            self.session.interact(100000, "speech")
        )

        state = self.session.get_state()
        self.assertTrue(state["is_active"])
        self.assertEqual(state["interaction_count"], 2)
        self.assertEqual(state["last_interaction_at"], 100000)

        state["interaction_count"] = 999
        state["is_active"] = False

        actual = self.session.get_state()
        self.assertTrue(actual["is_active"])
        self.assertEqual(actual["interaction_count"], 2)

    # ======================================
    # v0.4 新增：并发测试
    # ======================================

    def test_concurrent_start_only_once(self):
        """11. 多个线程同时开始会话，只能成功一次"""
        results = []
        errors = []
        gate = threading.Event()

        def worker():
            gate.wait()
            try:
                result = self.session.start(
                    1000, "touch"
                )
                results.append(result)
            except Exception as exc:
                errors.append(exc)

        threads = [
            threading.Thread(
                target=worker,
                daemon=True
            )
            for _ in range(16)
        ]

        for thread in threads:
            thread.start()

        gate.set()

        for thread in threads:
            thread.join(timeout=2)

        self.assertTrue(
            all(not t.is_alive() for t in threads),
            "并发 start() 疑似死锁"
        )
        self.assertFalse(errors, errors)

        self.assertEqual(len(results), 16)
        self.assertEqual(results.count(True), 1)
        self.assertEqual(results.count(False), 15)

        state = self.session.get_state()
        self.assertTrue(state["is_active"])
        self.assertEqual(state["interaction_count"], 1)
        self.assertEqual(state["started_at"], 1000)

    def test_concurrent_interactions_and_reads(self):
        """12. 并发互动与读取，次数正确且状态保持一致"""
        self.session.start(1000, "t1000")

        errors = []
        gate = threading.Event()

        writer_count = 6
        updates_per_writer = 100

        def writer(worker_id):
            gate.wait()
            try:
                for j in range(updates_per_writer):
                    now = (
                        1001
                        + worker_id * updates_per_writer
                        + j
                    )
                    success = self.session.interact(
                        now,
                        f"t{now}"
                    )
                    if not success:
                        raise AssertionError(
                            "活动会话中的互动不应失败"
                        )
            except Exception as exc:
                errors.append(exc)

        def reader():
            gate.wait()
            try:
                for _ in range(500):
                    state = self.session.get_state()

                    if not state["is_active"]:
                        raise AssertionError(
                            "没有调用 end()，会话不应结束"
                        )

                    if state["started_at"] != 1000:
                        raise AssertionError(
                            "会话开始时间被意外修改"
                        )

                    last_time = state["last_interaction_at"]
                    last_type = state["last_interaction_type"]

                    if last_type != f"t{last_time}":
                        raise AssertionError(
                            "读取到时间与类型不一致的状态"
                        )
            except Exception as exc:
                errors.append(exc)

        threads = [
            threading.Thread(
                target=writer,
                args=(i,),
                daemon=True
            )
            for i in range(writer_count)
        ]

        threads.append(
            threading.Thread(
                target=reader,
                daemon=True
            )
        )

        for thread in threads:
            thread.start()

        gate.set()

        for thread in threads:
            thread.join(timeout=3)

        self.assertTrue(
            all(not t.is_alive() for t in threads),
            "并发互动或读取疑似死锁"
        )
        self.assertFalse(errors, errors)

        state = self.session.get_state()
        expected_count = (
            1 + writer_count * updates_per_writer
        )

        self.assertEqual(
            state["interaction_count"],
            expected_count
        )
        self.assertTrue(state["is_active"])
        self.assertEqual(state["started_at"], 1000)
        self.assertEqual(
            state["last_interaction_type"],
            f't{state["last_interaction_at"]}'
        )

    def test_concurrent_end_only_once(self):
        """13. 多个线程同时结束会话，只能成功一次"""
        self.session.start(1000, "touch")
        self.session.interact(1020, "speech")

        results = []
        errors = []
        gate = threading.Event()

        def worker():
            gate.wait()
            try:
                results.append(self.session.end())
            except Exception as exc:
                errors.append(exc)

        threads = [
            threading.Thread(
                target=worker,
                daemon=True
            )
            for _ in range(12)
        ]

        for thread in threads:
            thread.start()

        gate.set()

        for thread in threads:
            thread.join(timeout=2)

        self.assertTrue(
            all(not t.is_alive() for t in threads),
            "并发 end() 疑似死锁"
        )
        self.assertFalse(errors, errors)

        self.assertEqual(len(results), 12)
        self.assertEqual(results.count(True), 1)
        self.assertEqual(results.count(False), 11)

        state = self.session.get_state()

        self.assertFalse(state["is_active"])
        self.assertEqual(state["started_at"], 1000)
        self.assertEqual(state["last_interaction_at"], 1020)
        self.assertEqual(
            state["last_interaction_type"],
            "speech"
        )
        self.assertEqual(state["interaction_count"], 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
