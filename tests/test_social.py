import sys
from pathlib import Path

# 允许直接运行: python tests/test_social.py
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.state_store import StateStore

store = StateStore()

assert store.get_state()["social_need"] == 20

store.apply_social_need_increase(30)

assert store.get_state()["social_need"] == 50

print("StateStore 社交需求集成测试通过！")