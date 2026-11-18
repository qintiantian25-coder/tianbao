import sys
import time
from pathlib import Path

# 直接运行脚本时，把项目根目录加入模块搜索路径
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.state_store import StateStore
from core.behavior_scheduler import BehaviorScheduler
from core.action_executor import execute_action


store = StateStore()
scheduler = BehaviorScheduler(cooldown_seconds=60)

# 模拟社交需求较高
store.apply_social_need_increase(70)

for i in range(3):

    # 1. 读取当前状态
    state = store.get_state()

    # 2. 获取当前时间
    now = time.monotonic()

    # 3. 决策与调度
    action = scheduler.tick(state, now)

    # 4. 执行行为，并获取执行后的状态
    result = execute_action(action, store)

    # 5. 输出结果
    print(f"第{i + 1}次决策：{action}")
    print(
        f"精力: {result['energy']}, "
        f"社交需求: {result['social_need']}"
    )

    time.sleep(1)