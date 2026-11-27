"use strict";

/**
 * Text-chat integration for POST /api/companion/chat.
 *
 * This module owns only the display-side chat state. It never sends a system
 * prompt or chat history: the Flask side owns the signed-cookie conversation.
 */

export const CHAT_ENDPOINT = "/api/companion/chat";
export const CHAT_MAX_LENGTH = 500;
export const CHAT_TIMEOUT_MS = 60000;

const TENDENCY_LABEL = {
  gentle: "温柔",
  tired: "安静",
  affectionate: "亲昵",
  playful: "活泼",
  neutral: "自然",
};

export class ChatProtocolError extends Error {
  constructor(message) {
    super(message);
    this.name = "ChatProtocolError";
  }
}

export class ChatRequestError extends Error {
  constructor(code, message, { status = null } = {}) {
    super(message);
    this.name = "ChatRequestError";
    this.code = code;
    this.status = status;
  }
}

export function chatTextLength(value) {
  return Array.from(String(value ?? "")).length;
}

export function validateChatText(rawText) {
  const text = String(rawText ?? "").trim();
  if (!text) {
    return {
      ok: false,
      code: "empty",
      message: "先写点想对阗宝说的话吧。",
    };
  }
  const length = chatTextLength(text);
  if (length > CHAT_MAX_LENGTH) {
    return {
      ok: false,
      code: "too_long",
      message: `最多 ${CHAT_MAX_LENGTH} 个字符，当前 ${length} 个。`,
    };
  }
  return { ok: true, text, length };
}

function normaliseUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  const token = (value) => (
    Number.isInteger(value) && value >= 0 ? value : null
  );
  return {
    prompt_tokens: token(usage.prompt_tokens),
    completion_tokens: token(usage.completion_tokens),
  };
}

/**
 * Validate one backend response. The reply is deliberately returned as raw
 * text; the DOM layer must render it with textContent, never innerHTML.
 */
export function parseChatResponse(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ChatProtocolError("服务器返回的聊天内容格式不正确。");
  }
  if (typeof payload.reply !== "string" || !payload.reply.trim()) {
    throw new ChatProtocolError("服务器没有返回可显示的文字回复。");
  }

  const latency = payload.latency_ms;
  return {
    reply: payload.reply.trim(),
    fallback: payload.fallback === true,
    tendency: typeof payload.tendency === "string" ? payload.tendency : null,
    usage: normaliseUsage(payload.usage),
    latencyMs: Number.isFinite(latency) && latency >= 0
      ? Math.round(latency)
      : null,
    error: typeof payload.error === "string" ? payload.error : null,
  };
}

export function tendencyLabel(tendency) {
  return TENDENCY_LABEL[tendency] || "阗宝";
}

export function formatChatLatency(latencyMs) {
  if (!Number.isFinite(latencyMs) || latencyMs < 0) return "";
  if (latencyMs < 1000) return `${Math.round(latencyMs)} ms`;
  return `${(latencyMs / 1000).toFixed(1)} s`;
}

/**
 * The request gate prevents a second send from starting while one chat turn
 * is in flight. It intentionally has no retry path: a UI timeout may happen
 * after Flask has already committed the turn.
 */
export class ChatClient {
  constructor({
    fetchImpl = null,
    timeoutMs = CHAT_TIMEOUT_MS,
  } = {}) {
    this.fetchImpl = fetchImpl || ((...args) => globalThis.fetch(...args));
    this.timeoutMs = Math.max(1, Number(timeoutMs) || CHAT_TIMEOUT_MS);
    this.inFlight = null;
  }

  get busy() {
    return this.inFlight !== null;
  }

  async send(rawText) {
    const validation = validateChatText(rawText);
    if (!validation.ok) {
      return {
        ok: false,
        code: validation.code,
        message: validation.message,
      };
    }
    if (this.busy) {
      return {
        ok: false,
        code: "busy",
        message: "阗宝还在想上一条消息，请等回复后再发送。",
      };
    }

    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), this.timeoutMs);
    const request = this._sendNow(validation.text, controller, timer);
    this.inFlight = request;
    try {
      return await request;
    } finally {
      if (this.inFlight === request) this.inFlight = null;
    }
  }

  async _sendNow(text, controller, timer) {
    try {
      if (typeof this.fetchImpl !== "function") {
        throw new ChatRequestError("network", "当前浏览器无法发起聊天请求。");
      }
      const response = await this.fetchImpl(CHAT_ENDPOINT, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });

      let data;
      try {
        data = await response.json();
      } catch {
        throw new ChatProtocolError("服务器返回的不是有效 JSON。");
      }

      // The backend uses HTTP 503 for a transient chat-capacity fallback.
      // Preserve that explicit fallback instead of pretending it is a reply.
      if (!response.ok) {
        if (data && data.fallback === true && typeof data.reply === "string") {
          const parsed = parseChatResponse(data);
          return { ok: true, ...parsed, httpStatus: response.status };
        }
        const message = data && typeof data.error === "string"
          ? data.error
          : `发送失败 (${response.status})。`;
        throw new ChatRequestError("http", message, {
          status: response.status,
        });
      }

      const parsed = parseChatResponse(data);
      return { ok: true, ...parsed, httpStatus: response.status };
    } catch (error) {
      if (error instanceof ChatProtocolError) {
        return {
          ok: false,
          code: "invalid_response",
          message: error.message,
        };
      }
      if (error instanceof ChatRequestError) {
        return {
          ok: false,
          code: error.code,
          message: error.message,
          status: error.status,
        };
      }
      if (controller.signal.aborted) {
        return {
          ok: false,
          code: "timeout",
          message: "阗宝想得有点久，本次请求已取消，没有自动重试。",
        };
      }
      return {
        ok: false,
        code: "network",
        message: "网络连接中断，本次消息没有自动重试。",
      };
    } finally {
      globalThis.clearTimeout(timer);
    }
  }
}

/**
 * Build one message element using textContent for every user/model string.
 * Kept DOM-generic so Node tests can verify the XSS boundary without jsdom.
 */
export function createChatMessageElement(doc, message) {
  const role = message.role || "assistant";
  const article = doc.createElement("article");
  article.className = `chat-message is-${role}`
    + (message.fallback ? " is-fallback" : "");

  const meta = doc.createElement("div");
  meta.className = "chat-message-meta";

  const label = doc.createElement("span");
  label.className = "chat-message-label";
  label.textContent = String(message.label || "");
  meta.appendChild(label);

  if (message.note) {
    const note = doc.createElement("span");
    note.className = "chat-message-note";
    note.textContent = String(message.note);
    meta.appendChild(note);
  }

  const body = doc.createElement("p");
  body.className = "chat-message-text";
  body.textContent = String(message.text ?? "");

  article.appendChild(meta);
  article.appendChild(body);
  return article;
}

/**
 * Display-only chat dock controller. It deliberately keeps no history that
 * could be sent to the server; the DOM log is only a view.
 */
export class ChatDockController {
  constructor({
    dock,
    form,
    input,
    sendButton,
    log,
    emptyState,
    logToggle,
    logCount,
    status,
    counter,
    client = new ChatClient(),
    documentRef = document,
  }) {
    this.dock = dock;
    this.form = form;
    this.input = input;
    this.sendButton = sendButton;
    this.log = log;
    this.emptyState = emptyState;
    this.logToggle = logToggle;
    this.logCount = logCount;
    this.status = status;
    this.counter = counter;
    this.client = client;
    this.document = documentRef;
    this.busy = false;
    this.mounted = false;
    this.composing = false;
    this.messageCount = 0;
  }

  mount() {
    if (this.mounted || !this.form || !this.input || !this.log) return;
    this.mounted = true;
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.sendCurrent();
    });
    this.input.addEventListener("keydown", (event) => this.onKeyDown(event));
    this.input.addEventListener("input", () => this.onInput());
    this.input.addEventListener("compositionstart", () => {
      this.composing = true;
    });
    this.input.addEventListener("compositionend", () => {
      this.composing = false;
    });
    this.logToggle?.addEventListener("click", () => this.toggleLog());
    this.updateCounter();
    this.autoResize();
  }

  onKeyDown(event) {
    if (event.isComposing || this.composing || event.keyCode === 229) return;
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (this.busy) {
      this.setStatus("等阗宝回复完再发送下一条。", "busy");
      return;
    }
    this.sendCurrent();
  }

  onInput() {
    this.input.removeAttribute("aria-invalid");
    this.updateCounter();
    this.autoResize();
  }

  async sendCurrent() {
    if (this.busy) {
      this.setStatus("等阗宝回复完再发送下一条。", "busy");
      return;
    }

    const validation = validateChatText(this.input.value);
    if (!validation.ok) {
      this.input.setAttribute("aria-invalid", "true");
      this.setStatus(validation.message, "error");
      this.input.focus({ preventScroll: true });
      return;
    }

    this.busy = true;
    this.setBusyUI(true);
    this.openLog();
    this.appendMessage({
      role: "user",
      label: "你",
      text: validation.text,
    });
    this.input.value = "";
    this.updateCounter();
    this.autoResize();
    const thinking = this.appendThinking();
    this.setStatus("阗宝正在想...", "busy");

    let result;
    try {
      result = await this.client.send(validation.text);
    } catch {
      result = {
        ok: false,
        code: "client",
        message: "聊天请求失败，本次消息没有自动重试。",
      };
    } finally {
      thinking?.remove();
      this.busy = false;
      this.setBusyUI(false);
    }

    if (!result.ok) {
      this.appendMessage({
        role: "error",
        label: "发送失败",
        text: result.message,
      });
      this.setStatus(result.message, "error");
      return;
    }

    if (result.fallback) {
      this.appendMessage({
        role: "assistant",
        label: "备用回复",
        note: "模型暂时不可用 · 不是模型推理结果",
        text: result.reply,
        fallback: true,
      });
      this.setStatus("模型暂时不可用，已显示安全备用回复。", "fallback");
      return;
    }

    const note = [
      tendencyLabel(result.tendency),
      formatChatLatency(result.latencyMs),
    ].filter(Boolean).join(" · ");
    this.appendMessage({
      role: "assistant",
      label: "阗宝",
      note,
      text: result.reply,
    });
    this.setStatus("阗宝回复了。", "ok");
  }

  appendMessage(message) {
    if (!this.log) return null;
    if (this.emptyState) this.emptyState.hidden = true;
    const element = createChatMessageElement(this.document, message);
    this.log.appendChild(element);
    this.messageCount += 1;
    if (this.logCount) this.logCount.textContent = String(this.messageCount);
    this.scrollToBottom();
    return element;
  }

  appendThinking() {
    if (!this.log) return null;
    const element = this.document.createElement("div");
    element.className = "chat-thinking";
    element.setAttribute("role", "status");
    element.textContent = "阗宝正在想...";
    this.log.appendChild(element);
    this.scrollToBottom();
    return element;
  }

  openLog() {
    if (!this.log) return;
    this.log.hidden = false;
    this.logToggle?.setAttribute("aria-expanded", "true");
    this.dock?.classList.add("is-log-open");
    this.scrollToBottom();
  }

  closeLog() {
    if (!this.log) return;
    this.log.hidden = true;
    this.logToggle?.setAttribute("aria-expanded", "false");
    this.dock?.classList.remove("is-log-open");
  }

  toggleLog() {
    if (!this.log) return;
    if (this.log.hidden) this.openLog();
    else this.closeLog();
  }

  setBusyUI(busy) {
    if (this.sendButton) this.sendButton.disabled = busy;
    this.form?.classList.toggle("is-busy", busy);
    this.form?.setAttribute("aria-busy", String(busy));
    this.dock?.classList.toggle("is-busy", busy);
  }

  setStatus(text, tone = "") {
    if (!this.status) return;
    this.status.textContent = text;
    if (tone) this.status.dataset.tone = tone;
    else this.status.removeAttribute("data-tone");
  }

  updateCounter() {
    if (!this.counter) return;
    const length = chatTextLength(this.input?.value);
    this.counter.textContent = `${length} / ${CHAT_MAX_LENGTH}`;
    this.counter.classList.toggle(
      "is-near-limit",
      length >= CHAT_MAX_LENGTH - 50,
    );
  }

  autoResize() {
    if (!this.input) return;
    this.input.style.height = "auto";
    this.input.style.height = `${Math.min(this.input.scrollHeight || 0, 104)}px`;
  }

  scrollToBottom() {
    if (!this.log) return;
    this.log.scrollTop = this.log.scrollHeight;
  }
}
