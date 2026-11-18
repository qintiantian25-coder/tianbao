from backend.state_store import StateStore

store = StateStore()

assert store.get_state()["energy"] == 80

store.apply_energy_cost(30)
assert store.get_state()["energy"] == 50

store.apply_energy_recovery(20)
assert store.get_state()["energy"] == 70

store.apply_energy_recovery(100)
assert store.get_state()["energy"] == 100

store.apply_energy_cost(200)
assert store.get_state()["energy"] == 0

print("精力管理测试通过！")