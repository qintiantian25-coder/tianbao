import time
import threading

from emotion import (
    emotion_decay,
    head_touch,
    sad_event,
    state_expression,
    event_expression,
)


class StateStore:

    def __init__(self):
        self.tianbao = {"emotion": "happy", "intensity": 60}
        self.personality = {"happy_decay": 1, "sad_decay": 4}
        self._last_update = time.monotonic()
        self._state_lock = threading.Lock()

    def _update_elapsed_time(self):
        """Apply decay once for the time since the previous state update.

        Called while holding _state_lock so GET and POST requests cannot
        accidentally update the same interval at the same time.
        """
        now = time.monotonic()
        elapsed = max(0.0, now - self._last_update)
        self._last_update = now
        emotion_decay(self.tianbao, elapsed, self.personality)

    def _state_data(self):
        """Return JSON-serializable state. Caller must hold _state_lock."""
        return {
            "emotion": self.tianbao["emotion"],
            "intensity": round(float(self.tianbao["intensity"]), 2),
            "description": state_expression(self.tianbao),
        }

    def get_state(self):
        with self._state_lock:
            self._update_elapsed_time()
            return self._state_data()

    def apply_touch(self, amount):
        with self._state_lock:
            self._update_elapsed_time()

            head_touch(self.tianbao, amount)

            current = self._state_data()
            message = event_expression(self.tianbao, "touch")

            return current, message

    def apply_sad_event(self, amount):
        with self._state_lock:
            self._update_elapsed_time()

            if amount > 0:
                sad_event(self.tianbao, amount)
                message = event_expression(
                    self.tianbao, "sad_event"
                )
            else:
                message = "嘿嘿~好像没有发生什么不开心的事情呢!"

            current = self._state_data()

            return current, message