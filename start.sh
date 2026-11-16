#!/data/data/com.termux/files/usr/bin/bash
# Starts the server + a Cloudflare tunnel in the background and prints the public URL (Termux).
#   Quick tunnel (random URL):  ./start.sh
#   Fixed URL (named tunnel):   CF_TUNNEL_TOKEN=xxxx PUBLIC_URL=https://call.yourdomain.com ./start.sh
cd "$(dirname "$0")"
export NODE_NO_WARNINGS=1

command -v node >/dev/null || pkg install -y nodejs
command -v cloudflared >/dev/null || pkg install -y cloudflared
[ -d node_modules ] || npm install --omit=dev

command -v termux-wake-lock >/dev/null && termux-wake-lock   # keep running while the screen is off

pkill -f "node server.js" 2>/dev/null
pkill -f "cloudflared tunnel" 2>/dev/null
sleep 1
: > server.log; : > tunnel.log

nohup node server.js > server.log 2>&1 &
for i in $(seq 1 15); do
  curl -s http://localhost:3000/health >/dev/null && break
  sleep 1
done
if ! curl -s http://localhost:3000/health >/dev/null; then
  echo "Server did not start. Check: cat server.log"; exit 1
fi
echo "Server is running on port 3000."
if grep -q "ADMIN PASSWORD" server.log 2>/dev/null; then
  echo; grep -A3 -B3 "ADMIN PASSWORD" server.log; echo
fi

if [ -n "$CF_TUNNEL_TOKEN" ]; then
  nohup cloudflared tunnel --no-autoupdate run --token "$CF_TUNNEL_TOKEN" > tunnel.log 2>&1 &
  URL="${PUBLIC_URL:-}"
  sleep 4
else
  # http2 is more reliable than QUIC on many mobile networks (override: CF_PROTOCOL=quic ./start.sh)
  nohup cloudflared tunnel --no-autoupdate --protocol "${CF_PROTOCOL:-http2}" --url http://localhost:3000 > tunnel.log 2>&1 &
  echo "Starting tunnel, please wait..."
  URL=""
  for i in $(seq 1 45); do
    URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' tunnel.log | head -1)
    [ -n "$URL" ] && break
    sleep 1
  done
fi

if [ -n "$URL" ]; then
  echo "$URL" > url.txt
  echo
  echo "=============================================="
  echo " App URL:      $URL"
  echo " Admin panel:  $URL/admin   (username: admin)"
  echo "=============================================="
  echo "Open the App URL in Chrome on every phone, create an account, and you are ready."
  echo "Forgot the admin password? Run: node admin-password.js      Stop everything: ./stop.sh"
else
  echo "Could not get a tunnel URL. Check: cat tunnel.log"
fi
