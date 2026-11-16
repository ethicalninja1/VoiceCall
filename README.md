# VoiceCall 4.0 — accounts, DP, direct chat, HD calls + secure admin console

## What's new in 4.0
- **Sign up / sign in with email or mobile number** — your 6-digit ID, name, contacts and chats stay the same on every device.
  Sign out / sign in any time. Optional OTP verification (email via SMTP, SMS via webhook), password reset, per-account lockout.
- **Unique names** (live availability check) and **profile photo (DP)** + About text.
- **Direct chat** (1-to-1, works even when the other person is offline): delivery ticks (✓ sent, ✓✓ delivered, blue ✓✓ read),
  typing indicator, photos, emoji picker, unread badges, block / report.
- **Contacts grid** with DP, **Online / Offline / Last seen** (live), quick chat / voice / video buttons; grid or list view.
- **Rings even when the app is closed** (Web Push) with Answer / Decline buttons; message notifications too.
- **Calls:** voice/video, filters, screen share (desktop), recording (peer notified), in-call chat + files + voice notes,
  quality modes, stats, call **security code** (verify nobody listens in), call history synced from the server.
- **Fast:** instant start from cache, installable PWA with cached app shell, gzip, batched rendering, immutable photo caching.
- **Admin console** (`/admin`): accounts with DP, **email/mobile, IP, location, GPS, device**, sign-in log, live map, calls,
  reports, activity, 2FA (authenticator app), Telegram alerts, daily DB backups, retention, CSV export, broadcast.

## Run on Termux
    unzip VoiceCall.zip -d ~/ && cd ~/VoiceCall
    chmod +x start.sh stop.sh
    ./start.sh
Prints the **App URL**, the **Admin URL** (`/admin`) and — on first run only — the **admin password**.
Open the App URL in Chrome on every phone → *Create account* → allow permissions once → done.
Stop: `./stop.sh` · Reset admin password: `node admin-password.js`

**Fixed link (recommended):** a quick-tunnel URL changes on every restart, and a browser keeps its login per URL.
Create a free *named tunnel* in Cloudflare Zero Trust, then:
`CF_TUNNEL_TOKEN=xxxx PUBLIC_URL=https://call.yourdomain.com ./start.sh`

## Deploy on Render (recommended hosting)
1. Put the project files at the **root** of a GitHub repository (package.json must be at the top level).
2. Render dashboard → **New → Blueprint** → select the repo. `render.yaml` creates the web service, a 1 GB disk and the settings.
   (Or **New → Web Service** manually: build `npm install --omit=dev`, start `node server.js`, health check `/health`,
   env `NODE_VERSION=22`, `DATA_DIR=/var/data`, and a **Disk** mounted at `/var/data`.)
3. Open the service → **Environment** and copy the generated `ADMIN_PASSWORD`.
4. Your HTTPS URL is the app: `https://<name>.onrender.com` · admin: `https://<name>.onrender.com/admin` (user `admin`).
- A disk needs a paid instance (Starter+). The free plan sleeps and loses data, so calls would not ring.
- Add `TURN_*` or `CF_TURN_*` variables if calls fail between some mobile networks (see `.env.example`).
- Push (calls when the app is closed) works automatically over Render's HTTPS.

## Deploy with Docker (server + your own TURN relay)
    cp .env.example .env     # edit
    docker compose up -d --build        # put HTTPS in front of port 3000
> Docker files are included but were not run in the build environment — test them once on your server.

## Verification codes & password reset
Set `SMTP_URL` (email) and/or `SMS_WEBHOOK_URL` (POST `{"to","text"}` — adapt Twilio / MSG91 / Fast2SMS). With a channel configured,
new accounts must enter a code; without one, accounts are created *unverified* (admin can mark them verified) and a forgotten
password is reset by the admin (Accounts → user → *Reset password*). See `.env.example` for every option.

## Admin console
Accounts (search, filters, DP, email/mobile, IP + history, ISP, IP location, GPS + map links, device, sessions, sign-in history,
rename / disconnect / sign out everywhere / reset password / verify / ban / delete) · Sign-ins · Live map (OpenStreetMap) ·
Calls · Reports · Activity · Tools (broadcast, backup now, 2FA, password, server status).
Security: scrypt passwords, optional TOTP 2FA, HttpOnly + SameSite=Strict cookie, 5-failure lockout, CSRF header on writes,
strict CSP, no-store. Env: `ADMIN_USER`, `ADMIN_PASSWORD`, `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`.

## Privacy & data (please read)
- On sign-up users must accept that the admin can see **name, ID, email/mobile, IP, device and approximate location**; precise **GPS** only
  if the user allows it (and can switch it off). Passwords are hashed. Chat **text is stored on the server** so offline users receive it;
  the admin console shows only message *counts*, never content. Calls, video and in-call chat are peer-to-peer.
- Users can delete their account (Me → Delete); the admin can export/delete any record. Data lives in `data/` — keep it private;
  `MESSAGE_RETENTION_DAYS` can auto-delete old messages. Use this only with informed users and follow your local privacy law.

## Limits
- Push needs HTTPS and a user-granted notification permission; it shows a notification with Answer / Decline (not a full-screen ringtone).
- Browsers can't switch earpiece/speaker (the speaker button mutes the other side). Screen share is desktop-only.
- **Not included yet:** group calls, background blur, Hindi UI, native Android app, QR codes, voicemail.

## Tests
    npm install && npm test        # 18 backend tests: accounts, OTP, DP, chat, presence, push, admin, 2FA, persistence

## Structure
    VoiceCall/
    ├── server.js                accounts, sign-in, DP, contacts, chat, presence, calls, push, admin hooks
    ├── lib/ db.js (SQLite) · auth.js · admin.js · admin-creds.js · totp.js · push.js · notify.js · geo.js · names.js · util.js
    ├── admin/                   admin console (index.html + assets/ admin.css · admin.js)
    ├── public/                  the app (index.html · style.css · app.js · sw.js · manifest · icons)
    ├── test/server.test.js      automated tests
    ├── start.sh · stop.sh · admin-password.js
    ├── Dockerfile · docker-compose.yml · docker/turnserver.conf
    └── .env.example · README.md · REQUIREMENTS.md · requirements.txt · package.json
