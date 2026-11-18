import sys
import time
from pathlib import Path

# 直接运行脚本时，把项目根目录加入模块搜索路径
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.emotion import (
    emotion_decay,
    head_touch,
    sad_event,
    event_expression,
)

tianbao = {
    "emotion": "happy",
    "intensity": 60
}

personality = {
      "happy_decay" : 1,
      "sad_decay" : 4
}

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
            event_expression(tianbao, event="touch")
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
            event_expression(tianbao, event="sad_event")
    elif command == "state":
        print(tianbao)
        event_expression(tianbao)
    elif command == "exit":
        print("tianbao已关闭")
        break