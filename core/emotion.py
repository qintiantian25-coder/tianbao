def head_touch(state, amount):
    """
    当阗宝被摸头时，更新情绪状态。
    """
    if state["emotion"] == "calm":
        state["emotion"] = "happy"
        state["intensity"] = min(100, state["intensity"] + amount)
    elif state["emotion"] == "sad":
        state["intensity"] = max(0, state["intensity"] - amount)
        if state["intensity"] == 0:
            state["emotion"] = "calm"
    elif state["emotion"] == "happy":
        state["intensity"] = min(100, state["intensity"] + amount)
    return state

def sad_event(state, amount):
    if state["emotion"] == "calm":
        state["emotion"] = "sad"
        state["intensity"] = min(100, state["intensity"] + amount)
    elif state["emotion"] == "sad":
        state["intensity"] = min(100, state["intensity"] + amount)
    elif state["emotion"] == "happy":
        state["intensity"] = max(0, state["intensity"] - amount)
        if state["intensity"] == 0:
            state["emotion"] = "calm"
    return state 

def emotion_decay(state,elapsed, personality):
    """
    让阗宝的情绪逐渐恢复平静。
    """
    if state["emotion"] == "happy":
        state["intensity"] = max(0, state["intensity"] - personality["happy_decay"] * elapsed)
    elif state["emotion"] == "sad":
        state["intensity"] = max(0, state["intensity"] - personality["sad_decay"] * elapsed) 
    if state["intensity"] == 0:
        state["emotion"] = "calm"
    return state 

def event_expression(state, event=None):

    emotion = state["emotion"]
    intensity = state["intensity"]

    # 1. 遇到负面事件后的即时反应
    if event == "sad_event":

        if emotion == "happy":
            return"唔...虽然有点小难过, 不过tianbao的好心情还在呢~"

        elif emotion == "calm":
            return"唔...有点失落呢, tianbao想安静地待一小会儿."

        elif emotion == "sad":
            if intensity >= 80:
                return"呜呜...这件事真的让tianbao好伤心, 想要一个抱抱..."
            elif intensity >= 50:
                return"呜...tianbao有点难过, 可以陪陪tianbao嘛?"
            else:
                return"唔...有一点点小委屈, 不过tianbao会慢慢好起来的~"

    # 2. 被摸头后的即时反应
    elif event == "touch":

        if emotion == "happy":
            return"嘿嘿~是摸摸头! tianbao的开心又多了一点点!"

        elif emotion == "sad":
            return"唔...谢谢你摸摸tianbao, 感觉心里暖暖的, 没那么难过啦~"

        elif emotion == "calm":
            return"呼~被摸摸头以后, tianbao感觉安心多啦."
    return""

def state_expression(state):   

    emotion = state["emotion"]
    intensity = state["intensity"]

    if emotion == "calm":
        return"tianbao当前状态:平静"

    elif emotion == "happy":
        if intensity >= 80:
            return"tianbao当前状态:非常开心"
        elif intensity >= 50:
            return"tianbao当前状态:开心"
        else:
            return"tianbao当前状态:心情不错"

    elif emotion == "sad":
        if intensity >= 80:
            return"tianbao当前状态:非常难过"
        elif intensity >= 50:
            return"tianbao当前状态:难过"
        else:
            return"tianbao当前状态:有些低落"
    return "tianbao当前状态:未知"