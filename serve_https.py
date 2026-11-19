"""Local HTTPS entry for tianbao.

Browsers only expose getUserMedia (microphone) on secure origins: HTTPS,
localhost, or 127.0.0.1. A plain http://<LAN-IP>:5000 address cannot record,
regardless of browser settings. This entry wraps the existing Flask app with a
local certificate so a phone on the same LAN can use the microphone after the
certificate is trusted.

    bash scripts/make_dev_cert.sh
    python serve_https.py

Environment overrides:
    TIANBAO_TLS_CERT / TIANBAO_TLS_KEY   certificate paths
    TIANBAO_HOST                         default 0.0.0.0 (LAN access)
    TIANBAO_PORT                         default 5443
    TIANBAO_AUTONOMY_INTERVAL            autonomy decision interval (default 10s)

Development use only; a Flask dev server and a local certificate are not a
production web-server setup. Do not expose this port to the internet.
"""

import os
import socket
from pathlib import Path

from flask import send_file

from app_web import app, start_autonomy_loop, stop_autonomy_loop

BASE_DIR = Path(__file__).resolve().parent
CERT_PATH = Path(os.environ.get("TIANBAO_TLS_CERT", BASE_DIR / "certs" / "dev-cert.pem"))
KEY_PATH = Path(os.environ.get("TIANBAO_TLS_KEY", BASE_DIR / "certs" / "dev-key.pem"))
HOST = os.environ.get("TIANBAO_HOST", "0.0.0.0")
PORT = int(os.environ.get("TIANBAO_PORT", "5443"))


def detect_lan_ip():
    """Best-effort LAN address for printing a phone-friendly URL."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        address = sock.getsockname()[0]
        sock.close()
        return address
    except OSError:
        try:
            return socket.gethostbyname(socket.gethostname())
        except OSError:
            return "127.0.0.1"


@app.get("/dev-cert.pem")
def dev_certificate():
    """Serve the development certificate for installing/trusting on a phone."""
    if not CERT_PATH.is_file():
        return "development certificate not found; run scripts/make_dev_cert.sh", 404
    return send_file(
        CERT_PATH,
        mimetype="application/x-pem-file",
        as_attachment=True,
        download_name="tianbao-dev-cert.pem",
    )


def main():
    """HTTPS 入口：启动 Flask 和后台自主行为循环。"""
    if not CERT_PATH.is_file() or not KEY_PATH.is_file():
        print("TLS certificate not found.")
        print("Run this first:  bash scripts/make_dev_cert.sh")
        print(f"Expected:        {CERT_PATH}")
        print(f"                 {KEY_PATH}")
        raise SystemExit(1)

    lan_ip = detect_lan_ip()
    print("tianbao HTTPS dev server")
    print(f"  local:  https://127.0.0.1:{PORT}/")
    print(f"  phone:  https://{lan_ip}:{PORT}/")
    print(f"  cert:   https://{lan_ip}:{PORT}/dev-cert.pem")
    print("Install and trust the development certificate on the phone first.")
    print("Microphone only works after the certificate is trusted; see")
    print("docs/https-lan-microphone.md.")
    print("WSL: phones must use the Windows host LAN IP, and the certificate")
    print("must be generated with LAN_IP=<that IP> (see the docs).")
    print("This is a LAN development server, not a public deployment.")

    try:
        start_autonomy_loop()
        # use_reloader=False 很重要：否则 reloader 的父子进程会各启动一个循环.
        app.run(
            host=HOST,
            port=PORT,
            ssl_context=(str(CERT_PATH), str(KEY_PATH)),
            debug=False,
            use_reloader=False,
            threaded=True,
        )
    finally:
        stop_autonomy_loop()


if __name__ == "__main__":
    main()
