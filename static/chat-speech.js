"use strict";

/**
 * Orchestrates chat-reply speech without owning the TTS implementation.
 *
 * app.js injects the existing speakCurrentText() path, SpeechBubble and
 * RobotView mouth hooks. This module owns only:
 *  - sentence chunking for the /api/tts 140-character limit,
 *  - latest-wins cancellation,
 *  - mouth start/stop around actual audio playback,
 *  - bubble linger timing.
 */

export const CHAT_SPEECH_CHUNK_CHARS = 140;
export const CHAT_BUBBLE_LINGER_MS = 5000;

function charLength(value) {
  return Array.from(String(value ?? "")).length;
}

/**
 * Split a reply into ordered speech chunks no longer than maxChars.
 * Break points prefer sentence punctuation, then comma-like punctuation,
 * then a hard Unicode-safe split. Whitespace is normalized only for speech.
 */
export function splitSpeechText(text, maxChars = CHAT_SPEECH_CHUNK_CHARS) {
  const normalized = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const limit = Math.max(1, Math.floor(Number(maxChars) || CHAT_SPEECH_CHUNK_CHARS));
  const sentences = normalized.match(/[^。！？!?；;….]+[。！？!?；;….]?/g)
    || [normalized];
  const pieces = [];

  const splitHard = (value) => {
    const chars = Array.from(value);
    while (chars.length > limit) {
      pieces.push(chars.splice(0, limit).join("").trim());
    }
    if (chars.length) pieces.push(chars.join("").trim());
  };

  for (const sentence of sentences) {
    const clean = sentence.trim();
    if (!clean) continue;
    if (charLength(clean) <= limit) {
      pieces.push(clean);
      continue;
    }

    const parts = clean.match(/[^，,、：:]+[，,、：:]?/g) || [clean];
    let current = "";
    for (const rawPart of parts) {
      const part = rawPart.trim();
      if (!part) continue;
      if (charLength(part) > limit) {
        if (current) {
          pieces.push(current);
          current = "";
        }
        splitHard(part);
      } else if (charLength(current + part) <= limit) {
        current += part;
      } else {
        if (current) pieces.push(current);
        current = part;
      }
    }
    if (current) pieces.push(current);
  }

  const chunks = [];
  for (const piece of pieces) {
    if (!piece) continue;
    const previous = chunks[chunks.length - 1];
    if (previous && charLength(previous + piece) <= limit) {
      chunks[chunks.length - 1] = previous + piece;
    } else {
      chunks.push(piece);
    }
  }
  return chunks;
}

export function shouldAutoSpeakAssistant(result) {
  return Boolean(
    result
    && result.ok === true
    && result.fallback === false
    && typeof result.reply === "string"
    && result.reply.trim(),
  );
}

export class ChatSpeechCoordinator {
  constructor({
    speak,
    cancelSpeech = () => {},
    showBubble,
    hideBubble,
    startMouth,
    stopMouth,
    setStatus = () => {},
    onFallback = () => {},
    onFinished = () => {},
    now = () => performance.now(),
    setTimeoutFn = (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeoutFn = (id) => globalThis.clearTimeout(id),
    lingerMs = CHAT_BUBBLE_LINGER_MS,
    maxChars = CHAT_SPEECH_CHUNK_CHARS,
    split = splitSpeechText,
  }) {
    this.speak = speak;
    this.cancelSpeech = cancelSpeech;
    this.showBubble = showBubble;
    this.hideBubble = hideBubble;
    this.startMouth = startMouth;
    this.stopMouth = stopMouth;
    this.setStatus = setStatus;
    this.onFallback = onFallback;
    this.onFinished = onFinished;
    this.now = now;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.lingerMs = Math.max(0, Number(lingerMs) || CHAT_BUBBLE_LINGER_MS);
    this.maxChars = maxChars;
    this.split = split;

    this.token = 0;
    this.active = false;
    this.audioStarted = false;
    this.fallbackNoted = false;
    this.mouthToken = null;
    this.timer = null;
    this.noAudioTimer = null;
    this.displayStartedAt = 0;
  }

  get isActive() {
    return this.active;
  }

  async play(text, { manual = false } = {}) {
    const clean = String(text ?? "").trim();
    if (!clean) return false;

    this.cancel({ hideBubble: true });
    const token = ++this.token;
    this.active = true;
    this.audioStarted = false;
    this.fallbackNoted = false;
    this.mouthToken = null;
    this.displayStartedAt = this.now();
    this.showBubble(clean);
    this.setStatus(manual ? "正在重播朗读..." : "正在准备朗读...", "busy");
    this.noAudioTimer = this.setTimeoutFn(() => {
      if (token !== this.token || this.audioStarted) return;
      this.noAudioTimer = null;
      this.token += 1;
      this.active = false;
      this.cancelSpeech();
      this.setStatus("自动朗读未启动，可点“重播朗读”。", "fallback");
      this.hideBubble();
      this.onFinished({ audioStarted: false, manual, noAudioTimeout: true });
    }, this.lingerMs);

    const chunks = this.split(clean, this.maxChars);
    for (const chunk of chunks) {
      if (token !== this.token) return false;
      let spoken = false;
      try {
        spoken = await this.speak(chunk, {
          onFirstSound: () => this.markAudioStarted(token),
          onFallback: (reason) => this.noteFallback(token, reason),
        });
      } catch {
        spoken = false;
      }
      if (token !== this.token) return false;
      if (!spoken) break;
    }
    if (token !== this.token) return false;

    this.active = false;
    if (this.noAudioTimer !== null) {
      this.clearTimeoutFn(this.noAudioTimer);
      this.noAudioTimer = null;
    }
    if (this.mouthToken !== null) {
      this.stopMouth(this.mouthToken);
      this.mouthToken = null;
    }
    this.scheduleHide(token);
    this.onFinished({ audioStarted: this.audioStarted, manual });
    return true;
  }

  markAudioStarted(token) {
    if (token !== this.token || this.audioStarted) return;
    this.audioStarted = true;
    if (this.noAudioTimer !== null) {
      this.clearTimeoutFn(this.noAudioTimer);
      this.noAudioTimer = null;
    }
    this.mouthToken = this.startMouth();
    this.setStatus(
      this.fallbackNoted
        ? "远程不可用，正在使用浏览器备用语音朗读。"
        : "正在朗读...",
      this.fallbackNoted ? "fallback" : "ok",
    );
  }

  noteFallback(token, reason) {
    if (token !== this.token) return;
    this.fallbackNoted = true;
    const detail = String(reason || "").trim();
    this.setStatus(
      detail
        ? `远程语音不可用，使用浏览器备用语音：${detail}`
        : "远程语音不可用，使用浏览器备用语音。",
      "fallback",
    );
    this.onFallback(detail);
  }

  scheduleHide(token) {
    const elapsed = Math.max(0, this.now() - this.displayStartedAt);
    const delay = this.audioStarted
      ? this.lingerMs
      : Math.max(0, this.lingerMs - elapsed);
    if (delay <= 0) {
      this.hideBubble();
      return;
    }
    this.timer = this.setTimeoutFn(() => {
      if (token !== this.token) return;
      this.timer = null;
      this.hideBubble();
    }, delay);
  }

  cancel({ hideBubble = false } = {}) {
    const hadWork = this.active
      || this.timer !== null
      || this.mouthToken !== null;
    this.token += 1;
    this.active = false;
    this.audioStarted = false;
    this.fallbackNoted = false;
    if (this.timer !== null) {
      this.clearTimeoutFn(this.timer);
      this.timer = null;
    }
    if (this.noAudioTimer !== null) {
      this.clearTimeoutFn(this.noAudioTimer);
      this.noAudioTimer = null;
    }
    if (this.mouthToken !== null) {
      this.stopMouth(this.mouthToken);
      this.mouthToken = null;
    }
    if (hadWork) this.cancelSpeech();
    if (hideBubble && hadWork) this.hideBubble();
  }
}
