"use strict";

/**
 * Text-chat integration for POST /api/companion/chat.
 *
 * This module owns only the display-side chat state. It never sends a system
 * prompt or chat history: the Flask side owns the signed-cookie conversation.
 */

import { shouldAutoSpeakAssistant } from "./chat-speech.js?v=0.8.2";

export const CHAT_ENDPOINT = "/api/companion/chat";
export const CHAT_MAX_LENGTH = 500;
export const CHAT_TIMEOUT_MS = 60000;
export const CHAT_HEIGHT_STORAGE_KEY = "tianbao.chatLogHeight.v1";
export const CHAT_MIN_HEIGHT = 84;
export const CHAT_HEIGHT_STEP = 24;

export function defaultChatLogHeight(viewportWidth, viewportHeight) {
  const width = Number(viewportWidth) || 0;
  const height = Number(viewportHeight) || 0;
  if (height > 0 && height <= 640) return 140;
  if (width <= 760) return 160;
  return 190;
}

export function clampChatHeight(value, minHeight = CHAT_MIN_HEIGHT, maxHeight = value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return minHeight;
  return Math.min(Math.max(numeric, minHeight), Math.max(minHeight, maxHeight));
}

export function resizeChatHeight(startHeight, startY, currentY, minHeight, maxHeight) {
  const delta = Number(startY) - Number(currentY);
  return clampChatHeight(
    Number(startHeight) + delta,
    minHeight,
    maxHeight,
  );
}

export function chatHeightLimit({
  dockBottom,
  headBottom,
  nonLogHeight,
  viewportHeight,
  minHeight = CHAT_MIN_HEIGHT,
}) {
  const safeBottom = Number(dockBottom);
  const safeHead = Number(headBottom);
  const safeNonLog = Math.max(0, Number(nonLogHeight) || 0);
  const available = Number.isFinite(safeBottom) && Number.isFinite(safeHead)
    ? safeBottom - (safeHead + 8) - safeNonLog
    : 0;
  const viewportCap = Math.max(
    minHeight,
    Math.floor((Number(viewportHeight) || 0) * 0.55),
  );
  return Math.max(minHeight, Math.min(available, viewportCap));
}

export function isChatLogNearBottom(
  { scrollHeight, scrollTop, clientHeight },
  threshold = 32,
) {
  const height = Number(scrollHeight) || 0;
  const top = Number(scrollTop) || 0;
  const visible = Number(clientHeight) || 0;
  return height - top - visible <= threshold;
}


export function clearChatHeight(storage) {
  try {
    storage?.removeItem(CHAT_HEIGHT_STORAGE_KEY);
  } catch {
    // Storage may be unavailable; the in-page height still resets.
  }
}

export function readChatHeight(storage) {
  try {
    const raw = storage && storage.getItem(CHAT_HEIGHT_STORAGE_KEY);
    if (raw === null || raw === undefined) return null;
    const height = Number(raw);
    return Number.isFinite(height) && height >= CHAT_MIN_HEIGHT
      ? height
      : null;
  } catch {
    return null;
  }
}

export function writeChatHeight(storage, height) {
  try {
    if (!storage) return;
    const value = Number(height);
    if (!Number.isFinite(value)) return;
    storage.setItem(CHAT_HEIGHT_STORAGE_KEY, String(Math.round(value)));
  } catch {
    // Storage can be blocked; resizing still works for this page.
  }
}

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
    anchor = null,
    form,
    input,
    sendButton,
    log,
    emptyState,
    logToggle,
    logCount,
    status,
    counter,
    resizeHandle = null,
    headHotzone = null,
    onUserMessage = null,
    onAssistantReply = null,
    client = new ChatClient(),
    documentRef = globalThis.document,
    windowRef = globalThis,
    storage = null,
  }) {
    this.dock = dock;
    this.anchor = anchor;
    this.form = form;
    this.input = input;
    this.sendButton = sendButton;
    this.log = log;
    this.emptyState = emptyState;
    this.logToggle = logToggle;
    this.logCount = logCount;
    this.status = status;
    this.counter = counter;
    this.resizeHandle = resizeHandle;
    this.headHotzone = headHotzone;
    this.onUserMessage = onUserMessage;
    this.onAssistantReply = onAssistantReply;
    this.client = client;
    this.document = documentRef;
    this.window = windowRef;
    this.storage = storage;
    if (!this.storage) {
      try {
        this.storage = windowRef?.localStorage || null;
      } catch {
        this.storage = null;
      }
    }
    this.busy = false;
    this.mounted = false;
    this.composing = false;
    this.messageCount = 0;
    this.currentHeight = null;
    this.minHeight = CHAT_MIN_HEIGHT;
    this.maxHeight = defaultChatLogHeight(
      this.window?.innerWidth,
      this.window?.innerHeight,
    );
    this.compactHeight = 0;
    this.dragState = null;
    this._onViewportChange = this.refreshLayout.bind(this);
    this._onPointerDown = this.onHandlePointerDown.bind(this);
    this._onPointerMove = this.onHandlePointerMove.bind(this);
    this._onPointerUp = this.onHandlePointerUp.bind(this);
    this._onPointerCancel = this.onHandlePointerCancel.bind(this);
    this._onLostPointerCapture = this.onLostPointerCapture.bind(this);
    this._onHandleKeyDown = this.onHandleKeyDown.bind(this);
    this._onHandleDoubleClick = this.onHandleDoubleClick.bind(this);
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
    this.input.addEventListener("focus", () => this.keepComposerVisible());

    this.resizeHandle?.addEventListener("pointerdown", this._onPointerDown);
    this.resizeHandle?.addEventListener("pointermove", this._onPointerMove);
    this.resizeHandle?.addEventListener("pointerup", this._onPointerUp);
    this.resizeHandle?.addEventListener(
      "pointercancel", this._onPointerCancel,
    );
    this.resizeHandle?.addEventListener(
      "lostpointercapture", this._onLostPointerCapture,
    );
    this.resizeHandle?.addEventListener("keydown", this._onHandleKeyDown);
    this.resizeHandle?.addEventListener(
      "dblclick", this._onHandleDoubleClick,
    );

    this.window?.addEventListener("resize", this._onViewportChange);
    this.window?.visualViewport?.addEventListener(
      "resize", this._onViewportChange,
    );

    this.currentHeight = readChatHeight(this.storage)
      ?? this.defaultHeightForViewport();
    this.refreshLayout();
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

    try {
      this.onUserMessage?.(validation.text);
    } catch {
      // Speech feedback must never block the chat turn.
    }
    this.busy = true;
    this.setBusyUI(true);
    this.openLog();
    this.appendMessage({
      role: "user",
      label: "你",
      text: validation.text,
    }, { forceScroll: true });
    this.input.value = "";
    this.updateCounter();
    this.autoResize();
    const thinking = this.appendThinking({ forceScroll: true });
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
    if (shouldAutoSpeakAssistant(result)) {
      try {
        this.onAssistantReply?.({
          reply: result.reply,
          tendency: result.tendency,
          latencyMs: result.latencyMs,
        });
      } catch {
        // TTS/bubble feedback must never break the chat display.
      }
    }
  }

  appendMessage(message, { forceScroll = false } = {}) {
    if (!this.log) return null;
    const shouldStick = forceScroll || this.isNearBottom();
    if (this.emptyState) this.emptyState.hidden = true;
    const element = createChatMessageElement(this.document, message);
    this.log.appendChild(element);
    this.messageCount += 1;
    if (this.logCount) this.logCount.textContent = String(this.messageCount);
    if (shouldStick) this.scrollToBottom();
    return element;
  }

  appendThinking({ forceScroll = false } = {}) {
    if (!this.log) return null;
    const shouldStick = forceScroll || this.isNearBottom();
    const element = this.document.createElement("div");
    element.className = "chat-thinking";
    element.setAttribute("role", "status");
    element.textContent = "阗宝正在想...";
    this.log.appendChild(element);
    if (shouldStick) this.scrollToBottom();
    return element;
  }

  openLog() {
    if (!this.log) return;
    this.log.hidden = false;
    this.refreshLayout();
    this.applyHeight(this.currentHeight, { persist: false });
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

  isNearBottom(threshold = 32) {
    if (!this.log || this.log.hidden) return true;
    return isChatLogNearBottom(this.log, threshold);
  }

  defaultHeightForViewport() {
    return defaultChatLogHeight(
      this.window?.innerWidth,
      this.window?.innerHeight,
    );
  }

  refreshLayout() {
    if (!this.dock || this.dock.offsetParent === null) return;
    const logHeight = this.log && !this.log.hidden
      ? this.log.offsetHeight
      : 0;
    const compactHeight = Math.max(0, this.dock.offsetHeight - logHeight);
    this.compactHeight = compactHeight;
    if (this.anchor) this.anchor.style.height = `${compactHeight + 10}px`;

    const dockRect = this.dock.getBoundingClientRect();
    const headRect = this.headHotzone?.getBoundingClientRect();
    const viewportHeight = this.window?.visualViewport?.height
      || this.window?.innerHeight
      || 0;
    this.maxHeight = chatHeightLimit({
      dockBottom: dockRect.bottom,
      headBottom: headRect?.bottom,
      nonLogHeight: compactHeight,
      viewportHeight,
      minHeight: CHAT_MIN_HEIGHT,
    });
    this.minHeight = Math.min(CHAT_MIN_HEIGHT, this.maxHeight);
    this.applyHeight(this.currentHeight, { persist: false });
  }

  applyHeight(height, { persist = false, scroll = true } = {}) {
    if (!this.log) return;
    const next = clampChatHeight(height, this.minHeight, this.maxHeight);
    const wasAtBottom = this.isNearBottom();
    this.currentHeight = next;
    this.log.style.height = `${next}px`;
    this.log.style.maxHeight = "none";
    this.syncHandle();
    if (scroll && !this.log.hidden && wasAtBottom) this.scrollToBottom();
    if (persist) writeChatHeight(this.storage, next);
  }

  syncHandle() {
    if (!this.resizeHandle) return;
    this.resizeHandle.setAttribute(
      "aria-valuemin", String(Math.round(this.minHeight)),
    );
    this.resizeHandle.setAttribute(
      "aria-valuemax", String(Math.round(this.maxHeight)),
    );
    this.resizeHandle.setAttribute(
      "aria-valuenow", String(Math.round(this.currentHeight || 0)),
    );
  }

  resetHeight() {
    this.applyHeight(this.defaultHeightForViewport(), { persist: false });
    clearChatHeight(this.storage);
    this.setStatus("聊天记录高度已恢复默认。", "ok");
  }

  onHandlePointerDown(event) {
    if (!this.resizeHandle || !this.log) return;
    if (event.isPrimary === false) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    this.resizeHandle.setPointerCapture?.(event.pointerId);
    this.openLog();
    this.refreshLayout();
    this.dragState = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: this.currentHeight,
    };
    this.dock?.classList.add("is-resizing");
    this.document?.body?.classList.add("chat-resizing");
  }

  onHandlePointerMove(event) {
    const state = this.dragState;
    if (!state || state.pointerId !== event.pointerId) return;
    event.preventDefault();
    const next = resizeChatHeight(
      state.startHeight,
      state.startY,
      event.clientY,
      this.minHeight,
      this.maxHeight,
    );
    this.applyHeight(next, { persist: false });
  }

  onHandlePointerUp(event) {
    if (!this.dragState || event.pointerId !== this.dragState.pointerId) return;
    this.finishResize(event.pointerId);
  }

  onHandlePointerCancel(event) {
    if (!this.dragState || event.pointerId !== this.dragState.pointerId) return;
    this.finishResize(event.pointerId);
  }

  onLostPointerCapture(event) {
    if (!this.dragState || event.pointerId !== this.dragState.pointerId) return;
    this.finishResize(event.pointerId);
  }

  finishResize(pointerId) {
    this.dragState = null;
    try {
      this.resizeHandle?.releasePointerCapture?.(pointerId);
    } catch {
      // Capture may already have been released by pointercancel.
    }
    this.dock?.classList.remove("is-resizing");
    this.document?.body?.classList.remove("chat-resizing");
    writeChatHeight(this.storage, this.currentHeight);
  }

  onHandleKeyDown(event) {
    if (!this.resizeHandle) return;
    const delta = event.key === "ArrowUp" || event.key === "PageUp"
      ? CHAT_HEIGHT_STEP * (event.key === "PageUp" ? 3 : 1)
      : event.key === "ArrowDown" || event.key === "PageDown"
        ? -CHAT_HEIGHT_STEP * (event.key === "PageDown" ? 3 : 1)
        : 0;
    if (!delta) return;
    event.preventDefault();
    this.openLog();
    this.refreshLayout();
    this.applyHeight(
      (this.currentHeight || this.defaultHeightForViewport()) + delta,
      { persist: true },
    );
  }

  onHandleDoubleClick(event) {
    event.preventDefault();
    this.openLog();
    this.refreshLayout();
    this.resetHeight();
  }

  keepComposerVisible() {
    if (!this.window?.matchMedia) return;
    if (!this.window.matchMedia("(max-width: 760px)").matches) return;
    this.window.setTimeout(() => {
      this.dock?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    }, 280);
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
