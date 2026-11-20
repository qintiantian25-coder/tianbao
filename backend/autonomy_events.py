"""Thread-safe in-memory event buffer for background autonomy actions.

Events contain only small, public presentation text. They never include
microphone data, private conversations, or anything from the state store.

Reads are non-destructive: each web client keeps its own cursor and can read
the same event independently. The buffer is intentionally process-local; a
backend restart clears it and resets the event ids.
"""

import threading
import time
from collections import deque


class AutonomyEventBuffer:
    def __init__(self, capacity=100):
        capacity = int(capacity)
        if capacity <= 0:
            raise ValueError("capacity must be positive")

        self._events = deque(maxlen=capacity)
        self._next_id = 0
        self._lock = threading.Lock()

    @property
    def latest_id(self):
        with self._lock:
            return self._next_id

    def publish(self, action, message, source="background"):
        """Append one event and return a copy of it."""
        with self._lock:
            self._next_id += 1
            event = {
                "id": self._next_id,
                "action": str(action),
                "message": str(message),
                "created_at": time.time(),
                "source": str(source),
            }
            self._events.append(event)
            return dict(event)

    def read(self, after_id=None):
        """Return a consistent snapshot for one client.

        ``after_id=None`` is the first-load case: return no events, only the
        current head id, so a page does not replay history that existed before
        it opened.
        """
        with self._lock:
            latest_id = self._next_id
            oldest_id = self._events[0]["id"] if self._events else 0

            if after_id is None:
                return {
                    "events": [],
                    "latest_id": latest_id,
                    "oldest_id": oldest_id,
                    "dropped": False,
                    "reset": False,
                }

            # The client cursor is from a previous server process (ids reset),
            # or is otherwise ahead of this buffer.
            if after_id > latest_id:
                return {
                    "events": [],
                    "latest_id": latest_id,
                    "oldest_id": oldest_id,
                    "dropped": False,
                    "reset": True,
                }

            # The cursor is older than the oldest retained event, so some
            # events were evicted by the capacity limit.
            dropped = bool(self._events) and after_id < oldest_id - 1
            events = [
                dict(event)
                for event in self._events
                if event["id"] > after_id
            ]

            return {
                "events": events,
                "latest_id": latest_id,
                "oldest_id": oldest_id,
                "dropped": dropped,
                "reset": False,
            }

    def reset(self):
        """Clear the buffer. Intended for tests, not exposed by the API."""
        with self._lock:
            self._events.clear()
            self._next_id = 0
