# Windows / 局域网麦克风说明

## 先看：Windows 本机（WSL 页面）

如果你只是想在 Windows 浏览器里使用 Windows 麦克风：

1. 手机和 HTTPS 都不需要。
2. 在 **Windows 的 Chrome / Edge** 中打开 `http://localhost:5000/` 或 `http://127.0.0.1:5000/`。
3. 点麦克风，允许浏览器麦克风权限即可；浏览器会直接使用 Windows 的麦克风设备。

不要用 WSL 的 `http://172.x.x.x:5000` 地址：它不是安全上下文，浏览器会禁用麦克风。Windows 本机请始终使用 `localhost` / `127.0.0.1`。

如果使用 VS Code 的 Simple Browser 或内嵌预览，建议改用独立的 Chrome/Edge 窗口，避免内嵌 WebView 不给麦克风权限。

## 局域网手机：原因

浏览器只在 **安全上下文（secure context）** 里开放 `getUserMedia()`：

- `https://...` 可以
- `http://localhost` / `http://127.0.0.1` 可以（仅本机）
- `http://192.168.x.x:5000` **不可以**

所以手机通过局域网 IP 用 HTTP 打开 tianbao 时，麦克风会被浏览器直接拒绝。这不是代码 bug，也不能靠前端绕过。要解决，就必须让手机访问一个 **HTTPS** 地址，并在手机上信任该证书。

## 方案 A：项目自带的本地 HTTPS（推荐，局域网）

项目新增了：

- `scripts/make_dev_cert.sh`：生成本地开发证书
- `serve_https.py`：用 HTTPS 启动同一个 Flask 应用（默认 5443 端口）
- `/dev-cert.pem`：方便手机下载证书

### 1. 生成证书

```bash
cd /home/student_server/Qtt/tianbao
bash scripts/make_dev_cert.sh
```

如果安装了 `mkcert`，脚本会优先使用它；否则使用 OpenSSL 生成一个包含 `localhost`、`127.0.0.1` 和本机局域网 IP 的自签证书。

证书会写入 `certs/`，并且 `certs/` 已加入 `.gitignore`，不要把私钥提交到仓库。

### 2. 启动 HTTPS

```bash
python serve_https.py
```

默认监听 `0.0.0.0:5443`，只在局域网内使用。也可通过环境变量修改：

```bash
TIANBAO_HOST=0.0.0.0 TIANBAO_PORT=5443 python serve_https.py
```

终端会打印手机地址，例如：

```text
phone:  https://192.168.1.20:5443/
cert:   https://192.168.1.20:5443/dev-cert.pem
```

### 3. 在手机上安装并信任证书

1. 手机连接同一个局域网。
2. 用手机浏览器打开 `https://<电脑IP>:5443/dev-cert.pem`。
3. 第一次会出现证书警告，选择继续/仍要访问。
4. 下载并安装证书：
   - **iOS**：设置 → 通用 → VPN 与设备管理 → 安装描述文件；然后设置 → 通用 → 关于本机 → 证书信任设置 → 对 tianbao 开发证书开启完全信任。
   - **Android**：设置 → 安全 → 加密与凭据 → 安装证书 → CA 证书（不同品牌菜单名称略有差异）。
5. 重新打开 `https://<电脑IP>:5443/`；地址栏应显示安全锁。
6. 点语音面板中的麦克风，允许麦克风权限，即可录音。

> 如果使用 mkcert，需要把 `$(mkcert -CAROOT)/rootCA.pem` 安装到手机并信任，而不是 `certs/dev-cert.pem`。脚本会打印具体路径。

### 4. WSL 用户额外注意（很重要）

如果 Flask 运行在 WSL 里，手机通常不能直接访问 WSL 的 IP。需要让 Windows 把端口转发到 WSL，并且**证书的 SAN 必须包含手机实际访问的 Windows 主机 LAN IP**，否则浏览器仍会报证书名不匹配。

**第 1 步：用 Windows 主机 IP 重新生成证书**

在 WSL 里执行（把 IP 换成 Windows 电脑的局域网 IP，可用 Windows 的 `ipconfig` 查看）：

```bash
LAN_IP=192.168.1.20 bash scripts/make_dev_cert.sh
```

**第 2 步：Windows 端口转发**（管理员 PowerShell；`<WSL_IP>` 用 WSL 里的 `hostname -I` 获取）：

```powershell
netsh interface portproxy add v4tov4 listenport=5443 listenaddress=0.0.0.0 connectport=5443 connectaddress=<WSL_IP>
New-NetFirewallRule -DisplayName "tianbao https 5443" -Direction Inbound -Protocol TCP -LocalPort 5443 -Action Allow
```

**第 3 步：手机访问 Windows 主机的 LAN IP**：`https://192.168.1.20:5443/`。

> `serve_https.py` 在 WSL 里打印的 `phone:` 地址可能是 WSL 的 IP，不一定是手机能访问的地址。WSL 场景请以 Windows 主机的 LAN IP 为准。
>
> WSL 的 IP 重启后可能变化，portproxy 可能需要重新配置；Windows 主机 IP 变化后也需要用新的 `LAN_IP` 重新生成证书。

## 方案 B：临时公网 HTTPS 隧道

如果只想快速测试，也可以用 Cloudflare Tunnel / ngrok 等工具把本地端口映射成 HTTPS：

```bash
cloudflared tunnel --url http://127.0.0.1:5000
```

它会给出一个 HTTPS 地址。优点是不需要装证书；缺点是流量经过第三方服务，且需要联网。家庭空间/语音数据敏感，建议只在临时测试时使用，并优先选择方案 A。

## 安全提醒

- `serve_https.py` 默认绑定 `0.0.0.0`，只适合受信任的局域网。
- 不要把 5443 端口直接暴露到公网。
- 开发证书和私钥只用于本地开发，不要提交或分发。
- 使用完可以 `Ctrl+C` 停止 HTTPS 服务；不需要时删除端口转发规则：
  ```powershell
  netsh interface portproxy delete v4tov4 listenport=5443 listenaddress=0.0.0.0
  ```

## 验证清单

- 手机地址栏为 `https://` 且证书受信任。
- 语音面板显示麦克风可使用；点击时有系统权限提示。
- 录音结束后可以回放自己的录音。
- 如果仍然失败：检查手机和电脑是否同一网段、Windows 防火墙、portproxy、证书是否安装并启用完全信任。
