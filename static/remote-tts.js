"use strict";

/**
 * tianbao virtual V0.6 - remote multi-timbre voice client.
 *
 * The front end only talks to the same-origin Flask proxy (/api/tts*). It
 * never uses a browser-localhost URL for the model server, so the page works
 * when the browser and the Flask process are on different machines.
 *
 * This module owns:
 *  - status/voice discovery (15 s polling + focus/visibility refresh),
 *  - WAV generation requests with cancellation and timeouts,
 *  - a latest-wins playback queue that never overlaps two clips,
 *  - Audio/Blob URL cleanup,
 *  - end-to-end timing metrics (server headers + performance.now()).
 */

export const DEFAULT_STATUS_POLL_MS = 15000;
export const DEFAULT_STATUS_TIMEOUT_MS = 6000;
export const DEFAULT_SYNTH_TIMEOUT_MS = 65000;
export const TTS_SELECTION_KEY = "tianbao.tts.selection.v2";

export class RemoteTTSError extends Error {
  constructor(message, { code = "remote", status = null, cause = null } = {}) {
    super(message);
    this.name = "RemoteTTSError";
    this.code = code;
    this.status = status;
    this.cause = cause;
  }
}

function normalizeVoice(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim();
  if (!id) return null;
  const reference = Number(raw.reference_seconds);
  return {
    id,
    name: String(raw.name || id).trim() || id,
    description: String(raw.description || "").trim(),
    available: raw.available !== false,
    reason: String(raw.reason || "").trim(),
    referenceSeconds: Number.isFinite(reference) ? reference : null,
  };
}

function parseHeaderMs(response, name) {
  const raw = response.headers.get(name);
  if (raw === null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function readSelection() {
  try {
    const raw = JSON.parse(localStorage.getItem(TTS_SELECTION_KEY) || "null");
    if (!raw || typeof raw !== "object") return null;
    const mode = raw.mode === "local" ? "local" : raw.mode === "remote" ? "remote" : null;
    if (!mode) return null;
    return {
      mode,
      remoteVoiceId: String(raw.remoteVoiceId || "").trim().slice(0, 64),
      localKey: String(raw.localKey || "").trim().slice(0, 120),
    };
  } catch {
    return null;
  }
}

export function loadTTSSelection() {
  return readSelection();
}

export function saveTTSSelection(selection) {
  if (!selection || typeof selection !== "object") return;
  const payload = {
    mode: selection.mode === "local" ? "local" : "remote",
    remoteVoiceId: String(selection.remoteVoiceId || "").trim().slice(0, 64),
    localKey: String(selection.localKey || "").trim().slice(0, 120),
  };
  try {
    localStorage.setItem(TTS_SELECTION_KEY, JSON.stringify(payload));
  } catch {
    /* localStorage can be unavailable in private mode */
  }
}

async function readErrorDetail(response) {
  try {
    const type = response.headers.get("content-type") || "";
    if (type.includes("application/json")) {
      const data = await response.json();
      if (data && typeof data === "object") {
        const parts = [];
        if (typeof data.error === "string" && data.error.trim()) {
          parts.push(data.error.trim());
        }
        if (typeof data.detail === "string" && data.detail.trim() && data.detail !== data.error) {
          parts.push(data.detail.trim());
        } else if (data.detail && typeof data.detail !== "string") {
          parts.push(JSON.stringify(data.detail));
        }
        return parts.join(" · ").slice(0, 280);
      }
      return "";
    }
    const text = await response.text();
    return text.trim().slice(0, 240);
  } catch {
    return "";
  }
}

export class RemoteTTSService {
  constructor({
    onChange = () => {},
    pollMs = DEFAULT_STATUS_POLL_MS,
    statusTimeoutMs = DEFAULT_STATUS_TIMEOUT_MS,
    synthTimeoutMs = DEFAULT_SYNTH_TIMEOUT_MS,
  } = {}) {
    this.onChange = onChange;
    this.pollMs = Math.max(5000, Number(pollMs) || DEFAULT_STATUS_POLL_MS);
    this.statusTimeoutMs = Math.max(1000, Number(statusTimeoutMs) || DEFAULT_STATUS_TIMEOUT_MS);
    this.synthTimeoutMs = Math.max(5000, Number(synthTimeoutMs) || DEFAULT_SYNTH_TIMEOUT_MS);

    this.status = null;
    this.voices = [];
    this.defaultVoiceId = "";
    this.available = false;
    this.reason = "";
    this.lastError = "";
    this.lastCheckedAt = 0;
    this.loading = true;

    this.refreshSeq = 0;
    this.refreshPromise = null;
    this.lastRefreshStartedAt = 0;
    this.timer = null;
    this.started = false;

    this.jobSeq = 0;
    this.activeJob = null;
    this.queuedJobs = [];

    this.handleFocus = this.handleFocus.bind(this);
    this.handleVisibility = this.handleVisibility.bind(this);
  }

  snapshot() {
    const statusVoiceCount = Number(this.status && this.status.voice_count);
    const statusAvailableCount = Number(this.status && this.status.available_voice_count);
    const listedAvailable = this.voices.filter((voice) => voice.available).length;
    return {
      status: this.status,
      voices: this.voices,
      defaultVoiceId: this.defaultVoiceId,
      available: this.available,
      reason: this.reason,
      lastError: this.lastError,
      lastCheckedAt: this.lastCheckedAt,
      loading: this.loading,
      voiceCount: this.voices.length
        || (Number.isFinite(statusVoiceCount) ? statusVoiceCount : 0),
      availableVoiceCount: listedAvailable
        || (Number.isFinite(statusAvailableCount) ? statusAvailableCount : 0),
      isSpeaking: Boolean(this.activeJob),
      queuedCount: this.queuedJobs.length,
    };
  }

  emit() {
    this.onChange(this.snapshot());
  }

  getVoice(voiceId) {
    return this.voices.find((voice) => voice.id === voiceId) || null;
  }

  isVoiceAvailable(voiceId) {
    const voice = this.getVoice(voiceId);
    return Boolean(voice && voice.available);
  }

  /* ---------------- discovery / polling ---------------- */

  start() {
    if (this.started) return;
    this.started = true;
    this.refresh({ force: true });
    this.timer = window.setInterval(() => {
      if (!document.hidden) this.refresh();
    }, this.pollMs);
    window.addEventListener("focus", this.handleFocus);
    document.addEventListener("visibilitychange", this.handleVisibility);
    window.addEventListener("online", this.handleFocus);
  }

  stop() {
    this.started = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    window.removeEventListener("focus", this.handleFocus);
    document.removeEventListener("visibilitychange", this.handleVisibility);
    window.removeEventListener("online", this.handleFocus);
    this.cancelAll("service stopped");
  }

  handleFocus() {
    // A focus return must be immediate even if the 15-second poll just ran.
    this.refresh({ force: true });
  }

  handleVisibility() {
    if (!document.hidden) this.refresh({ force: true });
  }

  async refresh({ force = false } = {}) {
    const now = performance.now();
    if (!force && this.refreshPromise) return this.refreshPromise;
    if (!force && now - this.lastRefreshStartedAt < 750) {
      return this.refreshPromise || Promise.resolve(this.snapshot());
    }

    this.lastRefreshStartedAt = now;
    const seq = ++this.refreshSeq;
    this.loading = !this.lastCheckedAt;
    this.emit();

    const promise = (async () => {
      const [statusResult, voicesResult] = await Promise.allSettled([
        this.fetchJSON("/api/tts/status", this.statusTimeoutMs),
        this.fetchJSON("/api/tts/voices", this.statusTimeoutMs),
      ]);

      // A forced refresh can supersede an older one; never let stale data win.
      if (seq !== this.refreshSeq) return this.snapshot();

      const statusData = statusResult.status === "fulfilled" ? statusResult.value : null;
      const voicesData = voicesResult.status === "fulfilled" ? voicesResult.value : null;
      const errors = [];

      let serviceReady = true;
      if (statusData) {
        if (statusData.tts_ready === false) {
          serviceReady = false;
          errors.push("TTS 尚未就绪");
        }
        if (statusData.model_ready === false) {
          serviceReady = false;
          const modelReason = String(statusData.model_reason || "").trim();
          errors.push(modelReason ? `模型尚未就绪 (${modelReason})` : "模型尚未就绪");
        }
      } else if (statusResult.status === "rejected") {
        errors.push(this.errorMessage(statusResult.reason, "状态接口不可用"));
      }

      const voices = voicesData && Array.isArray(voicesData.voices)
        ? voicesData.voices.map(normalizeVoice).filter(Boolean)
        : [];

      if (!voicesData && voicesResult.status === "rejected") {
        errors.push(this.errorMessage(voicesResult.reason, "音色列表不可用"));
      }

      // A working /voices endpoint is still useful if /status is broken, but
      // an explicit "not ready" status always wins (the model is still loading).
      this.available = Boolean((statusData || voicesData) && serviceReady);
      this.status = statusData || null;
      this.voices = voices;
      this.defaultVoiceId = String(
        (voicesData && voicesData.default_voice_id)
        || (statusData && statusData.default_voice_id)
        || ""
      ).trim();
      this.lastCheckedAt = Date.now();
      this.loading = false;
      this.lastError = errors.join(" · ");
      this.reason = this.available
        ? (this.lastError ? `语音服务可用 · ${this.lastError}` : "语音服务可用")
        : (this.lastError || "本地语音服务不可用");

      this.emit();
      return this.snapshot();
    })();

    this.refreshPromise = promise;
    try {
      return await promise;
    } finally {
      if (this.refreshPromise === promise) this.refreshPromise = null;
    }
  }

  errorMessage(error, fallback) {
    if (error instanceof RemoteTTSError) return error.message || fallback;
    if (error && error.message) return error.message;
    return fallback;
  }

  async fetchJSON(path, timeoutMs) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(path, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await readErrorDetail(response);
        throw new RemoteTTSError(
          detail || `语音服务返回 HTTP ${response.status}.`,
          { code: "http", status: response.status }
        );
      }
      let data;
      try {
        data = await response.json();
      } catch {
        throw new RemoteTTSError("语音服务返回了无效的 JSON.", { code: "json" });
      }
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new RemoteTTSError("语音服务返回了意外的 JSON 结构.", { code: "json" });
      }
      return data;
    } catch (error) {
      if (error instanceof RemoteTTSError) throw error;
      if (timedOut || (error && error.name === "AbortError")) {
        throw new RemoteTTSError("语音服务响应超时.", { code: "timeout", cause: error });
      }
      throw new RemoteTTSError(
        error && error.message ? error.message : "无法连接语音服务.",
        { code: "network", cause: error }
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------------- speech generation + playback ---------------- */

  /**
   * Generate and play one sentence. New calls interrupt the current sentence
   * by default (latest-wins queue); pass interrupt:false to append it.
   *
   * Resolves with:
   *   { ok:true, metrics }
   *   { ok:false, cancelled:true }
   *   { ok:false, error: RemoteTTSError, metrics }
   */
  speak(text, {
    voiceId = "",
    emotion = "neutral",
    cache = true,
    interrupt = true,
    timeoutMs = null,
    onFirstSound = null,
    onPhase = null,
  } = {}) {
    const clean = String(text || "").trim();
    if (!clean) {
      return Promise.resolve({
        ok: false,
        error: new RemoteTTSError("没有可朗读的文字.", { code: "empty_text" }),
      });
    }

    if (interrupt) {
      this.cancelAll("replaced by a newer sentence");
    } else if (this.activeJob || this.queuedJobs.length) {
      return new Promise((resolve) => {
        this.queuedJobs.push(this.createJob({
          text: clean,
          voiceId,
          emotion,
          cache,
          timeoutMs,
          onFirstSound,
          onPhase,
          resolve,
        }));
        this.emit();
      });
    }

    return new Promise((resolve) => {
      const job = this.createJob({
        text: clean,
        voiceId,
        emotion,
        cache,
        timeoutMs,
        onFirstSound,
        onPhase,
        resolve,
      });
      this.activeJob = job;
      this.runJob(job);
    });
  }

  createJob({
    text,
    voiceId,
    emotion,
    cache,
    timeoutMs,
    onFirstSound,
    onPhase,
    resolve,
  }) {
    return {
      id: ++this.jobSeq,
      text,
      voiceId,
      emotion,
      cache: Boolean(cache),
      timeoutMs: this.resolveTimeout(timeoutMs),
      onFirstSound,
      onPhase,
      decisionAt: performance.now(),
      resolve,
      settled: false,
      cancelled: false,
      timedOut: false,
      controller: new AbortController(),
      audio: null,
      url: null,
      playbackTimer: null,
      playStartTimer: null,
      firstSoundAt: 0,
      wavReadyAt: 0,
      cacheHeader: "",
      generateMs: null,
      serverTotalMs: null,
      voiceIdHeader: "",
      bytes: 0,
    };
  }

  resolveTimeout(timeoutMs) {
    const number = Number(timeoutMs);
    return Number.isFinite(number) && number > 0
      ? Math.max(3000, number)
      : this.synthTimeoutMs;
  }

  async runJob(job) {
    const phase = (name) => {
      if (this.activeJob !== job || job.settled) return;
      if (typeof job.onPhase === "function") {
        try { job.onPhase(name); } catch { /* UI callbacks must not break audio */ }
      }
    };

    phase("requesting");
    const timeoutTimer = window.setTimeout(() => {
      if (job.settled) return;
      job.timedOut = true;
      try { job.controller.abort(); } catch { /* already aborted */ }
    }, job.timeoutMs);

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "audio/wav",
        },
        body: JSON.stringify({
          text: job.text,
          voice_id: job.voiceId,
          emotion: job.emotion,
          cache: job.cache,
        }),
        cache: "no-store",
        signal: job.controller.signal,
      });

      if (job.settled) return;
      if (!response.ok) {
        const detail = await readErrorDetail(response);
        throw new RemoteTTSError(
          detail || `语音服务返回 HTTP ${response.status}.`,
          { code: "http", status: response.status }
        );
      }

      job.cacheHeader = (response.headers.get("X-Tianbao-Cache") || "").trim().toUpperCase();
      job.generateMs = parseHeaderMs(response, "X-Tianbao-Generate-Ms");
      job.serverTotalMs = parseHeaderMs(response, "X-Tianbao-Total-Ms");
      job.voiceIdHeader = (response.headers.get("X-Tianbao-Voice-Id") || job.voiceId).trim();

      phase("generating");
      const buffer = await response.arrayBuffer();
      if (job.settled) return;
      if (!buffer || buffer.byteLength < 44) {
        throw new RemoteTTSError("语音服务返回了空音频.", { code: "empty_audio" });
      }
      const riff = new TextDecoder().decode(buffer.slice(0, 4));
      if (riff !== "RIFF") {
        throw new RemoteTTSError("语音服务返回的不是 WAV 音频.", { code: "invalid_audio" });
      }
      job.wavReadyAt = performance.now();
      job.bytes = buffer.byteLength;

      const type = response.headers.get("content-type") || "audio/wav";
      const blob = new Blob([buffer], { type });
      job.url = URL.createObjectURL(blob);
      const audio = new Audio();
      job.audio = audio;
      audio.preload = "auto";

      const markFirstSound = () => {
        if (job.settled || job.firstSoundAt) return;
        if (job.playStartTimer) {
          clearTimeout(job.playStartTimer);
          job.playStartTimer = null;
        }
        job.firstSoundAt = performance.now();
        if (typeof job.onFirstSound === "function") {
          try {
            job.onFirstSound(job.firstSoundAt - job.decisionAt, this.metricsFor(job));
          } catch { /* UI callbacks must not break audio */ }
        }
      };

      audio.addEventListener("playing", markFirstSound);
      audio.addEventListener("ended", () => {
        if (job.settled) return;
        this.finishJob(job, { ok: true });
      });
      audio.addEventListener("error", () => {
        if (job.settled) return;
        const code = audio.error && audio.error.code;
        this.finishJob(job, {
          ok: false,
          error: new RemoteTTSError(
            `音频播放失败${code ? ` (code ${code})` : ""}.`,
            { code: "playback" }
          ),
        });
      });
      audio.addEventListener("loadedmetadata", () => {
        if (job.settled) return;
        const durationMs = Number.isFinite(audio.duration)
          ? Math.max(15000, audio.duration * 1000 + 5000)
          : 120000;
        job.playbackTimer = window.setTimeout(() => {
          if (job.settled) return;
          this.finishJob(job, {
            ok: false,
            error: new RemoteTTSError("音频播放超时, 已停止.", { code: "playback_timeout" }),
          });
        }, durationMs);
      });

      audio.src = job.url;
      phase("ready");

      // Do not await play(): a stalled play promise must not keep the speech
      // pending forever. The watchdog below turns a hung start into a normal
      // playback failure, which lets the UI fall back to browser speech.
      job.playStartTimer = window.setTimeout(() => {
        if (job.settled || job.firstSoundAt) return;
        this.finishJob(job, {
          ok: false,
          error: new RemoteTTSError("音频未能开始播放.", { code: "playback_timeout" }),
        });
      }, 15000);

      audio.play().then(() => {
        if (job.playStartTimer) {
          clearTimeout(job.playStartTimer);
          job.playStartTimer = null;
        }
        if (job.settled) return;
        markFirstSound();
        phase("playing");
      }).catch((error) => {
        if (job.playStartTimer) {
          clearTimeout(job.playStartTimer);
          job.playStartTimer = null;
        }
        if (job.settled) return;
        this.finishJob(job, {
          ok: false,
          error: new RemoteTTSError(
            "浏览器阻止了音频播放或播放失败.",
            { code: "playback", cause: error }
          ),
        });
      });
    } catch (error) {
      if (job.settled) return;
      if (job.cancelled) return;
      if (job.timedOut) {
        this.finishJob(job, {
          ok: false,
          error: new RemoteTTSError("语音生成超时, 正在使用备用语音.", { code: "timeout" }),
        });
        return;
      }
      const normalized = error instanceof RemoteTTSError
        ? error
        : new RemoteTTSError(
          error && error.message ? error.message : "远程语音生成失败.",
          { code: "network", cause: error }
        );
      this.finishJob(job, { ok: false, error: normalized });
    } finally {
      clearTimeout(timeoutTimer);
    }
  }

  metricsFor(job) {
    const now = performance.now();
    return {
      kind: "remote",
      voiceId: job.voiceIdHeader || job.voiceId,
      cache: job.cacheHeader,
      generateMs: job.generateMs,
      serverTotalMs: job.serverTotalMs,
      requestMs: job.wavReadyAt ? job.wavReadyAt - job.decisionAt : null,
      firstSoundMs: job.firstSoundAt ? job.firstSoundAt - job.decisionAt : null,
      playbackMs: job.firstSoundAt ? now - job.firstSoundAt : null,
      endToEndMs: now - job.decisionAt,
      bytes: job.bytes,
    };
  }

  finishJob(job, result) {
    if (job.settled) return;
    job.settled = true;

    if (job.playbackTimer) {
      clearTimeout(job.playbackTimer);
      job.playbackTimer = null;
    }
    if (job.playStartTimer) {
      clearTimeout(job.playStartTimer);
      job.playStartTimer = null;
    }

    const metrics = this.metricsFor(job);
    this.releaseJobAudio(job);
    if (this.activeJob === job) this.activeJob = null;

    job.resolve({
      ...result,
      metrics,
    });

    this.drainQueue();
  }

  releaseJobAudio(job) {
    const audio = job.audio;
    if (audio) {
      try { audio.pause(); } catch { /* ignore */ }
      try {
        audio.removeAttribute("src");
        audio.load();
      } catch { /* ignore */ }
      job.audio = null;
    }
    if (job.url) {
      try { URL.revokeObjectURL(job.url); } catch { /* ignore */ }
      job.url = null;
    }
  }

  cancelJob(job, reason) {
    if (!job || job.settled) return;
    job.cancelled = true;
    try { job.controller.abort(); } catch { /* already aborted */ }
    this.finishJob(job, { ok: false, cancelled: true, reason });
  }

  cancelAll(reason = "cancelled") {
    // Clear the queue first: finishJob() drains it, and we do not want the
    // job that is being replaced to immediately start the next queued one.
    const queued = this.queuedJobs.splice(0);
    for (const job of queued) {
      if (job.settled) continue;
      job.settled = true;
      job.resolve({ ok: false, cancelled: true, reason, metrics: null });
    }
    if (this.activeJob) this.cancelJob(this.activeJob, reason);
  }

  /** Stop any request/playback immediately (stop button, view change). */
  cancel() {
    this.cancelAll("cancelled by user");
  }

  drainQueue() {
    if (this.activeJob || !this.queuedJobs.length) return;
    const next = this.queuedJobs.shift();
    if (!next || next.settled) {
      this.drainQueue();
      return;
    }
    this.activeJob = next;
    this.runJob(next);
  }
}
