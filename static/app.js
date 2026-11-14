"use strict";

import { RobotView, baseExpressionFor } from "./robot-view.js?v=0.5.1";
import { TouchController, touchLevelFor, touchAmountFor } from "./robot-touch.js?v=0.5.1";
import { SpeechBubble } from "./bubble.js?v=0.5.1";
import { World25D } from "./world25d.js?v=0.5.1";
import { VoiceController, VOICE_RESPONSE_TEXT } from "./voice.js?v=0.5.1";
import { VoiceLibrary } from "./voice-library.js?v=0.5.1";

/* ==========================================================================
   DOM
   ========================================================================== */

const $ = (id) => document.getElementById(id);

const stage = $("robotStage");
const hotzone = $("headHotzone");
const touchHand = $("touchHand");

const debugOpen = $("debugOpen");
const debugClose = $("debugClose");
const debugPanel = $("debugPanel");
const debugDot = $("debugDot");
const offlineChip = $("offlineChip");

const dbgEmotion = $("dbgEmotion");
const dbgIntensity = $("dbgIntensity");
const dbgDescription = $("dbgDescription");
const dbgConnection = $("dbgConnection");
const dbgSync = $("dbgSync");
const dbgMeter = $("dbgMeter");
const dbgProgress = $("dbgProgress");
const dbgMode = $("dbgMode");
const dbgLastEvent = $("dbgLastEvent");
const dbgError = $("dbgError");

const touchSlider = $("touchSlider");
const touchValue = $("touchValue");
const touchLevel = $("touchLevel");
const touchButton = $("touchButton");
const sadSlider = $("sadSlider");
const sadValue = $("sadValue");
const sadLevel = $("sadLevel");
const sadButton = $("sadButton");
const speakInput = $("speakInput");
const speakButton = $("speakButton");
const listenSelect = $("listenSelect");
const listenInput = $("listenInput");
const listenButton = $("listenButton");
const stopSimulationBtn = $("stopSimulation");
const restoreIdleBtn = $("restoreIdle");
const stateGroup = document.querySelector(".state-group");

const sceneRoot = $("sceneRoot");
const viewTabs = [...document.querySelectorAll(".view-tab")];
const debugHud = $("debugHud");
const hudMood = $("hudMood");
const hudIntensity = $("hudIntensity");
const hudMode = $("hudMode");
const hudParams = $("hudParams");
const hudMove = $("hudMove");
const panelHudMood = $("panelHudMood");
const panelHudMode = $("panelHudMode");
const panelHudParams = $("panelHudParams");

const worldRoot = $("world25d");
const designView = $("design3d");
const charEntity = $("charEntity");
const char25d = $("char25d");
const charFlip = $("charFlip");
const charShadow = $("charShadow");
const isoBubble = $("isoBubble");
const isoHand = $("touchHandIso");
const moveStatus = $("moveStatus");

const panelTabs = [...document.querySelectorAll("[data-panel-tab]")];
const panelPanes = [...document.querySelectorAll("[data-panel-pane]")];
const panelBody = $("panelBody");
const actionModeNote = $("actionModeNote");
const actionGotoIso = $("actionGotoIso");
const cameraButton = $("cameraButton");
const designPetButton = $("designPetButton");
const designPetAvatar = $("designPetAvatar");
const designPetStatus = $("designPetStatus");

const voiceDock = $("voiceDock");
const voiceToggle = $("voiceToggle");
const voiceToggle25d = $("voiceToggle25d");
const voicePlayback = $("voicePlayback");
const voiceRetry = $("voiceRetry");
const voiceOpenPanel = $("voiceOpenPanel");
const voiceStatus = $("voiceStatus");
const voiceDebugRecord = $("voiceDebugRecord");
const voiceDebugPlay = $("voiceDebugPlay");
const voiceDebugRespond = $("voiceDebugRespond");
const voiceDebugStatus = $("voiceDebugStatus");

const ttsText = $("ttsText");
const timbreGrid = $("timbreGrid");
const ttsSpeak = $("ttsSpeak");
const ttsStop = $("ttsStop");
const ttsStatus = $("ttsStatus");
const voicePackList = $("voicePackList");
const voicePackUrl = $("voicePackUrl");
const voicePackDownload = $("voicePackDownload");
const voicePackSample = $("voicePackSample");
const voicePackStatus = $("voicePackStatus");
const customVoiceName = $("customVoiceName");
const customVoiceBase = $("customVoiceBase");
const customVoicePitch = $("customVoicePitch");
const customVoicePitchValue = $("customVoicePitchValue");
const customVoiceRate = $("customVoiceRate");
const customVoiceRateValue = $("customVoiceRateValue");
const customVoiceSave = $("customVoiceSave");
const customVoiceList = $("customVoiceList");

/* ==========================================================================
   Shared state
   ========================================================================== */

const EMOTION_LABEL = { happy: "开心", sad: "难过", calm: "平静" };

const LISTEN_META = {
  environment: {
    label: "环境声音",
    identity: "unknown",
    reaction: "唔...好像有什么轻轻的声音?",
  },
  stranger: {
    label: "陌生人",
    identity: "stranger",
    reaction: "唔? 是谁在和tianbao说话呀?",
  },
  zhuzhu: {
    label: "猪猪",
    identity: "zhuzhu",
    reaction: "哼唧哼唧~是猪猪来啦! tianbao听着呢~",
  },
  zaizai: {
    label: "仔仔",
    identity: "zaizai",
    reaction: "呀~是仔仔在说话! tianbao有在认真听哦~",
  },
};

const TOUCH_TIER_LABEL = {
  light: "轻轻摸头",
  medium: "普通摸头",
  affectionate: "亲昵摸头",
};

const appState = {
  /** Authoritative Flask state. */
  backend: {
    emotion: "happy",
    intensity: 60,
    description: "",
    online: null,
    lastSync: null,
  },
  /** Front-end-only interaction. */
  interaction: {
    mode: "idle",
    touchLevel: null,
    listeningTarget: null,
    speakerIdentity: "unknown",
  },
  baseExpression: baseExpressionFor("happy", 60),
  view: "robot",
  move: { x: 50, y: 74, motion: "待机", runToggle: false },
};

function idleInteraction() {
  return {
    mode: "idle",
    touchLevel: null,
    listeningTarget: null,
    speakerIdentity: "unknown",
  };
}

/* ==========================================================================
   View + bubble
   ========================================================================== */

const robot = new RobotView(stage);
robot.setBaseExpression(appState.baseExpression);
robot.setExpression(appState.baseExpression, { force: true });

const bubble = new SpeechBubble($("speechBubble"));
bubble.onClose = () => updateLastEvent("气泡已关闭.");

const world = new World25D({
  root: worldRoot,
  entity: charEntity,
  char: char25d,
  flip: charFlip,
  shadow: charShadow,
  bubble: isoBubble,
  onStatus: (status) => {
    appState.move = status;
    if (moveStatus) {
      moveStatus.textContent = `x ${Math.round(status.x)} · y ${Math.round(status.y)} · ${status.motion}`;
    }
    syncRunButtons(status.runToggle);
    updateHud();
  },
});
world.setFace(robot.currentEye || "open", robot.currentMouth || "smile");
world.setExpression(appState.baseExpression);
bubble.onUpdate = (update) => world.setBubble(update);
robot.onFaceChange = ({ eye, mouth }) => world.setFace(eye, mouth);

const voiceLibrary = new VoiceLibrary();
const voice = new VoiceController({
  onChange: (snapshot) => renderVoiceUI(snapshot),
  onRecorded: (recording) => handleVoiceRecorded(recording),
});

/* ==========================================================================
   Interaction state machine
   ========================================================================== */

let interactionToken = 0;
let simToken = 0;
let simTimer = null;
let activeTouchToken = null;
let activeVoiceToken = null;

function resolveExpression() {
  const interaction = appState.interaction;

  if (interaction.mode === "touch") {
    return interaction.touchLevel ? `touch_${interaction.touchLevel}` : "touch_light";
  }
  if (interaction.mode === "speaking") return "speaking";
  if (interaction.mode === "voice_listening") return "voice_listening";
  if (interaction.mode === "listening") {
    return `listening_${interaction.listeningTarget || "environment"}`;
  }
  return appState.baseExpression;
}

function beginInteraction(mode, extras = {}) {
  interactionToken += 1;
  appState.interaction = {
    ...idleInteraction(),
    ...extras,
    mode,
  };
  renderInteractionState();
  return interactionToken;
}

function endInteractionIfCurrent(token) {
  if (token !== interactionToken) return false;
  interactionToken += 1;
  appState.interaction = idleInteraction();
  activeTouchToken = null;
  robot.stopTalking();
  renderInteractionState();
  return true;
}

function renderInteractionState() {
  const expression = resolveExpression();
  robot.setExpression(expression);
  world.setExpression(expression);
  updateDebugMode();
}

/**
 * Cancel any speaking/listening/touch-preview simulation.
 * Real hold-to-touch is owned by TouchController, not this function.
 */
function cancelSimulation({ hideBubble = true, keepTouch = false } = {}) {
  simToken += 1;
  if (simTimer) {
    clearTimeout(simTimer);
    simTimer = null;
  }
  robot.stopTalking();
  voiceResponseActive = false;
  voice.cancelSpeech();
  if (voice.isRecording) voice.abortRecording();

  const mode = appState.interaction.mode;
  const isSimulated = mode === "speaking"
    || mode === "voice_listening"
    || mode === "listening"
    || (mode === "touch" && !keepTouch);

  if (isSimulated) {
    interactionToken += 1;
    appState.interaction = idleInteraction();
    activeTouchToken = null;
    activeVoiceToken = null;
    renderInteractionState();
  }

  if (hideBubble) bubble.hide();
}

/* ==========================================================================
   Touch (real pointer holding + keyboard + debug preview)
   ========================================================================== */

function beginTouch(level, source = "robot") {
  cancelSimulation({ hideBubble: true });
  activeTouchToken = beginInteraction("touch", { touchLevel: level });
  if (source !== "iso") {
    robot.setGaze(0);
    robot.setHeadTilt(0, -2);
  }
  updateLastEvent(`按住摸头中 · ${TOUCH_TIER_LABEL[level]}${source === "iso" ? " · 2.5D" : ""}`);
}

function changeTouchLevel(level) {
  if (appState.interaction.mode !== "touch") return;
  appState.interaction.touchLevel = level;
  renderInteractionState();
}

function finishTouch({ amount, level, source = "robot" }) {
  if (activeTouchToken !== null) {
    endInteractionIfCurrent(activeTouchToken);
    activeTouchToken = null;
  }
  if (source !== "iso") {
    robot.setGaze(0);
    robot.setHeadTilt(0, 0);
  }
  queueTouchSubmit(amount, { level, source });
}

function cancelTouch(source = "robot") {
  if (activeTouchToken !== null) {
    endInteractionIfCurrent(activeTouchToken);
    activeTouchToken = null;
  }
  if (source !== "iso") {
    robot.setGaze(0);
    robot.setHeadTilt(0, 0);
  }
  updateLastEvent("触摸被取消, 没有提交.");
}

new TouchController({
  stage,
  hotzone,
  hand: touchHand,
  onHoverChange: (hovering) => {
    robot.setHovering(hovering);
  },
  onPointerMove: ({ x }) => {
    if (appState.interaction.mode !== "idle") return;
    robot.setGaze(x * 3.2);
    robot.setHeadTilt(x * 1.1, -2);
  },
  onFocusChange: (hasFocus) => {
    robot.setTouchFocus(hasFocus);
  },
  onTouchStart: ({ level }) => beginTouch(level, "robot"),
  onTouchLevel: changeTouchLevel,
  onTouchEnd: (meta) => finishTouch({ ...meta, source: "robot" }),
  onTouchCancel: () => cancelTouch("robot"),
});

new TouchController({
  stage: worldRoot,
  hotzone: char25d,
  hand: isoHand,
  onHoverChange: (hovering) => {
    worldRoot.classList.toggle("is-hovering", hovering);
  },
  onPointerMove: () => {},
  onFocusChange: (hasFocus) => {
    worldRoot.classList.toggle("is-head-focused", hasFocus);
  },
  onTouchStart: ({ level }) => beginTouch(level, "iso"),
  onTouchLevel: changeTouchLevel,
  onTouchEnd: (meta) => finishTouch({ ...meta, source: "iso" }),
  onTouchCancel: () => cancelTouch("iso"),
});

/* 3D design preview: hold-to-pet prototype using the same touch state machine. */
let designPetActive = false;
let designPetStart = 0;
let designPetPointerAt = 0;
let designPetTimers = [];

function setDesignPetFace(pet) {
  if (designPetAvatar) designPetAvatar.dataset.pet = pet;
}

function startDesignPet() {
  if (designPetActive) return;
  designPetActive = true;
  designPetStart = performance.now();
  beginTouch("light", "design");
  setDesignPetFace("light");
  if (designPetStatus) designPetStatus.textContent = "摸摸中... 继续按住会更亲昵.";
  designPetTimers = [
    window.setTimeout(() => {
      if (!designPetActive) return;
      changeTouchLevel("medium");
      setDesignPetFace("medium");
      if (designPetStatus) designPetStatus.textContent = "tianbao 正在享受摸摸...";
    }, 500),
    window.setTimeout(() => {
      if (!designPetActive) return;
      changeTouchLevel("affectionate");
      setDesignPetFace("affectionate");
      if (designPetStatus) designPetStatus.textContent = "tianbao 被摸得很开心...";
    }, 1500),
  ];
}

function endDesignPet(send) {
  if (!designPetActive) return;
  const elapsed = performance.now() - designPetStart;
  const level = touchLevelFor(elapsed);
  const amount = touchAmountFor(elapsed);
  designPetActive = false;
  for (const timer of designPetTimers) clearTimeout(timer);
  designPetTimers = [];
  setDesignPetFace("idle");

  if (send) {
    if (designPetStatus) designPetStatus.textContent = "摸摸已送出, 等 tianbao 的回应...";
    finishTouch({ amount, level, source: "design" });
  } else {
    if (designPetStatus) designPetStatus.textContent = "这次摸头被取消了.";
    cancelTouch("design");
  }
}

let touchQueue = Promise.resolve();

/** Serialize releases so one hold always produces one ordered POST. */
function queueTouchSubmit(amount, meta) {
  touchQueue = touchQueue
    .then(() => sendTouch(amount, meta))
    .catch(() => { /* sendTouch handles its own errors */ });
}

/* ==========================================================================
   Debug touch-animation preview (no backend change)
   ========================================================================== */

const PREVIEW_DURATION = { light: 1700, medium: 2300, affectionate: 3100 };

function playTouchPreview(level) {
  clearDebugError();
  cancelSimulation({ hideBubble: true });
  const token = beginInteraction("touch", { touchLevel: level });
  robot.setGaze(0);
  robot.setHeadTilt(0, -2);
  const sim = ++simToken;
  updateLastEvent(`前端触摸动画测试 · ${TOUCH_TIER_LABEL[level]} (未调用 Python)`);

  simTimer = window.setTimeout(() => {
    if (sim !== simToken) return;
    simTimer = null;
    endInteractionIfCurrent(token);
    updateLastEvent("触摸动画测试结束, 情绪未改变.");
  }, PREVIEW_DURATION[level] || 2000);
}

/* ==========================================================================
   Flask API
   ========================================================================== */

let backendEpoch = 0;
let actionDepth = 0;
let pollBusy = false;
let connectionErrorShown = false;

function friendlyError(error) {
  if (!error) return "未知错误.";
  if (error.name === "AbortError") return "请求超时.";
  return error.message || "网络错误.";
}

async function apiRequest(url, options = {}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      ...options,
    });

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("服务器返回的不是有效 JSON.");
    }

    if (!response.ok) {
      throw new Error(data && data.error ? data.error : `请求失败 (${response.status}).`);
    }
    return data;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("请求超时.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function setOnline(online) {
  const previous = appState.backend.online;
  appState.backend.online = online;

  offlineChip.hidden = online;
  debugDot.classList.remove("is-connecting");
  debugDot.classList.toggle("is-online", online);
  debugDot.classList.toggle("is-offline", !online);

  dbgConnection.textContent = online ? "已连接" : "连接中断";
  dbgConnection.classList.remove("is-online", "is-offline", "is-connecting");
  dbgConnection.classList.add(online ? "is-online" : "is-offline");

  if (previous === true && online === false
      && appState.interaction.mode === "idle" && !bubble.isVisible) {
    bubble.type({
      label: "tianbao",
      text: "唔...tianbao 暂时联系不上自己的小脑袋了.",
      charDelay: 38,
      autoHideMs: 5200,
    });
  }
}

function showDebugError(message) {
  dbgError.textContent = message;
  dbgError.hidden = false;
}

function clearDebugError() {
  dbgError.hidden = true;
  dbgError.textContent = "";
  connectionErrorShown = false;
}

function showConnectionError(message) {
  connectionErrorShown = true;
  showDebugError(message);
}

function applyBackendState(data) {
  if (!data || typeof data !== "object") return false;
  if (!["happy", "sad", "calm"].includes(data.emotion)) return false;

  const intensity = Math.max(0, Math.min(100, Number(data.intensity) || 0));
  appState.backend.emotion = data.emotion;
  appState.backend.intensity = intensity;
  appState.backend.description = typeof data.description === "string" ? data.description : "";
  appState.backend.lastSync = new Date();
  appState.baseExpression = baseExpressionFor(data.emotion, intensity);

  robot.setBaseExpression(appState.baseExpression);
  if (appState.interaction.mode === "idle") {
    robot.setExpression(appState.baseExpression);
    world.setExpression(appState.baseExpression);
  }

  updateDebugState();
  return true;
}

async function pollState() {
  if (pollBusy || actionDepth > 0 || document.hidden) return;
  pollBusy = true;
  const epochAtStart = backendEpoch;

  try {
    const data = await apiRequest("/api/state");
    setOnline(true);
    if (epochAtStart === backendEpoch) {
      const applied = applyBackendState(data);
      if (!applied) throw new Error("后端返回的状态格式不正确.");
    }
    if (connectionErrorShown) clearDebugError();
  } catch (error) {
    setOnline(false);
    showConnectionError(`无法连接 Python 后端: ${friendlyError(error)}`);
  } finally {
    pollBusy = false;
  }
}

async function sendTouch(amount, meta = {}) {
  actionDepth += 1;
  backendEpoch += 1;

  try {
    const data = await apiRequest("/api/touch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
    });
    applyBackendState(data.state);
    setOnline(true);
    if (connectionErrorShown) clearDebugError();

    const tier = meta.level ? TOUCH_TIER_LABEL[meta.level] : "摸头";
    updateLastEvent(`真实摸头 · ${tier} · amount ${amount}`);
    showServerEvent(data.event);
  } catch (error) {
    setOnline(false);
    const message = friendlyError(error);
    showConnectionError(`摸摸头请求失败: ${message}`);
    if (appState.interaction.mode !== "speaking" && appState.interaction.mode !== "listening") {
      bubble.type({
        label: "tianbao",
        text: "唔...tianbao 暂时没有收到摸摸头, 等一会儿再试一次好吗?",
        charDelay: 32,
        autoHideMs: 6200,
      });
    }
  } finally {
    actionDepth -= 1;
  }
}

let sadInFlight = false;

async function sendSadEvent(amount) {
  if (sadInFlight) return;
  sadInFlight = true;
  sadButton.disabled = true;
  actionDepth += 1;
  backendEpoch += 1;

  try {
    const data = await apiRequest("/api/sad_event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
    });
    applyBackendState(data.state);
    setOnline(true);
    if (connectionErrorShown) clearDebugError();
    updateLastEvent(`负面事件 · 强度 ${amount}`);
    showServerEvent(data.event);
  } catch (error) {
    setOnline(false);
    showConnectionError(`负面事件请求失败: ${friendlyError(error)}`);
    if (appState.interaction.mode !== "speaking" && appState.interaction.mode !== "listening") {
      bubble.type({
        label: "tianbao",
        text: "唔...这个事件没有送达, 等一会儿再试试吧.",
        charDelay: 32,
        autoHideMs: 6200,
      });
    }
  } finally {
    actionDepth -= 1;
    sadInFlight = false;
    sadButton.disabled = false;
  }
}

function showServerEvent(event) {
  if (!event || !event.message) return;
  updateLastEvent(`${event.title || "事件"} · ${event.message}`);
  if (designPetStatus) designPetStatus.textContent = event.message;

  // Never stomp on a running typed simulation bubble.
  if (appState.interaction.mode === "speaking" || appState.interaction.mode === "listening") {
    return;
  }

  bubble.type({
    label: event.title || "tianbao",
    text: event.message,
    charDelay: 30,
    autoHideMs: 6200,
  });
}

/* ==========================================================================
   Debug actions
   ========================================================================== */

async function debugTouchReal() {
  if (touchButton.disabled) return;
  clearDebugError();

  const amount = Number(touchSlider.value);
  const level = amount <= 10 ? "light" : amount <= 20 ? "medium" : "affectionate";
  const holdMs = { light: 900, medium: 1300, affectionate: 1800 }[level];

  cancelSimulation({ hideBubble: true });
  const token = beginInteraction("touch", { touchLevel: level });
  robot.setGaze(0);
  robot.setHeadTilt(0, -2);

  touchButton.disabled = true;
  sadButton.disabled = true;

  const request = sendTouch(amount, { level, source: "debug" });
  await delay(holdMs);
  if (appState.interaction.mode === "touch") endInteractionIfCurrent(token);

  await request;
  touchButton.disabled = false;
  sadButton.disabled = false;
}

async function simulateSpeaking() {
  const text = speakInput.value.trim();
  if (!text) {
    clearDebugError();
    showDebugError("请先输入 tianbao 要说的话.");
    speakInput.focus();
    return;
  }

  clearDebugError();
  cancelSimulation({ hideBubble: true });
  const token = beginInteraction("speaking");
  const sim = ++simToken;
  updateLastEvent("前端模拟 · tianbao 正在说话");

  const completed = await bubble.type({
    label: "tianbao",
    text,
    charDelay: 46,
    autoHideMs: 0,
  });

  if (sim !== simToken) return;
  if (!completed) {
    endInteractionIfCurrent(token);
    return;
  }

  simTimer = window.setTimeout(() => {
    if (sim !== simToken) return;
    simTimer = null;
    endInteractionIfCurrent(token);
    bubble.hide();
    updateLastEvent("说话模拟结束, 已恢复当前情绪.");
  }, 1600);
}

async function simulateListening() {
  const target = listenSelect.value;
  const meta = LISTEN_META[target] || LISTEN_META.environment;
  const text = listenInput.value.trim();

  clearDebugError();
  cancelSimulation({ hideBubble: true });
  const token = beginInteraction("listening", {
    listeningTarget: target in LISTEN_META ? target : "environment",
    speakerIdentity: meta.identity,
  });
  const sim = ++simToken;
  updateLastEvent(`前端模拟 · 倾听${meta.label}${text ? "的声音" : ""}`);

  const lines = [];
  if (target !== "environment" || !text) lines.push(meta.reaction);
  if (text) lines.push(text);

  const completed = await bubble.type({
    label: meta.label,
    text: lines.join("\n"),
    charDelay: 42,
    autoHideMs: 0,
  });

  if (sim !== simToken) return;
  if (!completed) {
    endInteractionIfCurrent(token);
    return;
  }

  simTimer = window.setTimeout(() => {
    if (sim !== simToken) return;
    simTimer = null;
    endInteractionIfCurrent(token);
    bubble.hide();
    updateLastEvent("倾听模拟结束, 已恢复当前情绪.");
  }, target === "environment" ? 1600 : 1800);
}

function stopCurrentSimulation() {
  cancelSimulation({ hideBubble: true });
  interactionToken += 1;
  appState.interaction = idleInteraction();
  robot.stopTalking();
  robot.setExpression(appState.baseExpression, { force: true });
  robot.setGaze(0);
  robot.setHeadTilt(0, 0);
  stage.classList.remove("is-touching");
  updateDebugMode();
  updateLastEvent("已停止当前模拟.");
  clearDebugError();
}

function restoreIdle() {
  cancelSimulation({ hideBubble: true });
  interactionToken += 1;
  appState.interaction = idleInteraction();
  robot.stopTalking();
  robot.setExpression(appState.baseExpression, { force: true });
  robot.setGaze(0);
  robot.setHeadTilt(0, 0);
  stage.classList.remove("is-touching");
  updateDebugMode();
  updateLastEvent("已恢复待机动画.");
  clearDebugError();
}

/* ==========================================================================
   Debug UI updates
   ========================================================================== */

function touchTierForAmount(amount) {
  if (amount <= 10) return "轻轻摸头 · 1-10";
  if (amount <= 20) return "普通摸头 · 11-20";
  return "亲昵地摸头 · 21-30";
}

function sadTierForAmount(amount) {
  if (amount === 0) return "没有影响 · 0";
  if (amount <= 20) return "轻微负面事件 · 1-20";
  if (amount <= 50) return "普通负面事件 · 21-50";
  if (amount <= 80) return "严重负面事件 · 51-80";
  return "非常严重的事件 · 81-100";
}

function updateSliderLabels() {
  const touchAmount = Number(touchSlider.value);
  const sadAmount = Number(sadSlider.value);
  touchValue.textContent = String(touchAmount);
  touchLevel.textContent = touchTierForAmount(touchAmount);
  sadValue.textContent = String(sadAmount);
  sadLevel.textContent = sadTierForAmount(sadAmount);
  updateHud();
}

function updateDebugState() {
  const backend = appState.backend;
  dbgEmotion.textContent = EMOTION_LABEL[backend.emotion] || backend.emotion;
  dbgIntensity.textContent = backend.intensity.toFixed(1);
  dbgDescription.textContent = backend.description || "正在读取 tianbao 的状态...";
  dbgSync.textContent = backend.lastSync
    ? backend.lastSync.toLocaleTimeString("zh-CN", { hour12: false })
    : "--:--:--";

  dbgMeter.style.width = `${backend.intensity}%`;
  dbgProgress.setAttribute("aria-valuenow", String(Math.round(backend.intensity)));
  stateGroup.dataset.mood = backend.emotion === "sad"
    ? "sad"
    : backend.emotion === "calm" ? "calm" : "happy";
  updateHud();
}

function interactionText() {
  const interaction = appState.interaction;

  if (interaction.mode === "touch") {
    return `摸头中 · ${TOUCH_TIER_LABEL[interaction.touchLevel] || "轻轻摸头"}`;
  }
  if (interaction.mode === "speaking") return "说话中";
  if (interaction.mode === "voice_listening") return "正在听你说话";
  if (interaction.mode === "listening") {
    const meta = LISTEN_META[interaction.listeningTarget] || LISTEN_META.environment;
    return `倾听中 · ${meta.label}`;
  }
  return "待机";
}

function updateDebugMode() {
  dbgMode.textContent = interactionText();
  if (designPetAvatar) {
    const base = appState.baseExpression;
    designPetAvatar.dataset.mood = base.startsWith("sad")
      ? "sad"
      : base === "calm" ? "calm" : "happy";
  }
  updateHud();
}

function updateHud() {
  const backend = appState.backend;
  const mood = EMOTION_LABEL[backend.emotion] || backend.emotion;
  const intensity = backend.intensity.toFixed(1);
  const params = `摸头 ${touchSlider.value} · 事件 ${sadSlider.value}`;

  if (hudMood) hudMood.textContent = mood;
  if (hudIntensity) hudIntensity.textContent = intensity;
  if (hudMode) hudMode.textContent = interactionText();
  if (hudParams) hudParams.textContent = params;

  if (hudMove) {
    const isIso = appState.view === "iso";
    hudMove.hidden = !isIso;
    if (isIso) {
      const move = appState.move;
      hudMove.textContent = `2.5D · ${move.motion} · x ${Math.round(move.x)} y ${Math.round(move.y)}`;
    }
  }

  if (panelHudMood) panelHudMood.textContent = `${mood} ${intensity}`;
  if (panelHudMode) panelHudMode.textContent = interactionText();
  if (panelHudParams) {
    const extraMove = appState.view === "iso" && appState.move.motion !== "待机"
      ? ` · ${appState.move.motion}`
      : "";
    panelHudParams.textContent = params + extraMove;
  }
}

function updateHudVisibility() {
  debugHud.hidden = !panelOpen || appState.view === "3d";
}

function updateLastEvent(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  const short = clean.length > 96 ? `${clean.slice(0, 96)}…` : clean;
  dbgLastEvent.textContent = `最近事件: ${short || "暂无"}`;
}

/* ==========================================================================
   Views: robot / 2.5D room / 3D design preview
   ========================================================================== */

function setView(view) {
  if (!["robot", "iso", "3d"].includes(view) || appState.view === view) return;

  cancelSimulation({ hideBubble: true });
  appState.view = view;
  document.body.dataset.view = view;
  world.deactivate();

  stage.hidden = view !== "robot";
  worldRoot.hidden = view !== "iso";
  designView.hidden = view !== "3d";

  for (const tab of viewTabs) {
    const active = tab.dataset.view === view;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  }

  if (view === "iso") {
    world.setFace(robot.currentEye || "open", robot.currentMouth || "smile");
    world.setExpression(resolveExpression());
    world.activate();
  }

  updateActionAvailability();
  updateHud();
  updateHudVisibility();
  updateLastEvent(`切换到 ${view === "robot" ? "机器人" : view === "iso" ? "2.5D 小屋" : "3D 设计预览"} 视图.`);
}

function updateActionAvailability() {
  const iso = appState.view === "iso";
  if (actionModeNote) {
    actionModeNote.textContent = iso
      ? "2.5D 小屋已激活 · 可以控制 tianbao 移动."
      : "切换到 2.5D 小屋后可用.";
    actionModeNote.classList.toggle("is-ready", iso);
  }
  if (actionGotoIso) actionGotoIso.hidden = iso;
  for (const element of document.querySelectorAll("#panelPaneAction [data-move], #panelPaneAction [data-move-action]")) {
    element.disabled = !iso;
  }
}

function syncRunButtons(on) {
  for (const button of document.querySelectorAll("[data-move-action='run']")) {
    button.classList.toggle("is-on", Boolean(on));
    button.setAttribute("aria-pressed", String(Boolean(on)));
  }
}

function wireMovementControls() {
  for (const button of document.querySelectorAll("[data-move]")) {
    const direction = button.dataset.move;
    let pressedAt = 0;
    const press = (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      pressedAt = performance.now();
      button.classList.add("is-pressed");
      button.setAttribute("aria-pressed", "true");
      world.pressDirection(direction, true);
      try { button.setPointerCapture(event.pointerId); } catch { /* ignore */ }
    };
    const release = () => {
      button.classList.remove("is-pressed");
      button.setAttribute("aria-pressed", "false");
      world.pressDirection(direction, false);
    };
    button.addEventListener("pointerdown", press);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
    button.addEventListener("contextmenu", (event) => event.preventDefault());
    button.addEventListener("click", (event) => {
      // A quick tap (or keyboard activation) still moves one small step.
      if (event.detail === 0 || performance.now() - pressedAt < 260) {
        world.nudge(direction);
      }
    });
  }

  for (const button of document.querySelectorAll("[data-move-action]")) {
    const action = button.dataset.moveAction;
    if (action === "run") {
      button.addEventListener("click", () => {
        const on = world.toggleRun();
        syncRunButtons(on);
        updateHud();
      });
    } else if (action === "jump") {
      button.addEventListener("click", () => world.jump());
    } else if (action === "dash") {
      button.addEventListener("click", () => world.dash());
    }
  }

  window.addEventListener("pointerup", () => {
    for (const button of document.querySelectorAll("[data-move].is-pressed")) {
      button.classList.remove("is-pressed");
      button.setAttribute("aria-pressed", "false");
      world.pressDirection(button.dataset.move, false);
    }
  });
}

/* ==========================================================================
   Voice input / output
   ========================================================================== */

let voiceResponseActive = false;

function formatDuration(ms) {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function renderVoiceUI(snapshot) {
  const recording = snapshot.state === "recording";
  const requesting = snapshot.state === "requesting";
  const processing = snapshot.state === "processing";
  const playing = snapshot.state === "playing";
  const speaking = snapshot.state === "speaking";
  const has = snapshot.hasRecording;

  let status;
  if (snapshot.error) status = snapshot.error;
  else if (requesting) status = "正在请求麦克风权限...";
  else if (recording) status = `正在听... ${formatDuration(snapshot.elapsedMs)} · 再点一下结束`;
  else if (processing) status = "正在保存录音...";
  else if (playing) status = "正在回放你的录音...";
  else if (speaking || voiceResponseActive) status = "tianbao 正在回应...";
  else if (has) status = "录好了, 可以回放或再录一次.";
  else if (!snapshot.secure) status = "当前地址无法使用麦克风, Windows 请用 http://localhost:5000 打开.";
  else status = "点一下麦克风, 对 tianbao 说句话";

  const hostname = location.hostname;
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1"
    || hostname === "::1" || hostname === "[::1]";

  voiceStatus.textContent = status;
  const notes = [];
  if (!snapshot.speechSupported) notes.push("当前浏览器无语音合成, 仅显示文字.");
  if (!snapshot.secure) {
    notes.push(`当前页面 ${location.origin} 不是安全上下文; Windows 本机请用 http://localhost:5000 打开.`);
  } else if (isLocalhost) {
    notes.push("安全上下文 · 浏览器会直接使用当前系统 (Windows) 的麦克风.");
  } else {
    notes.push("安全上下文 · 麦克风使用浏览器所在系统的输入设备.");
  }
  voiceDebugStatus.textContent = status + (notes.length ? ` ${notes.join(" ")}` : "");

  voiceDock.classList.toggle("is-recording", recording || requesting);
  voiceDock.classList.toggle("has-error", Boolean(snapshot.error));
  voiceToggle.classList.toggle("is-recording", recording || requesting);
  voiceToggle.setAttribute("aria-pressed", String(recording));
  voiceToggle.setAttribute("aria-label", recording ? "结束录音" : "开始录音");
  voiceToggle.disabled = processing;

  if (voiceToggle25d) {
    voiceToggle25d.classList.toggle("is-recording", recording || requesting);
    voiceToggle25d.setAttribute("aria-label", recording ? "结束录音" : "对 tianbao 说话");
  }

  voicePlayback.hidden = !has;
  voicePlayback.disabled = recording || requesting || processing;
  voiceRetry.hidden = !has;
  voiceDebugRecord.textContent = recording ? "结束录音" : (requesting ? "请求权限..." : "开始录音");
  voiceDebugRecord.disabled = requesting || processing;
  voiceDebugPlay.disabled = !has || recording || requesting || processing;
  voiceDebugRespond.disabled = recording || requesting || processing || speaking;
}

async function handleVoiceToggle() {
  if (voice.isRecording) {
    if (voice.state === "requesting") voice.abortRecording();
    else voice.stopRecording();
    return;
  }

  cancelSimulation({ hideBubble: true });
  activeVoiceToken = beginInteraction("voice_listening");
  updateLastEvent("麦克风已开启, 正在听...");

  const started = await voice.startRecording();
  if (!started) {
    if (activeVoiceToken !== null) {
      endInteractionIfCurrent(activeVoiceToken);
      activeVoiceToken = null;
    }
    const message = voice.snapshot().error;
    if (message) {
      updateLastEvent(message);
      if (appState.interaction.mode === "idle") {
        bubble.type({
          label: "tianbao",
          text: message,
          charDelay: 28,
          autoHideMs: 6400,
        });
      }
    }
  }
}

function handleVoiceRecorded({ durationMs }) {
  if (activeVoiceToken !== null) {
    endInteractionIfCurrent(activeVoiceToken);
    activeVoiceToken = null;
  }
  updateLastEvent(`录音完成 · ${formatDuration(durationMs)}`);
  respondWithVoice();
}

function respondWithVoice() {
  return respondWithText(VOICE_RESPONSE_TEXT, voiceLibrary.getActiveVoice());
}

async function respondWithText(text, timbre) {
  const clean = String(text || "").trim();
  if (!clean) return;

  cancelSimulation({ hideBubble: true });
  const token = beginInteraction("speaking");
  const sim = ++simToken;
  voiceResponseActive = true;
  updateLastEvent(`语音输出 · ${timbre ? timbre.name : "默认音色"}`);

  const speechPromise = voice.speak(clean, timbre);
  const typedPromise = bubble.type({
    label: "tianbao",
    text: clean,
    charDelay: 44,
    autoHideMs: 0,
  });
  const [spoken, didType] = await Promise.all([speechPromise, typedPromise]);

  if (sim !== simToken) return;
  if (!spoken && !didType) {
    voiceResponseActive = false;
    endInteractionIfCurrent(token);
    renderVoiceUI(voice.snapshot());
    return;
  }

  simTimer = window.setTimeout(() => {
    if (sim !== simToken) return;
    simTimer = null;
    voiceResponseActive = false;
    endInteractionIfCurrent(token);
    bubble.hide();
    renderVoiceUI(voice.snapshot());
    updateLastEvent("语音输出结束, 已恢复当前情绪.");
  }, 900);
}

async function playUserRecording() {
  if (!voice.hasRecording) return;
  cancelSimulation({ hideBubble: true });
  await voice.playRecording();
}

/* ---------------- voice lab: timbres / custom / packs ---------------- */

function systemVoices() {
  if (!("speechSynthesis" in window)) return [];
  try { return window.speechSynthesis.getVoices() || []; } catch { return []; }
}

function populateCustomVoiceBase() {
  if (!customVoiceBase) return;
  const voices = systemVoices();
  const previous = customVoiceBase.value;
  customVoiceBase.textContent = "";
  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "默认系统语音";
  customVoiceBase.append(defaultOption);
  for (const voice of voices) {
    const option = document.createElement("option");
    option.value = voice.voiceURI;
    option.textContent = `${voice.name} (${voice.lang})`;
    customVoiceBase.append(option);
  }
  if (previous && [...customVoiceBase.options].some((option) => option.value === previous)) {
    customVoiceBase.value = previous;
  }
}

function updateTtsStatus() {
  const active = voiceLibrary.getActiveVoice();
  const snapshot = voice.snapshot();
  const notes = [];
  if (!snapshot.speechSupported) notes.push("当前浏览器无语音合成, 仅显示文字.");
  if (!snapshot.secure) notes.push("手机录音需要 HTTPS.");
  ttsStatus.textContent = `当前音色: ${active.name} (${active.packName})${notes.length ? ` · ${notes.join(" ")}` : ""}`;
}

function renderTimbres() {
  if (!timbreGrid) return;
  const active = voiceLibrary.getActiveVoice();
  timbreGrid.textContent = "";
  for (const voice of voiceLibrary.getVoices()) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `timbre-card${voice.key === active.key ? " is-active" : ""}`;
    card.dataset.voiceKey = voice.key;
    card.setAttribute("role", "option");
    card.setAttribute("aria-selected", String(voice.key === active.key));

    const name = document.createElement("span");
    name.className = "timbre-name";
    name.textContent = voice.name;
    const meta = document.createElement("span");
    meta.className = "timbre-meta";
    meta.textContent = `${voice.packName} · 高 ${voice.pitch.toFixed(2)} · 速 ${voice.rate.toFixed(2)}`;
    card.append(name, meta);

    card.addEventListener("click", () => {
      voiceLibrary.setActiveVoice(voice.key);
      renderTimbres();
      updateTtsStatus();
    });
    timbreGrid.append(card);
  }
  updateTtsStatus();
}

function renderVoicePacks() {
  if (!voicePackList) return;
  voicePackList.textContent = "";
  for (const pack of voiceLibrary.packs()) {
    const row = document.createElement("div");
    row.className = "pack-row";
    const info = document.createElement("div");
    info.className = "pack-info";
    const name = document.createElement("span");
    name.className = "pack-name";
    name.textContent = pack.name;
    const meta = document.createElement("span");
    meta.className = "pack-meta";
    meta.textContent = `${pack.builtin ? "内置" : "网络"} · ${pack.voices.length} 个音色${pack.description ? ` · ${pack.description}` : ""}`;
    info.append(name, meta);

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = `pack-toggle${pack.enabled ? " is-on" : ""}`;
    toggle.textContent = pack.enabled ? "已启用" : "已关闭";
    toggle.setAttribute("aria-pressed", String(pack.enabled));
    toggle.addEventListener("click", () => {
      const ok = voiceLibrary.setPackEnabled(pack.id, !pack.enabled);
      if (!ok) {
        voicePackStatus.textContent = "至少保留一个可用音色.";
        return;
      }
      renderVoiceLab();
      voicePackStatus.textContent = `${pack.name} 已${pack.enabled ? "关闭" : "启用"}.`;
    });

    row.append(info, toggle);
    if (!pack.builtin) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "pack-remove";
      remove.textContent = "卸载";
      remove.title = "卸载这个语音包";
      remove.addEventListener("click", () => {
        voiceLibrary.removePack(pack.id);
        renderVoiceLab();
        voicePackStatus.textContent = `${pack.name} 已卸载.`;
      });
      row.append(remove);
    }
    voicePackList.append(row);
  }
}

function renderCustomVoices() {
  if (!customVoiceList) return;
  const customs = voiceLibrary.getVoices().filter((voice) => voice.custom);
  customVoiceList.textContent = "";
  if (!customs.length) {
    const empty = document.createElement("p");
    empty.className = "field-note";
    empty.textContent = "还没有自定义音色.";
    customVoiceList.append(empty);
    return;
  }
  for (const voice of customs) {
    const row = document.createElement("div");
    row.className = "custom-row";
    const name = document.createElement("strong");
    name.textContent = voice.name;
    const meta = document.createElement("span");
    meta.textContent = `高 ${voice.pitch.toFixed(2)} · 速 ${voice.rate.toFixed(2)}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "删除";
    remove.addEventListener("click", () => {
      voiceLibrary.deleteCustom(voice.key);
      renderVoiceLab();
    });
    row.append(name, meta, remove);
    customVoiceList.append(row);
  }
}

function renderVoiceLab() {
  populateCustomVoiceBase();
  renderTimbres();
  renderVoicePacks();
  renderCustomVoices();
  updateTtsStatus();
}

function updateCustomVoiceLabels() {
  customVoicePitchValue.textContent = Number(customVoicePitch.value).toFixed(2);
  customVoiceRateValue.textContent = Number(customVoiceRate.value).toFixed(2);
}

function saveCustomVoice() {
  const name = customVoiceName.value.trim();
  if (!name) {
    ttsStatus.textContent = "请先给自定义音色起个名字.";
    customVoiceName.focus();
    return;
  }
  const selected = customVoiceBase.selectedOptions[0];
  const voiceURI = customVoiceBase.value;
  const voiceName = selected && voiceURI
    ? selected.textContent.replace(/\s*\([^)]*\)\s*$/, "").trim()
    : "";
  const saved = voiceLibrary.saveCustom({
    name,
    rate: Number(customVoiceRate.value),
    pitch: Number(customVoicePitch.value),
    voiceURI,
    voiceName,
  });
  if (!saved) {
    ttsStatus.textContent = "音色保存失败, 请检查浏览器的本地存储权限.";
    return;
  }
  customVoiceName.value = "";
  renderVoiceLab();
  voicePackStatus.textContent = `自定义音色「${saved.name}」已保存.`;
}

async function downloadVoicePack(url) {
  voicePackStatus.textContent = "正在下载语音包...";
  try {
    const pack = await voiceLibrary.downloadPack(url);
    renderVoiceLab();
    voicePackStatus.textContent = `已下载「${pack.name}」, 新增 ${pack.voices.length} 个音色.`;
  } catch (error) {
    voicePackStatus.textContent = error && error.message ? error.message : "语音包下载失败.";
  }
}

function stopVoiceOutput() {
  cancelSimulation({ hideBubble: true });
  voice.cancelSpeech();
  ttsStatus.textContent = "已停止 tianbao 的语音输出.";
}

async function speakTypedText() {
  const text = ttsText.value.trim();
  if (!text) {
    ttsStatus.textContent = "先输入要让 tianbao 说的话.";
    ttsText.focus();
    return;
  }
  await respondWithText(text, voiceLibrary.getActiveVoice());
}

/* ==========================================================================
   Drawer
   ========================================================================== */

let panelOpen = false;
let lastFocused = null;

let activePanelTab = "debug";

function setPanelTab(tab, { focus = false } = {}) {
  if (!["debug", "voice", "action"].includes(tab)) return;
  activePanelTab = tab;

  for (const button of panelTabs) {
    const active = button.dataset.panelTab === tab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  }
  for (const pane of panelPanes) {
    pane.hidden = pane.dataset.panelPane !== tab;
  }
  if (panelBody) panelBody.scrollTop = 0;

  if (tab === "voice") renderVoiceLab();
  if (tab === "action") updateActionAvailability();
  if (focus) {
    const target = panelTabs.find((button) => button.dataset.panelTab === tab);
    if (target) target.focus({ preventScroll: true });
  }
}

function openPanel(tab = null) {
  if (tab) setPanelTab(tab);
  if (panelOpen) return;
  panelOpen = true;
  lastFocused = document.activeElement;

  // Non-modal, persistent console: the stage stays crisp and interactive
  // behind the panel. Only the "收起" button (or Escape) hides it again.
  debugPanel.classList.add("is-open");
  debugPanel.inert = false;
  debugPanel.setAttribute("aria-hidden", "false");
  document.body.classList.add("debug-open");
  debugOpen.setAttribute("aria-expanded", "true");
  updateHud();
  updateHudVisibility();
  if (activePanelTab === "voice") renderVoiceLab();
  if (activePanelTab === "action") updateActionAvailability();

  window.setTimeout(() => debugClose.focus({ preventScroll: true }), 90);
  pollState();
}

function closePanel() {
  if (!panelOpen) return;
  panelOpen = false;

  debugPanel.classList.remove("is-open");
  debugPanel.setAttribute("aria-hidden", "true");
  debugPanel.inert = true;
  document.body.classList.remove("debug-open");
  debugOpen.setAttribute("aria-expanded", "false");
  updateHudVisibility();

  if (lastFocused && typeof lastFocused.focus === "function") {
    lastFocused.focus({ preventScroll: true });
  } else {
    debugOpen.focus({ preventScroll: true });
  }
}

/* ==========================================================================
   Wiring
   ========================================================================== */

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

debugOpen.addEventListener("click", () => openPanel());
debugClose.addEventListener("click", closePanel);

for (const tab of panelTabs) {
  tab.addEventListener("click", () => setPanelTab(tab.dataset.panelTab));
  tab.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const index = panelTabs.indexOf(tab);
    const next = event.key === "ArrowRight"
      ? (index + 1) % panelTabs.length
      : (index - 1 + panelTabs.length) % panelTabs.length;
    setPanelTab(panelTabs[next].dataset.panelTab, { focus: true });
  });
}

for (const tab of viewTabs) {
  tab.addEventListener("click", () => setView(tab.dataset.view));
}
wireMovementControls();
updateActionAvailability();

voiceOpenPanel.addEventListener("click", () => openPanel("voice"));

designPetButton.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  event.preventDefault();
  designPetPointerAt = performance.now();
  if (designPetActive) return;
  try { designPetButton.setPointerCapture(event.pointerId); } catch { /* ignore */ }
  startDesignPet();
});
designPetButton.addEventListener("pointerup", (event) => {
  event.preventDefault();
  endDesignPet(true);
});
designPetButton.addEventListener("pointercancel", () => endDesignPet(false));
designPetButton.addEventListener("lostpointercapture", () => endDesignPet(false));
designPetButton.addEventListener("contextmenu", (event) => event.preventDefault());
designPetButton.addEventListener("click", (event) => {
  // Keyboard activation has no pointer hold; use a normal medium touch.
  // Ignore the synthetic click that can follow a touch/pointer release.
  if (event.detail !== 0 || designPetActive) return;
  if (performance.now() - designPetPointerAt < 600) return;
  designPetActive = true;
  designPetStart = performance.now();
  beginTouch("medium", "design");
  setDesignPetFace("medium");
  if (designPetStatus) designPetStatus.textContent = "摸摸中...";
  designPetTimers = [window.setTimeout(() => {
    if (!designPetActive) return;
    designPetActive = false;
    setDesignPetFace("idle");
    if (designPetStatus) designPetStatus.textContent = "摸摸已送出, 等 tianbao 的回应...";
    finishTouch({ amount: 15, level: "medium", source: "design" });
  }, 900)];
});

actionGotoIso.addEventListener("click", () => {
  setView("iso");
  updateActionAvailability();
});
cameraButton.disabled = true;

voiceToggle.addEventListener("click", handleVoiceToggle);
if (voiceToggle25d) voiceToggle25d.addEventListener("click", handleVoiceToggle);
voicePlayback.addEventListener("click", playUserRecording);
voiceRetry.addEventListener("click", respondWithVoice);
voiceDebugRecord.addEventListener("click", handleVoiceToggle);
voiceDebugPlay.addEventListener("click", playUserRecording);
voiceDebugRespond.addEventListener("click", respondWithVoice);

ttsSpeak.addEventListener("click", speakTypedText);
ttsStop.addEventListener("click", stopVoiceOutput);
voicePackDownload.addEventListener("click", () => {
  const url = voicePackUrl.value.trim();
  if (!url) {
    voicePackStatus.textContent = "请输入语音包 manifest 地址.";
    return;
  }
  downloadVoicePack(url);
});
voicePackSample.addEventListener("click", () => {
  const sample = "/static/voice-packs/breeze.json";
  voicePackUrl.value = sample;
  downloadVoicePack(sample);
});
customVoiceSave.addEventListener("click", saveCustomVoice);
customVoicePitch.addEventListener("input", updateCustomVoiceLabels);
customVoiceRate.addEventListener("input", updateCustomVoiceLabels);
customVoiceName.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    saveCustomVoice();
  }
});
if ("speechSynthesis" in window && typeof window.speechSynthesis.addEventListener === "function") {
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    populateCustomVoiceBase();
    if (activePanelTab === "voice") renderTimbres();
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && panelOpen) closePanel();
});

touchSlider.addEventListener("input", updateSliderLabels);
sadSlider.addEventListener("input", updateSliderLabels);

touchButton.addEventListener("click", debugTouchReal);
sadButton.addEventListener("click", () => sendSadEvent(Number(sadSlider.value)));

speakButton.addEventListener("click", simulateSpeaking);
listenButton.addEventListener("click", simulateListening);

for (const button of document.querySelectorAll("[data-touch-sim]")) {
  button.addEventListener("click", () => playTouchPreview(button.dataset.touchSim));
}

stopSimulationBtn.addEventListener("click", stopCurrentSimulation);
restoreIdleBtn.addEventListener("click", restoreIdle);

// Ctrl/Cmd + Enter submits the debug text areas.
speakInput.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    simulateSpeaking();
  }
});
listenInput.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    simulateListening();
  }
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) pollState();
});

/* ==========================================================================
   Boot
   ========================================================================== */

setPanelTab("debug");
updateSliderLabels();
updateDebugState();
updateDebugMode();
updateLastEvent("暂无");
updateHudVisibility();
updateActionAvailability();
updateCustomVoiceLabels();
renderVoiceLab();
renderVoiceUI(voice.snapshot());
document.body.dataset.view = appState.view;
stage.dataset.expression = appState.baseExpression;
world.setExpression(appState.baseExpression);

pollState();
window.setInterval(pollState, 1000);
