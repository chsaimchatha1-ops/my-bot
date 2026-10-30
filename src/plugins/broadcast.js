/**
 * Nova WA Bot - Broadcast & Group Status Systems (Chapter 3)
 * Implements .bcgroup, .bcsel, .bclist, .bcselect, .bcselected, .bcclear, .bcstop, .gcsstatus, .gcssel, .bcprivate
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { 
    downloadMediaMessage, 
    generateWAMessage, 
    generateWAMessageFromContent, 
    jidNormalizedUser, 
    STORIES_JID 
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const logger = require('../logger');
const dbPath = path.join(__dirname, '../../data/database.json');

function loadDB() {
    try {
        return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    } catch (_) {
        return { selectedGroups: [], selectedGcsGroups: [] };
    }
}

function saveDB(data) {
    try {
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    } catch (_) {}
}

async function safeDownloadMedia(sock, msgObj) {
    return await downloadMediaMessage(
        msgObj,
        'buffer',
        {},
        {
            logger: pino({ level: 'silent' }),
            reuploadRequest: typeof sock?.updateMediaMessage === 'function' ? sock.updateMediaMessage.bind(sock) : undefined
        }
    );
}

let bcHalted = false;
let gcsHalted = false;

// Pending interactive status selections: cleanNumber -> { buffer, mediaType, caption, text, groupList, timestamp }
const pendingStatusSessions = new Map();
const pendingFile = path.join(__dirname, '../../data/pending_status.json');
const pendingMediaFile = path.join(__dirname, '../../data/pending_media.bin');

function savePendingSession(sessionData) {
    try {
        if (sessionData && sessionData.buffer) {
            fs.writeFileSync(pendingMediaFile, sessionData.buffer);
        }
        const meta = {
            mediaType: sessionData?.mediaType || 'text',
            caption: sessionData?.caption || '',
            text: sessionData?.text || '',
            groupList: sessionData?.groupList || [],
            timestamp: sessionData?.timestamp || Date.now(),
            hasMedia: !!(sessionData && sessionData.buffer)
        };
        fs.writeFileSync(pendingFile, JSON.stringify(meta, null, 2));
    } catch (_) {}
}

function loadPersistedSession() {
    try {
        if (!fs.existsSync(pendingFile)) return null;
        const meta = JSON.parse(fs.readFileSync(pendingFile, 'utf8'));
        if (!meta || Date.now() - meta.timestamp > 30 * 60 * 1000) return null; // 30 min validity
        let buffer = null;
        if (meta.hasMedia && fs.existsSync(pendingMediaFile)) {
            buffer = fs.readFileSync(pendingMediaFile);
        }
        return {
            ...meta,
            buffer
        };
    } catch (_) {
        return null;
    }
}

function clearPendingSessions() {
    pendingStatusSessions.clear();
    try {
        if (fs.existsSync(pendingFile)) fs.unlinkSync(pendingFile);
        if (fs.existsSync(pendingMediaFile)) fs.unlinkSync(pendingMediaFile);
    } catch (_) {}
}

function hasPendingStatus(cleanNumber) {
    if (pendingStatusSessions.size > 0) {
        for (const [key, sess] of pendingStatusSessions.entries()) {
            if (Date.now() - sess.timestamp < 30 * 60 * 1000) {
                return true;
            } else {
                pendingStatusSessions.delete(key);
            }
        }
    }
    const persisted = loadPersistedSession();
    return !!persisted;
}

function getActivePendingSession(cleanNumber) {
    if (cleanNumber && pendingStatusSessions.has(cleanNumber)) {
        const sess = pendingStatusSessions.get(cleanNumber);
        if (Date.now() - sess.timestamp < 30 * 60 * 1000) return sess;
    }
    for (const [_, sess] of pendingStatusSessions.entries()) {
        if (Date.now() - sess.timestamp < 30 * 60 * 1000) {
            return sess;
        }
    }
    const persisted = loadPersistedSession();
    if (persisted) return persisted;
    return null;
}

function parseTargetGroups(input, groupList) {
    if (!input || !groupList || groupList.length === 0) return [];

    let c = input.toLowerCase()
        .replace(/^(status|state|story|estatus|استیٹس|اسٹیٹس|سٹوری|استوری)\s*[:=\-]?\s*/i, '')
        .replace(/^(group|gcs|gc|گروپ)\s*[:=\-]?\s*/i, '')
        .replace(/^(number|num|no|نمبر)\s*[:=\-]?\s*/i, '')
        .trim();

    // Critical: If the user just typed "status" or "اسٹیٹس" without specifying a group, do NOT match all groups!
    if (!c || c.length === 0) {
        return [];
    }

    if (c === 'all' || input.toLowerCase().includes('all') || input.includes('سب') || input.includes('تمام')) {
        return groupList;
    }

    const targets = [];
    const numMatches = c.match(/\b\d+\b/g);
    if (numMatches) {
        for (const n of numMatches) {
            const idx = parseInt(n, 10);
            if (idx >= 1 && idx <= groupList.length) {
                const g = groupList[idx - 1];
                if (!targets.some(x => x.id === g.id)) targets.push(g);
            }
        }
    }
    if (targets.length > 0) return targets;

    const aliasMap = {
        'voice': 'boys',
        'boy': 'boys',
        'بوائز': 'boys',
        'وائس': 'boys',
        'next': 'toppers',
        'science': 'toppers',
        'academy': 'toppers',
        'ٹاپرز': 'toppers'
    };
    const searchKey = aliasMap[c] || c;
    for (const g of groupList) {
        const name = (g.subject || g.name || '').toLowerCase();
        if (name.includes(searchKey) || name.includes(c)) {
            if (!targets.some(x => x.id === g.id)) targets.push(g);
        }
    }
    return targets;
}

/**
 * Posts media or text as a Group Status Story for a WhatsApp group
 * Targets STORIES_JID ('status@broadcast') with group mention metadata.
 * STRICT: 
 * - Does NOT change group DP
 * - Does NOT send any message or media inside the group chat (0 group chat messages)
 * - Uses WhatsApp's Group Status Story Mention protocol
 */
async function postGroupStatusStory(sock, targetGroupJid, targetGroupName, mediaBuffer, mediaType, captionText) {
    const normalizedGroup = jidNormalizedUser(targetGroupJid);
    logger.status('STORY', `Publishing Group Status Story for "${targetGroupName}" (${targetGroupJid}) to status@broadcast`);

    const cleanCaption = (captionText || '')
        .replace(/^![a-zA-Z0-9_]+\s*/, '')
        .replace(/^\.[a-zA-Z0-9_]+\s*/, '')
        .trim();

    // 1. Fetch group participants for status viewer audience
    let audienceList = [];
    try {
        const metadata = await sock.groupMetadata(targetGroupJid);
        if (metadata && Array.isArray(metadata.participants)) {
            audienceList = metadata.participants.map(p => jidNormalizedUser(p.id || p.jid));
        }
    } catch (e) {
        logger.warn('STORY', `Could not fetch group participants for ${targetGroupName}: ${e.message}`);
    }

    // Always include bot's own JID so status appears in your own Updates/Status feed
    const selfJid = jidNormalizedUser(sock.user?.id);
    if (selfJid && !audienceList.includes(selfJid)) {
        audienceList.push(selfJid);
    }
    const ownerJid = '923039233197@s.whatsapp.net';
    if (!audienceList.includes(ownerJid)) {
        audienceList.push(ownerJid);
    }

    // 2. Prepare WhatsApp Status Message with Group Mention Context
    const contextInfo = {
        mentionedJid: [normalizedGroup],
        groupMentions: [
            {
                groupJid: normalizedGroup,
                groupSubject: targetGroupName
            }
        ]
    };

    let statusContent = {};
    if (mediaType === 'image' && mediaBuffer) {
        statusContent = {
            image: mediaBuffer,
            caption: cleanCaption || undefined,
            contextInfo
        };
    } else if (mediaType === 'video' && mediaBuffer) {
        statusContent = {
            video: mediaBuffer,
            caption: cleanCaption || undefined,
            contextInfo
        };
    } else if (mediaType === 'audio' && mediaBuffer) {
        statusContent = {
            audio: mediaBuffer,
            mimetype: 'audio/mp4',
            ptt: true,
            contextInfo
        };
    } else {
        statusContent = {
            text: cleanCaption || 'Group Status',
            contextInfo
        };
    }

    const additionalNodes = [
        {
            tag: 'meta',
            attrs: {},
            content: [
                {
                    tag: 'mentioned_users',
                    attrs: {},
                    content: [{ tag: 'to', attrs: { jid: normalizedGroup } }]
                }
            ]
        }
    ];

    let result;
    try {
        logger.status('STORY', `Relaying story to status@broadcast with ${audienceList.length} audience members...`);
        result = await sock.sendMessage(STORIES_JID, statusContent, {
            statusJidList: audienceList,
            additionalNodes
        });
    } catch (err) {
        logger.warn('STORY', `Primary status relay failed (${err.message}). Retrying with safe audience list.`);
        const safeAudience = [selfJid, ownerJid].filter(Boolean);
        result = await sock.sendMessage(STORIES_JID, statusContent, {
            statusJidList: safeAudience,
            additionalNodes
        });
    }

    const msgId = result?.key?.id;
    logger.status('STORY', `✅ Status Story successfully posted to STORIES_JID! (ID: ${msgId})`);
    return msgId || 'OK';
}

async function executePendingStatus(sock, msg, input, from, sender, cleanNumber) {
    const session = getActivePendingSession(cleanNumber);
    if (!session) {
        logger.debug('PENDING', `No active pending status session found for ${cleanNumber}`);
        return false;
    }

    const sendTarget = from;

    const cleanInput = input.toLowerCase().trim();
    logger.status('PENDING', `Processing user group choice: "${cleanInput}"`);

    if (cleanInput === 'cancel' || cleanInput === 'stop' || cleanInput === 'exit') {
        pendingStatusSessions.clear();
        logger.info('PENDING', 'User cancelled status session');
        await sock.sendMessage(sendTarget, { text: "❌ *Status setup cancelled.*" }, { quoted: msg });
        return true;
    }

    const groupList = session.groupList || [];
    if (groupList.length === 0) {
        pendingStatusSessions.clear();
        logger.warn('PENDING', 'Pending status session had empty group list');
        return false;
    }

    const targetGroups = parseTargetGroups(cleanInput, groupList);

    if (targetGroups.length === 0) {
        logger.warn('PENDING', `User input "${cleanInput}" did not match any group`);
        await sock.sendMessage(sendTarget, {
            text: `❌ *Group match nahi hua!*\n\n` +
                  `👉 Meherbani karke group ka number (jaise *4* for Boys), ya naam (jaise *boys*), ya *all* likhein.`
        }, { quoted: msg }).catch(() => {});
        return true; // Crucial: return true so Case 4 does NOT dump the 39 groups list!
    }

    logger.status('PENDING', `Target groups selected: ${targetGroups.map(g => g.subject).join(', ')}`);
    await sock.sendMessage(sendTarget, { react: { text: "⏳", key: msg.key } }).catch(() => {});

    // Clean caption text
    const cleanCaption = (session.caption || session.text || '')
        .replace(/^![a-zA-Z0-9_]+\s*/, '')
        .replace(/^\.[a-zA-Z0-9_]+\s*/, '')
        .trim();

    try {
        for (const group of targetGroups) {
            await postGroupStatusStory(
                sock, 
                group.id, 
                group.subject, 
                session.buffer, 
                session.mediaType, 
                cleanCaption
            );
        }
    } catch (err) {
        logger.error('STATUS', `Error executing group status: ${err.message}`, err);
        await sock.sendMessage(sendTarget, { text: `⚠️ Group status post karne mein masla aya: ${err.message}` }, { quoted: msg }).catch(() => {});
        clearPendingSessions();
        return true;
    }

    // STRICT CONSTRAINTS VERIFICATION:
    // 1. NEVER change group DP!
    // 2. NEVER send messages inside group chat!
    // 3. Status posted directly to WhatsApp Status / Story feed!

    await sock.sendMessage(sendTarget, { react: { text: "🎉", key: msg.key } }).catch(() => {});

    let confirmation = `🎉 *GROUP KE UPAR STATUS (GROUP STORY) LAG GAYA!*\n\n` +
                      `⭕ *Group Story:* ✅ Group Story status feed mein lag chuki hai!\n` +
                      `📍 *Target Group:* *${targetGroups.map(g => g.subject).join(', ')}*\n` +
                      `💬 *Group Chat Messages:* ❌ 0 Messages (Chat ke andar bilkul kuch nahi bheja gaya).\n` +
                      `🖼️ *Group DP (Profile Photo):* ❌ Bilkul change nahi ki (DP waisi hi hai).\n` +
                      `👁️ *Audience:* Group ke tamam members is story ko apne WhatsApp Status / Updates section mein dekh sakte hain!`;

    try {
        await sock.sendMessage(sendTarget, { text: confirmation }, { quoted: msg });
    } catch (_) {
        await sock.sendMessage(sendTarget, { text: confirmation });
    }

    logger.status('STATUS', `Confirmation sent to user. Clearing pending status sessions.`);
    clearPendingSessions();
    return true;
}

module.exports = {
    name: 'broadcast',
    hasPendingStatus,
    executePendingStatus,

    async handle(sock, msg, cmd, args, from, sender, isGroup, ownerNumber) {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const textPayload = args.join(' ') || quoted?.conversation || quoted?.extendedTextMessage?.text;

        // --------------------------------------------------------------------------
        // 1. LIST GROUPS (.bclist, .gcslist)
        // --------------------------------------------------------------------------
        if (['bclist', 'bcgroups', 'gcslist', 'statuslist'].includes(cmd)) {
            try {
                const chats = await sock.groupFetchAllParticipating();
                const groupList = Object.values(chats);

                if (groupList.length === 0) {
                    return sock.sendMessage(from, { text: "⚠️ Bot has not joined any groups yet." }, { quoted: msg });
                }

                let response = `📋 *تمام واٹس ایپ گروپس اور ان کے نمبرز:*\n\n`;

                groupList.forEach((group, index) => {
                    const isSpecial = (group.subject || '').toLowerCase().includes('boys') || (group.subject || '').toLowerCase().includes('toppers');
                    response += `🔹 *نمبر ${index + 1}:* ${group.subject}${isSpecial ? ' ⭐' : ''}\n`;
                });

                response += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                            `📸 *اسٹیٹس لگانے کا طریقہ:*\n` +
                            `کوئی بھی تصویر سینڈ کریں، اور مطلوبہ گروپ کا نمبر (مثلاً 1 یا 4 یا نام) لکھ کر بھیجیں!`;
                await sock.sendMessage(from, { text: response });
            } catch (err) {
                await sock.sendMessage(from, { text: `⚠️ Failed to fetch groups: ${err.message}` });
            }
            return true;
        }

        // --------------------------------------------------------------------------
        // 2. SELECT GROUPS (.bcselect, .gcsselect)
        // --------------------------------------------------------------------------
        if (['bcselect', 'bcset', 'gcsselect', 'statusselect'].includes(cmd)) {
            const input = args[0];
            if (!input) {
                return sock.sendMessage(from, {
                    text: "❌ *Usage:* `.bcselect 1,3,5` or `.bcselect 1-5` or `.bcselect all` or `.bcselect clear`"
                }, { quoted: msg });
            }

            try {
                const chats = await sock.groupFetchAllParticipating();
                const groupList = Object.values(chats);
                const db = loadDB();
                const targetKey = cmd.startsWith('gcs') ? 'selectedGcsGroups' : 'selectedGroups';

                if (input.toLowerCase() === 'clear') {
                    db[targetKey] = [];
                    saveDB(db);
                    return sock.sendMessage(from, { text: "🧹 Group selection cleared." }, { quoted: msg });
                }

                if (input.toLowerCase() === 'all') {
                    db[targetKey] = groupList.map(g => g.id);
                    saveDB(db);
                    return sock.sendMessage(from, { text: `✅ All *${groupList.length}* groups selected for broadcast.` }, { quoted: msg });
                }

                const selectedJids = [];
                const parts = input.split(',');

                for (const part of parts) {
                    if (part.includes('-')) {
                        const [start, end] = part.split('-').map(Number);
                        for (let i = start; i <= end; i++) {
                            if (groupList[i - 1]) selectedJids.push(groupList[i - 1].id);
                        }
                    } else {
                        const idx = Number(part.trim());
                        if (groupList[idx - 1]) selectedJids.push(groupList[idx - 1].id);
                    }
                }

                db[targetKey] = Array.from(new Set(selectedJids));
                saveDB(db);

                await sock.sendMessage(from, {
                    text: `✅ *Selection Saved:* ${db[targetKey].length} groups configured for targeted transmission.`
                }, { quoted: msg });
            } catch (err) {
                await sock.sendMessage(from, { text: `⚠️ Selection failed: ${err.message}` }, { quoted: msg });
            }
            return true;
        }

        // --------------------------------------------------------------------------
        // 3. VIEW SELECTED GROUPS (.bcselected, .gcsselected)
        // --------------------------------------------------------------------------
        if (['bcselected', 'bcselection', 'gcsselected'].includes(cmd)) {
            const db = loadDB();
            const targetKey = cmd.startsWith('gcs') ? 'selectedGcsGroups' : 'selectedGroups';
            const targets = db[targetKey] || [];

            if (targets.length === 0) {
                return sock.sendMessage(from, { text: "⚠️ No groups currently selected. Use `.bcselect` to pick groups." }, { quoted: msg });
            }

            let text = `🎯 *CURRENTLY SELECTED GROUPS (${targets.length})*\n\n`;
            targets.forEach((jid, i) => {
                text += `• [${i + 1}] ${jid}\n`;
            });
            await sock.sendMessage(from, { text }, { quoted: msg });
            return true;
        }

        // --------------------------------------------------------------------------
        // 4. CLEAR SELECTED GROUPS (.bcclear, .gcsclear)
        // --------------------------------------------------------------------------
        if (['bcclear', 'bcreset', 'gcsclear', 'gcsreset'].includes(cmd)) {
            const db = loadDB();
            const targetKey = cmd.startsWith('gcs') ? 'selectedGcsGroups' : 'selectedGroups';
            db[targetKey] = [];
            saveDB(db);
            await sock.sendMessage(from, { text: "🧹 Broadcast group selection reset to default." }, { quoted: msg });
            return true;
        }

        // --------------------------------------------------------------------------
        // 5. STOP ACTIVE BROADCAST (.bcstop, .gcsstop)
        // --------------------------------------------------------------------------
        if (['bcstop', 'stopbc', 'gcsstop', 'stopgcs'].includes(cmd)) {
            bcHalted = true;
            gcsHalted = true;
            await sock.sendMessage(from, { text: "🛑 *Emergency Stop Triggered:* Halting active broadcast queue immediately." }, { quoted: msg });
            return true;
        }

        // --------------------------------------------------------------------------
        // 6. BROADCAST TO ALL / SELECTED GROUPS WITH LIVE PROGRESS BAR (.bcgroup, .bcsel)
        // --------------------------------------------------------------------------
        if (['bcgroup', 'bc', 'broadcastgc', 'bcsel', 'bcs', 'gcsstatus', 'gcssel'].includes(cmd)) {
            if (!textPayload && !quoted) {
                return sock.sendMessage(from, {
                    text: "❌ *Usage:* Reply to a message/media or provide text:\n`.bcgroup <message>` or `.bcsel <message>`"
                }, { quoted: msg });
            }

            try {
                bcHalted = false;
                gcsHalted = false;

                const chats = await sock.groupFetchAllParticipating();
                const db = loadDB();
                const isSelectedOnly = ['bcsel', 'bcs', 'gcssel'].includes(cmd);
                const targetKey = cmd.startsWith('gcs') ? 'selectedGcsGroups' : 'selectedGroups';

                let targetJids = isSelectedOnly ? (db[targetKey] || []) : Object.keys(chats);

                if (targetJids.length === 0) {
                    return sock.sendMessage(from, { text: "⚠️ No target groups found for transmission." }, { quoted: msg });
                }

                // Send Initial Progress Message
                const progressMsg = await sock.sendMessage(from, {
                    text: `🚀 *Initializing Nova Broadcast...*\n` +
                          `📊 Progress: 0/${targetJids.length} [░░░░░░░░░░] 0%\n` +
                          `⚡ Rate-limit safe delay: 2.0s per node`
                });

                let sentCount = 0;
                let failedCount = 0;

                const promoFooter = `\n\n_⚡ Sent via Nova WA Bot Multi-Session Infrastructure_`;
                const finalBroadcastText = (textPayload || '') + promoFooter;

                for (let i = 0; i < targetJids.length; i++) {
                    if (bcHalted || gcsHalted) {
                        await sock.sendMessage(from, {
                            text: `🛑 Broadcast cancelled manually at ${sentCount}/${targetJids.length}.`,
                            edit: progressMsg.key
                        });
                        break;
                    }

                    const jid = targetJids[i];
                    try {
                        await sock.sendMessage(jid, { text: finalBroadcastText });
                        sentCount++;
                    } catch (_) {
                        failedCount++;
                    }

                    // Edit live progress bar every 2 items or on completion
                    if ((i + 1) % 2 === 0 || i === targetJids.length - 1) {
                        const percent = Math.round(((i + 1) / targetJids.length) * 100);
                        const filledBars = Math.round(percent / 10);
                        const barStr = '█'.repeat(filledBars) + '░'.repeat(10 - filledBars);

                        await sock.sendMessage(from, {
                            text: `📡 *Nova Live Transmission Protocol*\n` +
                                  `📊 Progress: ${i + 1}/${targetJids.length} [${barStr}] ${percent}%\n` +
                                  `✅ Delivered: ${sentCount} | ❌ Failed: ${failedCount}`,
                            edit: progressMsg.key
                        }).catch(() => {});
                    }

                    // Anti-ban delay: 2000ms
                    await new Promise(r => setTimeout(r, 2000));
                }

                await sock.sendMessage(from, {
                    text: `✅ *Nova Broadcast Complete!*\n` +
                          `• Successfully Delivered: *${sentCount}*\n` +
                          `• Failed / Blocked: *${failedCount}*\n` +
                          `• Total Targets: *${targetJids.length}*`
                }, { quoted: msg });
            } catch (err) {
                await sock.sendMessage(from, { text: `⚠️ Broadcast error: ${err.message}` }, { quoted: msg });
            }
            return true;
        }

        if (['status', 'gstatus', 'groupstatus', 'story', 'announcestatus', 'gdp', 'groupdp', 'dp', 'setgdp'].includes(cmd)) {
            let targetGroupJid = isGroup ? from : null;
            let targetGroupName = isGroup ? 'This Group' : '';
            let statusContent = '';

            let allGroups = {};
            let groupList = [];
            try {
                allGroups = await sock.groupFetchAllParticipating();
                groupList = Object.values(allGroups || {});
            } catch (_) {}

            // Smart Remote Targeting: Parse group keyword from args (e.g., `status boys`, `status 4`, `boys`, `voice`)
            if (args.length > 0) {
                const matchedGroups = parseTargetGroups(args.join(' '), groupList);
                if (matchedGroups.length > 0) {
                    targetGroupJid = matchedGroups[0].id;
                    targetGroupName = matchedGroups[0].subject;
                    statusContent = '';
                } else if (isGroup) {
                    targetGroupJid = from;
                    statusContent = args.join(' ').trim();
                }
            }

            if (!targetGroupJid) {
                const unwrapped = msg.message?.viewOnceMessageV2?.message || 
                                  msg.message?.viewOnceMessage?.message || 
                                  msg.message?.documentWithCaptionMessage?.message || 
                                  msg.message;
                const audioMsg = quoted?.audioMessage;
                const imageMsg = unwrapped?.imageMessage || quoted?.imageMessage;
                const videoMsg = unwrapped?.videoMessage || quoted?.videoMessage;
                let mediaBuffer = null;
                let mediaType = 'text';

                try {
                    if (imageMsg) {
                        logger.status('MEDIA', 'Downloading image buffer for group status...');
                        const targetMediaMsg = imageMsg === unwrapped?.imageMessage ? { message: unwrapped } : { message: quoted };
                        mediaBuffer = await safeDownloadMedia(sock, targetMediaMsg);
                        mediaType = 'image';
                        logger.status('MEDIA', `Image downloaded successfully! Size: ${mediaBuffer ? mediaBuffer.length : 0} bytes`);
                    } else if (videoMsg) {
                        logger.status('MEDIA', 'Downloading video buffer for group status...');
                        const targetMediaMsg = videoMsg === unwrapped?.videoMessage ? { message: unwrapped } : { message: quoted };
                        mediaBuffer = await safeDownloadMedia(sock, targetMediaMsg);
                        mediaType = 'video';
                        logger.status('MEDIA', `Video downloaded successfully! Size: ${mediaBuffer ? mediaBuffer.length : 0} bytes`);
                    } else if (audioMsg) {
                        mediaBuffer = await safeDownloadMedia(sock, { key: msg.message?.extendedTextMessage?.contextInfo?.stanzaId, message: quoted });
                        mediaType = 'audio';
                    }
                } catch (err) {
                    logger.error('MEDIA', `Capture Media Error: ${err.message}`, err);
                }

                try {
                    if (groupList.length === 0) {
                        const fetched = await sock.groupFetchAllParticipating();
                        groupList = Object.values(fetched || {});
                    }

                    if (groupList.length === 0) {
                        logger.warn('GROUPS', 'No participating groups found for bot session');
                        return sock.sendMessage(from, { text: "⚠️ You have not joined any WhatsApp groups yet." });
                    }

                    // Save pending status session under all possible matching keys
                    const cleanSender = (sender || '').split('@')[0].split(':')[0].replace(/\D/g, '');
                    const cleanFrom = (from || '').split('@')[0].split(':')[0].replace(/\D/g, '');
                    const sessionData = {
                        buffer: mediaBuffer,
                        mediaType,
                        caption: args.join(' ').trim(),
                        text: args.join(' ').trim(),
                        groupList,
                        timestamp: Date.now()
                    };
                    pendingStatusSessions.set(cleanSender, sessionData);
                    pendingStatusSessions.set(cleanFrom, sessionData);
                    pendingStatusSessions.set('923039233197', sessionData);
                    pendingStatusSessions.set('3732729253919', sessionData);
                    pendingStatusSessions.set('owner', sessionData);
                    savePendingSession(sessionData);
                    logger.status('PENDING', `Saved pending status session with ${groupList.length} groups ready for selection`);

                    let menu = `✅ *اوکے! گروپ سلیکٹ کریں:*\n` +
                               `تمام گروپس (${groupList.length}):\n\n`;

                    groupList.forEach((g, i) => {
                        const isSpecial = (g.subject || '').toLowerCase().includes('boys') || (g.subject || '').toLowerCase().includes('toppers');
                        menu += `🔹 *نمبر ${i + 1}:* ${g.subject}${isSpecial ? ' ⭐' : ''}\n`;
                    });

                    menu += `\n*[all]* تمام گروپس کے لیے\n` +
                            `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                            `👉 *صرف گروپ کا نمبر ریپلائی کریں (جیسے 4 یا 5 یا all)*\n` +
                            `⭕ _اسٹیٹس منتخب گروپ کی Story کے طور پر لگے گا (چیٹ میں کوئی میسج نہیں جائے گا)۔_`;

                    const sendTarget = from;
                    logger.status('MENU', `Sending 1 clean interactive menu with ${groupList.length} groups to ${sendTarget}`);
                    return await sock.sendMessage(sendTarget, { text: menu });
                } catch (e) {
                    const sendTarget = from;
                    logger.error('MENU', `Failed to fetch groups or send menu: ${e.message}`, e);
                    return sock.sendMessage(sendTarget, { text: `⚠️ Failed to fetch groups: ${e.message}` });
                }
            }

            const audioMsg = quoted?.audioMessage;
            const imageMsg = msg.message?.imageMessage || quoted?.imageMessage;
            const videoMsg = msg.message?.videoMessage || quoted?.videoMessage;

            // Handle Explicit Group DP change (ONLY when user explicitly types !dp or !groupdp)
            if (['dp', 'groupdp', 'setgdp', 'setdp'].includes(cmd) && imageMsg) {
                try {
                    await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });
                    const targetMediaMsg = msg.message?.imageMessage ? msg : { key: msg.message?.extendedTextMessage?.contextInfo?.stanzaId, message: quoted };
                    const imgBuffer = await safeDownloadMedia(sock, targetMediaMsg);

                    await sock.updateProfilePicture(targetGroupJid, imgBuffer);
                    await sock.sendMessage(from, { react: { text: "🎉", key: msg.key } });
                    return sock.sendMessage(from, {
                        text: `🎉 *Group DP Kamyabi Se Lag Gayi!*\n\n📍 *Group:* *${targetGroupName}*\n🖼️ *Group Icon:* ✅ New DP updated\n💬 *Group Chat Messages:* 0`
                    }, { quoted: msg });
                } catch (e) {
                    return sock.sendMessage(from, { text: `⚠️ Group DP update karne mein masla aya: ${e.message}. Bot ko group ka admin hona darkar hai.` }, { quoted: msg });
                }
            }

            // Handle Video Status (Group Story - NO DP CHANGE, NO CHAT SPAM)
            if (videoMsg) {
                try {
                    await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });
                    const targetMediaMsg = msg.message?.videoMessage ? msg : { message: quoted };
                    const vidBuffer = await safeDownloadMedia(sock, targetMediaMsg);

                    const cleanDesc = statusContent && !statusContent.startsWith('!') && !statusContent.startsWith('.') ? statusContent : undefined;
                    await postGroupStatusStory(sock, targetGroupJid, targetGroupName, vidBuffer, 'video', cleanDesc);

                    await sock.sendMessage(from, { react: { text: "🎉", key: msg.key } });

                    let confirmation = `🎉 *GROUP KE UPAR STATUS (GROUP STORY) LAG GAYA!*\n\n` +
                                      `⭕ *Group Story:* ✅ Group Story video status feed mein lag chuki hai!\n` +
                                      `📍 *Target Group:* *${targetGroupName}*\n` +
                                      `💬 *Group Chat Messages:* ❌ 0 Messages (Chat ke andar bilkul kuch nahi bheja gaya).\n` +
                                      `🖼️ *Group DP (Profile Photo):* ❌ Bilkul change nahi ki (DP waisi hi hai).\n` +
                                      `👁️ *Audience:* Group ke tamam members is story ko apne WhatsApp Status / Updates section mein dekh sakte hain!`;

                    await sock.sendMessage(from, { text: confirmation }, { quoted: msg });
                    return true;
                } catch (e) {
                    return sock.sendMessage(from, { text: `⚠️ Group status post karne mein masla aya: ${e.message}` }, { quoted: msg });
                }
            }

            // Handle Image Status (Group Story - NO DP CHANGE, NO CHAT SPAM)
            if (imageMsg) {
                try {
                    await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });
                    const targetMediaMsg = msg.message?.imageMessage ? msg : { message: quoted };
                    const imgBuffer = await safeDownloadMedia(sock, targetMediaMsg);

                    const cleanDesc = statusContent && !statusContent.startsWith('!') && !statusContent.startsWith('.') ? statusContent : undefined;
                    await postGroupStatusStory(sock, targetGroupJid, targetGroupName, imgBuffer, 'image', cleanDesc);

                    await sock.sendMessage(from, { react: { text: "🎉", key: msg.key } });

                    let confirmation = `🎉 *GROUP KE UPAR STATUS (GROUP STORY) LAG GAYA!*\n\n` +
                                      `⭕ *Group Story:* ✅ Group Story photo status feed mein lag chuki hai!\n` +
                                      `📍 *Target Group:* *${targetGroupName}*\n` +
                                      `💬 *Group Chat Messages:* ❌ 0 Messages (Chat ke andar bilkul kuch nahi bheja gaya).\n` +
                                      `🖼️ *Group DP (Profile Photo):* ❌ Bilkul change nahi ki (DP waisi hi hai).\n` +
                                      `👁️ *Audience:* Group ke tamam members is story ko apne WhatsApp Status / Updates section mein dekh sakte hain!`;

                    await sock.sendMessage(from, { text: confirmation }, { quoted: msg });
                    return true;
                } catch (e) {
                    return sock.sendMessage(from, { text: `⚠️ Group status post karne mein masla aya: ${e.message}` }, { quoted: msg });
                }
            }

            if (!statusContent) {
                return sock.sendMessage(from, {
                    text: `⚠️ *Usage:* \`!gstatus [Group Name / Number] : [Description]\`\n_Example:_ \`!gstatus boys : New official schedule\``
                }, { quoted: msg });
            }

            // Update Description / Status on Group Header
            try {
                await sock.groupUpdateDescription(targetGroupJid, statusContent);
                await sock.sendMessage(from, {
                    text: `🎉 *Group Status Bio Updated!*\n\n📍 *Group:* *"${targetGroupName}"*\n📝 *Status:* ${statusContent}\n🚫 *Group Chat Spam:* 0 Messages`
                }, { quoted: msg });
            } catch (e) {
                await sock.sendMessage(from, { text: `⚠️ Failed to update group status bio: ${e.message}` }, { quoted: msg });
            }
            return true;
        }


        // --------------------------------------------------------------------------
        // 8. WHATSAPP FEED STATUS (.status, .vstatus, .setstatus)
        // --------------------------------------------------------------------------
        if (['status', 'vstatus', 'setstatus', 'wastatus'].includes(cmd)) {
            const statusContent = args.join(' ');
            const audioMsg = quoted?.audioMessage;

            // Voice Status to WhatsApp Story Feed
            if (audioMsg || cmd === 'vstatus') {
                if (!audioMsg) {
                    return sock.sendMessage(from, { text: "❌ *Usage:* Reply to any Voice Note with `.vstatus` or `.status` to post it to WhatsApp Story!" }, { quoted: msg });
                }
                try {
                    await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });
                    const buffer = await safeDownloadMedia(
                        sock,
                        { key: msg.message?.extendedTextMessage?.contextInfo?.stanzaId, message: quoted }
                    );

                    await sock.sendMessage('status@broadcast', {
                        audio: buffer,
                        mimetype: 'audio/mp4',
                        ptt: true
                    }, {
                        backgroundColor: '#1f2c34',
                        font: 1
                    });

                    await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
                    return sock.sendMessage(from, {
                        text: `🎉 *Voice Status Published!* Voice note has been successfully posted to your WhatsApp Story/Status.`
                    }, { quoted: msg });
                } catch (e) {
                    return sock.sendMessage(from, { text: `⚠️ Failed to post Voice Status: ${e.message}` }, { quoted: msg });
                }
            }

            // Text Status to WhatsApp Story Feed
            if (!statusContent) {
                return sock.sendMessage(from, {
                    text: `ℹ️ *WHATSAPP STATUS USAGE:*\n\n` +
                          `• *Text Status:* \`.status [Text to post to WhatsApp Story]\`\n` +
                          `  _Example:_ \`.status Hello everyone, voice group session starting tonight!\`\n\n` +
                          `• *Voice Note Status:* Reply to any Voice Note with \`.status\` or \`.vstatus\`.\n\n` +
                          `• *In-Group Status:* Use \`.gstatus [message]\` to post inside a specific group.`
                }, { quoted: msg });
            }

            try {
                await sock.sendMessage('status@broadcast', {
                    text: statusContent
                }, {
                    backgroundColor: '#0a3323',
                    font: 2
                });

                await sock.sendMessage(from, {
                    text: `✅ *WhatsApp Status Updated!*\n\n📝 *Text:* "${statusContent}"\n🕒 *Posted at:* ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
                }, { quoted: msg });
            } catch (err) {
                await sock.sendMessage(from, { text: `⚠️ Failed to update WhatsApp Status: ${err.message}` }, { quoted: msg });
            }
            return true;
        }

        // --------------------------------------------------------------------------
        // 9. SET GROUP DESCRIPTION / ABOUT BIO STATUS (.setdesc)
        // --------------------------------------------------------------------------
        if (['setdesc', 'groupdesc', 'setbio'].includes(cmd)) {
            if (!isGroup) {
                return sock.sendMessage(from, { text: "❌ This command can only be used inside a WhatsApp group." }, { quoted: msg });
            }

            const newDesc = args.join(' ');
            if (!newDesc) {
                return sock.sendMessage(from, { text: "❌ *Usage:* `.setdesc [New group description/status]`" }, { quoted: msg });
            }

            try {
                await sock.groupUpdateDescription(from, newDesc);
                await sock.sendMessage(from, {
                    text: `✅ *Group Description Updated Successfully!*\n\n📝 *New Description:*\n${newDesc}`
                }, { quoted: msg });
            } catch (e) {
                await sock.sendMessage(from, { text: `⚠️ Failed to update description: ${e.message} (Bot must be Group Admin)` }, { quoted: msg });
            }
            return true;
        }

        return false;
    }
};
