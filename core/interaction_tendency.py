def decide_interaction_tendency(state):
    if state["emotion"] == "sad":
        return "gentle"  # 温柔
    elif state["energy"] < 30:
        return "tired"
    elif state["emotion"] == "happy" and state["energy"] >= 60:
        return "playful"  # 活泼，调皮
    elif state["social_need"] >= 70:
        return "affectionate" # 亲昵，撒娇
    else:
        return "neutral" # 中性，自然
    
def is_recent_interaction(session_state, now):
    last_interaction_at = session_state["last_interaction_at"]

    if last_interaction_at is None:
        return False

    elapsed_seconds = now - last_interaction_at

    if 0 <= elapsed_seconds <= 300:  # 5分钟内
        return True
    else:
        return False

def decide_contextual_tendency(state, session_state, now):
    base_tendency = decide_interaction_tendency(state)
    if base_tendency == "neutral" and is_recent_interaction(session_state, now):
        return "affectionate"
    else:
        return base_tendency

def count_recent_interactions(interaction_times, now):
    count = 0
    for interaction_time in interaction_times:
        elapsed_seconds = now - interaction_time
        if 0 <= elapsed_seconds <= 300:
            count += 1
    return count