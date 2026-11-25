import threading

class CompanionSession:
    """
    tianbao 持续陪伴会话管理器。

    负责记录主人与 tianbao 的持续互动。
    """

    def __init__(self):
        self.lock = threading.Lock()
        # TODO 1：是否正在陪伴
        # 属性名：is_active
        self.is_active = False
        # TODO 2：会话开始时间
        # 属性名：started_at
        self.started_at = None
        # TODO 3：最近一次互动时间
        # 属性名：last_interaction_at
        self.last_interaction_at = None
        # TODO 4：最近一次互动的类型
        # 属性名：last_interaction_type
        self.last_interaction_type = None
        # TODO 5：累计互动次数
        # 属性名：interaction_count
        self.interaction_count = 0
        self.interaction_times = []

    # TODO 7：开始陪伴会话
    def start(self, now, interaction_type):
        with self.lock:
            if self.is_active is True:
                return False
            self.is_active = True
            self.started_at = now
            self.last_interaction_at = now
            self.last_interaction_type = interaction_type
            self.interaction_count = 1
            self.interaction_times = []
            self.interaction_times.append(now)
            return True

    # TODO 8：记录后续互动
    def interact(self, now, interaction_type):
        with self.lock:
            if self.is_active is False:
                return False
            self.last_interaction_at = now
            self.last_interaction_type = interaction_type
            self.interaction_count += 1
            self.interaction_times.append(now)
            self.interaction_times = [
                t for t in self.interaction_times
                if 0 <= now - t <= 300
            ]
            return True
    
    # TODO 9：获取最近 5 分钟内的互动次数
    def get_recent_count(self, now):
        with self.lock:
            count = 0
            for interaction_time in self.interaction_times:
                elapsed_seconds = now - interaction_time
                if 0 <= elapsed_seconds <= 300:
                    count += 1
            return count

    # TODO 10：读取陪伴状态
    def get_state(self):
        with self.lock:
            return {
                "is_active": self.is_active,
                "started_at": self.started_at,
                "last_interaction_at": self.last_interaction_at,
                "last_interaction_type": self.last_interaction_type,
                "interaction_count": self.interaction_count
            }

    # TODO 11：结束陪伴会话
    def end(self):
        with self.lock:
            if self.is_active is False:
                return False
            self.is_active = False
            return True
