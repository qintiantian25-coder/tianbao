import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CHAT_ENDPOINT,
  CHAT_HEIGHT_STORAGE_KEY,
  CHAT_MAX_LENGTH,
  CHAT_MIN_HEIGHT,
  ChatClient,
  ChatDockController,
  chatHeightLimit,
  clampChatHeight,
  clearChatHeight,
  createChatMessageElement,
  defaultChatLogHeight,
  isChatLogNearBottom,
  parseChatResponse,
  readChatHeight,
  resizeChatHeight,
  validateChatText,
  writeChatHeight,
} from "../static/chat.js";
import {
  CHAT_SPEECH_CHUNK_CHARS,
  ChatSpeechCoordinator,
  shouldAutoSpeakAssistant,
  splitSpeechText,
} from "../static/chat-speech.js";


function chatResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return body;
    },
  };
}


test("normal text sends only text to the fixed chat endpoint", async () => {
  let captured = null;
  const client = new ChatClient({
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return chatResponse({
        reply: "我在听。",
        fallback: false,
        tendency: "gentle",
        usage: { prompt_tokens: 12, completion_tokens: 4 },
        latency_ms: 321,
      });
    },
  });

  const result = await client.send("  你好  ");

  assert.equal(result.ok, true);
  assert.equal(result.reply, "我在听。");
  assert.equal(result.fallback, false);
  assert.equal(result.tendency, "gentle");
  assert.equal(result.latencyMs, 321);
  assert.equal(captured.url, CHAT_ENDPOINT);
  assert.equal(captured.options.method, "POST");
  assert.equal(captured.options.credentials, "same-origin");
  assert.equal(captured.options.cache, "no-store");
  assert.equal(captured.options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(captured.options.body), { text: "你好" });
  assert.equal(captured.options.body.includes("history"), false);
  assert.equal(captured.options.body.includes("system"), false);
});


test("empty and over-limit input never call fetch", async () => {
  let calls = 0;
  const client = new ChatClient({
    fetchImpl: async () => {
      calls += 1;
      return chatResponse({ reply: "不应调用", fallback: false });
    },
  });

  const empty = await client.send("   ");
  assert.equal(empty.ok, false);
  assert.equal(empty.code, "empty");

  const tooLong = await client.send("x".repeat(CHAT_MAX_LENGTH + 1));
  assert.equal(tooLong.ok, false);
  assert.equal(tooLong.code, "too_long");
  assert.equal(calls, 0);
  assert.equal(validateChatText("x".repeat(CHAT_MAX_LENGTH)).ok, true);
});


test("fallback response remains explicitly marked", async () => {
  const client = new ChatClient({
    fetchImpl: async () => chatResponse({
      reply: "主人，我现在有点连不上自己的小脑袋。",
      fallback: true,
      tendency: "gentle",
      latency_ms: 12,
    }),
  });

  const result = await client.send("在吗？");
  assert.equal(result.ok, true);
  assert.equal(result.fallback, true);
  assert.equal(result.reply, "主人，我现在有点连不上自己的小脑袋。");
});


test("HTTP 503 fallback is preserved instead of reported as a real reply", async () => {
  const client = new ChatClient({
    fetchImpl: async () => chatResponse(
      { reply: "安全备用回复", fallback: true, error: "chat_temporarily_unavailable" },
      { ok: false, status: 503 },
    ),
  });

  const result = await client.send("在吗？");
  assert.equal(result.ok, true);
  assert.equal(result.fallback, true);
  assert.equal(result.httpStatus, 503);
});


test("HTTP and network failures do not retry", async () => {
  let httpCalls = 0;
  const httpClient = new ChatClient({
    fetchImpl: async () => {
      httpCalls += 1;
      return chatResponse(
        { error: "模型暂时不可用" },
        { ok: false, status: 500 },
      );
    },
  });
  const httpResult = await httpClient.send("在吗？");
  assert.equal(httpResult.ok, false);
  assert.equal(httpResult.code, "http");
  assert.equal(httpCalls, 1);

  let networkCalls = 0;
  const networkClient = new ChatClient({
    fetchImpl: async () => {
      networkCalls += 1;
      throw new TypeError("offline");
    },
  });
  const networkResult = await networkClient.send("在吗？");
  assert.equal(networkResult.ok, false);
  assert.equal(networkResult.code, "network");
  assert.equal(networkCalls, 1);
});


test("client timeout aborts once and does not retry", async () => {
  let calls = 0;
  const client = new ChatClient({
    timeoutMs: 10,
    fetchImpl: async (_url, { signal }) => {
      calls += 1;
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      });
    },
  });

  const result = await client.send("等很久");
  assert.equal(result.ok, false);
  assert.equal(result.code, "timeout");
  assert.equal(calls, 1);
});


test("a second send is rejected while the first is in flight", async () => {
  let resolveFetch;
  const client = new ChatClient({
    fetchImpl: () => new Promise((resolve) => {
      resolveFetch = resolve;
    }),
  });

  const first = client.send("第一条");
  const second = await client.send("第二条");
  assert.equal(second.ok, false);
  assert.equal(second.code, "busy");

  resolveFetch(chatResponse({
    reply: "第一条回复",
    fallback: false,
    latency_ms: 5,
  }));
  const firstResult = await first;
  assert.equal(firstResult.ok, true);
  assert.equal(firstResult.reply, "第一条回复");
  assert.equal(client.busy, false);
});


test("invalid model payloads are not treated as successful replies", async () => {
  const client = new ChatClient({
    fetchImpl: async () => chatResponse({ reply: "", fallback: false }),
  });
  const result = await client.send("在吗？");
  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid_response");
  assert.equal(
    parseChatResponse({ reply: "  正常文字  ", fallback: false }).reply,
    "正常文字",
  );
});


test("message rendering uses textContent for model HTML", () => {
  const created = [];
  const doc = {
    createElement(tag) {
      const node = {
        tag,
        className: "",
        textContent: "",
        children: [],
        appendChild(child) {
          this.children.push(child);
        },
        set innerHTML(_value) {
          throw new Error("innerHTML must not be used for chat text");
        },
      };
      created.push(node);
      return node;
    },
  };

  const raw = '<img src=x onerror="globalThis.pwned=1">';
  const element = createChatMessageElement(doc, {
    role: "assistant",
    label: "阗宝",
    text: raw,
  });

  assert.equal(element.className, "chat-message is-assistant");
  assert.equal(element.children[1].textContent, raw);
  assert.equal(created.some((node) => node.tag === "img"), false);
  assert.equal(element.children[1].innerHTML, undefined);
});


test("fallback rendering carries an explicit label", () => {
  const doc = {
    createElement() {
      return {
        className: "",
        textContent: "",
        children: [],
        appendChild(child) {
          this.children.push(child);
        },
      };
    },
  };
  const element = createChatMessageElement(doc, {
    role: "assistant",
    label: "备用回复",
    note: "模型暂时不可用",
    text: "安全备用回复",
    fallback: true,
  });
  assert.equal(element.className, "chat-message is-assistant is-fallback");
  assert.equal(element.children[0].children[0].textContent, "备用回复");
});


test("dragging up/down resizes within min and max bounds", () => {
  assert.equal(resizeChatHeight(190, 100, 60, CHAT_MIN_HEIGHT, 320), 230);
  assert.equal(resizeChatHeight(190, 100, 150, CHAT_MIN_HEIGHT, 320), 140);
  assert.equal(resizeChatHeight(190, 100, -500, CHAT_MIN_HEIGHT, 320), 320);
  assert.equal(resizeChatHeight(190, 100, 500, CHAT_MIN_HEIGHT, 320), CHAT_MIN_HEIGHT);
  assert.equal(clampChatHeight(500, CHAT_MIN_HEIGHT, 320), 320);
  assert.equal(clampChatHeight(1, CHAT_MIN_HEIGHT, 320), CHAT_MIN_HEIGHT);
});


test("default chat height adapts to desktop, phone and short viewports", () => {
  assert.equal(defaultChatLogHeight(1280, 900), 190);
  assert.equal(defaultChatLogHeight(390, 780), 160);
  assert.equal(defaultChatLogHeight(390, 600), 140);
  assert.equal(defaultChatLogHeight(1280, 600), 140);
});


test("height limit respects the robot head and viewport ceiling", () => {
  assert.equal(chatHeightLimit({
    dockBottom: 700,
    headBottom: 300,
    nonLogHeight: 120,
    viewportHeight: 800,
  }), 272);
  assert.equal(chatHeightLimit({
    dockBottom: 2000,
    headBottom: 0,
    nonLogHeight: 100,
    viewportHeight: 500,
  }), 275);
});


test("height preference persists without any chat text", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  writeChatHeight(storage, 245);
  assert.equal(readChatHeight(storage), 245);
  assert.equal(values.size, 1);
  assert.equal(values.has(CHAT_HEIGHT_STORAGE_KEY), true);
  assert.equal([...values.values()].join("").includes("聊天"), false);
  clearChatHeight(storage);
  assert.equal(values.size, 0);
  assert.equal(readChatHeight(storage), null);
});


test("auto-scroll is only allowed when the reader is near the bottom", () => {
  assert.equal(isChatLogNearBottom({
    scrollHeight: 1000,
    scrollTop: 600,
    clientHeight: 400,
  }), true);
  assert.equal(isChatLogNearBottom({
    scrollHeight: 1000,
    scrollTop: 500,
    clientHeight: 400,
  }), false);
  assert.equal(isChatLogNearBottom({
    scrollHeight: 1000,
    scrollTop: 570,
    clientHeight: 400,
  }), true);
});


test("long replies are split in order without truncation or duplication", () => {
  const sentence = "这是一段需要连续朗读的长回复，";
  const source = `第一句。${sentence.repeat(14)}最后一句。`;
  const chunks = splitSpeechText(source, CHAT_SPEECH_CHUNK_CHARS);
  const normalized = source.replace(/\s+/g, " ").trim();
  assert.ok(chunks.length > 1);
  assert.equal(chunks.join(""), normalized);
  for (const chunk of chunks) {
    assert.ok(Array.from(chunk).length <= CHAT_SPEECH_CHUNK_CHARS);
    assert.ok(chunk.length > 0);
  }
});


test("only successful non-fallback replies may auto-speak", () => {
  assert.equal(shouldAutoSpeakAssistant({
    ok: true,
    fallback: false,
    reply: "真实回复",
  }), true);
  assert.equal(shouldAutoSpeakAssistant({
    ok: true,
    fallback: true,
    reply: "备用回复",
  }), false);
  assert.equal(shouldAutoSpeakAssistant({
    ok: false,
    fallback: false,
    reply: "失败",
  }), false);
  assert.equal(shouldAutoSpeakAssistant({ ok: true, fallback: false, reply: " " }), false);
});


function speechHarness({ autoStart = true, chunkTexts = null } = {}) {
  const calls = {
    showBubble: [],
    hideBubble: 0,
    startMouth: 0,
    stopMouth: [],
    status: [],
    finished: [],
    chunks: [],
    timers: [],
    cancelled: 0,
  };
  const coordinator = new ChatSpeechCoordinator({
    speak: async (chunk, { onFirstSound }) => {
      calls.chunks.push(chunk);
      if (autoStart) onFirstSound(1);
      return true;
    },
    cancelSpeech: () => { calls.cancelled += 1; },
    showBubble: (text) => calls.showBubble.push(text),
    hideBubble: () => { calls.hideBubble += 1; },
    startMouth: () => {
      calls.startMouth += 1;
      return "mouth-token";
    },
    stopMouth: (token) => calls.stopMouth.push(token),
    setStatus: (text, tone) => calls.status.push({ text, tone }),
    onFinished: (info) => calls.finished.push(info),
    now: () => 1000,
    setTimeoutFn: (fn, ms) => {
      calls.timers.push({ fn, ms });
      return calls.timers.length;
    },
    clearTimeoutFn: () => {},
    split: (text) => (chunkTexts || splitSpeechText(text)),
  });
  return { coordinator, calls };
}


test("long replies are spoken sequentially with one continuous mouth state", async () => {
  const source = "第一句。" + "这是一段很长的连续朗读内容，".repeat(14) + "最后一句。";
  const { coordinator, calls } = speechHarness();
  await coordinator.play(source);
  assert.ok(calls.chunks.length > 1);
  assert.equal(calls.chunks.join(""), source.replace(/\s+/g, " ").trim());
  for (const chunk of calls.chunks) {
    assert.ok(Array.from(chunk).length <= CHAT_SPEECH_CHUNK_CHARS);
  }
  assert.equal(calls.startMouth, 1);
  assert.deepEqual(calls.stopMouth, ["mouth-token"]);
});


test("remote fallback is reported without starting mouth before audio", async () => {
  const calls = { status: [], fallbacks: [], started: 0, finished: [] };
  const coordinator = new ChatSpeechCoordinator({
    speak: async (_chunk, { onFallback }) => {
      onFallback("8030 HTTP 503");
      return false;
    },
    cancelSpeech: () => {},
    showBubble: () => {},
    hideBubble: () => {},
    startMouth: () => { calls.started += 1; return "mouth"; },
    stopMouth: () => {},
    setStatus: (text, tone) => calls.status.push({ text, tone }),
    onFallback: (reason) => calls.fallbacks.push(reason),
    onFinished: (info) => calls.finished.push(info),
    now: () => 0,
    setTimeoutFn: () => 1,
    clearTimeoutFn: () => {},
    split: (text) => [text],
  });
  await coordinator.play("远程服务失败的回复");
  assert.equal(calls.started, 0);
  assert.ok(calls.status.some((item) => item.tone === "fallback"));
  assert.deepEqual(calls.fallbacks, ["8030 HTTP 503"]);
  assert.equal(calls.finished[0].audioStarted, false);
});


test("chat speech starts mouth only on audio and hides bubble 5s after audio", async () => {
  const { coordinator, calls } = speechHarness();
  await coordinator.play("完整回复");
  assert.deepEqual(calls.showBubble, ["完整回复"]);
  assert.deepEqual(calls.chunks, ["完整回复"]);
  assert.equal(calls.startMouth, 1);
  assert.deepEqual(calls.stopMouth, ["mouth-token"]);
  assert.ok(calls.timers.length >= 1);
  const hideTimer = calls.timers[calls.timers.length - 1];
  assert.equal(hideTimer.ms, 5000);
  assert.equal(calls.hideBubble, 0);
  hideTimer.fn();
  assert.equal(calls.hideBubble, 1);
  assert.deepEqual(calls.finished, [{ audioStarted: true, manual: false }]);
});


test("no-audio chat reply never starts mouth and falls back to 5s display", async () => {
  const { coordinator, calls } = speechHarness({ autoStart: false });
  await coordinator.play("没有音频的回复");
  assert.equal(calls.startMouth, 0);
  assert.deepEqual(calls.stopMouth, []);
  assert.ok(calls.timers.length >= 1);
  const hideTimer = calls.timers[calls.timers.length - 1];
  assert.equal(hideTimer.ms, 5000);
  assert.deepEqual(calls.finished, [{ audioStarted: false, manual: false }]);
  hideTimer.fn();
  assert.equal(calls.hideBubble, 1);
});


test("a pending TTS with no audio is stopped and hidden at five seconds", async () => {
  let resolveSpeak;
  const calls = { cancelled: 0, hidden: 0, finished: [] , timers: []};
  const coordinator = new ChatSpeechCoordinator({
    speak: () => new Promise((resolve) => { resolveSpeak = resolve; }),
    cancelSpeech: () => { calls.cancelled += 1; },
    showBubble: () => {},
    hideBubble: () => { calls.hidden += 1; },
    startMouth: () => "mouth",
    stopMouth: () => {},
    setStatus: () => {},
    onFinished: (info) => calls.finished.push(info),
    now: () => 0,
    setTimeoutFn: (fn, ms) => { calls.timers.push({ fn, ms }); return calls.timers.length; },
    clearTimeoutFn: () => {},
    split: (text) => [text],
  });

  const playing = coordinator.play("生成很慢的回复");
  assert.equal(calls.timers[0].ms, 5000);
  calls.timers[0].fn();
  assert.equal(calls.hidden, 1);
  assert.equal(calls.cancelled, 1);
  assert.equal(calls.finished[0].noAudioTimeout, true);
  resolveSpeak(true);
  assert.equal(await playing, false);
});


test("a newer chat speech cancels the older async playback", async () => {
  let resolveFirst;
  let resolveSecond;
  let firstStarted = false;
  let secondStarted = false;
  const calls = { cancelled: 0, stopped: [], hidden: 0, timer: null };
  const coordinator = new ChatSpeechCoordinator({
    speak: (chunk, { onFirstSound }) => new Promise((resolve) => {
      if (chunk.includes("第一")) {
        firstStarted = true;
        resolveFirst = resolve;
      } else {
        secondStarted = true;
        onFirstSound(1);
        resolveSecond = resolve;
      }
    }),
    cancelSpeech: () => { calls.cancelled += 1; },
    showBubble: () => {},
    hideBubble: () => { calls.hidden += 1; },
    startMouth: () => "mouth",
    stopMouth: (token) => calls.stopped.push(token),
    setStatus: () => {},
    now: () => 100,
    setTimeoutFn: (fn, ms) => {
      calls.timer = { fn, ms };
      return 1;
    },
    clearTimeoutFn: () => {},
    split: (text) => [text],
  });

  const first = coordinator.play("第一条。");
  assert.equal(firstStarted, true);
  const second = coordinator.play("第二条。");
  assert.equal(secondStarted, true);
  resolveFirst(true);
  assert.equal(await first, false);
  resolveSecond(true);
  assert.equal(await second, true);
  assert.equal(calls.cancelled, 1);
  assert.deepEqual(calls.stopped, ["mouth"]);
  assert.equal(calls.timer.ms, 5000);
});


test("manual bubble close cancels active speech and clears its hide timer", async () => {
  let resolveSpeak;
  const calls = { cancelled: 0, stopped: [], hidden: 0, cleared: 0, timers: 0 };
  const coordinator = new ChatSpeechCoordinator({
    speak: async (_chunk, { onFirstSound }) => {
      onFirstSound(1);
      return new Promise((resolve) => { resolveSpeak = resolve; });
    },
    cancelSpeech: () => { calls.cancelled += 1; },
    showBubble: () => {},
    hideBubble: () => { calls.hidden += 1; },
    startMouth: () => "mouth",
    stopMouth: (token) => calls.stopped.push(token),
    now: () => 100,
    setTimeoutFn: () => { calls.timers += 1; return 42; },
    clearTimeoutFn: () => { calls.cleared += 1; },
    split: (text) => [text],
  });
  const playing = coordinator.play("正在朗读的回复");
  coordinator.cancel({ hideBubble: false });
  assert.equal(calls.hidden, 0);
  assert.equal(calls.cancelled, 1);
  assert.deepEqual(calls.stopped, ["mouth"]);
  assert.ok(calls.cleared >= 1);
  resolveSpeak(true);
  assert.equal(await playing, false);
});


function fakeChatElement(extra = {}) {
  const classes = new Set();
  return {
    className: "",
    textContent: "",
    hidden: false,
    disabled: false,
    value: "",
    scrollHeight: 0,
    scrollTop: 0,
    clientHeight: 0,
    offsetHeight: 0,
    offsetParent: {},
    style: {},
    dataset: {},
    children: [],
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      toggle: (name, force) => {
        if (force === undefined ? !classes.has(name) : force) classes.add(name);
        else classes.delete(name);
      },
      contains: (name) => classes.has(name),
    },
    setAttribute(name, value) { this[name] = String(value); },
    removeAttribute(name) { delete this[name]; },
    appendChild(child) { this.children.push(child); return child; },
    remove() {},
    focus() {},
    ...extra,
  };
}

function fakeChatController(result, callbacks = {}) {
  const elements = {
    dock: fakeChatElement({ offsetParent: null }),
    form: fakeChatElement(),
    input: fakeChatElement({ value: "测试消息" }),
    sendButton: fakeChatElement(),
    log: fakeChatElement({ hidden: true }),
    emptyState: fakeChatElement({ hidden: false }),
    logToggle: fakeChatElement(),
    logCount: fakeChatElement(),
    status: fakeChatElement(),
    counter: fakeChatElement(),
    resizeHandle: fakeChatElement(),
  };
  const doc = {
    createElement() {
      return fakeChatElement();
    },
  };
  const usedCallbacks = {
    user: 0,
    assistant: [],
    ...callbacks,
  };
  const controller = new ChatDockController({
    ...elements,
    client: { send: async () => result },
    documentRef: doc,
    windowRef: { innerWidth: 1280, innerHeight: 900 },
    storage: null,
    onUserMessage: (text) => {
      usedCallbacks.user += 1;
      usedCallbacks.lastUser = text;
    },
    onAssistantReply: (payload) => usedCallbacks.assistant.push(payload),
  });
  return { controller, elements, callbacks: usedCallbacks };
}


test("real chat replies notify speech, fallback replies do not", async () => {
  const real = fakeChatController({
    ok: true,
    reply: "真实模型回复",
    fallback: false,
    tendency: "gentle",
    latencyMs: 12,
  });
  await real.controller.sendCurrent();
  assert.equal(real.callbacks.user, 1);
  assert.equal(real.callbacks.lastUser, "测试消息");
  assert.deepEqual(real.callbacks.assistant, [{
    reply: "真实模型回复",
    tendency: "gentle",
    latencyMs: 12,
  }]);

  const fallback = fakeChatController({
    ok: true,
    reply: "备用回复",
    fallback: true,
    tendency: "gentle",
    latencyMs: 12,
  });
  await fallback.controller.sendCurrent();
  assert.equal(fallback.callbacks.user, 1);
  assert.deepEqual(fallback.callbacks.assistant, []);

  const failed = fakeChatController({
    ok: false,
    reply: "",
    fallback: false,
    error: "network",
  });
  await failed.controller.sendCurrent();
  assert.equal(failed.callbacks.user, 1);
  assert.deepEqual(failed.callbacks.assistant, []);
});


test("page includes the chat replay entry and full-text bubble support", () => {
  const html = readFileSync(
    new URL("../templates/index.html", import.meta.url),
    "utf8",
  );
  assert.match(html, /id="chatReplay"/);
  const bubbleSource = readFileSync(
    new URL("../static/bubble.js", import.meta.url),
    "utf8",
  );
  assert.match(bubbleSource, /showFull\(/);
  assert.match(bubbleSource, /textEl\.textContent = String\(text \?\? ""\)/);
  assert.equal(/MAX_CHARS/.test(bubbleSource), true);
});


test("page has a non-overlapping chat dock and the existing views remain", () => {
  const html = readFileSync(
    new URL("../templates/index.html", import.meta.url),
    "utf8",
  );
  for (const id of [
    "chatDock", "chatAnchor", "chatResizeHandle", "chatForm",
    "chatInput", "chatSend", "chatLog", "chatLogToggle",
    "chatCounter", "chatStatus",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  const robotStart = html.indexOf('<div class="robot-stage"');
  const worldStart = html.indexOf('<section class="world-25d"', robotStart);
  assert.ok(robotStart >= 0 && worldStart > robotStart);
  const robotBlock = html.slice(robotStart, worldStart);
  const hotzone = robotBlock.indexOf('id="headHotzone"');
  const chat = robotBlock.indexOf('id="chatDock"');
  const svgClose = robotBlock.lastIndexOf("</svg>", chat);
  assert.ok(hotzone >= 0 && chat > hotzone);
  assert.ok(svgClose > hotzone && svgClose < chat);
  assert.match(html, /id="world25d"/);
  assert.match(html, /id="design3d"/);
  assert.match(html, /id="chatInput"[^>]*maxlength="500"/);
  assert.match(html, /id="chatResizeHandle"[^>]*role="separator"/s);
  const css = readFileSync(
    new URL("../static/style.css", import.meta.url),
    "utf8",
  );
  assert.match(css, /body\[data-view="iso"\] \.chat-anchor/);
  assert.match(css, /body\[data-view="3d"\] \.chat-anchor/);
  assert.match(css, /\.chat-input\s*\{/);
  assert.match(css, /\.chat-resize-handle\s*\{/);
  assert.match(css, /cursor: ns-resize/);
  assert.match(css, /touch-action: none/);
  assert.match(css, /body\.chat-resizing/);
  assert.match(css, /height: 190px/);
  const source = readFileSync(
    new URL("../static/chat.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /pointerdown/);
  assert.match(source, /pointermove/);
  assert.match(source, /setPointerCapture/);
  assert.match(source, /dblclick/);
  assert.match(source, /ArrowUp/);
});


test("chat module is independent of touch and TTS", () => {
  const source = readFileSync(
    new URL("../static/chat.js", import.meta.url),
    "utf8",
  );
  assert.equal(source.includes("/api/touch"), false);
  assert.equal(source.includes("/api/tts"), false);
  assert.equal(/innerHTML\s*=/.test(source), false);
  assert.equal(source.includes("speechSynthesis"), false);
  assert.equal(source.includes("CHAT_HEIGHT_STORAGE_KEY"), true);
});
