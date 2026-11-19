def execute_action(action, store):

    if action == "interact":
        print("主人，我想和你玩一会儿~")

        # 主动互动消耗10点精力
        store.apply_energy_cost(10)

        # 假设主人成功回应，减少20点社交需求
        store.apply_social_need_decrease(20)

    elif action == "seek_comfort":
        print("主人，我有点伤心，想要安慰~")

        # 寻求安慰消耗1点精力
        store.apply_energy_cost(1)

        

    elif action == "rest":
        print("我想休息一下~")

        # 休息恢复10点精力
        store.apply_energy_recovery(10)  

    elif action == "idle":
        print("tianbao正在安静待机...")

    else:
        raise ValueError(f"未知行为：{action}")

    return store.get_state()