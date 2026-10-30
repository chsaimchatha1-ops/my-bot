/**
 * Nova WA Bot - QR Pairing Engine
 * Manages dynamic QR code generation, real-time polling, and socket lifecycle with automatic 515 reconnect
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
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const sessionManager = require('./sessionManager');

/**
 * Resilient helper to fetch participating groups with retry
 */
async function extractGroupsWithRetry(sock, botJid, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[QR Manager] Extracting groups attempt ${attempt}/${maxRetries} for +${botJid}...`);
            await new Promise(r => setTimeout(r, 2000 * attempt));
            const groupsData = await sock.groupFetchAllParticipating();
            const groupList = Object.values(groupsData || {}).map(g => {
                const botParticipant = g.participants?.find(p => p.id && p.id.includes(botJid));
                return {
                    id: g.id,
                    name: g.subject || 'Unnamed Group',
                    memberCount: (g.participants || []).length,
                    isAdmin: Boolean(botParticipant?.admin)
                };
            });
            console.log(`[QR Manager] Successfully extracted ${groupList.length} groups for +${botJid}`);
            return groupList;
        } catch (err) {
            console.warn(`[QR Manager] Attempt ${attempt} failed to extract groups:`, err.message);
            if (attempt === maxRetries) {
                return [];
            }
        }
    }
    return [];
}

class QRManager {
    constructor() {
        this.qrSessions = new Map(); // id -> { sock, qrBase64, status, number, timer, tempPath, groups, isClosed }
    }

    /**
     * Start a new ephemeral QR pairing session with cacheable key store and auto-reconnect on 515
     */
    async startQRSession(sessionId, number) {
        // Clean up previous session if exists
        this.cancelQRSession(sessionId);

        const cleanNumber = number.replace(/\D/g, '');
        const tempPath = path.join(__dirname, '../sessions', `qr_${sessionId}`);
        if (!fs.existsSync(tempPath)) {
            fs.mkdirSync(tempPath, { recursive: true });
        }

        const sessionRecord = {
            sock: null,
            qrBase64: null,
            status: 'initializing',
            number: cleanNumber,
            tempPath,
            groups: [],
            isClosed: false
        };

        this.qrSessions.set(sessionId, sessionRecord);

        const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1043857760] }));

        const setupSocket = async () => {
            if (sessionRecord.isClosed) return;

            try {
                // If previous socket exists, clean listeners
                if (sessionRecord.sock) {
                    try {
                        sessionRecord.sock.ev.removeAllListeners();
                        sessionRecord.sock.end();
                    } catch (_) {}
                }

                const { state, saveCreds } = await useMultiFileAuthState(tempPath);

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
                    retryRequestDelayMs: 300
                });

                sessionRecord.sock = sock;

                sock.ev.on('creds.update', saveCreds);

                sock.ev.on('connection.update', async (update) => {
                    if (sessionRecord.isClosed) return;
                    const { connection, qr, lastDisconnect } = update;

                    if (qr) {
                        try {
                            sessionRecord.qrBase64 = await QRCode.toDataURL(qr, {
                                margin: 2,
                                width: 320,
                                color: {
                                    dark: '#05070a',
                                    light: '#ffffff'
                                }
                            });
                            sessionRecord.status = 'waiting';
                        } catch (e) {
                            console.error('[QR Manager] Failed to encode QR matrix:', e);
                        }
                    }

                    if (connection === 'connecting') {
                        sessionRecord.status = 'connecting';
                    }

                    if (connection === 'open') {
                        if (sessionRecord.timer) clearTimeout(sessionRecord.timer);

                        const botJid = sock.user?.id ? sock.user.id.split(':')[0].replace(/\D/g, '') : cleanNumber;
                        sessionRecord.number = botJid;
                        console.log(`[QR Manager] WhatsApp connected successfully via QR for: +${botJid}`);

                        // Move credentials to long-term session storage
                        const permanentPath = path.join(__dirname, '../sessions', `session_${botJid}`);
                        try {
                            fs.cpSync(tempPath, permanentPath, { recursive: true });
                        } catch (err) {
                            console.error('[QR Manager] Failed to promote session to permanent storage:', err.message);
                        }

                        // Extract all participating groups from WhatsApp with retry
                        sessionRecord.groups = await extractGroupsWithRetry(sock, botJid);
                        sessionRecord.status = 'connected';

                        // Attach bot event listeners, moderation, and command dispatchers
                        sessionManager.sessions.set(botJid, { sock, status: 'connected', groups: sessionRecord.groups });
                        sessionManager.pairingStatuses.set(botJid, 'connected');
                        sessionManager.attachBotCapabilities(sock, botJid);
                    }

                    if (connection === 'close') {
                        const statusCode = lastDisconnect?.error?.output?.statusCode;
                        console.log(`[QR Manager] Socket closed for ${sessionId}. Status code: ${statusCode}`);

                        if (statusCode === DisconnectReason.loggedOut) {
                            console.log(`[QR Manager] User logged out / rejected for ${sessionId}`);
                            sessionRecord.status = 'expired';
                            this.cancelQRSession(sessionId);
                        } else {
                            // Status 515 (Restart Required) or 428 / 408 / etc:
                            // MUST reconnect immediately using saved credentials!
                            console.log(`[QR Manager] Restart required (code: ${statusCode}). Re-establishing connection for session ${sessionId}...`);
                            sessionRecord.status = 'connecting';
                            setTimeout(() => {
                                if (!sessionRecord.isClosed && sessionRecord.status !== 'connected') {
                                    setupSocket();
                                }
                            }, 800);
                        }
                    }
                });
            } catch (err) {
                console.error('[QR Manager] Error setting up socket:', err.message);
            }
        };

        await setupSocket();

        // Auto-kill ONLY if NOT connected within 4 minutes
        sessionRecord.timer = setTimeout(() => {
            if (sessionRecord.status !== 'connected') {
                this.cancelQRSession(sessionId);
            }
        }, 240 * 1000);

        return sessionId;
    }

    /**
     * Poll status, current QR base64 data URL, connected number, and extracted groups
     */
    getStatus(sessionId) {
        const sess = this.qrSessions.get(sessionId);
        if (!sess) {
            return { status: 'expired', error: 'Session expired or not found' };
        }
        return {
            status: sess.status,
            qr: sess.qrBase64,
            number: sess.number,
            groups: sess.groups || []
        };
    }

    /**
     * Clean up and terminate ephemeral QR session
     */
    cancelQRSession(sessionId) {
        const sess = this.qrSessions.get(sessionId);
        if (sess) {
            sess.isClosed = true;
            if (sess.timer) clearTimeout(sess.timer);
            // Only end socket and delete temp if NOT connected!
            if (sess.status !== 'connected') {
                try { sess.sock?.end(); } catch (_) {}
                try { fs.rmSync(sess.tempPath, { recursive: true, force: true }); } catch (_) {}
            }
            this.qrSessions.delete(sessionId);
        }
    }
}

module.exports = new QRManager();
