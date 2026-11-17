def decide_action(state):
    energy = state["energy"]
    emotion = state["emotion"]
    if energy < 30:
        return "rest"
    elif energy >= 70 and emotion == "happy":
        return "interact"
    else:
        return "idle"