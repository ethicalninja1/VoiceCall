#!/data/data/com.termux/files/usr/bin/bash
pkill -f "node server.js"
pkill -f "cloudflared tunnel"
command -v termux-wake-unlock >/dev/null && termux-wake-unlock
echo "Server and tunnel stopped."
