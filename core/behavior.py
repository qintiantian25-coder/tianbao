def decide_action(state):
    energy = state["energy"]
    emotion = state["emotion"]
    social_need = state["social_need"]

    if energy < 30:
        return "rest"
    elif energy >= 70 and emotion == "happy" and social_need >= 70:
        return "interact"
    else:
        return "idle"

