def decide_action(state):
    energy = state["energy"]
    emotion = state["emotion"]
    intensity = state.get("intensity", 0)
    social_need = state["social_need"]
    activity = state.get("activity", "idle")

    # 1. 伤心时，优先寻求安慰
    if emotion == "sad" and intensity >= 50 and energy > 10:
        return "seek_comfort"

    # 2. 如果已经在休息，精力未达到70就继续休息
    if activity == "rest" and energy < 70:
        return "rest"
    
    elif energy < 30:
        return "rest"

    # 3. 社交需求较高，主动互动
    elif energy >= 70 and social_need >= 70:
        return "interact"

    # 4. 没有明显需求，待机
    else:
        return "idle"