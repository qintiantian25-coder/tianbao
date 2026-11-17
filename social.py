def increase_social_need(state,amount):
    state["social_need"] = min(100, state["social_need"] + amount)
    return state

def reduce_social_need(state,amount):
    state["social_need"] = max(0, state["social_need"] - amount)
    return state