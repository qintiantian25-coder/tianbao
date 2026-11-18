#!/usr/bin/env bash
# tianbao 前端服务脚本 / 服务台
#
#   bash scripts/dev.sh start [http|https]
#   bash scripts/dev.sh stop
#   bash scripts/dev.sh restart [http|https]
#   bash scripts/dev.sh status
#   bash scripts/dev.sh logs
#
# start 默认启动 HTTP 入口 app_web.py (127.0.0.1:5000)。
# start https 启动 serve_https.py (0.0.0.0:5443, 需先运行 make_dev_cert.sh)。
# 进程在后台运行，PID 和日志保存在 .run/ 下。

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
PID_FILE="$RUN_DIR/frontend.pid"
MODE_FILE="$RUN_DIR/frontend.mode"
LOG_FILE="$RUN_DIR/frontend.log"

mkdir -p "$RUN_DIR"

usage() {
  cat <<'EOF'
tianbao 服务台

用法:
  bash scripts/dev.sh start [http|https]   启动前端 (默认 http)
  bash scripts/dev.sh stop                 关闭前端
  bash scripts/dev.sh restart [http|https] 重启前端
  bash scripts/dev.sh status               查看运行状态
  bash scripts/dev.sh logs                 跟踪日志

模式:
  http   app_web.py      http://127.0.0.1:5000/
  https  serve_https.py  https://127.0.0.1:5443/  (需先运行 make_dev_cert.sh)

环境变量:
  PYTHON_BIN  指定 Python 解释器 (默认 python, 缺失时回退 python3)

运行时文件:
  PID   .run/frontend.pid
  日志  .run/frontend.log
EOF
}

read_pid() {
  if [ -f "$PID_FILE" ]; then
    tr -d '[:space:]' < "$PID_FILE"
  fi
}

is_running() {
  local pid="${1:-}"
  [ -n "$pid" ] || return 1
  kill -0 "$pid" 2>/dev/null || return 1

  # 防止 PID 复用后误判或误杀无关进程.
  ps -p "$pid" -o args= 2>/dev/null \
    | grep -Eq '(^|/)(app_web|serve_https)\.py'
}

current_mode() {
  if [ -f "$MODE_FILE" ]; then
    tr -d '[:space:]' < "$MODE_FILE"
  else
    printf 'http'
  fi
}

url_for_mode() {
  case "$1" in
    http) printf 'http://127.0.0.1:5000/' ;;
    https) printf 'https://127.0.0.1:5443/' ;;
    *) printf '' ;;
  esac
}

port_in_use() {
  local port="$1"

  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]$port$"
    return
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$port" -sTCP:LISTEN -t >/dev/null 2>&1
    return
  fi

  return 1
}

find_python() {
  local candidate="${PYTHON_BIN:-python}"

  if ! command -v "$candidate" >/dev/null 2>&1; then
    candidate="python3"
  fi
  if ! command -v "$candidate" >/dev/null 2>&1; then
    echo "找不到 Python 解释器; 请设置 PYTHON_BIN." >&2
    return 1
  fi
  if ! "$candidate" -c "import flask" >/dev/null 2>&1; then
    echo "当前 Python 环境缺少 Flask: $candidate" >&2
    echo "请先激活项目环境, 或设置 PYTHON_BIN=/path/to/python." >&2
    return 1
  fi

  printf '%s' "$candidate"
}

start_server() {
  local mode="${1:-$(current_mode)}"
  local pid

  case "$mode" in
    http|https) ;;
    *)
      echo "未知模式: $mode (可选 http 或 https)" >&2
      usage
      return 2
      ;;
  esac

  pid="$(read_pid)"
  if is_running "$pid"; then
    echo "tianbao 前端已在运行 (PID $pid, $(current_mode))."
    echo "  URL: $(url_for_mode "$(current_mode)")"
    return 0
  fi
  rm -f "$PID_FILE" "$MODE_FILE"

  local port=5000
  if [ "$mode" = "https" ]; then
    port=5443
  fi
  if port_in_use "$port"; then
    echo "端口 $port 已被占用, 可能已有一个前端在运行." >&2
    echo "请先关闭旧进程 (例如 pkill -f app_web.py), 或改用另一种模式." >&2
    return 1
  fi

  if [ "$mode" = "https" ] \
    && { [ ! -f "$ROOT_DIR/certs/dev-cert.pem" ] \
      || [ ! -f "$ROOT_DIR/certs/dev-key.pem" ]; }; then
    echo "缺少 HTTPS 开发证书; 先运行: bash scripts/make_dev_cert.sh" >&2
    return 1
  fi

  local python_bin
  python_bin="$(find_python)"

  local entrypoint="$ROOT_DIR/app_web.py"
  if [ "$mode" = "https" ]; then
    entrypoint="$ROOT_DIR/serve_https.py"
  fi

  printf '\n===== %s start %s =====\n' \
    "$(date '+%Y-%m-%d %H:%M:%S')" "$mode" >> "$LOG_FILE"

  (
    cd "$ROOT_DIR"
    nohup "$python_bin" "$entrypoint" >> "$LOG_FILE" 2>&1 &
    printf '%s\n' "$!" > "$PID_FILE"
    printf '%s\n' "$mode" > "$MODE_FILE"
  )

  sleep 1
  pid="$(read_pid)"
  if ! is_running "$pid"; then
    echo "启动失败, 最近日志:" >&2
    tail -n 20 "$LOG_FILE" >&2 || true
    rm -f "$PID_FILE" "$MODE_FILE"
    return 1
  fi

  echo "已启动 tianbao 前端 ($mode)."
  echo "  PID: $pid"
  echo "  URL: $(url_for_mode "$mode")"
  echo "  日志: $LOG_FILE"
  if [ "$mode" = "https" ]; then
    echo "  手机/局域网: 按 docs/https-lan-microphone.md 使用 Windows 主机 LAN IP."
  fi
}

stop_server() {
  local pid
  pid="$(read_pid)"

  if ! is_running "$pid"; then
    rm -f "$PID_FILE" "$MODE_FILE"
    echo "tianbao 前端未运行."
    return 0
  fi

  echo "正在关闭 tianbao 前端 (PID $pid)..."
  kill "$pid" 2>/dev/null || true

  local i
  for i in $(seq 1 25); do
    if ! is_running "$pid"; then
      break
    fi
    sleep 0.2
  done

  if is_running "$pid"; then
    echo "进程仍未退出, 发送 SIGKILL." >&2
    kill -9 "$pid" 2>/dev/null || true
  fi

  rm -f "$PID_FILE" "$MODE_FILE"
  echo "已关闭 tianbao 前端."
}

status_server() {
  local pid mode
  pid="$(read_pid)"

  if is_running "$pid"; then
    mode="$(current_mode)"
    echo "tianbao 前端运行中."
    echo "  PID: $pid"
    echo "  模式: $mode"
    echo "  URL: $(url_for_mode "$mode")"
    echo "  日志: $LOG_FILE"
    return 0
  fi

  rm -f "$PID_FILE" "$MODE_FILE"
  echo "tianbao 前端未运行."

  local port
  for port in 5000 5443; do
    if port_in_use "$port"; then
      echo "  注意: 端口 $port 仍被占用 (可能是手动启动的进程)."
    fi
  done
  return 1
}

show_logs() {
  if [ ! -f "$LOG_FILE" ]; then
    echo "还没有日志: $LOG_FILE"
    return 0
  fi

  tail -n 80 -f "$LOG_FILE"
}

action="${1:-help}"
case "$action" in
  start|up)
    shift || true
    start_server "${1:-}"
    ;;
  stop|down)
    stop_server
    ;;
  restart)
    shift || true
    previous_mode="$(current_mode)"
    stop_server
    start_server "${1:-$previous_mode}"
    ;;
  status)
    status_server
    ;;
  logs|log)
    show_logs
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    echo "未知命令: $action" >&2
    usage
    exit 2
    ;;
esac
