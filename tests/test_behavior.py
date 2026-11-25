
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
from core.interaction_tendency import (
    decide_interaction_tendency,
    is_recent_interaction,
    decide_contextual_tendency,
    count_recent_interactions,
)


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



class TestInteractionTendency(unittest.TestCase):
    """v0.5 互动倾向判断单元测试。"""

    def test_all_tendencies_and_boundaries(self):
        """验证五种倾向及关键阈值。"""
        cases = [
            ("sad", 80, 20, "gentle"),
            ("sad", 10, 90, "gentle"),
            ("happy", 20, 90, "tired"),
            ("happy", 80, 90, "playful"),
            ("happy", 60, 20, "playful"),
            ("calm", 80, 90, "affectionate"),
            ("calm", 80, 70, "affectionate"),
            ("calm", 80, 69, "neutral"),
            ("happy", 40, 20, "neutral"),
            ("calm", 30, 20, "neutral"),
        ]

        for emotion, energy, social, expected in cases:
            with self.subTest(
                emotion=emotion,
                energy=energy,
                social_need=social
            ):
                state = {
                    "emotion": emotion,
                    "energy": energy,
                    "social_need": social
                }
                self.assertEqual(
                    decide_interaction_tendency(state),
                    expected
                )

    def test_sad_has_highest_priority(self):
        """伤心优先于疲倦及社交需求。"""
        state = {
            "emotion": "sad",
            "energy": 10,
            "social_need": 95
        }
        self.assertEqual(
            decide_interaction_tendency(state),
            "gentle"
        )

    def test_tired_overrides_affectionate(self):
        """低精力优先于亲昵倾向。"""
        state = {
            "emotion": "calm",
            "energy": 29,
            "social_need": 90
        }
        self.assertEqual(
            decide_interaction_tendency(state),
            "tired"
        )

    def test_playful_overrides_affectionate(self):
        """开心且精力充足时优先活泼。"""
        state = {
            "emotion": "happy",
            "energy": 60,
            "social_need": 90
        }
        self.assertEqual(
            decide_interaction_tendency(state),
            "playful"
        )

    def test_does_not_modify_input(self):
        """纯函数不应改变传入的状态。"""
        state = {
            "emotion": "happy",
            "energy": 80,
            "social_need": 90
        }
        before = state.copy()

        decide_interaction_tendency(state)

        self.assertEqual(state, before)



class TestContextualInteractionTendency(unittest.TestCase):
    """v0.5 近期互动与上下文倾向测试。"""

    def test_recent_interaction_boundaries(self):
        """None、0秒、300秒、超过300秒及未来时间。"""
        cases = [
            (None, 1000, False),
            (1000, 990, False),
            (1000, 1000, True),
            (1000, 1030, True),
            (1000, 1060, True),
            (1000, 1061, True),
            (1000, 1300, True),
            (1000, 1301, False),
        ]

        for last_time, now, expected in cases:
            with self.subTest(
                last_time=last_time,
                now=now
            ):
                session = {
                    "last_interaction_at": last_time
                }
                self.assertEqual(
                    is_recent_interaction(session, now),
                    expected
                )

    def test_neutral_becomes_affectionate_when_recent(self):
        """近期互动让中性倾向转为亲昵。"""
        state = {
            "emotion": "calm",
            "energy": 80,
            "social_need": 20
        }
        session = {"last_interaction_at": 1000}

        self.assertEqual(
            decide_contextual_tendency(state, session, 1030),
            "affectionate"
        )

    def test_neutral_remains_neutral_when_not_recent(self):
        """长时间未互动或从未互动，保持中性。"""
        state = {
            "emotion": "calm",
            "energy": 80,
            "social_need": 20
        }

        for last_time in (None, 1000):
            session = {
                "last_interaction_at": last_time
            }
            self.assertEqual(
                decide_contextual_tendency(
                    state, session, 1400
                ),
                "neutral"
            )

    def test_context_does_not_override_other_tendencies(self):
        """近期互动不覆盖其他已有倾向。"""
        session = {"last_interaction_at": 1000}

        cases = [
            ("sad", 80, 20, "gentle"),
            ("happy", 20, 90, "tired"),
            ("happy", 80, 90, "playful"),
            ("calm", 80, 90, "affectionate"),
        ]

        for emotion, energy, social, expected in cases:
            state = {
                "emotion": emotion,
                "energy": energy,
                "social_need": social
            }
            self.assertEqual(
                decide_contextual_tendency(
                    state, session, 1030
                ),
                expected
            )

    def test_context_functions_do_not_modify_inputs(self):
        """综合判断不修改原始状态和会话记录。"""
        state = {
            "emotion": "calm",
            "energy": 80,
            "social_need": 20
        }
        session = {"last_interaction_at": 1000}

        original_state = state.copy()
        original_session = session.copy()

        decide_contextual_tendency(state, session, 1030)

        self.assertEqual(state, original_state)
        self.assertEqual(session, original_session)



    def test_count_recent_interactions_five_minutes(self):
        """统计最近300秒内的互动次数。"""
        cases = [
            ([], 1300, 0),
            ([1000, 1010, 1020], 1030, 3),
            ([1000, 1010, 1300, 1301], 1300, 3),
            ([999, 1000, 1301], 1300, 1),
            ([1000, 1100], 1400, 1),
        ]

        for times, now, expected in cases:
            with self.subTest(
                times=times,
                now=now
            ):
                self.assertEqual(
                    count_recent_interactions(times, now),
                    expected
                )


class TestCompanionSessionRecentHistory(unittest.TestCase):
    """v0.5 最近五分钟互动历史管理测试。"""

    def setUp(self):
        self.session = CompanionSession()

    def test_initial_history_and_inactive_interaction(self):
        """初始化为空；未开始会话不能添加互动。"""
        self.assertEqual(self.session.interaction_times, [])
        self.assertEqual(self.session.get_recent_count(1000), 0)

        self.assertFalse(
            self.session.interact(1000, "touch")
        )
        self.assertEqual(self.session.interaction_times, [])

    def test_append_and_prune_history(self):
        """新互动能够追加时间，并移除过期记录。"""
        self.session.start(1000, "touch")
        self.session.interact(1100, "touch")
        self.session.interact(1300, "touch")
        self.session.interact(1301, "touch")
        self.session.interact(1401, "touch")

        self.assertEqual(
            self.session.interaction_times,
            [1300, 1301, 1401]
        )
        self.assertEqual(self.session.interaction_count, 5)
        self.assertEqual(self.session.get_recent_count(1401), 3)
        self.assertTrue(self.session.is_active)

    def test_five_minute_boundaries(self):
        """恰好300秒计入，超过300秒不计入。"""
        self.session.start(1000, "touch")
        self.session.interact(1300, "touch")

        self.assertEqual(
            self.session.get_recent_count(1300),
            2
        )

        self.session.interact(1301, "touch")

        self.assertEqual(
            self.session.interaction_times,
            [1300, 1301]
        )
        self.assertEqual(self.session.get_recent_count(1600), 2)
        self.assertEqual(self.session.get_recent_count(1601), 1)
        self.assertEqual(self.session.get_recent_count(1602), 0)

    def test_read_does_not_modify_history(self):
        """只读统计不修改历史，也不结束会话。"""
        self.session.start(1000, "touch")

        original = self.session.interaction_times.copy()

        self.assertEqual(self.session.get_recent_count(2000), 0)
        self.assertEqual(self.session.interaction_times, original)
        self.assertEqual(self.session.interaction_count, 1)
        self.assertTrue(self.session.is_active)

    def test_restart_resets_history(self):
        """新会话清空上一段会话的时间历史。"""
        self.session.start(1000, "touch")
        self.session.interact(1050, "touch")

        self.assertFalse(
            self.session.start(1100, "touch")
        )
        self.assertEqual(
            self.session.interaction_times,
            [1000, 1050]
        )

        self.assertTrue(self.session.end())
        self.assertTrue(self.session.start(2000, "touch"))

        self.assertEqual(
            self.session.interaction_times,
            [2000]
        )
        self.assertEqual(self.session.interaction_count, 1)
        self.assertEqual(self.session.get_recent_count(2000), 1)

    def test_concurrent_history_updates(self):
        """多个线程同时互动，累计次数和历史不丢失。"""
        self.session.start(1000, "touch")

        errors = []
        gate = threading.Event()

        worker_count = 8
        updates_per_worker = 25

        def worker():
            gate.wait()
            try:
                for _ in range(updates_per_worker):
                    success = self.session.interact(
                        1010, "touch"
                    )
                    if not success:
                        raise AssertionError(
                            "活动会话中的互动不应失败"
                        )
            except Exception as exc:
                errors.append(exc)

        threads = [
            threading.Thread(
                target=worker,
                daemon=True
            )
            for _ in range(worker_count)
        ]

        for thread in threads:
            thread.start()

        gate.set()

        for thread in threads:
            thread.join(timeout=3)

        self.assertTrue(
            all(not thread.is_alive() for thread in threads),
            "并发互动疑似死锁"
        )
        self.assertFalse(errors, errors)

        expected = 1 + worker_count * updates_per_worker

        self.assertEqual(
            self.session.interaction_count,
            expected
        )
        self.assertEqual(
            len(self.session.interaction_times),
            expected
        )
        self.assertEqual(
            self.session.get_recent_count(1010),
            expected
        )



from core.interaction_tendency import (
    decide_interaction_frequency,
    decide_frequency_tendency,
    decide_tendency_with_frequency,
    count_recent_interactions,
)


class TestFrequencyTendency(unittest.TestCase):
    """v0.5 互动频率与最终表达倾向测试。"""

    def test_frequency_boundaries(self):
        """验证0、1、2、3次等频率边界。"""
        cases = [
            (0, "none"),
            (1, "low"),
            (2, "low"),
            (3, "frequent"),
            (10, "frequent"),
        ]

        for count, expected in cases:
            with self.subTest(count=count):
                self.assertEqual(
                    decide_interaction_frequency(count),
                    expected
                )

    def test_neutral_frequency_adjustment(self):
        """只有频繁互动才将中性转为亲昵。"""
        cases = [
            ("none", "neutral"),
            ("low", "neutral"),
            ("frequent", "affectionate"),
        ]

        for frequency, expected in cases:
            with self.subTest(frequency=frequency):
                self.assertEqual(
                    decide_frequency_tendency(
                        "neutral", frequency
                    ),
                    expected
                )

    def test_preserve_existing_tendencies(self):
        """频率不应覆盖其他已有倾向。"""
        tendencies = [
            "gentle",
            "tired",
            "playful",
            "affectionate",
        ]

        for tendency in tendencies:
            for frequency in ("none", "low", "frequent"):
                with self.subTest(
                    tendency=tendency,
                    frequency=frequency
                ):
                    self.assertEqual(
                        decide_frequency_tendency(
                            tendency, frequency
                        ),
                        tendency
                    )

    def test_combined_tendency(self):
        """综合状态与频率判断最终倾向。"""
        cases = [
            ("sad", 80, 20, 4, "gentle"),
            ("happy", 20, 90, 5, "tired"),
            ("happy", 80, 90, 4, "playful"),
            ("calm", 80, 75, 0, "affectionate"),
            ("calm", 80, 20, 2, "neutral"),
            ("calm", 80, 20, 3, "affectionate"),
        ]

        for emotion, energy, social, count, expected in cases:
            state = {
                "emotion": emotion,
                "energy": energy,
                "social_need": social,
            }

            with self.subTest(
                emotion=emotion,
                count=count
            ):
                self.assertEqual(
                    decide_tendency_with_frequency(
                        state, count
                    ),
                    expected
                )

    def test_history_integration_and_purity(self):
        """互动历史能够参与判断，且不修改原始状态。"""
        state = {
            "emotion": "calm",
            "energy": 80,
            "social_need": 20,
        }
        times = [1000, 1010, 1020]
        original_state = state.copy()
        original_times = times.copy()

        recent_count = count_recent_interactions(
            times, 1030
        )

        self.assertEqual(recent_count, 3)
        self.assertEqual(
            decide_tendency_with_frequency(
                state, recent_count
            ),
            "affectionate"
        )
        self.assertEqual(state, original_state)
        self.assertEqual(times, original_times)


if __name__ == "__main__":
    unittest.main(verbosity=2)
