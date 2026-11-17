from behavior import decide_action

assert decide_action({"energy": 15, "emotion": "happy"}) == "rest"
assert decide_action({"energy": 25, "emotion": "happy"}) == "rest"
assert decide_action({"energy": 30, "emotion": "happy"}) == "idle"
assert decide_action({"energy": 80, "emotion": "happy"}) == "interact"
assert decide_action({"energy": 80, "emotion": "sad"}) == "idle"

print("行为决策测试通过！")