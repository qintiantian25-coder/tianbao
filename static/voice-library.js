"use strict";

/**
 * tianbao virtual V0.5 - front-end voice library.
 *
 * Four built-in "universal" timbres are TTS parameter profiles rendered by the
 * device speech engine. Downloaded packs are JSON manifests of additional
 * profiles; the interface is ready for a future real neural-TTS/audio pack
 * without changing the UI. Custom timbres are stored locally.
 */

const KEY_CUSTOM = "tianbao.voice.custom.v1";
const KEY_PACKS = "tianbao.voice.packs.v1";
const KEY_ENABLED = "tianbao.voice.enabled.v1";
const KEY_ACTIVE = "tianbao.voice.active.v1";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const BUILTIN_PACKS = [
  {
    id: "builtin-soft",
    name: "内置 · 软萌",
    builtin: true,
    description: "tianbao 的日常声音: 软一点, 高一点.",
    voices: [{
      id: "soft",
      name: "软萌",
      description: "轻柔偏高 · 日常陪伴",
      rate: 1.03,
      pitch: 1.30,
      voiceIndex: 0,
    }],
  },
  {
    id: "builtin-bright",
    name: "内置 · 元气",
    builtin: true,
    description: "快一点, 亮一点, 开心的时候用.",
    voices: [{
      id: "bright",
      name: "元气",
      description: "偏快偏亮 · 活泼",
      rate: 1.16,
      pitch: 1.16,
      voiceIndex: 1,
    }],
  },
  {
    id: "builtin-gentle",
    name: "内置 · 温柔",
    builtin: true,
    description: "慢一点, 柔一点, 适合安静的时候.",
    voices: [{
      id: "gentle",
      name: "温柔",
      description: "偏慢 · 轻声安慰",
      rate: 0.92,
      pitch: 1.05,
      voiceIndex: 2,
    }],
  },
  {
    id: "builtin-whisper",
    name: "内置 · 轻语",
    builtin: true,
    description: "低一点, 慢一点, 像睡前的悄悄话.",
    voices: [{
      id: "whisper",
      name: "轻语",
      description: "偏低偏慢 · 睡前",
      rate: 0.84,
      pitch: 0.92,
      voiceIndex: 3,
    }],
  },
];

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage can be unavailable in private mode */
  }
}

function normalizeVoice(raw, fallbackIndex = 0) {
  if (!raw || typeof raw !== "object") return null;
  const name = String(raw.name || "").trim();
  const id = String(raw.id || name).trim();
  if (!name || !id) return null;
  const rate = Number(raw.rate);
  const pitch = Number(raw.pitch);
  return {
    id,
    name,
    description: String(raw.description || "").trim(),
    rate: clamp(Number.isFinite(rate) ? rate : 1, 0.5, 2),
    pitch: clamp(Number.isFinite(pitch) ? pitch : 1, 0.5, 2),
    voiceHint: String(raw.voiceHint || "zh"),
    voiceIndex: Number.isInteger(raw.voiceIndex) ? raw.voiceIndex : fallbackIndex,
    voiceURI: typeof raw.voiceURI === "string" ? raw.voiceURI : "",
    voiceName: typeof raw.voiceName === "string" ? raw.voiceName : "",
  };
}

function normalizePack(raw, source = "") {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim();
  const name = String(raw.name || "").trim();
  const voices = Array.isArray(raw.voices)
    ? raw.voices.map((voice, index) => normalizeVoice(voice, index)).filter(Boolean)
    : [];
  if (!id || !name || !voices.length) return null;
  return {
    id,
    name,
    builtin: false,
    description: String(raw.description || "").trim(),
    version: String(raw.version || "1.0.0"),
    source,
    voices,
  };
}

export class VoiceLibrary {
  constructor() {
    const storedPacks = readJSON(KEY_PACKS, []);
    this.downloadedPacks = Array.isArray(storedPacks)
      ? storedPacks.map((pack) => normalizePack(pack, pack && pack.source ? pack.source : "")).filter(Boolean)
      : [];

    const storedCustom = readJSON(KEY_CUSTOM, []);
    this.customVoices = Array.isArray(storedCustom)
      ? storedCustom.map((voice) => normalizeVoice(voice, 0)).filter(Boolean).map((voice) => ({
        ...voice,
        id: voice.id.startsWith("custom-") ? voice.id : `custom-${voice.id}`,
        custom: true,
      }))
      : [];

    const storedEnabled = readJSON(KEY_ENABLED, {});
    this.enabled = storedEnabled && typeof storedEnabled === "object" ? { ...storedEnabled } : {};

    this.activeId = readJSON(KEY_ACTIVE, "") || "";
    this.ensureActive();
  }

  packs() {
    return [
      ...BUILTIN_PACKS.map((pack) => ({ ...pack, enabled: this.isPackEnabled(pack.id) })),
      ...this.downloadedPacks.map((pack) => ({ ...pack, enabled: this.isPackEnabled(pack.id) })),
    ];
  }

  isPackEnabled(packId) {
    return this.enabled[packId] !== false;
  }

  availableVoices() {
    const voices = [];
    for (const pack of this.packs()) {
      if (!pack.enabled) continue;
      for (const voice of pack.voices) {
        voices.push({
          ...voice,
          key: `${pack.id}::${voice.id}`,
          packId: pack.id,
          packName: pack.name,
          builtin: Boolean(pack.builtin),
          custom: false,
        });
      }
    }
    for (const voice of this.customVoices) {
      voices.push({
        ...voice,
        key: `custom::${voice.id}`,
        packId: "custom",
        packName: "自定义",
        builtin: false,
        custom: true,
      });
    }
    return voices;
  }

  getVoices() {
    const voices = this.availableVoices();
    if (voices.length) return voices;
    // Safety net: never leave the app without a usable TTS profile.
    const fallback = BUILTIN_PACKS[0].voices[0];
    return [{
      ...fallback,
      key: `${BUILTIN_PACKS[0].id}::${fallback.id}`,
      packId: BUILTIN_PACKS[0].id,
      packName: BUILTIN_PACKS[0].name,
      builtin: true,
      custom: false,
    }];
  }

  getActiveVoice() {
    const voices = this.getVoices();
    let active = voices.find((voice) => voice.key === this.activeId);
    if (!active) {
      active = voices[0];
      this.activeId = active ? active.key : "";
      writeJSON(KEY_ACTIVE, this.activeId);
    }
    return active;
  }

  ensureActive() {
    const voices = this.getVoices();
    if (!voices.some((voice) => voice.key === this.activeId)) {
      this.activeId = voices[0] ? voices[0].key : "";
      writeJSON(KEY_ACTIVE, this.activeId);
    }
  }

  setActiveVoice(key) {
    if (!this.getVoices().some((voice) => voice.key === key)) return false;
    this.activeId = key;
    writeJSON(KEY_ACTIVE, key);
    return true;
  }

  setPackEnabled(packId, enabled) {
    if (!enabled) {
      const remaining = this.availableVoices().filter((voice) => voice.packId !== packId);
      if (!remaining.length) return false;
    }
    this.enabled[packId] = Boolean(enabled);
    writeJSON(KEY_ENABLED, this.enabled);
    this.ensureActive();
    return true;
  }

  saveCustom({ name, rate, pitch, voiceURI = "", voiceName = "" }) {
    const cleanName = String(name || "").trim().slice(0, 16);
    if (!cleanName) return null;
    const id = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const voice = normalizeVoice({
      id,
      name: cleanName,
      description: "自定义音色",
      rate,
      pitch,
      voiceURI,
      voiceName,
    }, 0);
    if (!voice) return null;
    this.customVoices.push(voice);
    writeJSON(KEY_CUSTOM, this.customVoices);
    this.activeId = `custom::${voice.id}`;
    writeJSON(KEY_ACTIVE, this.activeId);
    return this.getActiveVoice();
  }

  deleteCustom(key) {
    const id = key.startsWith("custom::") ? key.slice("custom::".length) : key;
    const before = this.customVoices.length;
    this.customVoices = this.customVoices.filter((voice) => voice.id !== id);
    if (this.customVoices.length === before) return false;
    writeJSON(KEY_CUSTOM, this.customVoices);
    this.ensureActive();
    return true;
  }

  async downloadPack(url) {
    const source = String(url || "").trim();
    if (!source) throw new Error("请输入语音包地址.");
    const response = await fetch(source, { cache: "no-store" });
    if (!response.ok) throw new Error(`下载失败 (${response.status}).`);
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("语音包不是有效的 JSON.");
    }
    const pack = normalizePack(data, source);
    if (!pack) throw new Error("语音包格式不正确, 需要 id/name/voices.");
    const allBuiltinIds = new Set(BUILTIN_PACKS.map((item) => item.id));
    if (allBuiltinIds.has(pack.id)) throw new Error("语音包 id 与内置语音包冲突.");

    this.downloadedPacks = this.downloadedPacks.filter((item) => item.id !== pack.id);
    this.downloadedPacks.push(pack);
    writeJSON(KEY_PACKS, this.downloadedPacks);

    if (!this.enabled[pack.id]) {
      this.enabled[pack.id] = true;
      writeJSON(KEY_ENABLED, this.enabled);
    }
    this.ensureActive();
    return pack;
  }

  removePack(packId) {
    const before = this.downloadedPacks.length;
    this.downloadedPacks = this.downloadedPacks.filter((pack) => pack.id !== packId);
    if (this.downloadedPacks.length === before) return false;
    writeJSON(KEY_PACKS, this.downloadedPacks);
    delete this.enabled[packId];
    writeJSON(KEY_ENABLED, this.enabled);
    this.ensureActive();
    return true;
  }
}
