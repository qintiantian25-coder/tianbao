from .behavior import decide_action

class BehaviorScheduler:

    def __init__(self, cooldown_seconds=60):
        self.cooldown_seconds = cooldown_seconds
        self.last_interact_at = None
        self.comfort_cooldown_seconds = 300
        self.last_comfort_at = None

    def tick(self, state, now):

        action = decide_action(state)

        if action == "seek_comfort":

            if self.last_comfort_at is not None:
                elapsed = now - self.last_comfort_at

                if elapsed < self.comfort_cooldown_seconds:
                    # 如果很疲惫，就先休息
                    if state["energy"] < 30:
                        return "rest"

                    return "idle"

            self.last_comfort_at = now
            return "seek_comfort"

        if action != "interact":
            return action

        if self.last_interact_at is not None:
            elapsed = now - self.last_interact_at

            if elapsed < self.cooldown_seconds:
                return "idle"

        self.last_interact_at = now
        return "interact"
        