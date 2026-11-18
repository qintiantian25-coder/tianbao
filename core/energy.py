def consume_energy(state, amount):
    state["energy"] = max(0, state["energy"] - amount)
    return state


def recover_energy(state, amount):
    state["energy"] = min(100, state["energy"] + amount)
    return state