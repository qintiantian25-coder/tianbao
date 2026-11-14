#!/usr/bin/env bash
# Create a local development certificate for the tianbao HTTPS entry.
#
#   bash scripts/make_dev_cert.sh
#
# If mkcert is installed it is preferred (a locally trusted CA). Otherwise an
# OpenSSL self-signed certificate with localhost, 127.0.0.1 and the detected
# LAN IP is generated. The phone must install/trust the certificate before the
# browser treats https://<LAN-IP>:5443 as a secure origin for getUserMedia.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_DIR="$ROOT_DIR/certs"
CERT_FILE="$CERT_DIR/dev-cert.pem"
KEY_FILE="$CERT_DIR/dev-key.pem"

LAN_IP="${LAN_IP:-}"
if [ -z "$LAN_IP" ]; then
  LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
fi
if [ -z "$LAN_IP" ]; then
  LAN_IP="127.0.0.1"
fi

mkdir -p "$CERT_DIR"

if command -v mkcert >/dev/null 2>&1; then
  echo "Using mkcert for $LAN_IP, localhost, 127.0.0.1 ..."
  mkcert -cert-file "$CERT_FILE" -key-file "$KEY_FILE" \
    tianbao.local localhost 127.0.0.1 "$LAN_IP"
  CA_ROOT="$(mkcert -CAROOT 2>/dev/null || true)"
  echo
  echo "Certificate created:"
  echo "  $CERT_FILE"
  echo "  $KEY_FILE"
  if [ -n "$CA_ROOT" ]; then
    echo
    echo "For the phone, install/trust this root CA:"
    echo "  $CA_ROOT/rootCA.pem"
    echo "Download it to the phone and install it as a trusted CA, then enable"
    echo "full trust for it (iOS: Settings > General > About > Certificate Trust Settings)."
  fi
else
  echo "mkcert not found; using OpenSSL self-signed certificate for:"
  echo "  tianbao.local localhost 127.0.0.1 $LAN_IP"
  openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes \
    -keyout "$KEY_FILE" -out "$CERT_FILE" \
    -subj "/CN=tianbao.local" \
    -addext "subjectAltName=DNS:tianbao.local,DNS:localhost,IP:127.0.0.1,IP:$LAN_IP"
  chmod 600 "$KEY_FILE"
  echo
  echo "Certificate created:"
  echo "  $CERT_FILE"
  echo "  $KEY_FILE"
  echo
  echo "On the phone: open https://$LAN_IP:5443/dev-cert.pem after starting"
  echo "serve_https.py, accept the warning once, install the profile/certificate,"
  echo "and trust it. Then reopen https://$LAN_IP:5443/ and allow the microphone."
fi

echo
echo "Next:"
echo "  python serve_https.py"
echo "  phone: https://$LAN_IP:5443/"
echo "See docs/https-lan-microphone.md for WSL port forwarding and trust steps."
