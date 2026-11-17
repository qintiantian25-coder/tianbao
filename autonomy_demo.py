import time

from backend.state_store import StateStore
from behavior_scheduler import BehaviorScheduler

store = StateStore()
scheduler = BehaviorScheduler(cooldown_seconds=60)

# 模拟阗宝很想获得陪伴
store.apply_social_need_increase(70)

for i in range(3):
    state = store.get_state()
    now = time.monotonic()  # 注意这里的括号
    action = scheduler.tick(state, now)

    print(f"第{i + 1}次决策：{action}")

    time.sleep(1)