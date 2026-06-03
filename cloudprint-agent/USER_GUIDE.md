# User Guide

## Overview

CloudPrint Agent is a system tray application that runs silently in the background on your Windows PC. It bridges your locally connected USB printers with the CloudPrint web server, enabling cloud-based printing from any device.

---

## The System Tray Icon

The tray icon (bottom-right of your taskbar) shows the agent's current state:

| Icon | State | Meaning |
|------|-------|---------|
| 🟢 Green | Online | Connected to server, ready to print |
| 🔴 Grey/Red | Offline | Not connected — check server or settings |
| 🔵 Blue | Printing | A print job is currently being processed |

**Left-click** the tray icon to open/hide the dashboard window.  
**Right-click** the tray icon for the context menu:

- **Open Dashboard** — brings the window to the front
- **Start / Restart Agent** — reconnects to the server
- **Stop Agent** — pauses the agent (tray icon turns grey)
- **Quit CloudPrint Agent** — exits completely

---

## Dashboard Tabs

### Status Tab

Shows the current connection state, job counts, and connection details (server URL, Agent ID, poll interval). Use the **▶ Start**, **↺ Restart**, and **⏹ Stop** buttons to control the agent.

### Jobs Tab

A live history of all print jobs processed by this agent, including:
- File name and type icon
- Target printer
- Number of copies
- Status badge (Completed / Failed)
- Error message if the job failed

Click **Clear** to reset the job history display (this does not affect the server).

### Printers Tab

Lists all USB printers detected on this machine. Click **↺ Refresh** to re-scan after plugging in a new printer. The printer list is automatically synced to the CloudPrint server so it can route jobs correctly.

### Logs Tab

A live log view showing all agent activity in real time:
- **Grey** lines — normal info messages
- **Yellow** lines — warnings
- **Red** lines — errors

Click **⬇ Export** to save logs to a file, or **📂 Open Folder** to open the log directory.

### Settings Tab

Configure the agent's connection and behaviour:

| Setting | Description |
|---------|-------------|
| **Server URL** | Full URL of your CloudPrint server |
| **WebSocket URL** | WebSocket endpoint (auto-derived if left as default) |
| **WebSocket Secret** | Must match `WS_SECRET` on the server |
| **Agent ID** | Unique name for this machine (must match the server's printer registration) |
| **Force Printer** | Override routing — forces all jobs to one printer. Leave on Auto for plug-and-play |
| **Start minimised** | App opens silently to tray without showing the window |
| **Check for updates on start** | Enables automatic background update checks |
| **Poll interval** | How often (ms) the agent checks the server for new jobs |
| **Sync interval** | How often (ms) the agent syncs the local printer list with the server |

Click **💾 Save Settings** after making changes. Restart the agent for new connection settings to take effect.

---

## Plug-and-Play Printing

When the agent starts (or every 10 seconds), it scans your system for USB printers and registers them with the CloudPrint server. This means:

1. **Plug in a new printer** → it appears on the server within ~10 seconds
2. **Unplug a printer** → it shows as OFFLINE on the server automatically
3. **No manual configuration needed** — the server routes each job to the correct physical printer

To use plug-and-play routing, leave **Force Printer** set to **Auto**.

---

## Identifying a Printer (Test Page)

The CloudPrint server's admin dashboard has a **Ping Printer** button on the Printers page. Clicking it sends a test identification page to the physical printer, which is useful for verifying that routing is working correctly.

---

## Auto-Update

When a new version of CloudPrint Agent is released on GitHub, the agent will:
1. Detect the update silently in the background
2. Download it automatically
3. Show an **update banner** at the top of the window
4. Wait for you to click **Install & Restart** — or install on the next normal restart

You can also trigger a manual check via **Settings → 🔍 Check for Update**.

---

## Starting and Stopping the Agent

- **Start with Windows** — enabled automatically by the installer (via Windows startup key)
- **Temporarily stop** — right-click tray → Stop Agent (will restart on reboot)
- **Disable auto-start** — open Task Manager → Startup Apps → disable "CloudPrint Agent"

---

## Keyboard Shortcuts (Dashboard Window)

| Action | Shortcut |
|--------|----------|
| Minimize to tray | Window close button (×) |
| Switch tabs | Click tab buttons |

---

## Privacy & Security

- The agent only connects **outbound** to your CloudPrint server — no inbound ports
- All settings (including your `WS_SECRET`) are stored in an **encrypted** file using a machine-derived key
- Job files are downloaded temporarily to `%TEMP%`, printed, then immediately deleted
- Logs contain job titles and file sizes but **not** file contents
- The renderer window runs in a **sandboxed** Chromium context with no Node.js access
