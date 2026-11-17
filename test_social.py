from social import increase_social_need, reduce_social_need

state = {
    "social_need": 20
}

# 长时间没有陪伴
increase_social_need(state, 30)
assert state["social_need"] == 50

# 主人开始陪伴
reduce_social_need(state, 15)
assert state["social_need"] == 35

# 测试上限
increase_social_need(state, 100)
assert state["social_need"] == 100

# 测试下限
reduce_social_need(state, 200)
assert state["social_need"] == 0

print("社交需求测试通过！")