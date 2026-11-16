# Requirements
- **Node.js >= 22.13** (built-in SQLite is used — no native modules to compile) and npm >= 10
  (Termux's `pkg install nodejs` provides a recent version)
- npm packages (installed by `npm install`): express, ws, compression, web-push; optional: nodemailer
- Phones: Android 8+ with Chrome 90+ over **HTTPS** (needed for microphone, camera, push and installing the app)
- Hosting: HTTPS + WebSocket support — Cloudflare tunnel, Render, Railway, Fly.io, a VPS or Docker
- Server outbound internet: IP geolocation (optional), push services (FCM/Mozilla), Telegram (optional)
- Optional: TURN server (coturn via Docker, or Cloudflare Realtime TURN) for calls on strict networks
- Optional: email (SMTP) or SMS gateway (webhook) for verification codes
