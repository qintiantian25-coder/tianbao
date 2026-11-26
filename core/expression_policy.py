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

# 将结构化标签转化为自然语言表达
def describe_speech_tone(tone):
    if tone == "soft":
        return "语气温柔、轻声、克制。"
    elif tone == "quiet":
        return "语气安静、平缓。"
    elif tone == "lively":
        return "语气活泼、自然，带一点俏皮。"
    elif tone == "warm":
        return "语气温暖亲昵，不过度撒娇。"
    else:
        return "语气自然、亲切。"

# 将回复长度标签转换为自然语言描述
def describe_response_length(response_length):
    if response_length == "brief":
        return "尽量简短回应，避免不必要的展开。"
    elif response_length == "short":
        return "回复相对简短，表达自然、清晰。"
    else:
        return "根据交流内容自然决定回复长度。"

# 将表达主动程度转换为自然语言指导
def describe_expression_initiative(initiative):
    if initiative == "low":
        return "表达克制、温和，不刻意延长交流。"
    elif initiative == "high":
        return "回应积极、热情，可以适当俏皮，但不要主动打扰主人。"
    else:
        return "自然回应主人，保持适度的交流热情。"


# 根据表达策略，生成适用于MiniCPM的自然语言指导
def build_expression_instruction(policy):
    tone = policy["tone"]
    response_length = policy["response_length"]
    initiative = policy["initiative"]

    tone_description = describe_speech_tone(tone)
    response_length_description = describe_response_length(response_length)
    initiative_description = describe_expression_initiative(initiative)

    result = f"{tone_description}{response_length_description}{initiative_description}"
    return result