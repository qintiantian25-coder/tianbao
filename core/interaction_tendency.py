def decide_interaction_tendency(state):
    if state["emotion"] == "sad":
        return "gentle"
    elif state["energy"] < 30:
        return "tired"
    elif state["emotion"] == "happy" and state["energy"] >= 60:
        return "playful"
    elif state["social_need"] >= 70:
        return "affectionate"
    else:
        return "neutral"
    
def is_recent_interaction(session_state, now):
    last_interaction_at = session_state["last_interaction_at"]
    if last_interaction_at is None:
        return False
    is_recent_interaction = now - last_interaction_at
    if 0 <= is_recent_interaction <= 60:
        return True
    else:
        return False