/**
 * Nova WA Bot - Group Moderation Suite (Chapter 7 & Chapter 9)
 * Implements:
 * - .mute, .close, .groupmute, .grclose, .grmute
 * - .unmute, .open, .groupunmute, .gropen, .grunmute
 * - .kick, .remove, .k
 * - .promote, .makeadmin, .giveadmin, .p, .pro
 * - .demote, .unadmin, .d, .dis, .disadmin, .diss
 * - .disadmins, .dadmin, .dall, .disall
 * - .requests, .requestlist
 * - .acceptall, .appr, .approv, .approve, .approved
 * - .rejectall, .reject
 * - .adminlock, .lockadmin, .alock
 * - .antilink, .alink, .linkfilter, .nolink
 * - .antibad, .badwords, .ab, .badfilter, .badword
 * - .welcome, .welcomeon, .bye, .goodbye, .byeon
 * - .online, .whosonline, .onlinemembers
 * - .grouplink, .invite, .resetlink
 * - .end, .kickall, .byeall, .fuckall
 * - .setdesc, .setwelcome, .setgoodbye, .setantilinkwarn
 * - .botadmin, .giveadminbot, .makebotadmin, .adminbot, .admincheck, .admintest
 * - .tagall, .everyone, .hidetag
 */
const fs = require('fs');
const path = require('path');
const dbPath = path.join(__dirname, '../../data/database.json');

function loadDB() {
    try {
        return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    } catch (_) {
        return { groupSettings: {} };
    }
}

function saveDB(data) {
    try {
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    } catch (_) {}
}

module.exports = {
    name: 'groupAdmin',

    async handle(sock, msg, cmd, args, from, sender, isGroup, ownerNumber) {
        if (!isGroup) return false;

        // Check if user is an Admin in the group
        const meta = await sock.groupMetadata(from).catch(() => null);
        if (!meta) return false;

        const senderParticipant = meta.participants.find(p => p.id === sender);
        const isSenderAdmin = Boolean(senderParticipant?.admin);
        const isBotOwner = sender.includes(ownerNumber);

        // All supported moderation commands & aliases
        const adminCommands = [
            'mute', 'close', 'groupmute', 'grclose', 'grmute',
            'unmute', 'open', 'groupunmute', 'gropen', 'grunmute',
            'kick', 'remove', 'k',
            'promote', 'makeadmin', 'giveadmin', 'p', 'pro',
            'demote', 'unadmin', 'd', 'dis', 'disadmin', 'diss',
            'disadmins', 'dadmin', 'dall', 'disall',
            'requests', 'requestlist',
            'acceptall', 'appr', 'approv', 'approve', 'approved',
            'rejectall', 'reject',
            'antilink', 'alink', 'linkfilter', 'nolink',
            'antibad', 'badwords', 'ab', 'badfilter', 'badword',
            'adminlock', 'lockadmin', 'alock',
            'welcome', 'welcomeon', 'bye', 'goodbye', 'byeon',
            'online', 'whosonline', 'onlinemembers',
            'grouplink', 'invite', 'resetlink',
            'end', 'kickall', 'byeall', 'fuckall',
            'setdesc', 'setwelcome', 'setgoodbye', 'setantilinkwarn',
            'botadmin', 'giveadminbot', 'makebotadmin', 'adminbot',
            'admincheck', 'admintest',
            'tagall', 'everyone', 'hidetag'
        ];

        if (!adminCommands.includes(cmd)) return false;

        if (!isSenderAdmin && !isBotOwner) {
            await sock.sendMessage(from, {
                text: "🔒 *Access Denied:* You must be an actual WhatsApp Admin of this group to execute moderation commands."
            }, { quoted: msg });
            return true;
        }

        const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
                             msg.message?.extendedTextMessage?.contextInfo?.participant;

        const db = loadDB();
        db.groupSettings = db.groupSettings || {};
        db.groupSettings[from] = db.groupSettings[from] || {};

        switch (cmd) {
            case 'mute':
            case 'close':
            case 'groupmute':
            case 'grclose':
            case 'grmute':
                await sock.groupSettingUpdate(from, 'announcement');
                await sock.sendMessage(from, { text: "🔒 *Group Muted:* Only administrators can send messages." }, { quoted: msg });
                break;

            case 'unmute':
            case 'open':
            case 'groupunmute':
            case 'gropen':
            case 'grunmute':
                await sock.groupSettingUpdate(from, 'not_announcement');
                await sock.sendMessage(from, { text: "🔓 *Group Unmuted:* All members can send messages now." }, { quoted: msg });
                break;

            case 'kick':
            case 'remove':
            case 'k':
                if (!mentionedJid) {
                    return sock.sendMessage(from, { text: "❌ *Usage:* Reply to a user's message or tag them with `.kick @user`" }, { quoted: msg });
                }
                await sock.groupParticipantsUpdate(from, [mentionedJid], 'remove');
                await sock.sendMessage(from, { text: `👢 Removed @${mentionedJid.split('@')[0]} from group.`, mentions: [mentionedJid] });
                break;

            case 'promote':
            case 'makeadmin':
            case 'giveadmin':
            case 'p':
            case 'pro':
                if (!mentionedJid) {
                    return sock.sendMessage(from, { text: "❌ *Usage:* `.promote @user`" }, { quoted: msg });
                }
                await sock.groupParticipantsUpdate(from, [mentionedJid], 'promote');
                await sock.sendMessage(from, { text: `⭐ @${mentionedJid.split('@')[0]} has been promoted to Group Admin.`, mentions: [mentionedJid] });
                break;

            case 'demote':
            case 'unadmin':
            case 'd':
            case 'dis':
            case 'disadmin':
            case 'diss':
                if (!mentionedJid) {
                    return sock.sendMessage(from, { text: "❌ *Usage:* `.demote @user`" }, { quoted: msg });
                }
                await sock.groupParticipantsUpdate(from, [mentionedJid], 'demote');
                await sock.sendMessage(from, { text: `⬇️ @${mentionedJid.split('@')[0]} has been demoted to regular member.`, mentions: [mentionedJid] });
                break;

            case 'disadmins':
            case 'dadmin':
            case 'dall':
            case 'disall':
                const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                const adminsToDemote = meta.participants
                    .filter(p => p.admin && p.id !== sender && p.id !== botJid)
                    .map(p => p.id);

                if (adminsToDemote.length === 0) {
                    return sock.sendMessage(from, { text: "⚠️ No other admins found to demote." }, { quoted: msg });
                }
                await sock.groupParticipantsUpdate(from, adminsToDemote, 'demote');
                await sock.sendMessage(from, { text: `⚡ Successfully demoted ${adminsToDemote.length} other administrators.` }, { quoted: msg });
                break;

            case 'requests':
            case 'requestlist':
                const pending = await sock.groupRequestParticipantsList(from).catch(() => []);
                if (pending.length === 0) {
                    return sock.sendMessage(from, { text: "✨ No pending membership requests in this group." }, { quoted: msg });
                }
                let reqText = `📋 *PENDING JOIN REQUESTS (${pending.length})*\n\n`;
                pending.forEach((req, idx) => {
                    reqText += `*[${idx + 1}]* +${req.jid.split('@')[0]}\n`;
                });
                reqText += `\n💡 Type \`.acceptall\` to approve or \`.rejectall\` to decline.`;
                await sock.sendMessage(from, { text: reqText }, { quoted: msg });
                break;

            case 'acceptall':
            case 'appr':
            case 'approv':
            case 'approve':
            case 'approved':
                const allReqs = await sock.groupRequestParticipantsList(from).catch(() => []);
                if (allReqs.length === 0) {
                    return sock.sendMessage(from, { text: "✨ No pending requests to approve." }, { quoted: msg });
                }
                const jidsToApprove = allReqs.map(r => r.jid);
                for (const jid of jidsToApprove) {
                    await sock.groupRequestParticipantsUpdate(from, [jid], 'approve').catch(() => {});
                }
                await sock.sendMessage(from, { text: `✅ Approved all *${jidsToApprove.length}* membership requests!` }, { quoted: msg });
                break;

            case 'rejectall':
            case 'reject':
                const rejReqs = await sock.groupRequestParticipantsList(from).catch(() => []);
                if (rejReqs.length === 0) {
                    return sock.sendMessage(from, { text: "✨ No pending requests to reject." }, { quoted: msg });
                }
                const jidsToReject = rejReqs.map(r => r.jid);
                for (const jid of jidsToReject) {
                    await sock.groupRequestParticipantsUpdate(from, [jid], 'reject').catch(() => {});
                }
                await sock.sendMessage(from, { text: `🚫 Declined all *${jidsToReject.length}* membership requests.` }, { quoted: msg });
                break;

            case 'antilink':
            case 'alink':
            case 'linkfilter':
            case 'nolink':
                const linkState = args[0]?.toLowerCase() === 'on';
                db.groupSettings[from].antilink = linkState;
                saveDB(db);
                await sock.sendMessage(from, {
                    text: `🔗 *Anti-Link Shield:* ${linkState ? 'ACTIVATED ✅ (Invite links will be deleted)' : 'DEACTIVATED ❌'}`
                }, { quoted: msg });
                break;

            case 'antibad':
            case 'badwords':
            case 'ab':
            case 'badfilter':
            case 'badword':
                const badState = args[0]?.toLowerCase() === 'on';
                db.groupSettings[from].antibad = badState;
                saveDB(db);
                await sock.sendMessage(from, {
                    text: `🚫 *Anti-Badwords Shield:* ${badState ? 'ACTIVATED ✅' : 'DEACTIVATED ❌'}`
                }, { quoted: msg });
                break;

            case 'adminlock':
            case 'lockadmin':
            case 'alock':
                const lockState = args[0]?.toLowerCase() === 'on';
                db.groupSettings[from].adminlock = lockState;
                saveDB(db);
                await sock.sendMessage(from, {
                    text: `🔐 *Admin Lock:* ${lockState ? 'ACTIVATED ✅ (Unauthorized admin promotions will be auto-demoted)' : 'DEACTIVATED ❌'}`
                }, { quoted: msg });
                break;

            case 'welcome':
            case 'welcomeon':
                const welState = args[0]?.toLowerCase() === 'on';
                db.groupSettings[from].welcome = welState;
                saveDB(db);
                await sock.sendMessage(from, {
                    text: `👋 *Welcome Message:* ${welState ? 'ENABLED ✅' : 'DISABLED ❌'}`
                }, { quoted: msg });
                break;

            case 'bye':
            case 'goodbye':
            case 'byeon':
                const byeState = args[0]?.toLowerCase() === 'on';
                db.groupSettings[from].bye = byeState;
                saveDB(db);
                await sock.sendMessage(from, {
                    text: `👋 *Goodbye Message:* ${byeState ? 'ENABLED ✅' : 'DISABLED ❌'}`
                }, { quoted: msg });
                break;

            case 'online':
            case 'whosonline':
            case 'onlinemembers':
                let onlineText = `🟢 *ACTIVE GROUP PARTICIPANTS (${meta.participants.length})*\n\n`;
                meta.participants.slice(0, 50).forEach((p, i) => {
                    onlineText += `• @${p.id.split('@')[0]} ${p.admin ? '⭐ (Admin)' : ''}\n`;
                });
                await sock.sendMessage(from, {
                    text: onlineText,
                    mentions: meta.participants.map(p => p.id)
                }, { quoted: msg });
                break;

            case 'grouplink':
            case 'invite':
                const code = await sock.groupInviteCode(from).catch(() => null);
                if (code) {
                    await sock.sendMessage(from, { text: `🔗 *Group Link:* https://chat.whatsapp.com/${code}` }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: "⚠️ Could not retrieve link (Make sure bot is admin)." }, { quoted: msg });
                }
                break;

            case 'resetlink':
                const newCode = await sock.groupRevokeInvite(from).catch(() => null);
                if (newCode) {
                    await sock.sendMessage(from, { text: `🔄 *Link Reset Successfully:* https://chat.whatsapp.com/${newCode}` }, { quoted: msg });
                }
                break;

            case 'end':
            case 'kickall':
            case 'byeall':
            case 'fuckall':
                // Emergency Group Member Purge
                const myBotJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                const membersToPurge = meta.participants
                    .filter(p => !p.admin && p.id !== sender && p.id !== myBotJid)
                    .map(p => p.id);

                if (membersToPurge.length === 0) {
                    return sock.sendMessage(from, { text: "⚠️ No eligible members found to kick." }, { quoted: msg });
                }

                await sock.sendMessage(from, { text: `⚠️ *Executing Emergency Purge:* Removing ${membersToPurge.length} members...` }, { quoted: msg });
                for (const mJid of membersToPurge) {
                    await sock.groupParticipantsUpdate(from, [mJid], 'remove').catch(() => {});
                }
                await sock.sendMessage(from, { text: `👢 Group purge completed.` }, { quoted: msg });
                break;

            case 'botadmin':
            case 'giveadminbot':
            case 'makebotadmin':
            case 'adminbot':
                const currentBotJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                await sock.groupParticipantsUpdate(from, [currentBotJid], 'promote').catch(() => {});
                await sock.sendMessage(from, { text: "⭐ Bot promoted to Admin." }, { quoted: msg });
                break;

            case 'admincheck':
            case 'admintest':
                const isBotAdmin = meta.participants.some(p => p.id.startsWith(sock.user.id.split(':')[0]) && p.admin);
                await sock.sendMessage(from, {
                    text: `🛡️ *Group Security Audit:*\n• *You are Admin:* ${isSenderAdmin ? 'YES ✅' : 'NO ❌'}\n• *Bot is Admin:* ${isBotAdmin ? 'YES ✅' : 'NO ❌'}`
                }, { quoted: msg });
                break;

            case 'tagall':
            case 'everyone':
            case 'hidetag':
                const tagMessage = args.join(' ') || 'Attention everyone!';
                const participantsJids = meta.participants.map(p => p.id);
                let fullTagText = `📢 *ANNOUNCEMENT:*\n${tagMessage}\n\n`;
                meta.participants.forEach(p => {
                    fullTagText += `• @${p.id.split('@')[0]}\n`;
                });
                await sock.sendMessage(from, {
                    text: fullTagText,
                    mentions: participantsJids
                }, { quoted: msg });
                break;
        }

        return true;
    }
};
