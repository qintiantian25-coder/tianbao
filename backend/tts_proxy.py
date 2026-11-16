"""Same-origin proxy for the local TianBao voice service.

The browser must never talk to 127.0.0.1:8030 directly: from a browser on
Windows, ``127.0.0.1`` is the Windows machine, not this WSL/server process.
These routes let the existing Flask app (same origin as the page) forward the
requests and the WAV response.

Only a fixed upstream base URL is used. The route never accepts a URL from the
client, so it cannot be turned into an open proxy.
"""

import json
import os
import re
import urllib.error
import urllib.request

from flask import Blueprint, Response, jsonify, request


def _env_float(name, default):
    try:
        value = float(os.environ.get(name, ""))
    except (TypeError, ValueError):
        return default
    return value if value > 0 else default


# The service address is fixed by configuration, not by request parameters.
TTS_BASE_URL = (
    os.environ.get("TIANBAO_TTS_BASE") or "http://127.0.0.1:8030"
).strip().rstrip("/")

STATUS_TIMEOUT = _env_float("TIANBAO_TTS_STATUS_TIMEOUT", 4.0)
TTS_TIMEOUT = _env_float("TIANBAO_TTS_TIMEOUT", 60.0)

MAX_TEXT_LENGTH = 140
VOICE_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")
TTS_EMOTIONS = {"neutral", "happy", "shy", "comfort"}

# Response headers that carry the timing/cache data requested by the UI.
TTS_RESPONSE_HEADERS = (
    "X-Tianbao-Cache",
    "X-Tianbao-Generate-Ms",
    "X-Tianbao-Total-Ms",
    "X-Tianbao-Voice-Id",
    "Server-Timing",
)

# The model service is local. Never send those requests through a system HTTP
# proxy, even if http_proxy is configured in the server environment.
_DIRECT_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


class TTSProxyError(Exception):
    """A failure that should be reported to the browser as JSON."""

    def __init__(self, message, status=503, detail=None, upstream_status=None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.detail = detail
        self.upstream_status = upstream_status


def _read_error_body(error):
    """Read a small, human-readable body from an upstream HTTP error."""
    try:
        raw = error.read(8192)
    except Exception:  # noqa: BLE001 - error paths must never mask the original
        return None
    if not raw:
        return None
    text = raw.decode("utf-8", errors="replace").strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return text


def _open_upstream(path_or_url, *, data=None, timeout, accept):
    """Open an upstream request and translate every failure to TTSProxyError."""
    url = path_or_url
    if url.startswith("/"):
        url = f"{TTS_BASE_URL}{url}"

    request_obj = urllib.request.Request(
        url,
        data=data,
        headers={"Accept": accept},
        method="POST" if data is not None else "GET",
    )
    if data is not None:
        request_obj.add_header("Content-Type", "application/json")

    try:
        return _DIRECT_OPENER.open(request_obj, timeout=timeout)
    except urllib.error.HTTPError as error:
        detail = _read_error_body(error)
        status = 400 if 400 <= error.code < 500 else 503
        raise TTSProxyError(
            f"语音服务返回 HTTP {error.code}.",
            status=status,
            detail=detail,
            upstream_status=error.code,
        ) from error
    except urllib.error.URLError as error:
        reason = getattr(error, "reason", error)
        if isinstance(reason, TimeoutError) or "timed out" in str(reason).lower():
            raise TTSProxyError(
                "语音服务请求超时.", status=504, detail=str(reason)
            ) from error
        raise TTSProxyError(
            "无法连接本地语音服务, 正在使用备用语音.", status=503, detail=str(reason)
        ) from error
    except TimeoutError as error:
        raise TTSProxyError(
            "语音服务请求超时.", status=504, detail=str(error)
        ) from error
    except OSError as error:
        raise TTSProxyError(
            "无法连接本地语音服务, 正在使用备用语音.", status=503, detail=str(error)
        ) from error


def _error_response(error):
    payload = {"error": error.message}
    if error.upstream_status is not None:
        payload["upstream_status"] = error.upstream_status
    if error.detail is not None:
        payload["detail"] = error.detail
    response = jsonify(payload)
    response.status_code = error.status
    response.headers["Cache-Control"] = "no-store"
    return response


def _read_upstream_json(path):
    try:
        with _open_upstream(
            path,
            timeout=STATUS_TIMEOUT,
            accept="application/json",
        ) as upstream:
            raw = upstream.read()
            status = upstream.status
    except TTSProxyError:
        raise
    except OSError as error:
        raise TTSProxyError(
            "读取语音服务响应失败.", status=502, detail=str(error)
        ) from error

    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise TTSProxyError(
            "语音服务返回了无效的 JSON.", status=502, detail=str(error)
        ) from error

    if not isinstance(data, dict):
        raise TTSProxyError("语音服务返回了意外的 JSON 结构.", status=502)

    return data, status


def _json_response(data, status=200):
    response = jsonify(data)
    response.status_code = status
    response.headers["Cache-Control"] = "no-store"
    return response


tts_bp = Blueprint("tts_proxy", __name__)


@tts_bp.get("/api/tts/status")
def tts_status():
    """Forward GET /status from the voice service."""
    try:
        data, status = _read_upstream_json("/status")
    except TTSProxyError as error:
        return _error_response(error)
    return _json_response(data, status=status)


@tts_bp.get("/api/tts/voices")
def tts_voices():
    """Forward GET /voices; new server-side voices appear automatically."""
    try:
        data, status = _read_upstream_json("/voices")
    except TTSProxyError as error:
        return _error_response(error)
    return _json_response(data, status=status)


def _read_tts_payload():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise TTSProxyError("请求需要 JSON 对象.", status=400)

    text = data.get("text")
    if not isinstance(text, str) or not text.strip():
        raise TTSProxyError("text 不能为空.", status=400)
    text = text.strip()
    if len(text) > MAX_TEXT_LENGTH:
        raise TTSProxyError(
            f"text 最长 {MAX_TEXT_LENGTH} 个字符.", status=400
        )

    voice_id = data.get("voice_id", "yujie_v1")
    if not isinstance(voice_id, str) or not VOICE_ID_PATTERN.fullmatch(voice_id):
        raise TTSProxyError("voice_id 格式不正确.", status=400)

    emotion = data.get("emotion", "neutral")
    if emotion not in TTS_EMOTIONS:
        raise TTSProxyError(
            "emotion 必须是 neutral / happy / shy / comfort.",
            status=400,
        )

    cache = data.get("cache", True)
    if not isinstance(cache, bool):
        raise TTSProxyError("cache 必须是布尔值.", status=400)

    return {
        "text": text,
        "voice_id": voice_id,
        "emotion": emotion,
        "cache": cache,
    }


@tts_bp.post("/api/tts")
def tts_generate():
    """Forward POST /tts and relay the WAV plus timing/cache headers."""
    try:
        payload = _read_tts_payload()
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        with _open_upstream(
            "/tts",
            data=body,
            timeout=TTS_TIMEOUT,
            accept="audio/wav",
        ) as upstream:
            audio = upstream.read()
            content_type = upstream.headers.get("Content-Type", "audio/wav")
            upstream_headers = {
                name: upstream.headers.get(name)
                for name in TTS_RESPONSE_HEADERS
            }
    except TTSProxyError as error:
        return _error_response(error)
    except OSError as error:
        return _error_response(
            TTSProxyError("读取语音服务音频失败.", status=502, detail=str(error))
        )

    if not content_type.lower().startswith("audio/") and not audio.startswith(b"RIFF"):
        return _error_response(
            TTSProxyError(
                "语音服务返回了非音频内容.",
                status=502,
                detail=audio[:500].decode("utf-8", errors="replace"),
            )
        )

    response = Response(audio, status=200, content_type=content_type)
    response.headers["Cache-Control"] = "no-store"
    for name, value in upstream_headers.items():
        if value:
            # Header names are case-insensitive; Flask preserves this spelling.
            response.headers[name] = value
    return response
