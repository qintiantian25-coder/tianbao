# 根据tianbao当前的情绪、精力和社交需求，判断基础互动倾向
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

# 判断tianbao最近5分钟内是否与主人发生过互动   
def is_recent_interaction(session_state, now):
    last_interaction_at = session_state["last_interaction_at"]

    if last_interaction_at is None:
        return False

    elapsed_seconds = now - last_interaction_at

    if 0 <= elapsed_seconds <= 300:  # 5分钟内
        return True
    else:
        return False

# 综合tianbao的基础状态和最近互动时间，判断上下文互动倾向
def decide_contextual_tendency(state, session_state, now):
    base_tendency = decide_interaction_tendency(state)
    if base_tendency == "neutral" and is_recent_interaction(session_state, now):
        return "affectionate"
    else:
        return base_tendency

# 统计最近5分钟内发生的互动次数
def count_recent_interactions(interaction_times, now):
    count = 0
    for interaction_time in interaction_times:
        elapsed_seconds = now - interaction_time
        if 0 <= elapsed_seconds <= 300:
            count += 1
    return count

# 根据最近5分钟的互动次数，判断互动频率等级
def decide_interaction_frequency(recent_count):
    if recent_count == 0:
        return "none"
    elif recent_count <= 2:
        return "low"
    else:
        return "frequent"

# 根据近期互动频率，对基础互动倾向进行调整
def decide_frequency_tendency(base_tendency, frequency):
    if base_tendency == "neutral" and frequency == "frequent":
        return "affectionate"
    else:
        return base_tendency

# 综合tianbao当前状态与近期互动频率，得到最终互动倾向
def decide_tendency_with_frequency(state, recent_count):
    base_tendency = decide_interaction_tendency(state)
    frequency = decide_interaction_frequency(recent_count)
    result = decide_frequency_tendency(base_tendency, frequency)
    return result