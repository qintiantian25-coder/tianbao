# 根据tianbao的互动倾向，决定语言表达语气
def decide_speech_tone(tendency):
    if tendency == "gentle":
        return "soft" # 温柔语气
    elif tendency == "tired":
        return "quiet" # 安静，低能量
    elif tendency == "playful":
        return "lively" # 活泼，调皮
    elif tendency == "affectionate":
        return "warm" # 亲昵，撒娇
    else:
        return "natural" # 平静，自然

# 根据tianbao的互动倾向，决定回复长度
def decide_response_length(tendency):
    if tendency == "tired":
        return "brief" # 简短
    elif tendency == "gentle" or tendency == "affectionate":
        return "short" # 中等长度
    else:
        return "normal" # 正常

# 根据tianbao的互动倾向，决定表达主动程度
def decide_expression_initiative(tendency):
    if tendency == "gentle" or tendency == "tired":
        return "low" # 低主动
    elif tendency == "playful" or tendency == "affectionate":
        return "high" # 高主动
    else:
        return "medium" # 中等主动

# 根据tianbao的互动倾向，构建完整的表达策略
def build_expression_policy(tendency):
    tone = decide_speech_tone(tendency)
    response_length = decide_response_length(tendency)
    initiative = decide_expression_initiative(tendency)
    return {
        "tone": tone,
        "response_length": response_length,
        "initiative": initiative
    }

# 根据互动反馈，构建tianbao的完整表达信息
def build_companion_expression(feedback):
    tendency = feedback["tendency"]
    expression = build_expression_policy(tendency)
    return {
        "tendency": tendency,
        "frequency": feedback["frequency"],
        "recent_count": feedback["recent_count"],
        "expression": expression
    }