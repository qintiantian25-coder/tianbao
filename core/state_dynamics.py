from .emotion import emotion_decay
from .social import increase_social_need


def update_state_over_time(state, elapsed, rates):
    """
    根据经过的时间，更新 tianbao 的内部状态。

    state: 当前状态
    elapsed: 经过的秒数
    rates: 各状态的变化速率，单位为点/秒
    """

    # 防止时间差为负数
    elapsed = max(0, elapsed)

    # 1. 更新情绪
    emotion_decay(state, elapsed, rates)

    # 2. 更新社交需求
    social_growth = elapsed * rates["social_need_growth"]
    increase_social_need(state, social_growth)

    return state