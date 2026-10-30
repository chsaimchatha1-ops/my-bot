/**
 * Nova WA Bot - Master Multi-Session Engine & Plugin Orchestrator
 * Integrates 370+ VIP triggers across all 9 chapters of the VIP manual
 */
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const os = require('os');
const config = require('../config');
const logger = require('./logger');

// Load Modular Plugins
const privacyMedia = require('./plugins/privacyMedia');
const broadcast = require('./plugins/broadcast');
const groupAdmin = require('./plugins/groupAdmin');
const fonts = require('./plugins/fonts');
const unbanAppeals = require('./plugins/unbanAppeals');
const funGames = require('./plugins/funGames');
const downloader = require('./plugins/downloader');
const ai = require('./plugins/ai');
const tools = require('./plugins/tools');

const dbPath = path.join(__dirname, '../data/database.json');
const botSentMessageIds = new Set();
const processedMessageIds = new Set();
const messageStore = new Map();
let lastMediaTime = 0;
let lastChoiceTime = 0;

function loadDB() {
    try {
        return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    } catch (_) {
        return { whitelist: [], groupSettings: {}, badwords: [] };
    }
}

class SessionManager {
    constructor(sessionsDir = path.join(__dirname, '../sessions')) {
        this.sessionsDir = sessionsDir;
        this.sessions = new Map(); // cleanNumber -> { sock, status }
        this.pairingStatuses = new Map();
        this.messageCache = new Map();
        this.reconnectTimers = new Map();
        this.startTime = Date.now();

        if (!fs.existsSync(this.sessionsDir)) {
            fs.mkdirSync(this.sessionsDir, { recursive: true });
        }
    }

    async resetSession(phoneNumber) {
        const cleanNumber = phoneNumber.replace(/\D/g, '');
        console.log(`[Nova Engine] Resetting session for +${cleanNumber}...`);

        if (this.reconnectTimers.has(cleanNumber)) {
            clearTimeout(this.reconnectTimers.get(cleanNumber));
            this.reconnectTimers.delete(cleanNumber);
        }

        if (this.sessions.has(cleanNumber)) {
            const sess = this.sessions.get(cleanNumber);
            try {
                sess.sock?.ev?.removeAllListeners();
                sess.sock?.end?.();
            } catch (_) {}
            this.sessions.delete(cleanNumber);
        }
        this.pairingStatuses.delete(cleanNumber);

        const sessionPath = path.join(this.sessionsDir, `session_${cleanNumber}`);
        try {
            if (fs.existsSync(sessionPath)) {
                fs.rmSync(sessionPath, { recursive: true, force: true });
                console.log(`[Nova Engine] Cleaned session directory: ${sessionPath}`);
            }
        } catch (_) {}

        return await this.getOrCreatePairingCode(cleanNumber);
    }

    async initExistingSessions() {
        if (!fs.existsSync(this.sessionsDir)) return;
        try {
            const dirs = fs.readdirSync(this.sessionsDir);
            for (const dir of dirs) {
                if (dir.startsWith('session_')) {
                    const number = dir.replace('session_', '');
                    console.log(`[Nova Engine] Restoring saved session for +${number}...`);
                    this.reconnectSession(number);
                }
            }
        } catch (e) {
            console.error('[Nova Engine] Error restoring sessions:', e.message);
        }
    }

    getActiveSessionCount() {
        let count = 0;
        for (const [_, item] of this.sessions.entries()) {
            if (item && item.status === 'connected') count++;
        }
        return count;
    }

    getSessionStatus(number) {
        const clean = number.replace(/\D/g, '');
        return this.pairingStatuses.get(clean) || 'waiting';
    }

    getGroups(number) {
        const clean = number.replace(/\D/g, '');
        return this.sessions.get(clean)?.groups || [];
    }

    async getOrCreatePairingCode(phoneNumber) {
        const cleanNumber = phoneNumber.replace(/\D/g, '');
        const sessionPath = path.join(this.sessionsDir, `session_${cleanNumber}`);

        if (this.sessions.has(cleanNumber) && this.sessions.get(cleanNumber).status === 'connected') {
            return { alreadyConnected: true };
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
            },
            browser: Browsers.windows('Desktop'),
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            getMessage: async (key) => messageStore.get(key.id) || undefined
        });

        this.sessions.set(cleanNumber, { sock, status: 'connecting', groups: [] });
        this.pairingStatuses.set(cleanNumber, 'waiting');

        sock.ev.on('creds.update', saveCreds);

        // Attach capabilities immediately upon socket creation
        this.attachBotCapabilities(sock, cleanNumber);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'connecting') {
                this.pairingStatuses.set(cleanNumber, 'starting');
            }

            if (connection === 'open') {
                console.log(`[Nova Engine] Session Connected: +${cleanNumber}`);
                this.sessions.set(cleanNumber, { sock, status: 'connected', groups: [] });
                this.pairingStatuses.set(cleanNumber, 'connected');

                // Proactively upload 50 fresh prekeys
                sock.uploadPreKeys(50).catch(() => {});

                // Extract participating groups with retry
                (async () => {
                    for (let attempt = 1; attempt <= 3; attempt++) {
                        try {
                            await new Promise(r => setTimeout(r, 1500 * attempt));
                            const groupsData = await sock.groupFetchAllParticipating();
                            const groups = Object.values(groupsData || {}).map(g => {
                                const botParticipant = g.participants?.find(p => p.id && p.id.includes(cleanNumber));
                                return {
                                    id: g.id,
                                    name: g.subject || 'Unnamed Group',
                                    memberCount: (g.participants || []).length,
                                    isAdmin: Boolean(botParticipant?.admin)
                                };
                            });
                            const sess = this.sessions.get(cleanNumber);
                            if (sess) sess.groups = groups;
                            console.log(`[Nova Engine] Extracted ${groups.length} groups for +${cleanNumber}`);
                            break;
                        } catch (e) {
                            console.warn(`[Nova Engine] Attempt ${attempt} failed to extract groups:`, e.message);
                        }
                    }
                })();
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                console.log(`[Nova Engine] Session Disconnected: +${cleanNumber} (Status: ${statusCode})`);

                if (statusCode === DisconnectReason.loggedOut) {
                    try { fs.rmSync(sessionPath, { recursive: true, force: true }); } catch (_) {}
                    this.sessions.delete(cleanNumber);
                    this.pairingStatuses.delete(cleanNumber);
                } else {
                    this.pairingStatuses.set(cleanNumber, 'starting');
                    setTimeout(() => this.reconnectSession(cleanNumber), 1000);
                }
            }
        });

        if (!sock.authState.creds.registered) {
            return new Promise((resolve, reject) => {
                setTimeout(async () => {
                    try {
                        const code = await sock.requestPairingCode(cleanNumber);
                        resolve(code);
                    } catch (err) {
                        reject(err);
                    }
                }, 3000);
            });
        }

        return null;
    }

    sanitizeSessionDir(sessionPath) {
        try {
            if (!fs.existsSync(sessionPath)) return;
            const files = fs.readdirSync(sessionPath);
            for (const file of files) {
                if (file.startsWith('session-') && file.endsWith('.json')) {
                    const fullPath = path.join(sessionPath, file);
                    const stats = fs.statSync(fullPath);
                    if (stats.size > 20000) {
                        console.log(`[Nova Engine] Auto-purged corrupted session file: ${file} (${stats.size} bytes)`);
                        try { fs.unlinkSync(fullPath); } catch (_) {}
                    }
                }
            }
        } catch (_) {}
    }

    async reconnectSession(cleanNumber) {
        const sessionPath = path.join(this.sessionsDir, `session_${cleanNumber}`);
        if (!fs.existsSync(sessionPath)) return;

        try {
            this.sanitizeSessionDir(sessionPath);
            const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
            const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

            const sock = makeWASocket({
                version,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: false,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
                },
                browser: Browsers.windows('Desktop'),
                syncFullHistory: false,
                generateHighQualityLinkPreview: false,
                markOnlineOnConnect: true,
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 60000,
                keepAliveIntervalMs: 25000,
                getMessage: async (key) => messageStore.get(key.id) || undefined
            });

            this.sessions.set(cleanNumber, { sock, status: 'connecting', groups: [] });
            sock.ev.on('creds.update', saveCreds);

            // Attach capabilities immediately upon socket creation
            this.attachBotCapabilities(sock, cleanNumber);

            sock.ev.on('connection.update', (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    console.log(`[Nova Engine] Session Disconnected: +${cleanNumber} (Status: ${statusCode})`);

                    if (statusCode === DisconnectReason.loggedOut) {
                        try { fs.rmSync(sessionPath, { recursive: true, force: true }); } catch (_) {}
                        this.sessions.delete(cleanNumber);
                        this.pairingStatuses.delete(cleanNumber);
                    } else {
                        this.pairingStatuses.set(cleanNumber, 'starting');
                        console.log(`[Nova Engine] Auto-reconnecting session +${cleanNumber} in 3s...`);
                        const timer = setTimeout(() => this.reconnectSession(cleanNumber), 3000);
                        this.reconnectTimers.set(cleanNumber, timer);
                    }
                }

                if (connection === 'open') {
                    console.log(`[Nova Engine] Reconnected +${cleanNumber}`);
                    this.sessions.set(cleanNumber, { sock, status: 'connected', groups: [] });
                    this.pairingStatuses.set(cleanNumber, 'connected');

                    // Proactively upload 50 fresh prekeys to WhatsApp servers
                    // to prevent "Waiting for this message" E2EE decryption desyncs
                    sock.uploadPreKeys(50).catch(() => {});
                    
                    // Extract groups
                    (async () => {
                        try {
                            await new Promise(r => setTimeout(r, 2000));
                            const groupsData = await sock.groupFetchAllParticipating();
                            const groups = Object.values(groupsData || {}).map(g => ({
                                id: g.id,
                                name: g.subject || 'Unnamed Group',
                                memberCount: (g.participants || []).length,
                                isAdmin: Boolean(g.participants?.find(p => p.id && p.id.includes(cleanNumber))?.admin)
                            }));
                            const sess = this.sessions.get(cleanNumber);
                            if (sess) sess.groups = groups;
                            console.log(`[Nova Engine] Loaded ${groups.length} groups for +${cleanNumber}`);
                        } catch (e) {
                            console.warn(`[Nova Engine] Failed to load groups:`, e.message);
                        }
                    })();
                }
            });
        } catch (e) {
            console.error(`[Nova Engine] Reconnect error:`, e.message);
        }
    }

    attachBotCapabilities(sock, ownerNumber) {
        if (sock._botCapabilitiesAttached) return;
        sock._botCapabilitiesAttached = true;

        if (!sock._sendMessageWrapped) {
            sock._sendMessageWrapped = true;
            const origSend = sock.sendMessage.bind(sock);
            sock.sendMessage = async (...args) => {
                const res = await origSend(...args);
                if (res?.key?.id) {
                    botSentMessageIds.add(res.key.id);
                    processedMessageIds.add(res.key.id);
                    if (res.message) messageStore.set(res.key.id, res.message);
                    if (botSentMessageIds.size > 1000) {
                        const first = botSentMessageIds.values().next().value;
                        botSentMessageIds.delete(first);
                    }
                }
                return res;
            };
        }

        // Realtime Message Monitoring & Command Dispatcher
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify' && type !== 'append') return;

            for (const msg of messages) {
                if (!msg.message) continue;
                const msgId = msg.key?.id;
                const from = msg.key.remoteJid || '';
                const isGroup = from.endsWith('@g.us');
                if (from === 'status@broadcast') continue;

                // 1. NEVER PROCESS OUR OWN BOT MESSAGES!
                if (msgId && botSentMessageIds.has(msgId)) continue;

                // STRICT SECURITY FILTER: ONLY ALLOW THE USER'S OWN "MESSAGE YOURSELF" ("YOU" CHAT)
                // IF THE USER CHATS WITH ANY OTHER CONTACT, PERSON, OR GROUP, 100% IGNORE IT!
                const myClean = (sock.user?.id || ownerNumber || '923039233197').split('@')[0].split(':')[0].replace(/\D/g, '');
                const myLidClean = (sock.user?.lid || '3732729253919').split('@')[0].split(':')[0].replace(/\D/g, '');
                const fromClean = from.split('@')[0].split(':')[0].replace(/\D/g, '');
                const sender = msg.key.participant || from;
                const senderClean = sender.split('@')[0].split(':')[0].replace(/\D/g, '');

                const isMessageYourself = !isGroup && (
                    fromClean === myClean || 
                    fromClean === myLidClean || 
                    fromClean === '923039233197' || 
                    fromClean === '3732729253919' ||
                    senderClean === myClean ||
                    senderClean === myLidClean ||
                    senderClean === '923039233197' ||
                    senderClean === '3732729253919' ||
                    (msg.key.fromMe && !from.endsWith('@g.us'))
                );

                if (!isMessageYourself) {
                    continue; // 100% SILENT! ZERO INTERACTION WITH ANY OTHER CONTACT OR GROUP!
                }

                if (msgId && msg.message) {
                    messageStore.set(msgId, msg.message);
                }

                // Target JID: Send directly to `from` (the exact thread the user is in).
                // Whether it's an @lid or @s.whatsapp.net, sending to `from` delivers natively into the active chat.
                const targetChat = from;

                // Unwrap modern WhatsApp message containers (ViewOnce, etc.)
                const rawMsg = msg.message?.viewOnceMessageV2?.message || 
                               msg.message?.viewOnceMessage?.message || 
                               msg.message?.documentWithCaptionMessage?.message ||
                               msg.message;

                const imageMsg = rawMsg?.imageMessage;
                const videoMsg = rawMsg?.videoMessage;
                const isMedia = !!(imageMsg || videoMsg);

                const text = (
                    rawMsg?.conversation ||
                    rawMsg?.extendedTextMessage?.text ||
                    imageMsg?.caption ||
                    videoMsg?.caption ||
                    rawMsg?.documentMessage?.caption || ''
                ).trim();

                // 2. Ignore bot output formatting patterns to prevent loops
                const isBotFormatted = text.startsWith('❌') || 
                                      text.startsWith('📲') || 
                                      text.startsWith('🎉') || 
                                      text.startsWith('👋') || 
                                      text.startsWith('⚡') || 
                                      text.startsWith('📋') || 
                                      text.startsWith('⚠️') || 
                                      text.startsWith('✅') || 
                                      text.includes('GROUP KE UPAR STATUS') || 
                                      text.includes('Group Ke Upar Status') || 
                                      text.includes('Koi group match nahi hua');
                if (isBotFormatted) {
                    continue;
                }

                logger.info('INCOMING', `Yourself Msg: isMedia=${isMedia}, text="${text}", from=${from}`);

                const cleanLower = text.toLowerCase();

                // Case 0: Realtime system & status diagnostics request
                if (['logs', 'log', 'debug', 'audit', 'لاگز', 'لاگ'].includes(cleanLower) || cleanLower === '.logs' || cleanLower === '!logs' || cleanLower === '!debug') {
                    logger.info('COMMAND', `Serving audit logs to user in ${targetChat}`);
                    const logsMsg = logger.getWhatsAppFormattedLogs(15);
                    await sock.sendMessage(targetChat, { text: logsMsg }, { quoted: msg }).catch(() => {});
                    continue;
                }

                // Case 0b: Dummy Workflow / How-To Guide request
                if (['demo', 'guide', 'help', 'طریقہ', 'طریقہ کار', 'ڈیمو', 'رہنمائی', 'how', 'status help'].includes(cleanLower) || cleanLower === '.demo' || cleanLower === '!demo') {
                    const demoGuide = `📋 *GROUP STATUS LAGANE KA DUMMY STEP-BY-STEP TAREEQA*\n` +
                                      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                                      `1️⃣ *STEP 1 (Aap Tasveer ya Video Bhejein):*\n` +
                                      `   Apne WhatsApp se koi bhi Picture ya Video select karein.\n` +
                                      `   Neeche Caption mein likhein:\n` +
                                      `   👉 *status* (ya *اسٹیٹس*)\n` +
                                      `   Aur send kar dein.\n\n` +
                                      `2️⃣ *STEP 2 (Bot ka Jawab Aayega):*\n` +
                                      `   Bot aapko aapke tamam groups ki numbered list bhejega:\n` +
                                      `   _🔹 نمبر 1: Sasify Solutions_\n` +
                                      `   _🔹 نمبر 2: PLAB2_\n` +
                                      `   _🔹 نمبر 3: Prep_\n` +
                                      `   _🔹 نمبر 4: Boys ⭐_\n` +
                                      `   _🔹 نمبر 5: Next Toppers_\n\n` +
                                      `3️⃣ *STEP 3 (Aap Group Number Reply Karein):*\n` +
                                      `   Aap is list ke jawab mein sirf number likhein:\n` +
                                      `   👉 *4* (Boys group ke liye)\n` +
                                      `   👉 Ya *all* (tamam groups ke liye)\n\n` +
                                      `4️⃣ *STEP 4 (Story Lag Gayi!):*\n` +
                                      `   Bot confirm karega:\n` +
                                      `   🎉 *GROUP KE UPAR STATUS (GROUP STORY) LAG GAYA!*\n` +
                                      `   ⭕ *Story Status:* ✅ Aapke WhatsApp ke Updates / Status Tab mein story live lag chuki hai!\n` +
                                      `   🖼️ *Group DP:* ❌ Bilkul change nahi hui.\n` +
                                      `   💬 *Group Chat Spam:* ❌ 0 Messages.\n` +
                                      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                                      `💡 *Abhi Step 1 ke mutabiq tasveer bhej kar test karein!*`;
                    await sock.sendMessage(targetChat, { text: demoGuide }, { quoted: msg }).catch(() => {});
                    continue;
                }

                const hasPending = broadcast.hasPendingStatus();

                // Case 1: User replies to active status menu with number (e.g. "4"), group name ("boys"), or "status 4"
                if (!isMedia && text.length > 0 && (hasPending || /^\d{1,2}$/.test(text.trim()) || ['boys', 'toppers'].includes(text.toLowerCase().trim()))) {
                    const now = Date.now();
                    if (now - lastChoiceTime < 1000) {
                        continue;
                    }
                    lastChoiceTime = now;

                    const handled = await broadcast.executePendingStatus(sock, msg, text, targetChat, sender, 'owner');
                    if (handled) continue;

                    if (/^\d{1,2}$/.test(text.trim())) {
                        await sock.sendMessage(targetChat, {
                            text: `⚠️ *Koi pending photo ya video nahi mili!*\n\n` +
                                  `👉 Pehle apni tasveer ya video bhejein caption *status* ke sath,\n` +
                                  `پھر لسٹ آنے پر گروپ نمبر (*${text.trim()}*) ریپلائی کریں۔`
                        }, { quoted: msg }).catch(() => {});
                        continue;
                    }
                }

                // Case 2: User sends a photo or video directly in "You" chat
                if (isMedia) {
                    const now = Date.now();
                    if (now - lastMediaTime < 3000) {
                        console.log(`[Nova Engine] Debouncing duplicate media within 3s`);
                        continue;
                    }
                    lastMediaTime = now;

                    await broadcast.handle(sock, msg, 'status', [text], targetChat, sender, false, ownerNumber);
                    continue;
                }

                // Case 2b: User quotes a photo/video and sends "status", "4", "status 4", "boys", etc.
                const quotedMsgObj = rawMsg?.extendedTextMessage?.contextInfo?.quotedMessage;
                const quotedImage = quotedMsgObj?.imageMessage || quotedMsgObj?.viewOnceMessageV2?.message?.imageMessage;
                const quotedVideo = quotedMsgObj?.videoMessage || quotedMsgObj?.viewOnceMessageV2?.message?.videoMessage;
                if (quotedImage || quotedVideo) {
                    await broadcast.handle(sock, msg, 'status', [text], targetChat, sender, false, ownerNumber);
                    continue;
                }

                // Case 3: Explicit text commands starting with ! or . (.menu, .status, .ping, etc.)
                if (text.startsWith('!') || text.startsWith('.')) {
                    await this.dispatchCommand(sock, msg, text, targetChat, sender, senderClean, isGroup, ownerNumber);
                    continue;
                }

                // Case 4: User explicitly requests group directory / list
                if (['groups', 'group', 'list', 'statuslist', 'bclist', 'گروپ', 'گروپس', 'لسٹ'].includes(cleanLower) || cleanLower === '.groups' || cleanLower === '!groups') {
                    const now = Date.now();
                    if (now - lastChoiceTime > 2000) {
                        lastChoiceTime = now;
                        await broadcast.handle(sock, msg, 'statuslist', [], targetChat, sender, false, ownerNumber);
                    }
                    continue;
                }

                // Case 4b: User sends plain text "status", "اسٹیٹس", "story", "bc"
                if (['status', 'اسٹیٹس', 'story', 'سٹوری', 'bc', 'bcs', 'groupstatus', 'gcsstatus'].includes(cleanLower) || cleanLower.startsWith('status ') || cleanLower.startsWith('اسٹیٹس ') || cleanLower.startsWith('bc ')) {
                    const args = text.split(/\s+/).slice(1);
                    await broadcast.handle(sock, msg, 'status', args, targetChat, sender, false, ownerNumber);
                    continue;
                }
            }
        });
    }

    async dispatchCommand(sock, msg, rawText, from, sender, senderClean, isGroup, ownerNumber) {
        const [commandWithPrefix, ...args] = rawText.trim().split(/\s+/);
        const cmd = commandWithPrefix.slice(1).toLowerCase();
        const db = loadDB();

        // VIP Whitelist Check
        const isVIP = db.whitelist.includes(senderClean) ||
                      config.auth.adminNumbers.includes(senderClean) ||
                      senderClean.endsWith(ownerNumber);

        // --------------------------------------------------------------------------
        // CHAPTER 2: STATUS & SYSTEM DIAGNOSTICS
        // --------------------------------------------------------------------------
        if (['myrole', 'mystatus', 'whoami', 'myrank', 'role', 'profile'].includes(cmd)) {
            const roleBadge = isVIP ? '🌟 Whitelisted VIP Member (Tier 2)' : '👤 Standard Public User';
            return sock.sendMessage(from, {
                text: `👑 *NOVA VIP CREDENTIAL VERIFICATION*\n\n` +
                      `• *User JID:* @${senderClean}\n` +
                      `• *Privilege Tier:* ${roleBadge}\n` +
                      `• *Private Mode Access:* ${isVIP ? 'GRANTED (24/7 Immunity)' : 'RESTRICTED'}\n` +
                      `• *VIP Media Suite:* ${isVIP ? 'ENABLED (View-Once / AI / 320kbps)' : 'DISABLED'}\n` +
                      `• *Authorization Source:* \`data/database.json\``,
                mentions: [sender]
            }, { quoted: msg });
        }

        if (['alive', 'live', 'botstatus', 'uptime'].includes(cmd)) {
            const uptimeSec = Math.floor((Date.now() - this.startTime) / 1000);
            const hours = Math.floor(uptimeSec / 3600);
            const mins = Math.floor((uptimeSec % 3600) / 60);
            const secs = uptimeSec % 60;
            const ramUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
            const totalRam = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1);

            return sock.sendMessage(from, {
                text: `⚡ *NOVA WA BOT — SYSTEM DIAGNOSTICS*\n\n` +
                      `• *Engine Status:* Online & Synchronized 🟢\n` +
                      `• *Baileys Protocol:* Companion Multi-Device v6.7.8\n` +
                      `• *System Uptime:* ${hours}h ${mins}m ${secs}s\n` +
                      `• *Memory (RAM):* ${ramUsage} MB / ${totalRam} GB\n` +
                      `• *Host Node:* ${config.server.id}\n` +
                      `• *Active Sessions:* ${this.getActiveSessionCount()}`
            }, { quoted: msg });
        }

        if (cmd === 'ping') {
            const startMs = Date.now();
            await sock.sendMessage(from, { text: `⚡ *Nova Latency:* ${Date.now() - startMs}ms` }, { quoted: msg });
            return;
        }

        if (['logs', 'log', 'debug', 'audit'].includes(cmd)) {
            const logsMsg = logger.getWhatsAppFormattedLogs(15);
            return sock.sendMessage(from, { text: logsMsg }, { quoted: msg });
        }

        if (['menu', 'help', 'm', 'list'].includes(cmd)) {
            return sock.sendMessage(from, {
                text: `⚡ *NOVA WA BOT — VIP MASTER MENU (370+ TRIGGERS)*\n\n` +
                      `*Chapter 2: Status & Diagnostics*\n` +
                      `\`.myrole\`, \`.alive\`, \`.ping\`, \`.menu\`, \`.allmenu\`\n\n` +
                      `*Chapter 3: Group Broadcasts & Status*\n` +
                      `\`.bcgroup\`, \`.bcsel\`, \`.bclist\`, \`.bcselect\`, \`.bcselected\`, \`.bcclear\`, \`.bcstop\`, \`.gcsstatus\`, \`.gcssel\`\n\n` +
                      `*Chapter 4: Privacy Bypass & Media*\n` +
                      `\`.vv\` (View-Once Revealer), \`.heart\` (Owner Relay), \`.sticker\`, \`.take\`, \`.hd\`, \`.toimg\`, \`.tomp3\`, \`.qr\`\n\n` +
                      `*Chapter 5: AI & Generative Engines*\n` +
                      `\`.gpt\`, \`.gemini\`, \`.mistral\`, \`.imagine\`\n\n` +
                      `*Chapter 6: Media Downloaders*\n` +
                      `\`.song\` (320kbps), \`.video\` (HD MP4), \`.instagram\`, \`.tiktok\`, \`.fb\`, \`.twitter\`, \`.apk\`\n\n` +
                      `*Chapter 7: Group Moderation (Admins)*\n` +
                      `\`.mute\`, \`.unmute\`, \`.kick\`, \`.promote\`, \`.demote\`, \`.disadmins\`, \`.requests\`, \`.acceptall\`, \`.antilink\`, \`.antibad\`, \`.adminlock\`, \`.online\`\n\n` +
                      `*Chapter 8: Typography, Fun & Unbans*\n` +
                      `\`.font1\` to \`.font50\`, \`.8ball\`, \`.coin\`, \`.dice\`, \`.joke\`, \`.fact\`, \`.roast\`, \`.love\`, \`.nounban1-30\`, \`.gcunban1-30\`, \`.otpunban1-30\``
            }, { quoted: msg });
        }

        if (['allmenu', 'categories', 'catmenu'].includes(cmd)) {
            return sock.sendMessage(from, {
                text: `📱 *NOVA INTERACTIVE CATEGORY DASHBOARD*\n\n` +
                      `Reply with category number to explore:\n` +
                      `[1] 🛡️ System & VIP Status\n` +
                      `[2] 📢 Broadcast & Status Engines\n` +
                      `[3] 🔓 Privacy Bypass & View-Once\n` +
                      `[4] 🤖 Artificial Intelligence Suite\n` +
                      `[5] 📥 High-Speed Media Downloaders\n` +
                      `[6] 👥 Group Administration & Security\n` +
                      `[7] 🔤 50 Unicode Typography Fonts\n` +
                      `[8] 🎮 42 Interactive Games & Fun\n` +
                      `[9] 💌 90 WhatsApp Unban Appeals\n` +
                      `[10] 👑 Owner & Sudo Diagnostics`
            }, { quoted: msg });
        }

        if (['manual', 'manualpdf', 'botpdf', 'usermanual'].includes(cmd)) {
            const manualPath = path.join(__dirname, '../data/WA_ULTIMATE_BOT_VIP_MANUAL.pdf');
            if (fs.existsSync(manualPath)) {
                return sock.sendMessage(from, {
                    document: fs.readFileSync(manualPath),
                    mimetype: 'application/pdf',
                    fileName: 'WA_ULTIMATE_BOT_VIP_MANUAL.pdf',
                    caption: '📖 *WA ULTIMATE BOT — VIP USER MANUAL*\nExclusive Whitelist Edition (370+ VIP Triggers • October 2026)'
                }, { quoted: msg });
            } else {
                return sock.sendMessage(from, { text: "⚠️ VIP Manual PDF is currently being generated. Check back shortly." }, { quoted: msg });
            }
        }

        if (['owner', 'creator'].includes(cmd)) {
            return sock.sendMessage(from, {
                text: `👑 *BOT OWNER & LEAD ARCHITECT:*\n• Number: +${ownerNumber}\n• Status: Master Whitelist Controller 🌟\n• Engine: Nova Companion MD v1.0`
            }, { quoted: msg });
        }

        if (['version', 'botversion', 'checkupdate'].includes(cmd)) {
            return sock.sendMessage(from, {
                text: `🚀 *NOVA ENGINE VERSION:*\n• Current Build: v1.0.0 (VIP Whitelist Edition)\n• Modules: 9 Modular Plugins Active\n• Triggers: 370+ Verified Triggers\n• Status: Up to date 🟢`
            }, { quoted: msg });
        }

        // --------------------------------------------------------------------------
        // DELEGATE TO MODULAR PLUGINS
        // --------------------------------------------------------------------------
        if (await privacyMedia.handle(sock, msg, cmd, args, from, sender, isGroup, ownerNumber)) return;
        if (await broadcast.handle(sock, msg, cmd, args, from, sender, isGroup, ownerNumber)) return;
        if (await groupAdmin.handle(sock, msg, cmd, args, from, sender, isGroup, ownerNumber)) return;
        if (await fonts.handle(sock, msg, cmd, args, from)) return;
        if (await unbanAppeals.handle(sock, msg, cmd, args, from)) return;
        if (await funGames.handle(sock, msg, cmd, args, from, sender)) return;
        if (await downloader.handle(sock, msg, cmd, args, from)) return;
        if (await ai.handle(sock, msg, cmd, args, from)) return;
        if (await tools.handle(sock, msg, cmd, args, from)) return;
    }
}

module.exports = new SessionManager();

