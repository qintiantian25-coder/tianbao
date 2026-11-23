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

    # TODO 6：开始陪伴会话
    def start(self, now, interaction_type):
        with self.lock:
            if self.is_active is True:
                return False
            self.is_active = True
            self.started_at = now
            self.last_interaction_at = now
            self.last_interaction_type = interaction_type
            self.interaction_count = 1
            return True

    # TODO 7：记录后续互动
    def interact(self, now, interaction_type):
        with self.lock:
            if self.is_active is False:
                return False
            self.last_interaction_at = now
            self.last_interaction_type = interaction_type
            self.interaction_count += 1
            return True

    # TODO 8：读取陪伴状态
    def get_state(self):
        with self.lock:
            return {
                "is_active": self.is_active,
                "started_at": self.started_at,
                "last_interaction_at": self.last_interaction_at,
                "last_interaction_type": self.last_interaction_type,
                "interaction_count": self.interaction_count
            }

    # TODO 9：结束陪伴会话
    def end(self):
        with self.lock:
            if self.is_active is False:
                return False
            self.is_active = False
            return True
