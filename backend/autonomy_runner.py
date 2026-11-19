"""Background autonomy loop for tianbao.

The loop is deliberately independent of Flask. It only calls the ``run_once``
callable supplied by ``app_web``, so the shared StateStore, BehaviorScheduler
and action executor stay exactly the same as the manual debug API.

Lifecycle:
- Importing this module never starts a thread.
- ``AutonomyLoop.start()`` creates one daemon thread and is idempotent.
- ``stop()`` sets an Event so ``Event.wait(interval)`` returns immediately,
  then joins the thread.
"""

import logging
import math
import threading

autonomy_logger = logging.getLogger("tianbao.autonomy")

# Keep service logs visible even when Flask runs with debug=False.
if not autonomy_logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(
        logging.Formatter("%(asctime)s [autonomy] %(levelname)s %(message)s")
    )
    autonomy_logger.addHandler(_handler)

autonomy_logger.setLevel(logging.INFO)
autonomy_logger.propagate = False


class AutonomyLoop:
    """One daemon thread that periodically calls a shared decision function."""

    def __init__(self, run_once, interval_seconds=10.0, logger=None):
        interval = float(interval_seconds)
        if not math.isfinite(interval) or interval <= 0:
            raise ValueError("interval_seconds must be a positive finite number")

        self._run_once = run_once
        self.interval_seconds = interval
        self._logger = logger or autonomy_logger

        # _stop_event makes the wait interruptible. _lifecycle_lock protects
        # only thread creation/teardown, not the decision itself.
        self._stop_event = threading.Event()
        self._lifecycle_lock = threading.Lock()
        self._thread = None

    @property
    def running(self):
        thread = self._thread
        return bool(thread is not None and thread.is_alive())

    @property
    def run_once(self):
        return self._run_once

    def start(self):
        """Start the loop. Returns False if it is already running."""
        with self._lifecycle_lock:
            if self.running:
                return False

            self._stop_event.clear()
            self._thread = threading.Thread(
                target=self._run,
                name="tianbao-autonomy",
                daemon=True,
            )
            self._thread.start()

        return True

    def stop(self, timeout=5.0):
        """Interrupt the wait and join the thread. Returns True if stopped."""
        # Hold the lifecycle lock through the join so a concurrent start()
        # cannot replace the worker while stop() is still shutting it down.
        with self._lifecycle_lock:
            thread = self._thread
            if thread is None:
                return False

            self._stop_event.set()

            if thread.is_alive():
                thread.join(timeout)

            if thread.is_alive():
                # Keep _thread so a second start() cannot create a duplicate
                # while the old worker is still shutting down.
                self._logger.warning(
                    "自主行为循环未在 %.1f 秒内停止",
                    timeout,
                )
                return False

            self._thread = None

        self._logger.info("自主行为循环已停止")
        return True

    def _run(self):
        # Log inside the thread so the startup message always appears before
        # the first decision action.
        self._logger.info(
            "自主行为循环已启动 (间隔 %.1f 秒)",
            self.interval_seconds,
        )

        while not self._stop_event.is_set():
            try:
                self._run_once()
            except Exception:
                # A failed decision must not kill the scheduler thread.
                self._logger.exception("自主行为循环本轮执行失败")

            # Event.wait returns immediately when stop() is called.
            if self._stop_event.wait(self.interval_seconds):
                break
