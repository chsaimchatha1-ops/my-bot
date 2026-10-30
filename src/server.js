/**
 * Nova WA Bot - Master Express Application & API Router
 */
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const sessionManager = require('./sessionManager');
const qrManager = require('./qrManager');
const logger = require('./logger');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public'), {
    setHeaders: (res) => {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    }
}));

/**
 * Access Control Middleware
 */
function isAuthorized(number, accessKey) {
    // Free & Unlocked: No VIP key or passcode needed
    return { authorized: true, role: 'admin' };
}

// --------------------------------------------------------------------------
// 1. HEALTH CHECK & NODE LOAD BALANCING
// --------------------------------------------------------------------------
app.get('/ping', (req, res) => {
    res.json({
        status: "active",
        message: `${config.brand.name} is running 🔥`,
        serverId: config.server.id,
        activeSessions: sessionManager.getActiveSessionCount()
    });
});

// Dynamic Configuration for Frontend
app.get('/api/config', (req, res) => {
    res.json({
        brand: config.brand,
        nodes: config.nodes,
        cooldownSeconds: config.server.cooldownSeconds
    });
});

// Real-time Active Session & Group Query
app.get('/api/active-session', (req, res) => {
    // 1. Check sessionManager active sessions
    for (const [number, sess] of sessionManager.sessions.entries()) {
        if (sess && sess.status === 'connected') {
            return res.json({
                connected: true,
                number,
                groups: sess.groups || []
            });
        }
    }

    // 2. Check qrManager connected sessions
    for (const [id, sess] of qrManager.qrSessions.entries()) {
        if (sess && sess.status === 'connected') {
            return res.json({
                connected: true,
                number: sess.number,
                groups: sess.groups || []
            });
        }
    }

    res.json({ connected: false, groups: [] });
});

app.get('/api/groups', async (req, res) => {
    let allGroups = [];
    let botNumber = null;

    // Check sessionManager sessions
    for (const [number, sess] of sessionManager.sessions.entries()) {
        if (sess && sess.status === 'connected') {
            botNumber = number;
            if (sess.groups && sess.groups.length > 0) {
                allGroups = sess.groups;
            } else if (sess.sock) {
                try {
                    const data = await sess.sock.groupFetchAllParticipating();
                    allGroups = Object.values(data || {}).map(g => ({
                        id: g.id,
                        name: g.subject || 'Unnamed Group',
                        memberCount: (g.participants || []).length,
                        isAdmin: Boolean(g.participants?.find(p => p.id && p.id.includes(number))?.admin)
                    }));
                    sess.groups = allGroups;
                } catch (_) {}
            }
            break;
        }
    }

    // Check qrManager sessions if not found yet
    if (allGroups.length === 0) {
        for (const [id, sess] of qrManager.qrSessions.entries()) {
            if (sess && sess.status === 'connected') {
                botNumber = sess.number;
                allGroups = sess.groups || [];
                break;
            }
        }
    }

    res.json({
        connected: Boolean(botNumber),
        number: botNumber,
        count: allGroups.length,
        groups: allGroups
    });
});


// --------------------------------------------------------------------------
// 2. 8-DIGIT PAIRING CODE ENDPOINT
// --------------------------------------------------------------------------
app.get('/code', async (req, res) => {
    const { number, access_key } = req.query;

    if (!number) {
        return res.status(400).json({ error: "A valid WhatsApp number is required." });
    }

    const cleanNumber = number.replace(/\D/g, '');
    if (cleanNumber.length < 7 || cleanNumber.length > 15) {
        return res.status(400).json({ error: "Please enter a valid international phone number without spaces or +." });
    }

    // Verify Authorization
    const authCheck = isAuthorized(cleanNumber, access_key);
    if (!authCheck.authorized) {
        return res.status(403).json({
            error: "🔒 Access Denied! Invalid Key. Enter valid VIP Key or Normal User Key."
        });
    }

    try {
        const result = await sessionManager.getOrCreatePairingCode(cleanNumber);
        if (result && result.alreadyConnected) {
            return res.json({ status: "already_connected", message: "Number is already connected and active." });
        }
        if (!result) {
            return res.status(500).json({ error: "Could not generate pairing code. Please try again." });
        }
        res.json({ code: result });
    } catch (err) {
        console.error('[API /code Error]:', err.message);
        res.status(500).json({ error: err.message || "Failed to generate pairing code." });
    }
});

app.get('/reset', async (req, res) => {
    const number = req.query.number || '923039233197';
    const cleanNumber = number.replace(/\D/g, '');
    try {
        const code = await sessionManager.resetSession(cleanNumber);
        res.json({ success: true, number: cleanNumber, code });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/test-relay', async (req, res) => {
    let sock = null;
    for (const [number, sess] of sessionManager.sessions.entries()) {
        if (sess && sess.status === 'connected') sock = sess.sock;
    }
    if (!sock) return res.status(500).json({ error: 'No connected session' });

    try {
        const targetGroupJid = '120363423251922928@g.us';
        const meta = await sock.groupMetadata(targetGroupJid);
        const participants = meta.participants.map(p => p.id);
        res.json({ success: true, targetGroupJid, subject: meta.subject, participants });
    } catch (e) {
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});

app.get('/api/test-send-status', async (req, res) => {
    let sock = null;
    for (const [number, sess] of sessionManager.sessions.entries()) {
        if (sess && sess.status === 'connected') sock = sess.sock;
    }
    if (!sock) return res.status(500).json({ error: 'No connected session' });

    try {
        const { STORIES_JID } = require('@whiskeysockets/baileys');
        const text = req.query.text || 'Test Status from Bot ' + Date.now();
        const type = req.query.type || '1';

        let result;
        if (type === '1') {
            result = await sock.sendMessage(STORIES_JID, { text }, {
                backgroundColor: '#1d4ed8',
                font: 2,
                statusJidList: ['923039233197@s.whatsapp.net']
            });
        } else if (type === '2') {
            const meta = await sock.groupMetadata('120363423251922928@g.us');
            const participants = meta.participants.map(p => p.id);
            result = await sock.sendMessage(STORIES_JID, { text }, {
                backgroundColor: '#1d4ed8',
                font: 2,
                statusJidList: ['923039233197@s.whatsapp.net', ...participants]
            });
        }
        res.json({ success: true, type, id: result?.key?.id, key: result?.key });
    } catch (e) {
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});

app.get('/api/test-image-status', async (req, res) => {
    let sock = null;
    for (const [number, sess] of sessionManager.sessions.entries()) {
        if (sess && sess.status === 'connected') sock = sess.sock;
    }
    if (!sock) return res.status(500).json({ error: 'No connected session' });

    try {
        const { STORIES_JID } = require('@whiskeysockets/baileys');
        const imgPath = 'C:\\Users\\.ONE\\.gemini\\antigravity\\brain\\5dc2993a-b83f-4ec6-b000-d24ea66f0292\\.user_uploaded\\media_1793212724038_76bdf49c.jpg';
        const buffer = fs.readFileSync(imgPath);

        const targetGroupJid = '120363423251922928@g.us';
        const meta = await sock.groupMetadata(targetGroupJid);
        const participants = meta.participants.map(p => p.id);
        const fullList = ['923039233197@s.whatsapp.net', ...participants];

        const statusMsg = await sock.sendMessage(STORIES_JID, {
            image: buffer,
            caption: '🌟 Test Image Story ' + new Date().toLocaleTimeString(),
            contextInfo: {
                mentionedJid: [targetGroupJid],
                groupMentions: [{ groupJid: targetGroupJid, groupSubject: meta.subject }]
            }
        }, {
            broadcast: true,
            statusJidList: fullList
        });

        res.json({ success: true, statusId: statusMsg?.key?.id, key: statusMsg?.key });
    } catch (e) {
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});

app.get('/api/test-group-mention', async (req, res) => {
    let sock = null;
    for (const [number, sess] of sessionManager.sessions.entries()) {
        if (sess && sess.status === 'connected') sock = sess.sock;
    }
    if (!sock) return res.status(500).json({ error: 'No connected session' });

    try {
        const { STORIES_JID, generateWAMessageFromContent } = require('@whiskeysockets/baileys');
        const crypto = require('crypto');
        const targetGroupJid = '120363423251922928@g.us';

        const meta = await sock.groupMetadata(targetGroupJid);
        const participants = meta.participants.map(p => p.id);
        const fullList = ['923039233197@s.whatsapp.net', ...participants];

        const text = 'Testing Group Story ' + new Date().toLocaleTimeString();
        const statusMsg = await sock.sendMessage(STORIES_JID, {
            text,
            contextInfo: {
                mentionedJid: [targetGroupJid],
                groupMentions: [{ groupJid: targetGroupJid, groupSubject: meta.subject }]
            }
        }, {
            backgroundColor: '#1d4ed8',
            font: 2,
            statusJidList: fullList,
            additionalNodes: [
                {
                    tag: 'meta',
                    attrs: {},
                    content: [
                        {
                            tag: 'mentioned_users',
                            attrs: {},
                            content: [{ tag: 'to', attrs: { jid: targetGroupJid } }]
                        }
                    ]
                }
            ]
        });

        const statusId = statusMsg.key.id;

        const protocolMessage = {
            groupStatusMentionMessage: {
                message: {
                    protocolMessage: {
                        key: statusMsg.key,
                        type: 25
                    }
                }
            },
            messageContextInfo: {
                messageSecret: crypto.randomBytes(32)
            }
        };

        const mentionWAMsg = await generateWAMessageFromContent(targetGroupJid, protocolMessage, {});

        const relayResult = await sock.relayMessage(
            targetGroupJid,
            mentionWAMsg.message,
            {
                additionalNodes: [
                    {
                        tag: 'meta',
                        attrs: { is_group_status_mention: 'true', is_status_mention: 'true' }
                    }
                ]
            }
        );

        res.json({ success: true, statusId, relayResult });
    } catch (e) {
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});

// --------------------------------------------------------------------------
// 3. PAIRING STATUS POLLING
// --------------------------------------------------------------------------
app.get('/pairing/status', (req, res) => {
    const { number } = req.query;
    if (!number) {
        return res.status(400).json({ status: "error", error: "Number required" });
    }

    const cleanNumber = number.replace(/\D/g, '');
    const status = sessionManager.getSessionStatus(cleanNumber);
    const groups = sessionManager.getGroups(cleanNumber);
    res.json({ status, number: cleanNumber, groups });
});

// --------------------------------------------------------------------------
// 4. REALTIME QR PAIRING ENDPOINTS
// --------------------------------------------------------------------------
app.post('/qr/start', async (req, res) => {
    const { number, access_key } = req.body;

    let cleanNumber = (number || '').replace(/\D/g, '');
    if (!cleanNumber) {
        cleanNumber = 'qr_' + Date.now();
    }

    try {
        const sessionId = uuidv4();
        await qrManager.startQRSession(sessionId, cleanNumber);
        res.json({ id: sessionId, status: "initializing" });
    } catch (err) {
        res.status(500).json({ error: err.message || "Could not start QR session" });
    }
});

app.get('/qr/status/:id', (req, res) => {
    const status = qrManager.getStatus(req.params.id);
    res.json(status);
});

app.post('/qr/cancel/:id', (req, res) => {
    qrManager.cancelQRSession(req.params.id);
    res.json({ status: "cancelled" });
});

// --------------------------------------------------------------------------
// 5. AUDIT LOGS & DIAGNOSTICS ENDPOINTS
// --------------------------------------------------------------------------
app.get('/api/logs', (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 50;
    res.json({
        success: true,
        count: logger.getRecentLogs(limit).length,
        logs: logger.getRecentLogs(limit)
    });
});

app.get('/api/logs/status', (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 50;
    res.json({
        success: true,
        count: logger.getStatusLogs(limit).length,
        logs: logger.getStatusLogs(limit)
    });
});

// Fallback route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Resilience: Prevent unhandled socket drops or network timeouts from exiting the process
process.on('uncaughtException', (err) => {
    console.error('[Nova Uncaught Exception]:', err.message || err);
});
process.on('unhandledRejection', (reason) => {
    console.error('[Nova Unhandled Rejection]:', reason?.message || reason);
});

// Start Server
const PORT = config.server.port;
app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`⚡ ${config.brand.name} [${config.brand.version}]`);
    console.log(`📡 Server running on http://localhost:${PORT}`);
    console.log(`🔒 VIP Keys Loaded: ${config.auth.validKeys.length}`);
    console.log(`👑 Admin Numbers Whitelisted: ${config.auth.adminNumbers.length}`);
    console.log(`====================================================`);
    sessionManager.initExistingSessions();
});
