import time

test_state = {
    "emotion": "happy",
    "intensity": 60
}

tianbao = {
    "emotion": "happy",
    "intensity": 60
}

personality = {
      "happy_decay" : 1,
      "sad_decay" : 4
}

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

def emotion_expression(state, event=None):

    emotion = state["emotion"]
    intensity = state["intensity"]

    # 1. 遇到负面事件后的即时反应
    if event == "sad_event":

        if emotion == "happy":
            print("唔...虽然有点小难过, 不过tianbao的好心情还在呢~")

        elif emotion == "calm":
            print("唔...有点失落呢, tianbao想安静地待一小会儿.")

        elif emotion == "sad":
            if intensity >= 80:
                print("呜呜...这件事真的让tianbao好伤心, 想要一个抱抱...")
            elif intensity >= 50:
                print("呜...tianbao有点难过, 可以陪陪tianbao嘛?")
            else:
                print("唔...有一点点小委屈, 不过tianbao会慢慢好起来的~")

    # 2. 被摸头后的即时反应
    elif event == "touch":

        if emotion == "happy":
            print("嘿嘿~是摸摸头! tianbao的开心又多了一点点!")

        elif emotion == "sad":
            print("唔...谢谢你摸摸tianbao, 感觉心里暖暖的, 没那么难过啦~")

        elif emotion == "calm":
            print("呼~被摸摸头以后, tianbao感觉安心多啦.")

    # 3. 普通情绪表达
    if emotion == "calm":#这里之前是elif 但是会被 evnet截断只会走上面的sad或者touch下面都不会走了，所以event和emotionn应该是两个判断口
        print("唔~tianbao现在很安心, 陪着你就很舒服啦.")

    elif emotion == "happy":
        if intensity >= 80:
            print("哇呜!! tianbao超级超级开心! 好想开心地转个圈圈~")
        elif intensity >= 50:
            print("嘿嘿! tianbao现在好开心呀, 感觉什么都很美好!")
        else:
            print("嘿嘿, tianbao今天的心情还不错呢~")

    elif emotion == "sad":
        if intensity >= 80:
            print("呜呜...tianbao真的有点伤心了, 想靠近你一点...")
        elif intensity >= 50:
            print("呜...tianbao心里有点难受, 可以陪tianbao待一会儿嘛?")
        else:
            print("唔...tianbao有一点点不开心, 想要一个摸摸头...")

print("初始状态：", tianbao)
last_time = time.monotonic() # time.monotonic()是一个单调时钟的当前读数
while True: # 持续循环，直到程序主动退出或被中断
    command = input("请输入指令：") # input()里是给用户的提示词
    current_time = time.monotonic()
    elapsed = current_time - last_time
    last_time = current_time #上一次情绪更新的计时点（情绪不会因为程序正在工作而暂停）
    emotion_decay(tianbao, elapsed, personality)
    if command == "touch":
        amount = int(input(
        "请输入摸头程度(1-10: 轻轻摸头, 11-20: 普通摸头, 21-30: 亲昵地摸头): "
        ))
        if 1 <= amount <= 30:
            if amount <= 10:
                print("唔~是谁轻轻碰了碰tianbao的小脑袋呀?")
            elif amount <= 20:
                print("嘿嘿~tianbao被摸摸头啦, 好舒服呀!")
            else:
                print("哇呜~是超级温柔的摸摸头! tianbao要幸福得冒泡泡啦!")
            head_touch(tianbao, amount)
            print(tianbao)
            emotion_expression(tianbao, event="touch")
        else:
            print("唔? 摸头程度要在1到30之间哦~")

    elif command == "sad_event":
        print("请选择负面事件强度:")
        print("0: 无影响")
        print("1-20: 轻微负面事件")
        print("21-50: 普通负面事件")
        print("51-80: 严重负面事件")
        print("81-100: 非常严重的负面事件")
        amount = int(input("请输入事件强度(0-100): "))

        if not 0 <= amount <= 100:
            print("唔? 事件强度只能在0到100之间哦~")
        elif amount == 0:
            print("嘿嘿~好像没有发生什么不开心的事情呢!")
        else:
            if amount <= 20:
                print("唔? 好像遇到了一点点小麻烦呢...不过没关系啦~")

            elif amount <= 50:
                print("唔...发生了一件不太开心的事情, tianbao有点小委屈呢.")

            elif amount <= 80:
                print("呜...这件事有点让tianbao难受, 心里闷闷的...")
            else:
                print("呜呜...怎么会发生这样的事情呀...tianbao有点受打击了...")

            sad_event(tianbao, amount)
            print(tianbao)
            emotion_expression(tianbao, event="sad_event")
    elif command == "state":
        print(tianbao)
        emotion_expression(tianbao)
    elif command == "exit":
        print("tianbao已关闭")
        break
