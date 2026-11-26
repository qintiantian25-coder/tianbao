
def is_valid_chat_reply(reply):
    """检查模型回复是否包含异常格式。"""
    cleaned_reply = reply.strip()

    if cleaned_reply == "":
        return False

    # 禁止的格式标记
    forbidden_markers = [
        "<think>",
        "</think>",
        r"\begin{",
        r"\end{",
        "$$"
    ]

    for marker in forbidden_markers:
        if marker in cleaned_reply:
            return False

    return True


def process_model_reply(reply):
    """返回有效回复；异常时使用备用回复。"""
    fallback_reply = "主人，我刚刚没组织好语言，可以再说一次吗？"

    if is_valid_chat_reply(reply):
        cleaned_reply = reply.strip()
        return cleaned_reply
    else:
        return fallback_reply
