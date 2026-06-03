# Troubleshooting Guide

## Agent Won't Start

### "Missing settings: wsSecret, agentId"

The Setup Wizard appears on launch if the agent is not configured. Fill in:
- **Server URL** — the full URL of your CloudPrint server
- **WebSocket Secret** — the `WS_SECRET` from the server's `.env.local`
- **Agent ID** — a unique name for this machine

### "Unauthorized — check WS_SECRET"

The secret doesn't match the server's `WS_SECRET` environment variable.

**Fix:** Open Settings → paste the exact value of `WS_SECRET` from the server's `.env.local` file.

---

## Agent Shows Offline / Red Tray Icon

### Server not reachable

1. Check that the CloudPrint server is running (`node server.js` or your deployment)
2. Verify the **Server URL** in Settings is correct and reachable from this machine
3. Try opening the server URL in a browser from this PC

### Firewall blocking outbound connections

Windows Firewall may block Node.js. Go to:
**Windows Security → Firewall → Allow an app through Firewall** → check that `CloudPrint Agent` (or `electron.exe`) has outbound access.

### Wrong port

Make sure the port in your Server URL matches the server's `PORT` env variable (default `3000`).

---

## Printers Not Showing Up

### No printers detected

1. Make sure your USB printer is plugged in and powered on
2. Check it appears in Windows **Settings → Bluetooth & Devices → Printers & Scanners**
3. Click **↺ Refresh** on the Printers tab in the agent

### Printers detected locally but not showing on the server dashboard

1. Check the Logs tab for sync errors
2. The sync endpoint is `POST /api/receiver/sync` — verify it is reachable
3. Make sure the server has the sync route implemented (requires the latest server update)

---

## Print Jobs Not Processing

### Job queued but never printed

1. Check the server dashboard — is the job status stuck on **QUEUED**?
2. Open the Logs tab in the agent — look for poll errors or `HTTP 4xx` responses
3. Verify the agent's **Agent ID** exactly matches what is registered on the server dashboard (Printers page)

### "Download failed: HTTP 403" or "HTTP 404"

The file URL in the job is inaccessible from this machine. This usually means:
- The Cloudflare R2 bucket or pre-signed URL has expired
- The server's `R2_PUBLIC_URL` is misconfigured

### "Print failed: Printer not found"

The printer name in the job's routing doesn't match any installed printer.

**Fix:** Go to Settings → set a **Force Printer** override to your printer's exact name as shown in Windows.

---

## Auto-Update Not Working

### No update notifications

1. Check Settings → **Check for updates on start** is enabled
2. Check that this machine has internet access to `https://github.com`
3. Check the Logs tab for updater errors

### "Cannot check for updates" error

This happens in development builds. Auto-update only works in production builds (signed, from a GitHub Release).

---

## How to Export Logs

1. Open the **Logs** tab
2. Click **⬇ Export** — a Save dialog will open
3. Save the `.txt` file and share it when reporting issues

Alternatively, click **📂 Open Folder** to open the log directory directly:
```
%APPDATA%\CloudPrint Agent\logs\
```

---

## Resetting All Settings

```powershell
# Stop the app first, then run:
Remove-Item -Recurse -Force "$env:APPDATA\CloudPrint Agent"
```

The Setup Wizard will reappear on next launch.

---

## Reporting Bugs

Please open an issue on [GitHub](https://github.com/Juhamim/cloudprint-agent/issues) and include:
- Your exported log file
- Windows version (`winver`)
- CloudPrint Agent version (shown in the title bar)
- What you were trying to do when the error occurred
