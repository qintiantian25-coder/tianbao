def execute_action(action, store):

    if action == "interact":
        print("主人，我想和你玩一会儿~")

        # 主动互动消耗10点精力
        store.apply_energy_cost(10)

        # 假设主人成功回应，减少20点社交需求
        store.apply_social_need_decrease(20)

        

    elif action == "rest":
        print("我想休息一下~")

        # TODO 3：恢复 10 点精力

    elif action == "idle":
        print("tianbao正在安静待机...")

    else:
        raise ValueError(f"未知行为：{action}")

    return store.get_state()