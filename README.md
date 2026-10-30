# ⚡ Nova WA Bot — Multi-Session Companion Infrastructure

**Nova WA Bot** is a modern, high-performance WhatsApp Companion Bot and Multi-Session Platform built with **Node.js, Express, and `@whiskeysockets/baileys`**. It provides a 3-step Glassmorphic web pairing wizard supporting both **8-Digit Companion Pairing Codes** and **Real-Time QR Codes**, combined with an automation engine featuring Anti-Call, Anti-Delete, Auto-React, and VIP Access Key authorization.

---

## 🌟 Key Features

* **Dual Pairing Engine:**
  * **8-Digit Alphanumeric Code:** Native WhatsApp multi-device companion linking (`sock.requestPairingCode`).
  * **Real-Time Dynamic QR Code:** Base64 QR streaming with automatic 3-minute socket cleanup to bypass phone rate limits.
* **Multi-Session Isolation:** Run concurrent, completely independent WhatsApp accounts on a single node without cross-contamination.
* **Security & VIP Access Key System:** Protect pairing behind configurable VIP keys (`NOVA-VIP-2026`) with whitelisted Admin number bypass.
* **Anti-Call Auto-Reject:** Automatically detects incoming voice and video calls, rejects them instantly, and sends an automated notice to protect privacy.
* **Anti-Delete / Revoke Logger:** Intercepts deleted/revoked messages and forwards the original content to the bot owner.
* **Auto-React Engine:** Automatically adds emoji reactions to incoming trigger words.
* **Group & Admin Controls:** Built-in `.adminlock`, `.tagall`, `.ping`, `.owner`, and `.menu` commands.
* **Multi-Node Load Balancer:** Telemetry `/ping` endpoint reporting active session counts and node health to the frontend.

---

## 🚀 Quick Start (Local Setup)

### 1. Prerequisites
* **Node.js v18+** or higher (v20+ recommended)
* **npm** or **yarn**

### 2. Installation
Open your terminal in this directory:
```bash
cd "C:\Users\.ONE\.gemini\antigravity\scratch\nova-wa-bot"
npm install
```

### 3. Configuration
Copy the sample environment file:
```bash
copy .env.example .env
```
Edit `.env` or `config.js` to set your brand parameters, VIP keys, and admin numbers:
* `BRAND_NAME`: Set to your brand (e.g. `Nova WA Bot`)
* `VIP_KEYS`: Comma-separated list of active keys (e.g. `NOVA-VIP-2026,VIP-99`)
* `ADMIN_NUMBERS`: Numbers that bypass key checks (e.g. `3318447030,3285118386`)
* `CHANNEL_URL`: Your official WhatsApp Channel link

### 4. Run the Server
```bash
npm start
```
Open [http://localhost:3000](http://localhost:3000) in your browser!

---

## 📡 API Specification

| Endpoint | Method | Parameters | Description |
| :--- | :--- | :--- | :--- |
| `/ping` | `GET` | `_t=<timestamp>` | Health check & active session count for load balancing |
| `/code` | `GET` | `?number=<phone>&access_key=<key>` | Generates 8-digit companion pairing code |
| `/pairing/status` | `GET` | `?number=<phone>` | Polls connection state (`waiting`, `starting`, `connected`) |
| `/qr/start` | `POST` | `{"number": "...", "access_key": "..."}` | Initializes ephemeral QR session |
| `/qr/status/:id` | `GET` | none | Polls QR image data URL and status |
| `/qr/cancel/:id` | `POST` | none | Gracefully terminates QR session |

---

## 🌐 Cloud Deployment Options

### 1. Heroku Deployment
1. Create a new Heroku app:
   ```bash
   heroku create nova-wa-bot
   ```
2. Set configuration variables:
   ```bash
   heroku config:set BRAND_NAME="Nova WA Bot" VIP_KEYS="NOVA-VIP-2026"
   ```
3. Deploy code:
   ```bash
   git push heroku main
   ```

### 2. Render / Railway Deployment
* Build Command: `npm install`
* Start Command: `npm start`
* Environment Variables: Configure `PORT`, `VIP_KEYS`, and `ADMIN_NUMBERS`.

### 3. Docker Deployment
Create a `Dockerfile`:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```
Build & run:
```bash
docker build -t nova-wa-bot .
docker run -p 3000:3000 -v $(pwd)/sessions:/app/sessions nova-wa-bot
```

---

## 🔒 Security Best Practices
1. **Never commit the `sessions/` directory**: Signal Protocol private keys are stored in `sessions/session_<number>`. Always keep `sessions/` in `.gitignore`.
2. **Respect WhatsApp Terms**: Do not use automated bots for unsolicited bulk messaging to avoid permanent phone bans.
3. **Use Companion Mode**: This project uses the official WhatsApp Multi-Device Companion linking flow, reducing ban risks compared to unauthorized web scrapers.
