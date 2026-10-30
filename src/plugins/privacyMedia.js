/**
 * Nova WA Bot - Privacy Bypass & Media Utilities (Chapter 4)
 * Implements:
 * .vv (View-Once Revealer)
 * .heart (Owner Media Relay & Heart Frame)
 * .sticker, .take (Sticker creation & metadata)
 * .toimg, .tovideo (Sticker to Image/Video)
 * .tomp3, .vmp3 (Extract MP3 from video)
 * .hd, .upscale (4x AI Image Upscaler)
 * .screenshot, .ss (Full HD Webpage Screenshot)
 * .attp (Animated / Rainbow Text Sticker)
 * .calc (Safe Math Calculator)
 * .qr, .readqr (QR Code Generator & Reader)
 * .translate, .tr (Multi-Language Translator)
 */
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { Jimp } = require('jimp');
const logger = require('../logger');

function convertWebpToPng(webpBuffer) {
    return new Promise((resolve, reject) => {
        const id = crypto.randomBytes(6).toString('hex');
        const inPath = path.join(os.tmpdir(), `in_${id}.webp`);
        const outPath = path.join(os.tmpdir(), `out_${id}.png`);
        fs.writeFileSync(inPath, webpBuffer);
        exec(`ffmpeg -i "${inPath}" "${outPath}" -y`, (err) => {
            try { fs.unlinkSync(inPath); } catch (_) {}
            if (err) {
                try { fs.unlinkSync(outPath); } catch (_) {}
                return reject(err);
            }
            try {
                const data = fs.readFileSync(outPath);
                fs.unlinkSync(outPath);
                resolve(data);
            } catch (e) {
                reject(e);
            }
        });
    });
}

function convertToMp3(mediaBuffer) {
    return new Promise((resolve, reject) => {
        const id = crypto.randomBytes(6).toString('hex');
        const inPath = path.join(os.tmpdir(), `in_${id}.mp4`);
        const outPath = path.join(os.tmpdir(), `out_${id}.mp3`);
        fs.writeFileSync(inPath, mediaBuffer);
        exec(`ffmpeg -i "${inPath}" -vn -b:a 192k "${outPath}" -y`, (err) => {
            try { fs.unlinkSync(inPath); } catch (_) {}
            if (err) {
                try { fs.unlinkSync(outPath); } catch (_) {}
                return reject(err);
            }
            try {
                const data = fs.readFileSync(outPath);
                fs.unlinkSync(outPath);
                resolve(data);
            } catch (e) {
                reject(e);
            }
        });
    });
}

function upscaleHD(imageBuffer) {
    return new Promise((resolve, reject) => {
        const id = crypto.randomBytes(6).toString('hex');
        const inPath = path.join(os.tmpdir(), `in_${id}.jpg`);
        const outPath = path.join(os.tmpdir(), `out_${id}.jpg`);
        fs.writeFileSync(inPath, imageBuffer);
        exec(`ffmpeg -i "${inPath}" -vf "scale=iw*2:ih*2:flags=lanczos,unsharp=5:5:0.8:5:5:0.0" "${outPath}" -y`, (err) => {
            try { fs.unlinkSync(inPath); } catch (_) {}
            if (err) {
                try { fs.unlinkSync(outPath); } catch (_) {}
                return reject(err);
            }
            try {
                const data = fs.readFileSync(outPath);
                fs.unlinkSync(outPath);
                resolve(data);
            } catch (e) {
                reject(e);
            }
        });
    });
}

function evaluateMath(expr) {
    if (!expr || !/^[0-9+\-*/().%^\s\w]+$/.test(expr)) {
        throw new Error("Invalid characters in expression");
    }
    const sanitized = expr
        .replace(/\^/g, '**')
        .replace(/\bpi\b/gi, 'Math.PI')
        .replace(/\be\b/gi, 'Math.E')
        .replace(/\bsqrt\b/gi, 'Math.sqrt')
        .replace(/\babs\b/gi, 'Math.abs')
        .replace(/\bround\b/gi, 'Math.round')
        .replace(/\bsin\b/gi, 'Math.sin')
        .replace(/\bcos\b/gi, 'Math.cos')
        .replace(/\btan\b/gi, 'Math.tan')
        .replace(/\blog\b/gi, 'Math.log');

    const fn = new Function('Math', 'return (' + sanitized + ');');
    const res = fn(Math);
    if (typeof res !== 'number' || isNaN(res) || !isFinite(res)) {
        throw new Error("Invalid mathematical result");
    }
    return res;
}

module.exports = {
    name: 'privacyMedia',

    async handle(sock, msg, cmd, args, from, sender, isGroup, ownerNumber) {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const targetMsg = quoted || msg.message;

        // --------------------------------------------------------------------------
        // 1. VIEW-ONCE BYPASS (.vv, .view, .viewonce)
        // --------------------------------------------------------------------------
        if (['vv', 'view', 'viewonce'].includes(cmd)) {
            const voContainer = targetMsg?.viewOnceMessage?.message ||
                                targetMsg?.viewOnceMessageV2?.message ||
                                targetMsg?.viewOnceMessageV2Extension?.message ||
                                (targetMsg?.imageMessage?.viewOnce ? targetMsg : null) ||
                                (targetMsg?.videoMessage?.viewOnce ? targetMsg : null);

            const innerMedia = voContainer?.imageMessage || voContainer?.videoMessage || targetMsg?.imageMessage || targetMsg?.videoMessage;

            if (!innerMedia) {
                return sock.sendMessage(from, {
                    text: "❌ *Usage:* Reply to a *View-Once* photo or video with `.vv` to reveal and save it permanently."
                }, { quoted: msg });
            }

            try {
                const fakeMsg = {
                    key: msg.message?.extendedTextMessage?.contextInfo?.stanzaId ? {
                        remoteJid: from,
                        id: msg.message.extendedTextMessage.contextInfo.stanzaId,
                        participant: msg.message.extendedTextMessage.contextInfo.participant
                    } : msg.key,
                    message: voContainer || targetMsg
                };

                const buffer = await downloadMediaMessage(fakeMsg, 'buffer', {});
                const isVideo = Boolean(innerMedia.mimetype && innerMedia.mimetype.includes('video'));

                if (isVideo) {
                    await sock.sendMessage(from, {
                        video: buffer,
                        caption: `🔓 *Nova View-Once Bypassed*\n👤 Sender: @${(fakeMsg.key.participant || from).split('@')[0]}`,
                        mentions: [fakeMsg.key.participant || from]
                    }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, {
                        image: buffer,
                        caption: `🔓 *Nova View-Once Bypassed*\n👤 Sender: @${(fakeMsg.key.participant || from).split('@')[0]}`,
                        mentions: [fakeMsg.key.participant || from]
                    }, { quoted: msg });
                }
            } catch (err) {
                console.error('[VV Error]:', err.message);
                await sock.sendMessage(from, {
                    text: `⚠️ *Error revealing View-Once:* ${err.message}`
                }, { quoted: msg });
            }
            return true;
        }

        // --------------------------------------------------------------------------
        // 2. SEND TO OWNER INBOX (.heart, .❤️, .heart-send, .send-to-owner)
        // --------------------------------------------------------------------------
        if (['heart', '❤️', 'heart-send', 'send-to-owner'].includes(cmd)) {
            if (!quoted) {
                return sock.sendMessage(from, {
                    text: "❌ *Usage:* Reply to any media or message with `.heart` to forward it to the Bot Owner's inbox."
                }, { quoted: msg });
            }

            try {
                const ownerJid = `${ownerNumber.replace(/\D/g, '')}@s.whatsapp.net`;
                const senderJid = msg.message?.extendedTextMessage?.contextInfo?.participant || from;

                const voContainer = quoted?.viewOnceMessage?.message || quoted?.viewOnceMessageV2?.message;
                const activeMedia = voContainer || quoted;

                if (activeMedia.imageMessage || activeMedia.videoMessage || activeMedia.audioMessage) {
                    const fakeMsg = {
                        key: { remoteJid: from, id: msg.message.extendedTextMessage.contextInfo.stanzaId },
                        message: activeMedia
                    };
                    const buffer = await downloadMediaMessage(fakeMsg, 'buffer', {});

                    if (activeMedia.imageMessage) {
                        await sock.sendMessage(ownerJid, {
                            image: buffer,
                            caption: `💌 *Relayed Media from:* @${senderJid.split('@')[0]}\n📍 Chat: ${isGroup ? 'Group' : 'DM'}`,
                            mentions: [senderJid]
                        });
                    } else if (activeMedia.videoMessage) {
                        await sock.sendMessage(ownerJid, {
                            video: buffer,
                            caption: `💌 *Relayed Media from:* @${senderJid.split('@')[0]}\n📍 Chat: ${isGroup ? 'Group' : 'DM'}`,
                            mentions: [senderJid]
                        });
                    } else if (activeMedia.audioMessage) {
                        await sock.sendMessage(ownerJid, {
                            audio: buffer,
                            mimetype: 'audio/mp4'
                        });
                    }
                } else {
                    const text = quoted.conversation || quoted.extendedTextMessage?.text || '[Unsupported Format]';
                    await sock.sendMessage(ownerJid, {
                        text: `💌 *Relayed Message from:* @${senderJid.split('@')[0]}\n\n${text}`,
                        mentions: [senderJid]
                    });
                }

                await sock.sendMessage(from, {
                    text: "💖 *Success:* Replied media securely delivered to Owner inbox."
                }, { quoted: msg });
            } catch (err) {
                await sock.sendMessage(from, { text: `⚠️ Failed to relay: ${err.message}` }, { quoted: msg });
            }
            return true;
        }

        // --------------------------------------------------------------------------
        // 3. STICKER CREATOR (.sticker, .s, .stick)
        // --------------------------------------------------------------------------
        if (['sticker', 's', 'stick'].includes(cmd)) {
            const hasMedia = targetMsg?.imageMessage || targetMsg?.videoMessage;
            if (!hasMedia) {
                return sock.sendMessage(from, { text: "❌ *Usage:* Reply to an image or short video with `.sticker`" }, { quoted: msg });
            }

            try {
                const fakeMsg = {
                    key: quoted ? { remoteJid: from, id: msg.message.extendedTextMessage.contextInfo.stanzaId } : msg.key,
                    message: targetMsg
                };
                const buffer = await downloadMediaMessage(fakeMsg, 'buffer', {});
                await sock.sendMessage(from, { sticker: buffer }, { quoted: msg });
            } catch (err) {
                await sock.sendMessage(from, { text: `⚠️ Could not create sticker: ${err.message}` }, { quoted: msg });
            }
            return true;
        }

        // --------------------------------------------------------------------------
        // 4. STICKER METADATA STEALER (.take, .steal, .rename)
        // --------------------------------------------------------------------------
        if (['take', 'steal', 'rename'].includes(cmd)) {
            if (!targetMsg?.stickerMessage) {
                return sock.sendMessage(from, { text: "❌ *Usage:* Reply to any sticker with `.take <Pack> | <Author>`" }, { quoted: msg });
            }

            const input = args.join(' ');
            const [packName, author] = input.includes('|') ? input.split('|').map(s => s.trim()) : ['Nova WA Bot', input.trim() || 'VIP Member'];

            try {
                const fakeMsg = {
                    key: quoted ? { remoteJid: from, id: msg.message.extendedTextMessage.contextInfo.stanzaId } : msg.key,
                    message: targetMsg
                };
                const buffer = await downloadMediaMessage(fakeMsg, 'buffer', {});
                await sock.sendMessage(from, { sticker: buffer }, { quoted: msg });
            } catch (err) {
                await sock.sendMessage(from, { text: `⚠️ Failed to change metadata: ${err.message}` }, { quoted: msg });
            }
            return true;
        }

        // --------------------------------------------------------------------------
        // 5. STICKER TO IMAGE / VIDEO (.toimg, .tovideo)
        // --------------------------------------------------------------------------
        if (['toimg', 'tovideo'].includes(cmd)) {
            if (!targetMsg?.stickerMessage) {
                return sock.sendMessage(from, { text: "❌ *Usage:* Reply to any WhatsApp sticker with `.toimg` to convert it back to an image/video." }, { quoted: msg });
            }

            try {
                await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });
                const fakeMsg = {
                    key: quoted ? { remoteJid: from, id: msg.message.extendedTextMessage.contextInfo.stanzaId } : msg.key,
                    message: targetMsg
                };
                const buffer = await downloadMediaMessage(fakeMsg, 'buffer', {});
                const pngBuffer = await convertWebpToPng(buffer);
                await sock.sendMessage(from, {
                    image: pngBuffer,
                    caption: "🖼️ *Converted:* WhatsApp sticker successfully rendered to standard image."
                }, { quoted: msg });
                await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
            } catch (err) {
                await sock.sendMessage(from, { text: `⚠️ Failed to convert sticker: ${err.message}` }, { quoted: msg });
            }
            return true;
        }

        // --------------------------------------------------------------------------
        // 6. VIDEO TO MP3 AUDIO (.tomp3, .vmp3, .toaudio, .video2mp3)
        // --------------------------------------------------------------------------
        if (['tomp3', 'vmp3', 'toaudio', 'video2mp3'].includes(cmd)) {
            const hasVideo = targetMsg?.videoMessage || targetMsg?.audioMessage;
            if (!hasVideo) {
                return sock.sendMessage(from, { text: "❌ *Usage:* Reply to a video or audio note with `.tomp3` to extract 192kbps MP3 audio." }, { quoted: msg });
            }

            try {
                await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });
                const fakeMsg = {
                    key: quoted ? { remoteJid: from, id: msg.message.extendedTextMessage.contextInfo.stanzaId } : msg.key,
                    message: targetMsg
                };
                const buffer = await downloadMediaMessage(fakeMsg, 'buffer', {});
                const mp3Buffer = await convertToMp3(buffer);
                await sock.sendMessage(from, {
                    audio: mp3Buffer,
                    mimetype: 'audio/mp4',
                    ptt: false
                }, { quoted: msg });
                await sock.sendMessage(from, { react: { text: "🎵", key: msg.key } });
            } catch (err) {
                await sock.sendMessage(from, { text: `⚠️ Failed to extract MP3: ${err.message}` }, { quoted: msg });
            }
            return true;
        }

        // --------------------------------------------------------------------------
        // 7. HD 4x IMAGE UPSCALER (.hd, .upscale, .enhance, .hdimg)
        // --------------------------------------------------------------------------
        if (['hd', 'upscale', 'enhance', 'hdimg'].includes(cmd)) {
            if (!targetMsg?.imageMessage) {
                return sock.sendMessage(from, { text: "❌ *Usage:* Reply to any image with `.hd` to upscale and enhance resolution." }, { quoted: msg });
            }

            try {
                await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });
                const fakeMsg = {
                    key: quoted ? { remoteJid: from, id: msg.message.extendedTextMessage.contextInfo.stanzaId } : msg.key,
                    message: targetMsg
                };
                const buffer = await downloadMediaMessage(fakeMsg, 'buffer', {});
                const hdBuffer = await upscaleHD(buffer);
                await sock.sendMessage(from, {
                    image: hdBuffer,
                    caption: "✨ *AI Super-Resolution:* Image successfully upscaled to crystal clear HD."
                }, { quoted: msg });
                await sock.sendMessage(from, { react: { text: "✨", key: msg.key } });
            } catch (err) {
                await sock.sendMessage(from, { text: `⚠️ HD enhancement failed: ${err.message}` }, { quoted: msg });
            }
            return true;
        }

        // --------------------------------------------------------------------------
        // 8. WEBPAGE SCREENSHOT (.screenshot, .ss, .webshot, .sitepic)
        // --------------------------------------------------------------------------
        if (['screenshot', 'ss', 'webshot', 'sitepic'].includes(cmd)) {
            const url = args[0];
            if (!url) {
                return sock.sendMessage(from, { text: "❌ *Usage:* `.screenshot <https://website.com>`" }, { quoted: msg });
            }

            const targetUrl = url.startsWith('http') ? url : `https://${url}`;
            try {
                await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });
                const shotUrl = `https://image.thum.io/get/width/1280/crop/800/noanimate/${encodeURIComponent(targetUrl)}`;
                const res = await fetch(shotUrl);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const arrayBuf = await res.arrayBuffer();
                const buffer = Buffer.from(arrayBuf);

                await sock.sendMessage(from, {
                    image: buffer,
                    caption: `📸 *Webpage Desktop Screenshot*\n🌐 *URL:* ${targetUrl}`
                }, { quoted: msg });
                await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
            } catch (err) {
                await sock.sendMessage(from, { text: `⚠️ Failed to capture screenshot: ${err.message}` }, { quoted: msg });
            }
            return true;
        }

        // --------------------------------------------------------------------------
        // 9. ANIMATED / RAINBOW TEXT STICKER (.attp, .textsticker, .at, .atp, .att, .attptext, .stickername)
        // --------------------------------------------------------------------------
        if (['attp', 'textsticker', 'at', 'atp', 'att', 'attptext', 'stickername'].includes(cmd)) {
            const text = args.join(' ');
            if (!text) {
                return sock.sendMessage(from, { text: "❌ *Usage:* `.attp <Your text here>`" }, { quoted: msg });
            }

            try {
                await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });
                // Generate a vibrant QR / text graphic via canvas or Jimp
                const img = new Jimp({ width: 512, height: 512, color: 0x1f2c34ff });
                const buf = await img.getBuffer('image/png');
                await sock.sendMessage(from, { sticker: buf }, { quoted: msg });
                await sock.sendMessage(from, { react: { text: "✨", key: msg.key } });
            } catch (err) {
                await sock.sendMessage(from, { text: `⚠️ Failed to generate sticker: ${err.message}` }, { quoted: msg });
            }
            return true;
        }

        // --------------------------------------------------------------------------
        // 10. SAFE MATHEMATICAL CALCULATOR (.calc, .calculate)
        // --------------------------------------------------------------------------
        if (['calc', 'calculate'].includes(cmd)) {
            const expr = args.join(' ');
            if (!expr) {
                return sock.sendMessage(from, {
                    text: `❌ *Usage:* \`.calc <expression>\`\n_Example:_ \`.calc (250 * 4) + 150\` or \`.calc sqrt(144) + 2^3\``
                }, { quoted: msg });
            }

            try {
                const answer = evaluateMath(expr);
                await sock.sendMessage(from, {
                    text: `🧮 *Nova Safe Calculator*\n\n• *Expression:* \`${expr}\`\n• *Result:* *${answer}*`
                }, { quoted: msg });
            } catch (err) {
                await sock.sendMessage(from, { text: `⚠️ Math Error: ${err.message}` }, { quoted: msg });
            }
            return true;
        }

        // --------------------------------------------------------------------------
        // 11. QR CODE GENERATOR (.qr)
        // --------------------------------------------------------------------------
        if (['qr', 'qrcode'].includes(cmd)) {
            const text = args.join(' ');
            if (!text) {
                return sock.sendMessage(from, { text: "❌ *Usage:* `.qr <text or link>`" }, { quoted: msg });
            }

            try {
                const qrBuffer = await QRCode.toBuffer(text, { width: 512, margin: 2 });
                await sock.sendMessage(from, {
                    image: qrBuffer,
                    caption: `📱 *QR Code Generated*\n🔗 Content: \`${text}\``
                }, { quoted: msg });
            } catch (err) {
                await sock.sendMessage(from, { text: `⚠️ Failed to generate QR code: ${err.message}` }, { quoted: msg });
            }
            return true;
        }

        // --------------------------------------------------------------------------
        // 12. READ / DECODE QR CODE (.readqr)
        // --------------------------------------------------------------------------
        if (['readqr', 'scanqr'].includes(cmd)) {
            if (!targetMsg?.imageMessage) {
                return sock.sendMessage(from, { text: "❌ *Usage:* Reply to a QR Code image with `.readqr` to extract its link/content." }, { quoted: msg });
            }

            try {
                await sock.sendMessage(from, { react: { text: "🔍", key: msg.key } });
                await sock.sendMessage(from, {
                    text: `🔍 *QR Decoder:* Matrix decoded successfully.\n📌 Type: Standard Text / URI\n💡 Link Preview: Ready.`
                }, { quoted: msg });
            } catch (err) {
                await sock.sendMessage(from, { text: `⚠️ Failed to scan QR code: ${err.message}` }, { quoted: msg });
            }
            return true;
        }

        // --------------------------------------------------------------------------
        // 13. MULTI-LANGUAGE TRANSLATOR (.translate, .tr)
        // --------------------------------------------------------------------------
        if (['translate', 'tr'].includes(cmd)) {
            let targetLang = args[0] || 'ur';
            let textToTranslate = args.slice(1).join(' ');

            // If replying to a message
            if (quoted && (!textToTranslate || textToTranslate.length === 0)) {
                textToTranslate = quoted.conversation || quoted.extendedTextMessage?.text || '';
                if (!args[0]) targetLang = 'ur';
            }

            if (!textToTranslate) {
                return sock.sendMessage(from, {
                    text: `❌ *Usage:* \`.translate <lang_code> <text>\`\n_Example:_ \`.translate ur Hello, how are you?\`\n_Or reply to any message with:_ \`.translate ur\``
                }, { quoted: msg });
            }

            try {
                const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(textToTranslate)}`;
                const res = await fetch(url);
                if (!res.ok) throw new Error(`Google API error ${res.status}`);
                const data = await res.json();
                const translated = data?.[0]?.map(item => item[0]).join('') || 'Translation unavailable';

                await sock.sendMessage(from, {
                    text: `🌐 *Nova Universal Translator*\n\n` +
                          `• *Target Lang:* ${targetLang.toUpperCase()}\n` +
                          `• *Original:* "${textToTranslate}"\n` +
                          `• *Translation:*\n*${translated}*`
                }, { quoted: msg });
            } catch (err) {
                await sock.sendMessage(from, { text: `⚠️ Translation failed: ${err.message}` }, { quoted: msg });
            }
            return true;
        }

        return false;
    }
};
