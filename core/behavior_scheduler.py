from behavior import decide_action

class BehaviorScheduler:

    def __init__(self, cooldown_seconds=60):
        self.cooldown_seconds = cooldown_seconds
        self.last_interact_at = None

    def tick(self, state, now):

        action = decide_action(state)

        if action != "interact":
            return action

        if self.last_interact_at is not None:
            elapsed = now - self.last_interact_at

            if elapsed < self.cooldown_seconds:
                return "idle"

        self.last_interact_at = now
        return "interact"
        