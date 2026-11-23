import threading
import time

class CompanionRequestTracker:
    """
    tianbao 的自主请求管理器。

    负责：
    1. 记录 tianbao 主动发出的陪伴或安慰请求。
    2. 记录请求发起时间和有效时间。
    3. 判断请求是否仍然有效。
    4. 后续判断主人是否回应了请求。
    """

    def __init__(self, timeout_seconds=60):
        # TODO 1：保存有效时间
        self.timeout_seconds = timeout_seconds
        # TODO 2：初始化下一个请求编号
        self.next_request_id = 1
        # TODO 3：初始化当前请求
        self.current_request = None
        # TODO 4：创建线程锁
        self.lock = threading.Lock()

    def start(self, action, now):
        """
        创建一次新的自主请求。

        action：请求类型，例如 "interact"
        now：当前时间，例如 1000
        """

    # TODO 1：
    # 创建一个字典，保存到 self.current_request
    # 字典需要包含以下5个键：
    #
    # "id"         → 使用 self.next_request_id
    # "action"     → 使用传入的 action
    # "created_at" → 使用传入的 now
    # "expires_at" → 使用 now + self.timeout_seconds
    # "status"     → 初始状态为 "pending"
        self.current_request = {
            "id": self.next_request_id,
            "action": action,
            "created_at": now,
            "expires_at": now + self.timeout_seconds,
            "status": "pending"
        }

    # TODO 2：
    # 创建完成后，下一个请求编号增加1
        self.next_request_id += 1

    # TODO 3：
    # 返回刚刚创建的请求字典
        return self.current_request

    def _refresh(self, now):
        """
        检查当前请求是否过期。
        注意：调用这个函数之前，外层应已获取 self.lock。
        """
        if self.current_request is None:
            return
        if self.current_request["status"] == "pending" and now >= self.current_request["expires_at"]:
            self.current_request["status"] = "expired"
       
pass


