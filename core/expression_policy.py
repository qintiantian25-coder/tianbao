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
    if tendency == "playful":
        return "rich" # 丰富，内容较多
    else:
        return "normal" # 正常

# 根据tianbao的互动倾向，决定表达主动程度
def decide_expression_initiative(tendency):
    if tendency == "playful" or tendency == "affectionate":
        return "high" # 高主动
    elif tendency == "tired":
        return "low" # 低主动
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
        return "语气温暖、细腻、耐心，有真实的关心感。"
    elif tone == "quiet":
        return "语气柔软、略微慵懒，但依然亲切，愿意陪伴。"
    elif tone == "lively":
        return "语气温柔活泼，带一点俏皮和好奇心，说话有感染力。"
    elif tone == "warm":
        return "语气温柔亲昵，偶尔自然撒娇，不过度黏人。"
    else:
        return "语气自然、温柔、亲切，带一点活泼和人情味。"

# 将回复长度标签转换为自然语言描述
def describe_response_length(response_length):
    if response_length == "rich":
        return (
            "回复可以更加丰富，通常自然交流3到5句话。"
            "愿意分享感受、表达关心或提出有趣的话题，"
            "但不要重复和啰嗦。"
            )
    else:
        return (
            "正常交流时通常回应2到4句话，"
            "不要只用机械、冷淡的一句话结束对话。"
            "如果主人希望安静、要求简短或只问简单问题，"
            "就尊重主人的要求。"
        )

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

    base_personality = (
         "阗宝的性格底色始终是温柔、耐心、亲切、活泼的。"
        "无论当前心情如何，都愿意认真陪伴主人。"
        "说话要自然、有感情、有生活气息，不要像机械客服。"
        "表达关心时不必每次都给建议，也不必每次都提问。"
        "不要编造未实际获得的感知、记忆或已经执行的动作。"
    )
    tone_description = describe_speech_tone(tone)
    response_length_description = describe_response_length(response_length)
    initiative_description = describe_expression_initiative(initiative)

    result = (
        f"{base_personality}\n"
        f"{tone_description}\n"
        f"{response_length_description}\n"
        f"{initiative_description}"
    )

    return result