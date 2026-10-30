/**
 * Nova WA Bot - Text & Developer Utilities (Chapter 9)
 * Implements:
 * - .base64, .decode64
 * - .binary, .unbinary
 * - .hex, .unhex
 * - .capitalize, .uppercase, .lowercase, .mock, .emojify, .reverse, .removespace
 * - .count
 * - .date, .time, .timestamp, .timezone
 * - .expandurl, .shorturl
 * - .password, .uuid
 * - .json, .regex, .define, .spell
 */
const crypto = require('crypto');

module.exports = {
    name: 'tools',

    async handle(sock, msg, cmd, args, from) {
        const text = args.join(' ');
        const cleanCmd = cmd.toLowerCase();

        // 1. BASE64
        if (cleanCmd === 'base64') {
            if (!text) return sock.sendMessage(from, { text: "❌ *Usage:* `.base64 <text to encode>`" }, { quoted: msg });
            const encoded = Buffer.from(text, 'utf8').toString('base64');
            return sock.sendMessage(from, { text: `🔐 *Base64 Encoded:*\n\`${encoded}\`` }, { quoted: msg });
        }

        if (['decode64', 'base64decode'].includes(cleanCmd)) {
            if (!text) return sock.sendMessage(from, { text: "❌ *Usage:* `.decode64 <base64 string>`" }, { quoted: msg });
            try {
                const decoded = Buffer.from(text, 'base64').toString('utf8');
                return sock.sendMessage(from, { text: `🔓 *Base64 Decoded:*\n${decoded}` }, { quoted: msg });
            } catch (e) {
                return sock.sendMessage(from, { text: `⚠️ Invalid Base64: ${e.message}` }, { quoted: msg });
            }
        }

        // 2. BINARY
        if (cleanCmd === 'binary') {
            if (!text) return sock.sendMessage(from, { text: "❌ *Usage:* `.binary <text>`" }, { quoted: msg });
            const binary = text.split('').map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
            return sock.sendMessage(from, { text: `💻 *Binary Code:*\n\`${binary}\`` }, { quoted: msg });
        }

        if (cleanCmd === 'unbinary') {
            if (!text) return sock.sendMessage(from, { text: "❌ *Usage:* `.unbinary <binary string>`" }, { quoted: msg });
            try {
                const decoded = text.split(' ').map(bin => String.fromCharCode(parseInt(bin, 2))).join('');
                return sock.sendMessage(from, { text: `📝 *Decoded Text:*\n${decoded}` }, { quoted: msg });
            } catch (e) {
                return sock.sendMessage(from, { text: `⚠️ Invalid Binary format` }, { quoted: msg });
            }
        }

        // 3. HEX
        if (cleanCmd === 'hex') {
            if (!text) return sock.sendMessage(from, { text: "❌ *Usage:* `.hex <text>`" }, { quoted: msg });
            const hex = Buffer.from(text, 'utf8').toString('hex');
            return sock.sendMessage(from, { text: `🔢 *Hexadecimal:*\n\`${hex}\`` }, { quoted: msg });
        }

        if (cleanCmd === 'unhex') {
            if (!text) return sock.sendMessage(from, { text: "❌ *Usage:* `.unhex <hex string>`" }, { quoted: msg });
            try {
                const decoded = Buffer.from(text, 'hex').toString('utf8');
                return sock.sendMessage(from, { text: `📝 *Decoded Text:*\n${decoded}` }, { quoted: msg });
            } catch (e) {
                return sock.sendMessage(from, { text: `⚠️ Invalid Hex format` }, { quoted: msg });
            }
        }

        // 4. TEXT TRANSFORMATION
        if (cleanCmd === 'uppercase') {
            if (!text) return sock.sendMessage(from, { text: "❌ *Usage:* `.uppercase <text>`" }, { quoted: msg });
            return sock.sendMessage(from, { text: text.toUpperCase() }, { quoted: msg });
        }

        if (cleanCmd === 'lowercase') {
            if (!text) return sock.sendMessage(from, { text: "❌ *Usage:* `.lowercase <text>`" }, { quoted: msg });
            return sock.sendMessage(from, { text: text.toLowerCase() }, { quoted: msg });
        }

        if (cleanCmd === 'capitalize') {
            if (!text) return sock.sendMessage(from, { text: "❌ *Usage:* `.capitalize <text>`" }, { quoted: msg });
            const cap = text.replace(/\b\w/g, l => l.toUpperCase());
            return sock.sendMessage(from, { text: cap }, { quoted: msg });
        }

        if (cleanCmd === 'reverse') {
            if (!text) return sock.sendMessage(from, { text: "❌ *Usage:* `.reverse <text>`" }, { quoted: msg });
            return sock.sendMessage(from, { text: text.split('').reverse().join('') }, { quoted: msg });
        }

        if (cleanCmd === 'mock') {
            if (!text) return sock.sendMessage(from, { text: "❌ *Usage:* `.mock <text>`" }, { quoted: msg });
            const mocked = text.split('').map((c, i) => i % 2 === 0 ? c.toLowerCase() : c.toUpperCase()).join('');
            return sock.sendMessage(from, { text: mocked }, { quoted: msg });
        }

        if (cleanCmd === 'emojify') {
            if (!text) return sock.sendMessage(from, { text: "❌ *Usage:* `.emojify <text>`" }, { quoted: msg });
            return sock.sendMessage(from, { text: `✨ ${text.split(' ').join(' 🌸 ')} ✨` }, { quoted: msg });
        }

        if (['removespace', 'removespaces'].includes(cleanCmd)) {
            if (!text) return sock.sendMessage(from, { text: "❌ *Usage:* `.removespace <text>`" }, { quoted: msg });
            return sock.sendMessage(from, { text: text.replace(/\s+/g, '') }, { quoted: msg });
        }

        if (cleanCmd === 'count') {
            if (!text) return sock.sendMessage(from, { text: "❌ *Usage:* `.count <text>`" }, { quoted: msg });
            const words = text.trim().split(/\s+/).length;
            const chars = text.length;
            return sock.sendMessage(from, {
                text: `📊 *Text Statistics:*\n• *Characters:* ${chars}\n• *Words:* ${words}`
            }, { quoted: msg });
        }

        // 5. DATE & TIME
        if (cleanCmd === 'date') {
            const now = new Date();
            return sock.sendMessage(from, {
                text: `📅 *Current Date:* ${now.toDateString()}\n🕒 *Time (UTC):* ${now.toTimeString()}`
            }, { quoted: msg });
        }

        if (cleanCmd === 'time') {
            const pktTime = new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', second: '2-digit' });
            return sock.sendMessage(from, {
                text: `🕒 *Current Pakistan Time (PKT):* ${pktTime}`
            }, { quoted: msg });
        }

        if (cleanCmd === 'timestamp') {
            return sock.sendMessage(from, {
                text: `⏱️ *Unix Timestamp:* \`${Math.floor(Date.now() / 1000)}\`\n⚡ Milliseconds: \`${Date.now()}\``
            }, { quoted: msg });
        }

        if (cleanCmd === 'timezone') {
            const tz = args[0] || 'Asia/Karachi';
            try {
                const tzTime = new Date().toLocaleString('en-US', { timeZone: tz });
                return sock.sendMessage(from, { text: `🌍 *Time in ${tz}:*\n${tzTime}` }, { quoted: msg });
            } catch (e) {
                return sock.sendMessage(from, { text: `⚠️ Invalid Timezone: ${tz}` }, { quoted: msg });
            }
        }

        // 6. GENERATORS
        if (cleanCmd === 'password') {
            const length = parseInt(args[0], 10) || 16;
            const pass = crypto.randomBytes(length).toString('base64').slice(0, length);
            return sock.sendMessage(from, {
                text: `🔑 *Generated Strong Password:*\n\`${pass}\`\n\n⚠️ Keep this password secret!`
            }, { quoted: msg });
        }

        if (cleanCmd === 'uuid') {
            const id = crypto.randomUUID();
            return sock.sendMessage(from, {
                text: `🆔 *Generated UUID v4:*\n\`${id}\``
            }, { quoted: msg });
        }

        // 7. DEVELOPER VALIDATION
        if (cleanCmd === 'json') {
            if (!text) return sock.sendMessage(from, { text: "❌ *Usage:* `.json <JSON string>`" }, { quoted: msg });
            try {
                const parsed = JSON.parse(text);
                const pretty = JSON.stringify(parsed, null, 2);
                return sock.sendMessage(from, { text: `✅ *Valid JSON Format:*\n\`\`\`json\n${pretty}\n\`\`\`` }, { quoted: msg });
            } catch (e) {
                return sock.sendMessage(from, { text: `❌ *Invalid JSON Syntax:*\n${e.message}` }, { quoted: msg });
            }
        }

        if (cleanCmd === 'regex') {
            const pattern = args[0];
            const sample = args.slice(1).join(' ');
            if (!pattern || !sample) {
                return sock.sendMessage(from, { text: "❌ *Usage:* `.regex <pattern> <text>`" }, { quoted: msg });
            }
            try {
                const re = new RegExp(pattern);
                const isMatch = re.test(sample);
                return sock.sendMessage(from, {
                    text: `🔍 *Regex Tester:*\n• *Pattern:* \`/${pattern}/\`\n• *Sample:* "${sample}"\n• *Matched:* ${isMatch ? 'YES ✅' : 'NO ❌'}`
                }, { quoted: msg });
            } catch (e) {
                return sock.sendMessage(from, { text: `⚠️ Regex Error: ${e.message}` }, { quoted: msg });
            }
        }

        if (cleanCmd === 'shorturl') {
            const longUrl = args[0];
            if (!longUrl) return sock.sendMessage(from, { text: "❌ *Usage:* `.shorturl <URL>`" }, { quoted: msg });
            try {
                const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`);
                const short = await res.text();
                return sock.sendMessage(from, { text: `🔗 *Shortened URL:*\n${short}` }, { quoted: msg });
            } catch (e) {
                return sock.sendMessage(from, { text: `⚠️ Failed to shorten URL: ${e.message}` }, { quoted: msg });
            }
        }

        if (cleanCmd === 'expandurl') {
            const shortUrl = args[0];
            if (!shortUrl) return sock.sendMessage(from, { text: "❌ *Usage:* `.expandurl <Short URL>`" }, { quoted: msg });
            try {
                const res = await fetch(shortUrl, { method: 'HEAD', redirect: 'follow' });
                return sock.sendMessage(from, { text: `🔗 *Expanded Destination URL:*\n${res.url}` }, { quoted: msg });
            } catch (e) {
                return sock.sendMessage(from, { text: `⚠️ Failed to expand URL: ${e.message}` }, { quoted: msg });
            }
        }

        if (cleanCmd === 'define') {
            if (!text) return sock.sendMessage(from, { text: "❌ *Usage:* `.define <word>`" }, { quoted: msg });
            try {
                const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(text)}`);
                const data = await res.json();
                if (Array.isArray(data) && data[0]?.meanings?.[0]?.definitions?.[0]) {
                    const def = data[0].meanings[0].definitions[0].definition;
                    const part = data[0].meanings[0].partOfSpeech || 'noun';
                    return sock.sendMessage(from, {
                        text: `📖 *Dictionary Definition for:* *"${text}"*\n\n• *Part of Speech:* _${part}_\n• *Definition:* ${def}`
                    }, { quoted: msg });
                } else {
                    return sock.sendMessage(from, { text: `⚠️ Word not found: "${text}"` }, { quoted: msg });
                }
            } catch (e) {
                return sock.sendMessage(from, { text: `⚠️ Dictionary lookup failed: ${e.message}` }, { quoted: msg });
            }
        }

        return false;
    }
};
