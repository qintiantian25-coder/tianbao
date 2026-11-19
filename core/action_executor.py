def execute_action(action, store):

    if action == "interact":
        print("主人，我想和你玩一会儿~")

        # 结束休息，进入普通活动状态
        store.set_activity("idle")

        # 主动互动消耗10点精力
        store.apply_energy_cost(10)

        # 暂时模拟主人成功回应
        store.apply_social_need_decrease(20)

    elif action == "seek_comfort":
        print("主人，我有点伤心，想要安慰~")

        # 结束休息
        store.set_activity("idle")

        # 请求安慰只消耗1点精力
        store.apply_energy_cost(1)

    elif action == "rest":
        print("我想休息一下~")

        # 进入持续休息状态
        store.set_activity("rest")

    elif action == "idle":
        print("tianbao正在安静待机...")

        # 结束休息，进入待机状态
        store.set_activity("idle")

    else:
        raise ValueError(f"未知行为：{action}")

    return store.get_state()