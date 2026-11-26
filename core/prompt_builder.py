from core.expression_policy import (
    build_companion_expression,
    build_expression_instruction
)


def build_companion_messages(
        persona, 
        expression_instruction, 
        user_text, 
        history = None,
        max_history_messages = 6
        ):

    # 1. 创建字符串
    system_content = f"{persona}\n{expression_instruction}"

    # 2. 创建系统消息字典
    system_message = {
        "role": "system",
        "content": system_content
    }

    # 3. 创建主人消息字典
    user_message = {
        "role": "user",
        "content": user_text
    }

    if history is None:
        history = []

    # 
    if max_history_messages == 0:
        recent_history = []
    else:
        recent_history = history[-max_history_messages:]
    
    # 4. 创建消息列表，初始只包含 system_message
    # []创建列表，保证顺序，{}创建集合或字典，不保证顺序
    # "system_message" 字符串，内容就是system_message; system_message 变量，指向你创建的那个字典
    messages = [system_message]

    # 5. 将历史消息添加到消息列表中
    # 谁要增加元素，就对谁调用 append()
    # 把当前历史消息复制一份，然后添加到 messages 列表的末尾
    for history_message in recent_history:
        messages.append(history_message.copy())

    # 6. 将主人消息添加到消息列表中
    messages.append(user_message)

    # 7. 返回列表
    return messages

def build_messages_from_feedback(
    persona,
    feedback,
    user_text,
    history=None,
    max_history_messages=6
):
    companion_expression = build_companion_expression(feedback)
    #{} 主要用来创建字典，而 [] 可以用来从字典中取出指定键对应的值
    policy = companion_expression["expression"]
    expression_instruction = build_expression_instruction(policy)

    messages = build_companion_messages(
        persona,
        expression_instruction,
        user_text,
        history,
        max_history_messages
    )

    return messages



    