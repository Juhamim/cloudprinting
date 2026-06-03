# CloudPrint Agent

> The Windows desktop bridge between your USB printers and the CloudPrint server. Runs silently in the system tray, polls the server for jobs, and spools them to local printers automatically.

---

## Features

- 🖨️ **Plug-and-play printer detection** — automatically discovers and registers all locally connected USB printers with the CloudPrint server
- ☁️ **WebSocket + HTTP polling** — receives print jobs via WebSocket push (low latency) with automatic HTTP polling fallback
- 🔄 **Auto-reconnect** — exponential backoff reconnection ensures the agent recovers from network interruptions without intervention
- 🔒 **Encrypted settings** — server credentials are encrypted using a machine-derived key
- 🗂️ **Daily log rotation** — logs stored in `%APPDATA%\CloudPrint Agent\logs\` with 14-day retention
- 🚀 **Auto-update** — pulls updates silently from GitHub Releases via electron-updater
- 🖥️ **System tray** — runs in the background, status-indicator icon switches between Online / Offline / Printing states
- 🪟 **NSIS installer** — one-click installer with automatic Windows startup registration

---

## Quick Start

### 1 — Download

Grab the latest `CloudPrint Agent Setup x.x.x.exe` from [GitHub Releases](https://github.com/Juhamim/cloudprint-agent/releases).

### 2 — Install

Run the installer. It will:
- Install the app to `C:\Program Files\CloudPrint Agent\`
- Register it to run at Windows login (via `HKCU\...\Run`)
- Launch the agent after installation

### 3 — Configure

On first launch, the setup wizard will ask for:

| Field | Description |
|-------|-------------|
| **Server URL** | Your CloudPrint server address, e.g. `http://192.168.1.10:3000` |
| **WebSocket Secret** | The `WS_SECRET` value from your server's `.env.local` |
| **Agent ID** | A unique name for this machine, e.g. `office-hp-printer` |

### 4 — Done

The agent connects, syncs your printers with the server, and starts processing jobs. The tray icon turns **green** when online.

---

## System Requirements

- Windows 10 / 11 (64-bit)
- USB printer installed and working in Windows
- Network access to the CloudPrint server

---

## Building from Source

```bash
git clone https://github.com/Juhamim/cloudprint-agent
cd cloudprint-agent
npm install
npm start         # Run in development
npm run build:win # Build Windows installer → dist/
```

See [INSTALLATION.md](INSTALLATION.md) for a full development setup guide.

---

## License

MIT
