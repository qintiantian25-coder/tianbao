"use strict";

import { RobotView, baseExpressionFor } from "./robot-view.js?v=0.7.1";
import { TouchController } from "./robot-touch.js?v=0.7.1";
import { SpeechBubble } from "./bubble.js?v=0.7.1";
import { World25D } from "./world25d.js?v=0.7.1";
import { VoiceController, VOICE_RESPONSE_TEXT } from "./voice.js?v=0.7.1";
import { VoiceLibrary } from "./voice-library.js?v=0.7.1";
import {
  RemoteTTSService,
  loadTTSSelection,
  saveTTSSelection,
} from "./remote-tts.js?v=0.7.1";
import {
  applyCompanionPollResults,
  isInvitationStillRelevant as isInvitationStillRelevantPure,
} from "./poll-guard.js?v=0.7.1";
import {
  ALL_SKINS,
  FINISHES,
  SKIN_GROUPS,
  DEFAULT_PERSONA_ID,
  DEFAULT_FINISH_ID,
  loadSkinSelection,
  saveSkinSelection,
  resolveSkinTheme,
  skinCssVariables,
  normalizeSkinSelection,
} from "./skins.js?v=0.7.1";
import { chargingStateFor } from "./home-layout.js?v=0.7.1";
import {
  nearestIsoInteraction,
  nearbyInteractionLabel,
} from "./furniture-interactions.js?v=0.7.1";

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
const dbgEnergy = $("dbgEnergy");
const dbgSocial = $("dbgSocial");
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
const autonomyTick = $("autonomyTick");
const autonomyStatus = $("autonomyStatus");
const autonomyCooldownReset = $("autonomyCooldownReset");
const autonomyPresetStatus = $("autonomyPresetStatus");
const companionRequestStatus = $("companionRequestStatus");
const companionSessionStatus = $("companionSessionStatus");
const autonomyPresetButtons = [...document.querySelectorAll("[data-autonomy-preset]")];
const stateGroup = document.querySelector(".state-group");

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
const home3dRoot = $("design3d");
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
const cameraStatus = $("cameraStatus");
const cameraSimPreview = $("cameraSimPreview");
const actionGoto3d = $("actionGoto3d");
const furnitureStatus = $("furnitureStatus");
const debugChargeStatus = $("debugChargeStatus");
const debugChargeEnergy = $("debugChargeEnergy");
const debugReturnDock = $("debugReturnDock");
const debugLeaveDock = $("debugLeaveDock");
const autoReturnToggle = $("autoReturnToggle");
const isoChargeStatus = $("isoChargeStatus");
const isoChargeHud = $("isoChargeHud");
const isoNearbyPrompt = $("isoNearbyPrompt");
const isoNearbyText = $("isoNearbyText");
const isoNearbyDebug = $("isoNearbyDebug");
const isoSofa = $("isoSofa");
const isoLamp = $("isoLamp");
const isoPlant = $("isoPlant");
const isoMediaConsole = $("isoMediaConsole");
const isoTable = $("isoTable");
const isoChargePad = $("isoChargePad");
const skinOpen = $("skinOpen");
const skinClose = $("skinClose");
const skinPanel = $("skinPanel");
const skinCurrentName = $("skinCurrentName");
const skinGrid = $("skinGrid");
const skinFinishPane = $("skinFinishPane");
const skinFinishGrid = $("skinFinishGrid");
const skinTabs = [...document.querySelectorAll("[data-skin-tab]")];
const skinGroupHint = $("skinGroupHint");
const skinActiveLabel = $("skinActiveLabel");
const skinReset = $("skinReset");

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
const ttsVoiceSelect = $("ttsVoiceSelect");
const ttsServiceBadge = $("ttsServiceBadge");
const ttsServiceDetail = $("ttsServiceDetail");
const ttsFallbackNotice = $("ttsFallbackNotice");
const speechMetrics = $("speechMetrics");
const isoSpeechMetrics = $("isoSpeechMetrics");
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

/**
 * Front-end presentation for one autonomy action, used by both the manual
 * debug preview and automatic background events. The server owns the rules;
 * this map only decides how to show the result.
 */
const AUTONOMY_META = {
  interact: {
    label: "互动",
    bubble: "主人，我想和你玩一会儿~",
    expression: "happy_mid",
    headTilt: 0,
    headLift: 1,
    duration: 3200,
  },
  seek_comfort: {
    label: "求安慰",
    bubble: "主人，我有点伤心，想要安慰~",
    expression: "sad_mid",
    headTilt: 1.2,
    headLift: -2,
    duration: 3200,
  },
  rest: {
    label: "休息",
    bubble: "我想休息一下~",
    expression: "calm",
    headTilt: 0,
    headLift: -1.5,
    duration: 2800,
  },
  idle: {
    label: "待机",
    bubble: "tianbao 正在安静待机...",
    expression: null,
    headTilt: 0,
    headLift: 0,
    duration: 2200,
  },
};

const AUTONOMY_EVENT_ACTIONS = new Set([
  "interact",
  "seek_comfort",
  "rest",
  "idle",
]);

const AUTONOMY_EVENT_PRIORITY = {
  seek_comfort: 3,
  interact: 3,
  rest: 2,
  idle: 1,
};

const AUTONOMY_EVENT_TTL_MS = {
  seek_comfort: 15000,
  interact: 15000,
  rest: 4000,
  idle: 4000,
};

// null means "first load": set the cursor to the server's latest id without
// replaying events that existed before the page opened.
let autonomyCursor = null;
let pendingAutonomyEvent = null;

/** Display labels only; the backend owns the preset target values. */
const AUTONOMY_PRESET_META = {
  wants_companion: "想要陪伴",
  low_energy: "精力不足",
  normal_idle: "普通待机",
};

const appState = {
  /** Authoritative Flask state. */
  backend: {
    emotion: "happy",
    intensity: 60,
    energy: null,
    socialNeed: null,
    activity: "idle",
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
  companionRequest: null,
  companionSession: null,
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
    autonomySource: null,
  };
}

/* ==========================================================================
   Skin selection
   ========================================================================== */

let skinSelection = loadSkinSelection();
let currentSkinTheme = resolveSkinTheme(
  skinSelection.personaId,
  skinSelection.finishId,
);
let activeSkinTab = currentSkinTheme.category === "robot" ? "robot" : "ai";
let skinPanelOpen = false;
let skinPanelReturnFocus = null;
let skinPanelCloseTimer = null;

/* ==========================================================================
   Charging / furniture scene state
   ========================================================================== */

const AUTO_RETURN_THRESHOLD = 25;
const AUTO_RETURN_STORAGE_KEY = "tianbao.autoReturn.v1";
const CHARGE_TICK_MS = 2000;

const furnitureState = {
  sofa: false,
  lampOn: true,
  plant: false,
  media: false,
  table: false,
};
let furnitureBubbleTimer = null;
let teaTimer = null;

function readAutoReturn() {
  try {
    const raw = localStorage.getItem(AUTO_RETURN_STORAGE_KEY);
    return raw === null ? true : raw === "1";
  } catch {
    return true;
  }
}

let autoReturnEnabled = readAutoReturn();
let lowEnergyAutoReturnArmed = true;
let chargeSession = {
  active: false,
  view: null,
  timer: null,
  inFlight: false,
  full: false,
};

/* ==========================================================================
   3D lazy loader
   ========================================================================== */

let home3d = null;
let home3dPromise = null;
let home3dFailed = false;
let threeDPetActive = false;

/* ==========================================================================
   View + bubble
   ========================================================================== */

const robot = new RobotView(stage);
robot.setBaseExpression(appState.baseExpression);
robot.setExpression(appState.baseExpression, { force: true });

const bubble = new SpeechBubble($("speechBubble"));
bubble.onClose = () => {
  clearSpeechMetrics();
  updateLastEvent("气泡已关闭.");
};

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
    updateChargeUI();
    updateNearbyInteraction();
  },
  onDockChange: (event) => handleDockChange("iso", event),
});
world.setFace(robot.currentEye || "open", robot.currentMouth || "smile");
world.setExpression(appState.baseExpression);
worldRoot.__world25d = world;
bubble.onUpdate = (update) => {
  if (furnitureBubbleTimer) {
    clearTimeout(furnitureBubbleTimer);
    furnitureBubbleTimer = null;
  }
  world.setBubble(update);
};
robot.onFaceChange = ({ eye, mouth }) => {
  world.setFace(eye, mouth);
  if (home3d) home3d.setFace(eye, mouth);
};

const voiceLibrary = new VoiceLibrary();
const voice = new VoiceController({
  onChange: (snapshot) => renderVoiceUI(snapshot),
  onRecorded: (recording) => handleVoiceRecorded(recording),
});

const remoteTTS = new RemoteTTSService({
  onChange: (snapshot) => {
    // A successful status refresh means a service-level outage is over. Keep
    // a per-request/playback failure visible until the next successful remote
    // sentence, but do not leave "备用语音" on screen after the service is
    // clearly back (and we are not in the middle of a fallback sentence).
    if (snapshot.available && ttsRuntimeFallback && !voiceResponseActive) {
      const failure = ttsRuntimeFallback;
      if (failure.serviceLevel && performance.now() - failure.at > 1500) {
        ttsRuntimeFallback = null;
      }
    }
    syncTTSVoiceOptions();
    renderTTSServiceStatus();
    updateTtsStatus();
  },
});

/**
 * The saved choice survives reloads. The default is the server default voice
 * (yujie_v1 when available); the browser voice remains one select away and is
 * also the automatic fallback.
 */
let ttsSelection = loadTTSSelection() || {
  mode: "remote",
  remoteVoiceId: "",
  localKey: voiceLibrary.getActiveVoice().key,
};
let ttsRuntimeFallback = null;
let ttsOptionsSignature = "";
// -Infinity (not 0): performance.now() starts near 0, so 0 would look like a
// touch that just happened right after a reload.
let lastTouchCompletedAt = -Infinity;
let lastTTSFailureKey = "";
let lastTTSFailureAt = 0;
let speechMetricsToken = 0;

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

  if (interaction.mode === "autonomy") {
    const meta = AUTONOMY_META[interaction.autonomyAction];
    return meta && meta.expression ? meta.expression : appState.baseExpression;
  }
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
  remoteTTS.cancel();
  voice.cancelSpeech();
  clearSpeechMetrics();
  if (voice.isRecording) voice.abortRecording();

  const mode = appState.interaction.mode;
  const isSimulated = mode === "speaking"
    || mode === "voice_listening"
    || mode === "listening"
    || mode === "autonomy"
    || (mode === "touch" && !keepTouch);

  if (isSimulated) {
    interactionToken += 1;
    appState.interaction = idleInteraction();
    activeTouchToken = null;
    activeVoiceToken = null;
    renderInteractionState();
    // Clear a temporary autonomy/preview head pose before the next
    // interaction (touch or voice) sets its own pose.
    robot.setGaze(0);
    robot.setHeadTilt(0, 0);
  }

  if (hideBubble) bubble.hide();
}

/* ==========================================================================
   Skin atelier
   ========================================================================== */

const AVATAR_VARIABLES = {
  bodyA: "--avatar-body-a",
  bodyB: "--avatar-body-b",
  headA: "--avatar-head-a",
  headB: "--avatar-head-b",
  outline: "--avatar-outline",
  screenA: "--avatar-screen-a",
  screenB: "--avatar-screen-b",
  face: "--avatar-face",
  accent: "--avatar-accent",
  accentSoft: "--avatar-accent-soft",
  aura: "--avatar-aura",
};

function applyAvatarColors(element, colors) {
  for (const [key, cssName] of Object.entries(AVATAR_VARIABLES)) {
    if (colors && colors[key]) element.style.setProperty(cssName, colors[key]);
  }
}

function createAvatar(skin, colors) {
  const avatar = document.createElement("span");
  avatar.className = "skin-avatar";
  avatar.dataset.accessory = skin.accessory;
  avatar.setAttribute("aria-hidden", "true");
  applyAvatarColors(avatar, colors);

  const head = document.createElement("span");
  head.className = "av-head";
  const screen = document.createElement("span");
  screen.className = "av-screen";
  const leftEye = document.createElement("i");
  leftEye.className = "av-eye left";
  const rightEye = document.createElement("i");
  rightEye.className = "av-eye right";
  const smile = document.createElement("i");
  smile.className = "av-smile";
  screen.append(leftEye, rightEye, smile);

  const body = document.createElement("span");
  body.className = "av-body";
  const dot = document.createElement("span");
  dot.className = "av-dot";
  body.append(dot);

  avatar.append(head, screen, body);
  return avatar;
}

function createSkinCard(skin) {
  const colors = resolveSkinTheme(skin.id, skinSelection.finishId).colors;
  const card = document.createElement("button");
  card.type = "button";
  card.className = "skin-card";
  card.dataset.skinId = skin.id;
  card.setAttribute("role", "option");
  card.setAttribute("aria-selected", String(skin.id === skinSelection.personaId));
  card.setAttribute("aria-label", `${skin.name}，${skin.subtitle}`);
  if (skin.id === skinSelection.personaId) card.classList.add("is-active");

  const name = document.createElement("span");
  name.className = "skin-card-name";
  name.textContent = skin.name;
  const badge = document.createElement("b");
  badge.textContent = skin.badge;
  name.append(badge);

  const subtitle = document.createElement("span");
  subtitle.className = "skin-card-sub";
  subtitle.textContent = skin.subtitle;

  card.append(createAvatar(skin, colors), name, subtitle);
  card.addEventListener("click", () => {
    skinSelection = normalizeSkinSelection({
      personaId: skin.id,
      finishId: skinSelection.finishId,
    });
    applySkinTheme(
      resolveSkinTheme(skinSelection.personaId, skinSelection.finishId),
      { persist: true, announce: true },
    );
    const again = skinGrid?.querySelector(`[data-skin-id="${skin.id}"]`);
    if (again) again.focus({ preventScroll: true });
  });
  return card;
}

function createFinishCard(finish) {
  const theme = resolveSkinTheme(skinSelection.personaId, finish.id);
  const card = document.createElement("button");
  card.type = "button";
  card.className = "skin-finish-card";
  card.dataset.finishId = finish.id;
  card.setAttribute("role", "option");
  card.setAttribute("aria-selected", String(finish.id === skinSelection.finishId));
  card.setAttribute("aria-label", `${finish.name}，${finish.description}`);
  if (finish.id === skinSelection.finishId) card.classList.add("is-active");

  const swatch = document.createElement("span");
  swatch.className = "finish-swatch";
  for (const key of ["headA", "headB", "face", "accent", "screenA"]) {
    const stripe = document.createElement("i");
    stripe.style.background = theme.colors[key] || "#ded8cc";
    swatch.append(stripe);
  }
  const name = document.createElement("span");
  name.className = "skin-finish-name";
  name.textContent = finish.name;
  const desc = document.createElement("span");
  desc.className = "skin-finish-desc";
  desc.textContent = finish.description;
  card.append(swatch, name, desc);

  card.addEventListener("click", () => {
    skinSelection = normalizeSkinSelection({
      personaId: skinSelection.personaId,
      finishId: finish.id,
    });
    applySkinTheme(
      resolveSkinTheme(skinSelection.personaId, skinSelection.finishId),
      { persist: true, announce: true },
    );
    const again = skinFinishGrid?.querySelector(`[data-finish-id="${finish.id}"]`);
    if (again) again.focus({ preventScroll: true });
  });
  return card;
}

function updateSkinTabs() {
  for (const tab of skinTabs) {
    const active = tab.dataset.skinTab === activeSkinTab;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  }
}

function renderSkinPanel() {
  if (!skinGrid || !skinFinishGrid || !currentSkinTheme) return;
  updateSkinTabs();

  const finishTab = activeSkinTab === "finish";
  if (skinFinishPane) skinFinishPane.hidden = !finishTab;
  if (skinGrid) skinGrid.hidden = finishTab;

  if (finishTab) {
    if (skinGroupHint) {
      skinGroupHint.textContent = "涂装会套用在当前形象上；原色留白会保留角色自带配色。";
    }
    skinFinishGrid.replaceChildren(...FINISHES.map(createFinishCard));
  } else {
    const group = SKIN_GROUPS.find((item) => item.id === activeSkinTab);
    if (skinGroupHint) {
      skinGroupHint.textContent = group ? group.hint : "";
    }
    const skins = ALL_SKINS.filter((skin) => skin.category === activeSkinTab);
    skinGrid.replaceChildren(...skins.map(createSkinCard));
  }

  if (skinCurrentName) skinCurrentName.textContent = currentSkinTheme.name;
  if (skinActiveLabel) {
    skinActiveLabel.textContent =
      `当前：${currentSkinTheme.name} · ${currentSkinTheme.finishName} · ${currentSkinTheme.subtitle}`;
  }
}

function applySkinTheme(theme, { persist = true, announce = false } = {}) {
  currentSkinTheme = theme;
  skinSelection = normalizeSkinSelection({
    personaId: theme.personaId,
    finishId: theme.finishId,
  });
  if (persist) saveSkinSelection(skinSelection);

  const root = document.documentElement;
  const variables = skinCssVariables(theme.colors);
  for (const [name, value] of Object.entries(variables)) {
    root.style.setProperty(name, value);
  }
  root.dataset.skinAccessory = theme.accessory;
  root.dataset.skinPersona = theme.personaId;
  root.dataset.skinCategory = theme.category;

  if (home3d) home3d.applyTheme(theme);
  updateSkinTabs();
  renderSkinPanel();
  if (announce) {
    updateLastEvent(`换肤 · ${theme.name} · ${theme.finishName}`);
  }
}

function setSkinTab(tab, { focus = false } = {}) {
  if (!["ai", "robot", "finish"].includes(tab)) return;
  activeSkinTab = tab;
  renderSkinPanel();
  if (focus) {
    const target = skinTabs.find((button) => button.dataset.skinTab === tab);
    if (target) target.focus({ preventScroll: true });
  }
}

function openSkinPanel() {
  if (!skinPanel || skinPanelOpen) return;
  if (panelOpen) closePanel();
  skinPanelOpen = true;
  skinPanelReturnFocus = document.activeElement;
  if (skinPanelCloseTimer) {
    clearTimeout(skinPanelCloseTimer);
    skinPanelCloseTimer = null;
  }
  activeSkinTab = currentSkinTheme.category === "robot" ? "robot" : "ai";
  renderSkinPanel();
  skinPanel.hidden = false;
  skinPanel.inert = false;
  skinPanel.setAttribute("aria-hidden", "false");
  if (skinOpen) skinOpen.setAttribute("aria-expanded", "true");
  document.body.classList.add("skin-open");
  window.requestAnimationFrame(() => skinPanel.classList.add("is-open"));
  window.setTimeout(() => skinClose?.focus({ preventScroll: true }), 40);
}

function closeSkinPanel({ restoreFocus = true } = {}) {
  if (!skinPanel || !skinPanelOpen) return;
  skinPanelOpen = false;
  skinPanel.classList.remove("is-open");
  skinPanel.setAttribute("aria-hidden", "true");
  if (skinOpen) skinOpen.setAttribute("aria-expanded", "false");
  document.body.classList.remove("skin-open");
  skinPanelCloseTimer = window.setTimeout(() => {
    if (skinPanelOpen) return;
    skinPanel.hidden = true;
    skinPanel.inert = true;
    skinPanelCloseTimer = null;
  }, 200);
  if (restoreFocus) {
    const target = skinPanelReturnFocus && typeof skinPanelReturnFocus.focus === "function"
      ? skinPanelReturnFocus
      : skinOpen;
    target?.focus({ preventScroll: true });
  }
}

function wireSkinPanel() {
  if (!skinOpen || !skinPanel) return;
  skinOpen.addEventListener("click", () => {
    if (skinPanelOpen) closeSkinPanel();
    else openSkinPanel();
  });
  skinClose?.addEventListener("click", () => closeSkinPanel());
  skinReset?.addEventListener("click", () => {
    skinSelection = normalizeSkinSelection({
      personaId: DEFAULT_PERSONA_ID,
      finishId: DEFAULT_FINISH_ID,
    });
    applySkinTheme(
      resolveSkinTheme(DEFAULT_PERSONA_ID, DEFAULT_FINISH_ID),
      { persist: true, announce: true },
    );
    setSkinTab("robot");
  });
  for (const tab of skinTabs) {
    tab.addEventListener("click", () => setSkinTab(tab.dataset.skinTab));
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const index = skinTabs.indexOf(tab);
      const next = event.key === "ArrowRight"
        ? (index + 1) % skinTabs.length
        : (index - 1 + skinTabs.length) % skinTabs.length;
      setSkinTab(skinTabs[next].dataset.skinTab, { focus: true });
    });
  }
  document.addEventListener("pointerdown", (event) => {
    if (!skinPanelOpen) return;
    if (skinPanel.contains(event.target) || skinOpen.contains(event.target)) return;
    closeSkinPanel({ restoreFocus: false });
  });
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
  lastTouchCompletedAt = performance.now();
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

/* 3D petting is wired by the lazy Home3D instance below. */

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
      const error = new Error(
        data && data.error ? data.error : `请求失败 (${response.status}).`,
      );
      error.status = response.status;
      throw error;
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

function percentOrNull(value) {
  if (value === null || value === undefined) return null;

  const number = Number(value);
  if (!Number.isFinite(number)) return null;

  return Math.max(0, Math.min(100, number));
}

function applyBackendState(data) {
  if (!data || typeof data !== "object") return false;
  if (!["happy", "sad", "calm"].includes(data.emotion)) return false;

  const intensity = percentOrNull(data.intensity);
  const activity = data.activity === "rest" ? "rest" : "idle";
  appState.backend.emotion = data.emotion;
  appState.backend.intensity = intensity === null ? 0 : intensity;
  appState.backend.energy = percentOrNull(data.energy);
  appState.backend.socialNeed = percentOrNull(data.social_need);
  appState.backend.activity = activity;
  appState.backend.description = typeof data.description === "string" ? data.description : "";
  appState.backend.lastSync = new Date();
  // While resting, keep a calm resting face until activity returns to idle.
  appState.baseExpression = activity === "rest"
    ? "calm"
    : baseExpressionFor(data.emotion, appState.backend.intensity);

  robot.setBaseExpression(appState.baseExpression);
  if (appState.interaction.mode === "idle") {
    robot.setExpression(appState.baseExpression);
    world.setExpression(appState.baseExpression);
  }

  updateDebugState();
  if (home3d) home3d.setEnergy(energyValue());
  updateChargeUI();
  maybeAutoReturnCharging();
  return true;
}

function updateCompanionRequest(data) {
  const request = data && data.request && typeof data.request === "object"
    ? data.request
    : null;
  appState.companionRequest = request;

  if (!companionRequestStatus) return;

  if (!request) {
    companionRequestStatus.textContent = "当前没有待回应的请求.";
    companionRequestStatus.dataset.state = "none";
    return;
  }

  const label = request.action === "seek_comfort" ? "安慰" : "陪伴";
  const ref = request.id ? ` #${request.id}` : "";

  if (request.status === "pending") {
    const remaining = Number(data.remaining_seconds);
    const suffix = Number.isFinite(remaining)
      ? ` · 剩余 ${Math.max(0, Math.ceil(remaining))}s`
      : "";
    companionRequestStatus.textContent =
      `等待主人回应: ${label}请求${ref}${suffix}`;
    companionRequestStatus.dataset.state = "pending";
  } else if (request.status === "responded") {
    companionRequestStatus.textContent = `主人已回应: ${label}请求${ref}`;
    companionRequestStatus.dataset.state = "responded";
  } else {
    companionRequestStatus.textContent = `请求已过期: ${label}请求${ref}`;
    companionRequestStatus.dataset.state = "expired";
  }
}

function updateCompanionSession(data) {
  const state = data && typeof data === "object" ? data : null;
  appState.companionSession = state;

  if (!companionSessionStatus) return;

  if (!state || state.is_active !== true) {
    companionSessionStatus.textContent = "陪伴会话: 未开始.";
    companionSessionStatus.dataset.state = "inactive";
    return;
  }

  const count = Number.isFinite(Number(state.interaction_count))
    ? Math.max(0, Math.trunc(Number(state.interaction_count)))
    : 0;
  const typeLabel = state.last_interaction_type === "touch"
    ? "真实摸头"
    : (state.last_interaction_type || "未知");
  companionSessionStatus.textContent =
    `陪伴会话: 进行中 · 互动 ${count} 次 · 最近互动: ${typeLabel}`;
  companionSessionStatus.dataset.state = "active";
}

async function pollState() {
  if (pollBusy || actionDepth > 0 || document.hidden) return;
  pollBusy = true;
  const epochAtStart = backendEpoch;

  // One poll cycle serves the state panel, the autonomy event stream, the
  // companion request and the ongoing companion session; no second timer is
  // created.
  const [stateResult, eventsResult, requestResult, sessionResult] =
    await Promise.allSettled([
      apiRequest("/api/state"),
      apiRequest(autonomyEventsUrl()),
      apiRequest("/api/companion/request"),
      apiRequest("/api/companion/session"),
    ]);

  try {
    if (stateResult.status !== "fulfilled") {
      throw stateResult.reason || new Error("状态请求失败.");
    }

    const data = stateResult.value;
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

  // Update request/session before processing events, so a stale invitation
  // for a request that was just responded to is ignored immediately. The
  // epoch guard prevents a poll that started before a touch from overwriting
  // the newer request/session state written by the touch response.
  applyCompanionPollResults({
    epochAtStart,
    currentEpoch: backendEpoch,
    requestResult,
    sessionResult,
    updateRequest: updateCompanionRequest,
    updateSession: updateCompanionSession,
  });

  if (eventsResult.status === "fulfilled") {
    processAutonomyEvents(eventsResult.value);
  } else if (eventsResult.reason && eventsResult.reason.status === 400) {
    // A cursor from an incompatible server generation: re-establish it.
    autonomyCursor = null;
  }

  flushPendingAutonomyEvent();
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

    if (data.companion_session) {
      updateCompanionSession(data.companion_session);
    }

    const tier = meta.level ? TOUCH_TIER_LABEL[meta.level] : "摸头";
    updateLastEvent(`真实摸头 · ${tier} · amount ${amount}`);

    if (data.request_accepted && data.companion_request) {
      const request = data.companion_request;
      const label = request.action === "seek_comfort" ? "安慰" : "陪伴";
      const text = request.action === "seek_comfort"
        ? "谢谢主人来安慰我，tianbao 心里暖暖的~"
        : "嘿嘿，谢谢主人回应我！tianbao 好开心~";

      updateCompanionRequest({
        request,
        remaining_seconds: 0,
      });

      // The invitation has been accepted; do not let a pending invitation
      // bubble/animation play later.
      if (pendingAutonomyEvent
          && (pendingAutonomyEvent.action === "interact"
            || pendingAutonomyEvent.action === "seek_comfort")) {
        pendingAutonomyEvent = null;
      }

      updateLastEvent(`主人回应了${label}请求${request.id ? ` #${request.id}` : ""}`);
      if (appState.interaction.mode !== "speaking"
          && appState.interaction.mode !== "listening") {
        bubble.type({
          label: "tianbao",
          text,
          charDelay: 32,
          autoHideMs: 5200,
        });
      }
    } else {
      showServerEvent(data.event);
    }
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
   Manual autonomy tick (server-side decision, front-end preview only)
   ========================================================================== */

let autonomyInFlight = false;
let autonomyBlocked = false;

function setAutonomyBusy(busy) {
  const disabled = busy || autonomyBlocked;

  autonomyTick.disabled = disabled;
  autonomyCooldownReset.disabled = disabled;
  for (const button of autonomyPresetButtons) {
    button.disabled = disabled;
  }
}

/**
 * Show the result of one server-side decision. This never calls TTS or the
 * voice controller; the bubble explicitly marks the behaviour as simulated.
 */
function playAutonomyPreview(action) {
  const meta = AUTONOMY_META[action] || AUTONOMY_META.idle;

  cancelSimulation({ hideBubble: true });
  const token = beginInteraction("autonomy", {
    autonomyAction: action,
    autonomySource: "preview",
  });

  robot.setGaze(0);
  robot.setHeadTilt(meta.headTilt || 0, meta.headLift || 0);

  bubble.type({
    label: "自主行为 · 前端模拟",
    text: meta.bubble,
    charDelay: 34,
    autoHideMs: meta.duration,
  });

  updateLastEvent(`自主决策 · ${meta.label} · 前端动画模拟 · 未调用语音`);

  simTimer = window.setTimeout(() => {
    if (endInteractionIfCurrent(token)) {
      robot.setGaze(0);
      robot.setHeadTilt(0, 0);
    }
    simTimer = null;
  }, meta.duration);
}

/* ==========================================================================
   Automatic autonomy events (backend -> browser)
   ========================================================================== */

function autonomyEventsUrl() {
  if (autonomyCursor === null) return "/api/autonomy/events";
  return `/api/autonomy/events?after_id=${encodeURIComponent(autonomyCursor)}`;
}

function isInvitationStillRelevant(action, requestId) {
  return isInvitationStillRelevantPure(
    action,
    requestId,
    appState.companionRequest,
  );
}

function processAutonomyEvents(data) {
  if (!data || typeof data !== "object") return;

  const latestId = Number(data.latest_id);
  if (!Number.isInteger(latestId) || latestId < 0) return;

  if (autonomyCursor === null) {
    // First poll after opening the page: start at the current head, never
    // replay events that happened before the page was opened.
    autonomyCursor = latestId;
    return;
  }

  if (data.reset === true || latestId < autonomyCursor) {
    // The backend restarted and event ids reset, or the cursor is ahead.
    // Re-read the new buffer from its beginning on the next poll; old
    // pending events from the previous server generation are stale.
    autonomyCursor = 0;
    pendingAutonomyEvent = null;
    return;
  }

  const previousCursor = autonomyCursor;
  autonomyCursor = latestId;

  const events = Array.isArray(data.events) ? data.events : [];
  const fresh = events.filter((event) => {
    if (!event || typeof event.action !== "string") return false;
    if (!AUTONOMY_EVENT_ACTIONS.has(event.action)) return false;

    const id = Number(event.id);
    if (!Number.isInteger(id) || id <= previousCursor) return false;

    const requestId = event.request_id === null || event.request_id === undefined
      ? null
      : Number(event.request_id);
    return isInvitationStillRelevant(event.action, requestId);
  });

  if (!fresh.length) return;

  // Coalesce to one event per poll. A dropped/overflowed backlog keeps only
  // the newest event, so a burst never becomes a queue of stale bubbles.
  const backlog = data.dropped === true || fresh.length > 3;
  let chosen = fresh[fresh.length - 1];

  if (!backlog) {
    chosen = fresh[0];
    for (const event of fresh.slice(1)) {
      const priority = AUTONOMY_EVENT_PRIORITY[event.action] || 0;
      const chosenPriority = AUTONOMY_EVENT_PRIORITY[chosen.action] || 0;
      if (priority >= chosenPriority) chosen = event;
    }
  }

  queueAutonomyEvent(chosen);
}

function queueAutonomyEvent(event) {
  const priority = AUTONOMY_EVENT_PRIORITY[event.action] || 0;
  if (!priority) return;

  const now = performance.now();
  if (pendingAutonomyEvent && isAutonomyEventExpired(pendingAutonomyEvent, now)) {
    pendingAutonomyEvent = null;
  }

  // While the owner is busy, do not trade an important pending event for a
  // newer but lower-priority one.
  if (pendingAutonomyEvent && pendingAutonomyEvent.priority > priority) {
    return;
  }

  const requestId = event.request_id === null || event.request_id === undefined
    ? null
    : Number(event.request_id);

  pendingAutonomyEvent = {
    id: Number(event.id),
    action: event.action,
    message: typeof event.message === "string" ? event.message : "",
    requestId: Number.isInteger(requestId) ? requestId : null,
    priority,
    queuedAt: now,
  };
}

function autonomyEventTtl(action) {
  return AUTONOMY_EVENT_TTL_MS[action] || 4000;
}

function isAutonomyEventExpired(event, now = performance.now()) {
  return now - event.queuedAt > autonomyEventTtl(event.action);
}

function autonomyInteractionBusy() {
  if (document.hidden) return true;
  if (appState.view === "3d") return true;
  if (appState.interaction.mode !== "idle") return true;
  if (bubble.isVisible) return true;
  if (actionDepth > 0) return true;
  if (autonomyInFlight) return true;
  if (simTimer) return true;
  if (threeDPetActive) return true;
  if (voiceResponseActive) return true;
  if (voice.isRecording || voice.isPlaying) return true;

  const voiceState = voice.snapshot();
  return voiceState.isSpeaking || voiceState.state === "processing";
}

function flushPendingAutonomyEvent() {
  if (!pendingAutonomyEvent) return;

  if (!isInvitationStillRelevant(
    pendingAutonomyEvent.action,
    pendingAutonomyEvent.requestId,
  )) {
    updateLastEvent("邀请已被回应或替换，跳过过期邀请事件.");
    pendingAutonomyEvent = null;
    return;
  }

  const now = performance.now();
  if (isAutonomyEventExpired(pendingAutonomyEvent, now)) {
    updateLastEvent(`自主事件已过期，跳过: ${pendingAutonomyEvent.action}`);
    pendingAutonomyEvent = null;
    return;
  }

  if (autonomyInteractionBusy()) return;

  const event = pendingAutonomyEvent;
  pendingAutonomyEvent = null;
  playAutonomyEvent(event);
}

function playAutonomyEvent(event) {
  const meta = AUTONOMY_META[event.action];
  if (!meta) return;

  // Deliberately do not call cancelSimulation(): a background event must
  // never cancel an owner interaction. autonomyInteractionBusy() has already
  // established that no interaction is active.
  const token = beginInteraction("autonomy", {
    autonomyAction: event.action,
    autonomySource: "event",
  });

  robot.setGaze(0);
  robot.setHeadTilt(meta.headTilt || 0, meta.headLift || 0);

  bubble.type({
    label: "tianbao",
    text: event.message || meta.bubble,
    charDelay: 34,
    autoHideMs: meta.duration,
  });

  updateLastEvent(`自主事件 #${event.id} · ${meta.label}`);

  simTimer = window.setTimeout(() => {
    if (endInteractionIfCurrent(token)) {
      robot.setGaze(0);
      robot.setHeadTilt(0, 0);
    }
    simTimer = null;
    flushPendingAutonomyEvent();
  }, meta.duration);
}

async function runAutonomyTick() {
  if (autonomyInFlight || autonomyBlocked) return;

  autonomyInFlight = true;
  setAutonomyBusy(true);
  clearDebugError();
  autonomyStatus.textContent = "正在请求后端执行一次自主决策...";
  actionDepth += 1;
  backendEpoch += 1;

  try {
    const data = await apiRequest("/api/debug/autonomy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tianbao-Debug": "1",
      },
      body: "{}",
    });

    if (!data || typeof data.action !== "string") {
      throw new Error("后端返回的自主决策格式不正确.");
    }
    if (!applyBackendState(data.state)) {
      throw new Error("后端返回的状态格式不正确.");
    }

    setOnline(true);
    if (connectionErrorShown) clearDebugError();

    const meta = AUTONOMY_META[data.action] || AUTONOMY_META.idle;
    const cooldown = Number(data.cooldown_remaining);
    const cooldownText = Number.isFinite(cooldown) && cooldown > 0
      ? ` · 主动互动冷却剩余 ${Math.ceil(cooldown)}s`
      : "";

    // executed === false means the decision was deduplicated, typically
    // because a same-action companion request is still pending. Keep the
    // decision text but never replay a new invitation preview.
    if (data.executed === false) {
      autonomyStatus.textContent = "已有待回应请求，未重复发起.";
    } else {
      autonomyStatus.textContent = `上次决策: ${meta.label}${cooldownText}.`;
      playAutonomyPreview(data.action);
    }
  } catch (error) {
    const message = friendlyError(error);

    if (error.status === 403) {
      autonomyBlocked = true;
      autonomyStatus.textContent = "调试接口仅限本机访问.";
      showDebugError(message);
    } else {
      setOnline(false);
      autonomyStatus.textContent = "自主决策失败.";
      showConnectionError(`自主决策请求失败: ${message}`);
    }
  } finally {
    actionDepth -= 1;
    autonomyInFlight = false;
    setAutonomyBusy(false);
  }
}

async function applyAutonomyPreset(presetKey) {
  const label = AUTONOMY_PRESET_META[presetKey];
  if (!label || autonomyInFlight || autonomyBlocked) return;

  autonomyInFlight = true;
  setAutonomyBusy(true);
  clearDebugError();
  autonomyPresetStatus.textContent = `正在应用预设: ${label}...`;
  actionDepth += 1;
  backendEpoch += 1;

  try {
    const data = await apiRequest("/api/debug/state/preset", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tianbao-Debug": "1",
      },
      body: JSON.stringify({ preset: presetKey }),
    });

    if (!data || typeof data.preset !== "string") {
      throw new Error("后端返回的状态预设格式不正确.");
    }
    if (!applyBackendState(data.state)) {
      throw new Error("后端返回的状态格式不正确.");
    }

    setOnline(true);
    if (connectionErrorShown) clearDebugError();

    const energyText = appState.backend.energy === null
      ? "--" : appState.backend.energy.toFixed(1);
    const socialText = appState.backend.socialNeed === null
      ? "--" : appState.backend.socialNeed.toFixed(1);
    const cooldown = Number(data.cooldown_remaining);
    const cooldownText = Number.isFinite(cooldown) && cooldown > 0
      ? ` · 主动互动冷却剩余 ${Math.ceil(cooldown)}s`
      : "";
    autonomyPresetStatus.textContent =
      `已应用: ${label} · 精力 ${energyText} · 社交 ${socialText}${cooldownText}.`;

    for (const button of autonomyPresetButtons) {
      const active = button.dataset.autonomyPreset === presetKey;
      button.classList.toggle("is-on", active);
      button.setAttribute("aria-pressed", String(active));
    }

    updateLastEvent(`状态预设 · ${label} · 未执行行为`);
  } catch (error) {
    const message = friendlyError(error);

    if (error.status === 403) {
      autonomyBlocked = true;
      autonomyPresetStatus.textContent = "调试接口仅限本机访问.";
      showDebugError(message);
    } else {
      setOnline(false);
      autonomyPresetStatus.textContent = "状态预设应用失败.";
      showConnectionError(`状态预设请求失败: ${message}`);
    }
  } finally {
    actionDepth -= 1;
    autonomyInFlight = false;
    setAutonomyBusy(false);
  }
}

async function resetAutonomyCooldown() {
  if (autonomyInFlight || autonomyBlocked) return;

  autonomyInFlight = true;
  setAutonomyBusy(true);
  clearDebugError();
  autonomyStatus.textContent = "正在重置主动互动冷却...";
  actionDepth += 1;

  try {
    const data = await apiRequest("/api/debug/autonomy/reset", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tianbao-Debug": "1",
      },
      body: "{}",
    });

    if (!data || data.reset !== true) {
      throw new Error("后端返回的重置结果格式不正确.");
    }

    setOnline(true);
    if (connectionErrorShown) clearDebugError();

    const remaining = Number(data.cooldown_remaining);
    autonomyStatus.textContent = Number.isFinite(remaining)
      ? `主动互动冷却已重置 (剩余 ${Math.ceil(remaining)}s).`
      : "主动互动冷却已重置.";
    updateLastEvent("调试 · 已重置主动互动冷却 · 状态未改变");
  } catch (error) {
    const message = friendlyError(error);

    if (error.status === 403) {
      autonomyBlocked = true;
      autonomyStatus.textContent = "调试接口仅限本机访问.";
      showDebugError(message);
    } else {
      setOnline(false);
      autonomyStatus.textContent = "重置冷却失败.";
      showConnectionError(`重置冷却请求失败: ${message}`);
    }
  } finally {
    actionDepth -= 1;
    autonomyInFlight = false;
    setAutonomyBusy(false);
  }
}

async function refreshAutonomyStatus() {
  try {
    const data = await apiRequest("/api/debug/autonomy");
    if (!data || !data.enabled) return;

    const cooldown = Number(data.cooldown_remaining);
    if (Number.isFinite(cooldown) && cooldown > 0) {
      autonomyStatus.textContent = `主动互动冷却剩余 ${Math.ceil(cooldown)}s.`;
    }
  } catch (error) {
    if (error.status === 403) {
      autonomyBlocked = true;
      setAutonomyBusy(false);
      autonomyStatus.textContent = "调试接口仅限本机访问.";
    }
  }
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
  dbgEnergy.textContent = backend.energy === null ? "--" : backend.energy.toFixed(1);
  dbgSocial.textContent = backend.socialNeed === null ? "--" : backend.socialNeed.toFixed(1);
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

  if (interaction.mode === "autonomy") {
    const meta = AUTONOMY_META[interaction.autonomyAction];
    const suffix = interaction.autonomySource === "event" ? "自动" : "模拟";
    return `自主${meta ? meta.label : "行为"} · ${suffix}`;
  }
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
   Furniture interactions + charging (2D / 3D shared)
   ========================================================================== */

function setFurnitureStatus(text, { announce = true } = {}) {
  if (furnitureStatus) furnitureStatus.textContent = text;
  if (announce) updateLastEvent(text);
}

function applyFurnitureVisuals() {
  worldRoot.classList.toggle("is-cozy", furnitureState.sofa);
  isoSofa?.classList.toggle("is-cozy", furnitureState.sofa);
  worldRoot.classList.toggle("is-lamp-off", !furnitureState.lampOn);
  isoLamp?.classList.toggle("is-off", !furnitureState.lampOn);
  isoMediaConsole?.classList.toggle("is-music-on", furnitureState.media);
}

function isTypingTarget(target) {
  return target instanceof Element
    && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function updateNearbyInteraction() {
  let next = null;
  if (appState.view === "iso" && world.active) {
    const dock = world.getDockState();
    if (!dock.docked && !dock.docking) {
      next = nearestIsoInteraction(appState.move.x, appState.move.y);
    }
  }
  if (isoNearbyPrompt) {
    isoNearbyPrompt.hidden = !next;
    if (next && isoNearbyText) isoNearbyText.textContent = next.prompt;
  }
  if (isoNearbyDebug) isoNearbyDebug.textContent = nearbyInteractionLabel(next);
  worldRoot.classList.toggle("has-nearby-interaction", Boolean(next));
  return next;
}

function pressEInteraction() {
  if (appState.view !== "iso" || skinPanelOpen || panelOpen) return false;
  if (appState.interaction.mode !== "idle") return false;
  const nearby = updateNearbyInteraction();
  if (!nearby) {
    setFurnitureStatus("附近没有可互动的家具，再走近一点试试.", { announce: false });
    return false;
  }
  runFurnitureAction(nearby.id, { fromKeyboard: true });
  return true;
}

function showIsoFurnitureBubble(text, label = "tianbao", autoHideMs = 4200) {
  if (!worldRoot || worldRoot.hidden) return;
  if (appState.interaction.mode === "speaking" || appState.interaction.mode === "listening") {
    return;
  }
  if (furnitureBubbleTimer) clearTimeout(furnitureBubbleTimer);
  world.setBubble({ label, text, visible: true });
  furnitureBubbleTimer = window.setTimeout(() => {
    furnitureBubbleTimer = null;
    world.setBubble({ label: "", text: "", visible: false });
  }, autoHideMs);
}

function runFurnitureAction(action, { fromKeyboard = true } = {}) {
  const valid = new Set(["sofa", "lamp", "plant", "media", "table", "charger"]);
  if (!valid.has(action)) return;

  if (action === "charger") {
    requestReturnDock("interaction");
    setFurnitureStatus("已请求无线充电座接管移动.");
    return;
  }

  if (appState.view !== "iso") {
    setView("iso");
  }
  if (teaTimer && action === "table") {
    clearTimeout(teaTimer);
    teaTimer = null;
  }

  if (action === "sofa") {
    furnitureState.sofa = !furnitureState.sofa;
    applyFurnitureVisuals();
    setFurnitureStatus(furnitureState.sofa ? "沙发互动：暖灯和软垫准备好了." : "沙发互动已收起.");
    showIsoFurnitureBubble(
      furnitureState.sofa
        ? "沙发软乎乎的，我们一起窝一会儿吧~"
        : "沙发先给你留着，想坐的时候再叫我。",
    );
  } else if (action === "lamp") {
    furnitureState.lampOn = !furnitureState.lampOn;
    applyFurnitureVisuals();
    setFurnitureStatus(`落地灯已${furnitureState.lampOn ? "打开" : "关闭"}.`);
    showIsoFurnitureBubble(
      furnitureState.lampOn ? "灯亮啦，屋里又暖回来了~" : "把灯关小一点，晚上要慢慢安静下来啦。",
    );
  } else if (action === "plant") {
    furnitureState.plant = true;
    isoPlant?.classList.add("is-watered");
    applyFurnitureVisuals();
    setFurnitureStatus("绿植浇水动画 · 叶片上的小水雾出现了.");
    showIsoFurnitureBubble("喝饱水啦，叶子是不是更精神了？");
    window.setTimeout(() => {
      furnitureState.plant = false;
      isoPlant?.classList.remove("is-watered");
    }, 1800);
  } else if (action === "media") {
    furnitureState.media = !furnitureState.media;
    applyFurnitureVisuals();
    setFurnitureStatus(furnitureState.media ? "唱片机开始转动，音符飘出来了." : "唱片机已暂停.");
    showIsoFurnitureBubble(
      furnitureState.media ? "这张唱片是留给晚上的，一起听一小段吧~" : "音乐收起来啦，房间又安静了。",
    );
  } else if (action === "table") {
    furnitureState.table = true;
    isoTable?.classList.add("is-tea");
    applyFurnitureVisuals();
    setFurnitureStatus("茶几上的热茶正在冒热气.");
    showIsoFurnitureBubble("给你留了一杯热茶，捧一会儿手就不冷啦。");
    teaTimer = window.setTimeout(() => {
      furnitureState.table = false;
      isoTable?.classList.remove("is-tea");
      teaTimer = null;
    }, 6500);
  }
}


/* ==========================================================================
   Wireless charging
   ========================================================================== */

function energyValue() {
  return appState.backend.energy === null ? 0 : appState.backend.energy;
}

function dockStateForView(view) {
  if (view === "3d" && home3d) return home3d.getState();
  if (view === "iso") return world.getDockState();
  return { docked: false, docking: false, charging: false };
}

function currentDockState() {
  return dockStateForView(appState.view);
}

function chargingLabelState() {
  const energy = energyValue();
  const dock = currentDockState();
  const inCharge = chargeSession.active && chargeSession.view === appState.view;
  if (dock.docked && energy >= 99.95) {
    return { phase: "full", label: "已充满 · 可以出发啦", percent: energy };
  }
  return chargingStateFor({
    energy,
    docked: Boolean(dock.docked),
    charging: Boolean(inCharge),
  });
}

function updateChargeUI() {
  const energy = energyValue();
  const dock = currentDockState();
  const state = chargingLabelState();
  const isCharging = state.phase === "charging";

  if (debugChargeEnergy) debugChargeEnergy.textContent = `${energy.toFixed(1)}%`;
  if (debugChargeStatus) {
    const suffix = dock.docking ? " · 正在归位"
      : dock.docked ? " · 已接管移动"
        : "";
    debugChargeStatus.textContent = `${state.label}${suffix}`;
  }
  if (isoChargeStatus) {
    isoChargeStatus.textContent = state.label + (dock.docked ? " · 已接管" : "");
  }
  if (isoChargeHud) isoChargeHud.classList.toggle("is-charging", isCharging);
  if (debugLeaveDock) debugLeaveDock.disabled = !(dock.docked || dock.docking);
  if (isoChargePad) {
    isoChargePad.classList.toggle("is-active", Boolean(dock.docked || dock.docking));
    isoChargePad.classList.toggle("is-charging", isCharging);
  }
}

async function chargeTick() {
  const session = chargeSession;
  if (!session.active || session.inFlight) return;
  if (document.hidden) {
    stopCharging({ reason: "hidden", silent: true });
    return;
  }
  const dock = dockStateForView(session.view);
  if (!dock.docked) {
    stopCharging({ reason: "left-dock" });
    return;
  }

  session.inFlight = true;
  actionDepth += 1;
  backendEpoch += 1;
  try {
    const data = await apiRequest("/api/charge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (data && data.state) applyBackendState(data.state);
    setOnline(true);
    if (connectionErrorShown) clearDebugError();
    if (session.view === "3d" && home3d) {
      home3d.setEnergy(energyValue());
    }
    updateChargeUI();
    if (data && data.full === true) {
      stopCharging({ full: true });
      updateLastEvent(`无线充电完成 · 精力 ${energyValue().toFixed(1)}%`);
    }
  } catch (error) {
    if (session.active) {
      setOnline(false);
      showConnectionError(`充电请求失败: ${friendlyError(error)}`);
      stopCharging({ reason: "error" });
    }
  } finally {
    session.inFlight = false;
    if (session === chargeSession) session.inFlight = false;
    actionDepth -= 1;
  }
}

function startCharging(view) {
  if (chargeSession.active && chargeSession.view === view) return;
  if (chargeSession.active) stopCharging({ silent: true });

  const energy = energyValue();
  if (energy >= 99.95) {
    chargeSession = { active: false, view, timer: null, inFlight: false, full: true };
    if (view === "iso") world.setCharging(false);
    if (view === "3d" && home3d) home3d.setCharging(false);
    updateChargeUI();
    updateLastEvent("已停靠在充电座 · 电量已满");
    return;
  }

  chargeSession = {
    active: true,
    view,
    timer: null,
    inFlight: false,
    full: false,
  };
  lowEnergyAutoReturnArmed = false;
  if (view === "iso") world.setCharging(true);
  if (view === "3d" && home3d) home3d.setCharging(true);
  updateChargeUI();
  chargeSession.timer = window.setInterval(chargeTick, CHARGE_TICK_MS);
  chargeTick();
}

function stopCharging({ full = false, silent = false, reason = "" } = {}) {
  const view = chargeSession.view;
  if (chargeSession.timer) {
    clearInterval(chargeSession.timer);
    chargeSession.timer = null;
  }
  chargeSession = {
    active: false,
    view,
    timer: null,
    inFlight: false,
    full: Boolean(full || chargeSession.full),
  };
  if (view === "iso" && world?.getDockState) world.setCharging(false);
  if (view === "3d" && home3d) home3d.setCharging(false);
  updateChargeUI();
  if (!silent) {
    updateLastEvent(full ? "无线充电完成，充电座仍保持停靠状态." : `已停止充电${reason ? ` · ${reason}` : ""}.`);
  }
}

function handleDockChange(view, event) {
  if (view === "iso" && appState.view !== "iso") return;
  if (view === "3d" && appState.view !== "3d") return;
  if (!event) return;

  if (event.docked) {
    lowEnergyAutoReturnArmed = false;
    updateLastEvent(view === "iso" ? "2.5D · 已自动归位到无线充电座" : "3D · 已自动归位到无线充电座");
    startCharging(view);
    if (view === "iso") {
      showIsoFurnitureBubble("找到充电座啦，接下来交给我自己就好~", "tianbao", 3200);
    }
  } else {
    if (chargeSession.active && chargeSession.view === view) {
      stopCharging({ reason: event.reason || "undock" });
    }
    updateChargeUI();
  }
}

function maybeAutoReturnCharging() {
  if (appState.backend.energy === null || appState.backend.energy === undefined) return;
  const energy = energyValue();
  if (energy > AUTO_RETURN_THRESHOLD) lowEnergyAutoReturnArmed = true;
  if (!autoReturnEnabled || !lowEnergyAutoReturnArmed) return;
  if (energy > AUTO_RETURN_THRESHOLD) return;
  if (chargeSession.active) return;
  if (document.hidden) return;
  if (appState.interaction.mode !== "idle") return;
  if (actionDepth > 0 || autonomyInFlight) return;

  if (appState.view === "iso" && world.active) {
    const state = world.getDockState();
    if (state.docked || state.docking) return;
    if (world.returnToDock("auto")) {
      lowEnergyAutoReturnArmed = false;
      updateLastEvent("低电量 · 自动归位程序接管，正在回充.");
      showIsoFurnitureBubble("电量有点低啦，我先自己回充电座~");
      updateChargeUI();
    }
  } else if (appState.view === "3d" && home3d) {
    const state = home3d.getState();
    if (state.docked || state.docking) return;
    if (home3d.returnToDock("auto")) {
      lowEnergyAutoReturnArmed = false;
      updateLastEvent("3D · 低电量自动归位程序接管.");
      updateChargeUI();
    }
  }
}

function resumeSceneCharging(view) {
  if (view === "iso" && world.active) {
    const state = world.getDockState();
    if (state.docked) startCharging("iso");
    else maybeAutoReturnCharging();
  } else if (view === "3d" && home3d) {
    const state = home3d.getState();
    if (state.docked) startCharging("3d");
    else maybeAutoReturnCharging();
  }
}

function requestReturnDock(trigger = "button") {
  lowEnergyAutoReturnArmed = false;
  if (appState.view === "3d" && home3d) {
    home3d.returnToDock(trigger);
    updateLastEvent("3D · 已请求回充.");
  } else if (appState.view === "iso") {
    world.returnToDock(trigger);
    updateLastEvent("2.5D · 已请求回充.");
  } else {
    setView("iso");
    window.requestAnimationFrame(() => {
      world.returnToDock(trigger);
      updateLastEvent("已切换到 2.5D 小屋并请求回充.");
    });
  }
  setFurnitureStatus("回充指令已发出，充电座将接管归位和移动.", { announce: false });
  updateChargeUI();
}

function leaveChargeDock() {
  if (appState.view === "3d" && home3d) {
    home3d.leaveDock("button");
  } else if (appState.view === "iso") {
    world.leaveDock("button");
  }
  if (chargeSession.active) stopCharging({ reason: "leave-dock" });
  lowEnergyAutoReturnArmed = false;
  updateChargeUI();
  updateLastEvent("已离开充电座.");
}

/* ==========================================================================
   Lazy 3D loader
   ========================================================================== */

function updateCameraModeUI(mode) {
  if (cameraSimPreview) cameraSimPreview.classList.toggle("is-live", mode === "camera");
  if (cameraStatus) {
    cameraStatus.textContent = mode === "camera"
      ? "tianbao 第一视角 · REC 中；WASD 移动，方向键或拖动环视，不读取真实摄像头。"
      : "第一人称仿真画面已接通，点击下方按钮进入 REC 模式。";
  }
  if (mode === "camera") {
    updateLastEvent("3D · tianbao 第一视角 · REC 实时渲染");
  }
}

function createHome3DCallbacks() {
  return {
    onDockChange: (event) => handleDockChange("3d", event),
    onPetStart: ({ level }) => {
      threeDPetActive = true;
      beginTouch(level, "3d");
    },
    onPetLevel: ({ level }) => changeTouchLevel(level),
    onPetEnd: (meta) => {
      threeDPetActive = false;
      finishTouch({ ...meta, source: "3d" });
    },
    onPetCancel: () => {
      threeDPetActive = false;
      cancelTouch("3d");
    },
    onModeChange: (mode) => updateCameraModeUI(mode),
    onRoomChange: (room) => {
      if (room && appState.view === "3d") {
        updateLastEvent(`3D 位置 · ${room.name}`);
      }
    },
    onStatus: () => {},
  };
}

function showHome3DLoadFailure(error) {
  const loading = home3dRoot?.querySelector("#home3dLoading");
  const fallback = home3dRoot?.querySelector("#home3dFallback");
  if (loading) {
    loading.classList.add("is-hidden");
    loading.hidden = true;
  }
  if (fallback) fallback.hidden = false;
  if (cameraStatus) cameraStatus.textContent = "3D 渲染加载失败，2.5D 场景仍可正常使用。";
  if (error) console.error("tianbao home3d load:", error);
  if (error) showDebugError(`3D 场景加载失败: ${friendlyError(error)}`);
}

function ensureHome3D() {
  if (home3d) {
    if (appState.view === "3d") home3d.activate();
    return Promise.resolve(home3d);
  }
  if (home3dFailed) return Promise.resolve(null);
  if (home3dPromise) return home3dPromise;

  home3dPromise = import("./home3d.js?v=0.7.1")
    .then((module) => {
      if (!module || typeof module.Home3D !== "function") {
        throw new Error("Home3D 模块格式不正确.");
      }
      const instance = new module.Home3D({
        root: home3dRoot,
        theme: currentSkinTheme,
        callbacks: createHome3DCallbacks(),
      });
      if (!instance.mount()) {
        throw new Error("WebGL 渲染器初始化失败.");
      }
      home3d = instance;
      home3dRoot.__home3d = instance;
      home3d.setEnergy(energyValue());
      home3d.setFace(robot.currentEye || "open", robot.currentMouth || "smile");
      if (appState.view === "3d") {
        home3d.activate();
        resumeSceneCharging("3d");
      }
      if (cameraStatus) cameraStatus.textContent = "tianbao 第一视角已接通；WASD 移动，方向键或拖动环视。";
      return home3d;
    })
    .catch((error) => {
      home3dFailed = true;
      showHome3DLoadFailure(error);
      return null;
    })
    .finally(() => {
      home3dPromise = null;
    });
  return home3dPromise;
}

async function open3DCamera() {
  if (appState.view !== "3d") setView("3d");
  const instance = await ensureHome3D();
  if (!instance) {
    showConnectionError("tianbao 第一视角加载失败，请检查浏览器 WebGL 或刷新页面.");
    return;
  }
  if (appState.view !== "3d") return;
  instance.activate();
  instance.setMode("camera");
  updateCameraModeUI("camera");
  if (panelOpen) closePanel();
}

/* ==========================================================================
   Views: robot / 2.5D room / 3D home
   ========================================================================== */

function setView(view) {
  if (!["robot", "iso", "3d"].includes(view) || appState.view === view) return;

  if (skinPanelOpen) closeSkinPanel({ restoreFocus: false });
  cancelSimulation({ hideBubble: true });
  if (furnitureBubbleTimer) {
    clearTimeout(furnitureBubbleTimer);
    furnitureBubbleTimer = null;
  }
  world.setBubble({ label: "", text: "", visible: false });

  const previousView = appState.view;
  if (previousView === "iso" || previousView === "3d") {
    stopCharging({ silent: true });
  }
  if (previousView === "iso") world.deactivate();
  if (previousView === "3d" && home3d) home3d.deactivate();
  if (previousView === "3d") {
    cameraSimPreview?.classList.remove("is-live");
    if (cameraStatus) cameraStatus.textContent = "3D 已暂停；再次打开会恢复之前的视角。";
  }

  appState.view = view;
  document.body.dataset.view = view;

  stage.hidden = view !== "robot";
  worldRoot.hidden = view !== "iso";
  home3dRoot.hidden = view !== "3d";

  for (const tab of viewTabs) {
    const active = tab.dataset.view === view;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  }

  if (view === "iso") {
    world.setFace(robot.currentEye || "open", robot.currentMouth || "smile");
    world.setExpression(resolveExpression());
    world.activate();
    updateChargeUI();
    updateNearbyInteraction();
    window.requestAnimationFrame(() => {
      if (appState.view === "iso") {
        resumeSceneCharging("iso");
        updateNearbyInteraction();
      }
    });
  }

  if (view === "3d") {
    ensureHome3D().then((instance) => {
      if (!instance || appState.view !== "3d") return;
      instance.activate();
      instance.setEnergy(energyValue());
      updateCameraModeUI(instance.getState().mode);
      resumeSceneCharging("3d");
    });
  }

  if (view !== "iso") updateNearbyInteraction();
  updateActionAvailability();
  updateHud();
  updateHudVisibility();
  updateChargeUI();
  updateLastEvent(`切换到 ${view === "robot" ? "机器人" : view === "iso" ? "2.5D 小屋" : "3D 大平层"} 视图.`);
}

function updateActionAvailability() {
  const iso = appState.view === "iso";
  const is3d = appState.view === "3d";
  if (actionModeNote) {
    actionModeNote.textContent = iso
      ? "2.5D 小屋已激活 · 可以控制 tianbao 移动."
      : is3d
        ? "3D 大平层已激活 · 点击地面移动，或打开仿真摄像头."
        : "切换到 2.5D 小屋或 3D 大平层后可用.";
    actionModeNote.classList.toggle("is-ready", iso || is3d);
  }
  if (actionGotoIso) actionGotoIso.hidden = iso;
  if (actionGoto3d) actionGoto3d.hidden = is3d;
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
  return respondWithText(VOICE_RESPONSE_TEXT);
}

/* ---------------- speech timing + remote fallback ---------------- */

function formatSpeechSeconds(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) return "—";
  return `${(value / 1000).toFixed(2)}s`;
}

function setSpeechMetricsText(text, {
  kind = "",
  title = "",
  token = speechMetricsToken,
} = {}) {
  if (token !== speechMetricsToken) return;
  for (const element of [speechMetrics, isoSpeechMetrics]) {
    if (!element) continue;
    element.hidden = !text;
    element.textContent = text;
    if (kind) element.dataset.kind = kind;
    else element.removeAttribute("data-kind");
    if (title) element.title = title;
    else element.removeAttribute("title");
  }
}

function clearSpeechMetrics() {
  speechMetricsToken += 1;
  for (const element of [speechMetrics, isoSpeechMetrics]) {
    if (!element) continue;
    element.hidden = true;
    element.textContent = "";
    element.removeAttribute("title");
    element.removeAttribute("data-kind");
  }
}

function remoteMetricsText(metrics, { phase = "done" } = {}) {
  const bits = [
    `生成 ${formatSpeechSeconds(metrics.generateMs)}`,
    `首声 ${formatSpeechSeconds(metrics.firstSoundMs)}`,
    `缓存 ${metrics.cache || "—"}`,
    phase === "done" ? `播放 ${formatSpeechSeconds(metrics.playbackMs)}` : "播放中",
  ];
  return bits.join(" · ");
}

function browserMetricsText(metrics, { phase = "done", fallback = false } = {}) {
  const bits = [
    fallback ? "备用语音" : "浏览器语音",
    `首声 ${formatSpeechSeconds(metrics.firstSoundMs)}`,
    phase === "done" ? `播放 ${formatSpeechSeconds(metrics.playbackMs)}` : "播放中",
  ];
  return bits.join(" · ");
}

function showRemoteMetrics(metrics, { phase = "done", token = speechMetricsToken } = {}) {
  const titleBits = [];
  if (Number.isFinite(metrics.generateMs)) {
    titleBits.push(`服务端推理 ${formatSpeechSeconds(metrics.generateMs)}`);
  }
  if (Number.isFinite(metrics.serverTotalMs)) {
    titleBits.push(`服务端总耗时 ${formatSpeechSeconds(metrics.serverTotalMs)}`);
  }
  if (Number.isFinite(metrics.requestMs)) {
    titleBits.push(`WAV 就绪 ${formatSpeechSeconds(metrics.requestMs)}`);
  }
  if (Number.isFinite(metrics.endToEndMs)) {
    titleBits.push(`端到端 ${formatSpeechSeconds(metrics.endToEndMs)}`);
  }
  if (Number.isFinite(metrics.bytes)) {
    titleBits.push(`${Math.round(metrics.bytes / 1024)} KB`);
  }
  titleBits.push("生成 = 服务端推理; 首声 = 从决定朗读到实际出声 (含请求/解码)");
  setSpeechMetricsText(remoteMetricsText(metrics, { phase }), {
    kind: "remote",
    title: titleBits.join(" · "),
    token,
  });
}

function showBrowserMetrics(metrics, {
  phase = "done",
  fallback = false,
  token = speechMetricsToken,
  note = "",
} = {}) {
  const titleBits = ["首声 = 从决定朗读到浏览器语音开始 (含远程失败等待)"];
  if (Number.isFinite(metrics.endToEndMs)) {
    titleBits.push(`端到端 ${formatSpeechSeconds(metrics.endToEndMs)}`);
  }
  if (!voice.snapshot().speechSupported) {
    titleBits.push("当前浏览器没有可用的语音合成引擎, 仅显示文字");
  }
  if (note) titleBits.push(note);
  setSpeechMetricsText(browserMetricsText(metrics, { phase, fallback }), {
    kind: fallback ? "fallback" : "browser",
    title: titleBits.join(" · "),
    token,
  });
}

/**
 * Existing emotion state -> the four emotions supported by the voice service:
 * sad => comfort, calm => neutral, happy => happy, a recent head touch => shy.
 */
function ttsEmotionForSpeech() {
  if (appState.backend.emotion === "sad") return "comfort";
  if (appState.backend.emotion === "calm") return "neutral";
  if (performance.now() - lastTouchCompletedAt < 15000) return "shy";
  return "happy";
}

function selectedRemoteVoiceId() {
  if (ttsSelection.remoteVoiceId) return ttsSelection.remoteVoiceId;
  const preferred = remoteTTS.voices.find(
    (voice) => voice.id === remoteTTS.defaultVoiceId && voice.available
  );
  if (preferred) return preferred.id;
  const firstAvailable = remoteTTS.voices.find((voice) => voice.available);
  if (firstAvailable) return firstAvailable.id;
  // Before /voices has loaded (or when the list is unavailable), keep the
  // server's default id so the next sentence can still try it.
  return remoteTTS.defaultVoiceId || "";
}

function remoteVoiceName(voiceId) {
  const found = remoteTTS.getVoice(voiceId);
  return found ? found.name : (voiceId || "服务器默认音色");
}

function resolveSpeechPlan() {
  const local = voiceLibrary.getActiveVoice();
  if (ttsSelection.mode !== "remote") {
    return { mode: "local", local, fallback: false, unavailableReason: "" };
  }

  const voiceId = selectedRemoteVoiceId();
  const remoteVoice = voiceId ? remoteTTS.getVoice(voiceId) : null;
  let unavailableReason = "";
  if (!voiceId) {
    unavailableReason = "尚未选择服务器音色";
  } else if (remoteVoice && !remoteVoice.available) {
    unavailableReason = remoteVoice.reason || "服务器标记该音色不可用";
  }

  return {
    mode: "remote",
    voiceId,
    remoteVoice,
    local,
    fallback: Boolean(unavailableReason),
    unavailableReason,
  };
}

function setTTSRuntimeFallback(error) {
  const message = error && error.message ? error.message : "远程语音不可用";
  const code = error && error.code ? error.code : "remote";
  const status = error && Number.isFinite(Number(error.status)) ? Number(error.status) : null;
  const serviceLevel = !remoteTTS.available
    || code === "network"
    || code === "timeout"
    || code === "json"
    || (code === "http" && Number(status) >= 500);
  ttsRuntimeFallback = { message, code, status, serviceLevel, at: performance.now() };
  renderTTSServiceStatus();
  updateTtsStatus();

  const key = `${code}:${message}`;
  const now = performance.now();
  // The debug log is not a popup; even so, do not repeat the same failure
  // more than once every 30 seconds.
  if (key !== lastTTSFailureKey || now - lastTTSFailureAt > 30000) {
    lastTTSFailureKey = key;
    lastTTSFailureAt = now;
    updateLastEvent(`远程语音失败, 已切换备用语音: ${message}`);
  }

  // Refresh immediately so the panel reflects reality instead of waiting for
  // the next 15-second poll.
  remoteTTS.refresh({ force: true });
}

function clearTTSRuntimeFallback() {
  if (!ttsRuntimeFallback) return;
  ttsRuntimeFallback = null;
  renderTTSServiceStatus();
  updateTtsStatus();
}

async function speakWithBrowser(clean, plan, token, decisionAt, {
  fallback = false,
  note = "",
} = {}) {
  const timbre = plan.local || voiceLibrary.getActiveVoice();
  setSpeechMetricsText(
    fallback ? "备用语音准备中..." : "浏览器语音准备中...",
    {
      kind: fallback ? "fallback" : "browser",
      title: note,
      token,
    }
  );

  const spoken = await voice.speak(clean, timbre, {
    since: decisionAt,
    onFirstSound: (firstSoundMs) => {
      showBrowserMetrics(
        { firstSoundMs },
        { phase: "first", fallback, token, note }
      );
    },
  });

  if (!spoken) return false;
  const metrics = voice.lastSpeechMetrics || {};
  showBrowserMetrics(metrics, { phase: "done", fallback, token, note });
  return true;
}

async function speakCurrentText(clean, emotion, token, plan) {
  const decisionAt = performance.now();

  if (plan.mode === "local") {
    return speakWithBrowser(clean, plan, token, decisionAt, { fallback: false });
  }

  if (plan.fallback) {
    setTTSRuntimeFallback(new Error(plan.unavailableReason || "所选服务器音色不可用"));
    return speakWithBrowser(clean, plan, token, decisionAt, {
      fallback: true,
      note: plan.unavailableReason,
    });
  }

  setSpeechMetricsText("远程语音生成中...", {
    kind: "remote",
    title: `音色 ${remoteVoiceName(plan.voiceId)}`,
    token,
  });

  const result = await remoteTTS.speak(clean, {
    voiceId: plan.voiceId,
    emotion,
    cache: true,
    // If the service is currently known to be down, fail faster. The next
    // sentence still tries again, so recovery is picked up immediately.
    timeoutMs: remoteTTS.available ? 65000 : 12000,
    onFirstSound: (firstSoundMs, metrics) => {
      showRemoteMetrics({ ...metrics, firstSoundMs }, { phase: "first", token });
    },
    onPhase: (phase) => {
      if (phase === "requesting" || phase === "generating") {
        setSpeechMetricsText("远程语音生成中...", {
          kind: "remote",
          title: `音色 ${remoteVoiceName(plan.voiceId)}`,
          token,
        });
      } else if (phase === "ready") {
        setSpeechMetricsText("WAV 已就绪 · 播放中...", { kind: "remote", token });
      }
    },
  });

  if (result.cancelled) return false;
  if (result.ok) {
    clearTTSRuntimeFallback();
    showRemoteMetrics(result.metrics, { phase: "done", token });
    updateLastEvent(
      `远程语音 · ${remoteVoiceName(result.metrics.voiceId)} · 缓存 ${result.metrics.cache || "—"}`
    );
    return true;
  }

  setTTSRuntimeFallback(result.error);
  return speakWithBrowser(clean, plan, token, decisionAt, {
    fallback: true,
    note: result.error && result.error.message,
  });
}

async function respondWithText(text) {
  const clean = String(text || "").trim();
  if (!clean) return;

  cancelSimulation({ hideBubble: true });
  clearSpeechMetrics();
  const metricsToken = speechMetricsToken;

  const token = beginInteraction("speaking");
  const sim = ++simToken;
  voiceResponseActive = true;

  const plan = resolveSpeechPlan();
  const emotion = ttsEmotionForSpeech();
  const source = plan.mode === "remote"
    ? (plan.fallback
      ? `备用语音 (${remoteVoiceName(plan.voiceId)} 不可用)`
      : `远程语音 · ${remoteVoiceName(plan.voiceId)}`)
    : `浏览器内置 · ${plan.local.name}`;
  updateLastEvent(`语音输出 · ${source} · 情绪 ${emotion}`);

  const speechPromise = speakCurrentText(clean, emotion, metricsToken, plan);
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

  // Keep the timing line readable after playback stops. The bubble close
  // button still dismisses it immediately.
  const lingerMs = speechMetrics && !speechMetrics.hidden ? 3600 : 900;
  simTimer = window.setTimeout(() => {
    if (sim !== simToken) return;
    simTimer = null;
    voiceResponseActive = false;
    endInteractionIfCurrent(token);
    bubble.hide();
    clearSpeechMetrics();
    renderVoiceUI(voice.snapshot());
    updateLastEvent("语音输出结束, 已恢复当前情绪.");
  }, lingerMs);
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

function appendVoiceOption(parent, value, label, {
  disabled = false,
  title = "",
} = {}) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  option.disabled = Boolean(disabled);
  if (title) option.title = title;
  parent.append(option);
  return option;
}

/**
 * Rebuild the unified selector from /api/tts/voices + the existing browser
 * voices. Server voices are never hard-coded: a new directory on the server
 * appears after the next refresh. Unavailable voices stay visible but are
 * disabled, and a saved selection is always preserved.
 */
function syncTTSVoiceOptions({ force = false } = {}) {
  if (!ttsVoiceSelect) return;

  const localVoices = voiceLibrary.getVoices();
  let selectedRemoteId = selectedRemoteVoiceId();

  // First run: adopt the server default (or first available voice) and persist
  // it, so a reload keeps the same choice.
  if (ttsSelection.mode === "remote" && !ttsSelection.remoteVoiceId && selectedRemoteId) {
    ttsSelection = { ...ttsSelection, remoteVoiceId: selectedRemoteId };
    saveTTSSelection(ttsSelection);
    selectedRemoteId = ttsSelection.remoteVoiceId;
  }

  if (ttsSelection.mode === "local"
    && !localVoices.some((voice) => voice.key === ttsSelection.localKey)
    && localVoices.length) {
    ttsSelection = { ...ttsSelection, localKey: localVoices[0].key };
    saveTTSSelection(ttsSelection);
  }

  const signature = JSON.stringify({
    loading: remoteTTS.loading,
    checked: Boolean(remoteTTS.lastCheckedAt),
    defaultVoiceId: remoteTTS.defaultVoiceId,
    remote: remoteTTS.voices.map((voice) => [
      voice.id,
      voice.name,
      voice.description,
      voice.available,
      voice.reason,
    ]),
    local: localVoices.map((voice) => [
      voice.key,
      voice.name,
      voice.packName,
      Boolean(voice.custom),
    ]),
    mode: ttsSelection.mode,
    selectedRemoteId,
    localKey: ttsSelection.localKey,
  });

  if (!force && signature === ttsOptionsSignature) {
    const desired = ttsSelection.mode === "remote"
      ? `remote:${selectedRemoteId}`
      : `local:${ttsSelection.localKey}`;
    if (desired && ttsVoiceSelect.value !== desired) ttsVoiceSelect.value = desired;
    return;
  }

  // Do not yank the option list out from under an open dropdown; retry when
  // the user closes it.
  if (!force
    && document.activeElement === ttsVoiceSelect
    && signature !== ttsOptionsSignature) {
    ttsVoiceSelect.addEventListener("blur", () => {
      syncTTSVoiceOptions({ force: true });
    }, { once: true });
    return;
  }

  ttsOptionsSignature = signature;
  ttsVoiceSelect.textContent = "";

  const remoteGroup = document.createElement("optgroup");
  remoteGroup.label = "服务器音色 · MiniCPM-o";
  if (!remoteTTS.voices.length) {
    appendVoiceOption(
      remoteGroup,
      "",
      remoteTTS.loading || !remoteTTS.lastCheckedAt
        ? "正在加载服务器音色..."
        : "服务器音色暂不可用（使用备用语音）",
      { disabled: true, title: remoteTTS.reason || "" }
    );
  }
  if (selectedRemoteId && !remoteTTS.voices.some((voice) => voice.id === selectedRemoteId)) {
    // Keep the saved id visible even while /voices is unreachable. It is
    // disabled, so the user cannot newly choose it; when the server lists it
    // again this synthetic option is replaced by the real one.
    appendVoiceOption(
      remoteGroup,
      `remote:${selectedRemoteId}`,
      `${selectedRemoteId} · 当前不可用`,
      {
        disabled: true,
        title: "保存的选择仍会保留; 服务器重新提供该音色后会自动恢复.",
      }
    );
  }
  for (const voice of remoteTTS.voices) {
    const option = appendVoiceOption(
      remoteGroup,
      `remote:${voice.id}`,
      `${voice.name}${voice.available ? "" : " · 不可用"}`,
      {
        disabled: !voice.available,
        title: [
          voice.description,
          voice.available ? "" : `不可用原因: ${voice.reason || "服务器未说明"}`,
        ].filter(Boolean).join(" · "),
      }
    );
    option.dataset.voiceId = voice.id;
  }
  ttsVoiceSelect.append(remoteGroup);

  const localGroup = document.createElement("optgroup");
  localGroup.label = "浏览器内置 · 无需服务器";
  for (const voice of localVoices) {
    appendVoiceOption(
      localGroup,
      `local:${voice.key}`,
      `${voice.name} · ${voice.packName}${voice.custom ? " · 自定义" : ""}`,
      {
        title: `音高 ${voice.pitch.toFixed(2)} · 语速 ${voice.rate.toFixed(2)}`,
      }
    );
  }
  ttsVoiceSelect.append(localGroup);

  const desired = ttsSelection.mode === "remote"
    ? `remote:${selectedRemoteId}`
    : `local:${ttsSelection.localKey}`;
  if (desired) ttsVoiceSelect.value = desired;
  if (!desired && ttsVoiceSelect.options.length) ttsVoiceSelect.selectedIndex = 0;
}

function setLocalVoiceSelection(key) {
  if (!key) return;
  voiceLibrary.setActiveVoice(key);
  ttsSelection = { ...ttsSelection, mode: "local", localKey: key };
  saveTTSSelection(ttsSelection);
  ttsRuntimeFallback = null;
  syncTTSVoiceOptions({ force: true });
  renderTTSServiceStatus();
  updateTtsStatus();
}

function handleVoiceSelectionChange() {
  if (!ttsVoiceSelect) return;
  const value = ttsVoiceSelect.value || "";

  if (value.startsWith("remote:")) {
    const id = value.slice("remote:".length);
    if (!id) return;
    ttsSelection = { ...ttsSelection, mode: "remote", remoteVoiceId: id };
    saveTTSSelection(ttsSelection);
    ttsRuntimeFallback = null;
    renderTimbres();
    renderTTSServiceStatus();
    updateTtsStatus();
    updateLastEvent(`音色切换 · ${remoteVoiceName(id)} (服务器)`);
    return;
  }

  if (value.startsWith("local:")) {
    setLocalVoiceSelection(value.slice("local:".length));
    renderTimbres();
    updateLastEvent(`音色切换 · ${voiceLibrary.getActiveVoice().name} (浏览器内置)`);
  }
}

function renderTTSServiceStatus() {
  if (!ttsServiceBadge || !ttsServiceDetail) return;

  const snapshot = remoteTTS.snapshot();
  const plan = resolveSpeechPlan();
  const remoteMode = ttsSelection.mode === "remote";

  let badgeText = "检测中";
  let badgeState = "checking";
  if (snapshot.lastCheckedAt) {
    if (snapshot.available) {
      badgeText = `远程就绪 · ${snapshot.availableVoiceCount} 可用`;
      badgeState = "online";
    } else {
      badgeText = "远程不可用 · 备用语音";
      badgeState = "offline";
    }
  }
  ttsServiceBadge.textContent = badgeText;
  ttsServiceBadge.dataset.state = badgeState;

  const details = [];
  if (!snapshot.lastCheckedAt) {
    details.push("正在检测 /api/tts/status ...");
  } else if (snapshot.available) {
    details.push(
      `语音服务可用 · ${snapshot.voiceCount} 个音色`
      + (snapshot.defaultVoiceId ? ` · 默认 ${snapshot.defaultVoiceId}` : "")
    );
  } else {
    details.push(`语音服务不可用${snapshot.reason ? ` · ${snapshot.reason}` : ""}`);
  }

  if (remoteMode) {
    if (plan.unavailableReason) {
      details.push(`所选音色不可用: ${plan.unavailableReason} · 使用备用语音`);
    } else {
      details.push(`当前: ${remoteVoiceName(plan.voiceId)}`);
    }
  } else {
    details.push(`当前: 浏览器内置 · ${plan.local.name}`);
  }

  if (!voice.snapshot().speechSupported) {
    details.push("浏览器无语音合成, 备用时仅显示文字");
  }
  if (snapshot.lastCheckedAt) {
    const checked = new Date(snapshot.lastCheckedAt);
    details.push(`最近检测 ${checked.toLocaleTimeString("zh-CN", { hour12: false })}`);
  }

  ttsServiceDetail.textContent = details.join(" · ");

  const fallbackActive = remoteMode && (
    plan.fallback
    || Boolean(ttsRuntimeFallback)
    || (Boolean(snapshot.lastCheckedAt) && !snapshot.available)
  );
  if (ttsFallbackNotice) {
    ttsFallbackNotice.hidden = !fallbackActive;
    if (fallbackActive) {
      const reason = ttsRuntimeFallback
        ? ttsRuntimeFallback.message
        : (plan.unavailableReason || snapshot.reason || "远程语音不可用");
      ttsFallbackNotice.title = reason;
      ttsFallbackNotice.textContent = "正在使用备用语音";
    } else {
      ttsFallbackNotice.removeAttribute("title");
    }
  }
}

function updateTtsStatus() {
  if (!ttsStatus) return;
  const plan = resolveSpeechPlan();

  if (ttsSelection.mode === "remote") {
    const notes = [];
    if (!remoteTTS.lastCheckedAt) notes.push("正在检测语音服务");
    else if (plan.unavailableReason) notes.push("所选音色不可用 · 使用备用语音");
    else if (ttsRuntimeFallback) notes.push("正在使用备用语音");
    else if (!remoteTTS.available) notes.push("远程不可用 · 使用备用语音");
    else notes.push("远程语音就绪");
    ttsStatus.textContent = `当前音色: ${remoteVoiceName(plan.voiceId)} (服务器) · ${notes.join(" · ")}`;
    return;
  }

  const notes = [];
  if (!voice.snapshot().speechSupported) notes.push("浏览器无语音合成, 仅显示文字");
  ttsStatus.textContent = `当前音色: ${plan.local.name} (${plan.local.packName}) · 浏览器内置`
    + (notes.length ? ` · ${notes.join(" · ")}` : "");
}

function renderTimbres() {
  if (!timbreGrid) return;
  const localActiveKey = ttsSelection.mode === "local"
    ? voiceLibrary.getActiveVoice().key
    : "";
  timbreGrid.textContent = "";
  for (const voice of voiceLibrary.getVoices()) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `timbre-card${voice.key === localActiveKey ? " is-active" : ""}`;
    card.dataset.voiceKey = voice.key;
    card.setAttribute("role", "option");
    card.setAttribute("aria-selected", String(voice.key === localActiveKey));

    const name = document.createElement("span");
    name.className = "timbre-name";
    name.textContent = voice.name;
    const meta = document.createElement("span");
    meta.className = "timbre-meta";
    meta.textContent = `${voice.packName} · 高 ${voice.pitch.toFixed(2)} · 速 ${voice.rate.toFixed(2)}`;
    card.append(name, meta);

    card.addEventListener("click", () => {
      setLocalVoiceSelection(voice.key);
      renderTimbres();
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
  syncTTSVoiceOptions({ force: true });
  renderTimbres();
  renderVoicePacks();
  renderCustomVoices();
  updateTtsStatus();
  renderTTSServiceStatus();
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
  remoteTTS.cancel();
  voice.cancelSpeech();
  clearSpeechMetrics();
  ttsStatus.textContent = "已停止 tianbao 的语音输出.";
}

async function speakTypedText() {
  const text = ttsText.value.trim();
  if (!text) {
    ttsStatus.textContent = "先输入要让 tianbao 说的话.";
    ttsText.focus();
    return;
  }
  await respondWithText(text);
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

  if (tab === "voice") {
    renderVoiceLab();
    remoteTTS.refresh({ force: true });
  }
  if (tab === "action") updateActionAvailability();
  if (focus) {
    const target = panelTabs.find((button) => button.dataset.panelTab === tab);
    if (target) target.focus({ preventScroll: true });
  }
}

function openPanel(tab = null) {
  if (skinPanelOpen) closeSkinPanel({ restoreFocus: false });
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

actionGotoIso.addEventListener("click", () => {
  setView("iso");
  updateActionAvailability();
});
actionGoto3d?.addEventListener("click", () => {
  setView("3d");
  updateActionAvailability();
});
cameraButton.addEventListener("click", () => open3DCamera());
debugReturnDock?.addEventListener("click", () => requestReturnDock("debug"));
debugLeaveDock?.addEventListener("click", leaveChargeDock);
if (autoReturnToggle) {
  autoReturnToggle.checked = autoReturnEnabled;
  autoReturnToggle.addEventListener("change", () => {
    autoReturnEnabled = autoReturnToggle.checked;
    try {
      localStorage.setItem(AUTO_RETURN_STORAGE_KEY, autoReturnEnabled ? "1" : "0");
    } catch { /* localStorage may be unavailable */ }
    lowEnergyAutoReturnArmed = true;
    updateLastEvent(`低电量自动回充已${autoReturnEnabled ? "开启" : "关闭"}.`);
    if (autoReturnEnabled) maybeAutoReturnCharging();
  });
}
wireSkinPanel();

voiceToggle.addEventListener("click", handleVoiceToggle);
if (voiceToggle25d) voiceToggle25d.addEventListener("click", handleVoiceToggle);
voicePlayback.addEventListener("click", playUserRecording);
voiceRetry.addEventListener("click", respondWithVoice);
voiceDebugRecord.addEventListener("click", handleVoiceToggle);
voiceDebugPlay.addEventListener("click", playUserRecording);
voiceDebugRespond.addEventListener("click", respondWithVoice);
autonomyTick.addEventListener("click", runAutonomyTick);
autonomyCooldownReset.addEventListener("click", resetAutonomyCooldown);
autonomyPresetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    applyAutonomyPreset(button.dataset.autonomyPreset);
  });
});

ttsSpeak.addEventListener("click", speakTypedText);
ttsStop.addEventListener("click", stopVoiceOutput);
if (ttsVoiceSelect) {
  ttsVoiceSelect.addEventListener("change", handleVoiceSelectionChange);
}
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
  if (event.key === "Escape") {
    if (skinPanelOpen) {
      event.preventDefault();
      closeSkinPanel();
      return;
    }
    if (panelOpen) {
      event.preventDefault();
      closePanel();
    }
    return;
  }

  if (event.code !== "KeyE" || event.repeat || event.isComposing) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (isTypingTarget(event.target)) return;
  if (appState.view !== "iso") return;
  if (pressEInteraction()) event.preventDefault();
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
  if (document.hidden) {
    stopCharging({ silent: true, reason: "hidden" });
    return;
  }
  // Do not replay a backlog of events accumulated while the tab was hidden.
  autonomyCursor = null;
  pendingAutonomyEvent = null;
  if (appState.view === "iso" || appState.view === "3d") {
    resumeSceneCharging(appState.view);
  }
  pollState();
});

/* ==========================================================================
   Boot
   ========================================================================== */

applySkinTheme(currentSkinTheme, { persist: false });
if (autoReturnToggle) autoReturnToggle.checked = autoReturnEnabled;
setPanelTab("debug");
updateSliderLabels();
updateDebugState();
updateDebugMode();
updateLastEvent("暂无");
updateHudVisibility();
updateActionAvailability();
updateChargeUI();
updateNearbyInteraction();
updateCustomVoiceLabels();
renderVoiceLab();
renderVoiceUI(voice.snapshot());
renderTTSServiceStatus();
remoteTTS.start();
document.body.dataset.view = appState.view;
stage.dataset.expression = appState.baseExpression;
world.setExpression(appState.baseExpression);

pollState();
refreshAutonomyStatus();
window.setInterval(pollState, 1000);
