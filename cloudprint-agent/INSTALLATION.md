# Installation Guide

## Installer (Recommended)

### Step 1 — Download

Download `CloudPrint Agent Setup x.x.x.exe` from the [GitHub Releases page](https://github.com/Juhamim/cloudprint-agent/releases/latest).

### Step 2 — Run the Installer

Double-click the `.exe` file. Windows SmartScreen may warn about an unsigned app — click **More Info → Run Anyway**.

The installer will:
1. Show a welcome screen with installation directory selection
2. Copy files to `C:\Program Files\CloudPrint Agent\`
3. Create desktop and Start Menu shortcuts
4. Register `CloudPrint Agent` in `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` so it starts with Windows
5. Launch the app immediately after install

### Step 3 — First-Launch Setup

The **Setup Wizard** opens automatically on the first run:

1. **Server URL** — enter the full URL of your CloudPrint server including port:
   ```
   http://192.168.1.100:3000
   ```
   Use `https://` if your server has TLS configured.

2. **WebSocket Secret** — copy the `WS_SECRET` value from your server's `.env.local` file.

3. **Agent ID** — enter a short, unique identifier for this machine (no spaces):
   ```
   office-main-printer
   ```

4. Click **Save & Connect** — the agent will connect, register your printers, and begin processing jobs.

---

## Development Installation

```bash
# Clone the repository
git clone https://github.com/Juhamim/cloudprint-agent.git
cd cloudprint-agent

# Install dependencies
npm install

# Start in development mode (DevTools enabled)
npm run dev

# Build production Windows installer
npm run build:win
```

The installer will be output to `dist/CloudPrint Agent Setup x.x.x.exe`.

### Environment Notes

- Requires **Node.js 18+** and **npm 9+**
- Electron is installed as a dev dependency — no global install needed
- `electron-builder` downloads Windows build tools automatically
- The `pdf-to-printer` package requires **SumatraPDF** to be available on the PATH for production use. The installer bundles this automatically via `extraResources`.

---

## Uninstall

### Via Add/Remove Programs (Recommended)

Go to **Settings → Apps → Installed Apps**, search for "CloudPrint Agent", click **Uninstall**.

This will:
- Remove all installed files
- Remove the Start Menu and Desktop shortcuts
- Remove the startup registry key

> ℹ️ Your settings file (`%APPDATA%\CloudPrint Agent\`) is **not** deleted on uninstall, so your configuration is preserved if you reinstall.

### Manual Cleanup

To completely remove all traces:

```powershell
# Remove settings and logs
Remove-Item -Recurse -Force "$env:APPDATA\CloudPrint Agent"

# Remove startup key
Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "CloudPrint Agent" -ErrorAction SilentlyContinue
```

---

## Firewall Considerations

The agent makes **outbound HTTP/HTTPS and WebSocket connections** to your CloudPrint server.
- No inbound ports are required
- Windows Firewall should not require any changes for LAN or internet servers

If your server is on a remote VPN, ensure the VPN client is connected before starting the agent.
