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

    def __init__(self, timeout_seconds=300):
        # TODO 1：保存有效时间
        self.timeout_seconds = timeout_seconds
        # TODO 2：初始化下一个请求编号
        self.next_request_id = 1
        # TODO 3：初始化当前请求
        self.current_request = None
        # TODO 4：创建线程锁
        self.lock = threading.Lock()

    # TODO 5：获取当前请求状态，等待主人回应：pending
    def start(self, action, now):
        with self.lock:
            self._refresh(now)
            if (
                self.current_request is not None 
                and self.current_request["status"] == "pending"
                and action == self.current_request["action"]
            ):
                return self.current_request
            else:
                self.current_request = {
                    "id": self.next_request_id,
                    "action": action,
                    "created_at": now,
                    "expires_at": now + self.timeout_seconds,
                    "status": "pending"
                }
                self.next_request_id += 1
                return self.current_request

    # TODO 6：检查请求是否超时，及时回应：responded，过期：expired
    def _refresh(self, now):
        if self.current_request is None:
            return
        if self.current_request["status"] == "pending" and now >= self.current_request["expires_at"]:
            self.current_request["status"] = "expired"

    def get_current(self, now):
        with self.lock:
            self._refresh(now)
            if self.current_request is None:
                return None
            else:
                return self.current_request.copy()
                



