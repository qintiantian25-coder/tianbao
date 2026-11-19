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
                    # 已经在休息且精力尚未恢复到70，继续休息
                    if (
                        state.get("activity") == "rest"
                        and state["energy"] < 70
                    ):
                        return "rest"

                    # 精力很低，开始休息
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
        