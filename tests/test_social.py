from backend.state_store import StateStore

store = StateStore()

assert store.get_state()["social_need"] == 20

store.apply_social_need_increase(30)

assert store.get_state()["social_need"] == 50

print("StateStore 社交需求集成测试通过！")