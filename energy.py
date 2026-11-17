from behavior import decide_action

state1 = {
    "emotion": "happy",
    "energy": 15
}

state2 = {
    "emotion": "happy",
    "energy": 80
}

state3 = {
    "emotion": "calm",
    "energy": 50
}

assert decide_action(state1) == "rest"
assert decide_action(state2) == "interact"
assert decide_action(state3) == "idle"

print("行为决策测试通过！")