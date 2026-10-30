/**
 * Nova WA Bot - 90 Official WhatsApp Support Unban Appeals (Chapter 8)
 * Implements .nounban1-30, .gcunban1-30, .otpunban1-30
 */

const LANGUAGES = [
    'English', 'Urdu', 'Hindi', 'Arabic', 'Punjabi', 'Bengali', 'Persian', 'Turkish', 'Indonesian', 'Malay',
    'Spanish', 'Portuguese', 'French', 'German', 'Italian', 'Dutch', 'Russian', 'Ukrainian', 'Polish', 'Romanian',
    'Greek', 'Czech', 'Slovak', 'Hungarian', 'Bulgarian', 'Serbian', 'Croatian', 'Bosnian', 'Slovenian', 'Swedish'
];

function generateAppeal(type, langIdx, numberArg) {
    const lang = LANGUAGES[langIdx - 1] || 'English';
    const num = numberArg || '+[YOUR PHONE NUMBER]';

    if (type === 'no') {
        return `📨 *OFFICIAL NUMBER UNBAN APPEAL (${lang.toUpperCase()})*\n` +
               `📧 *Send Email To:* support@whatsapp.com / appeals@support.whatsapp.com\n` +
               `📌 *Subject:* Request for Review / Account Restriction Removal: ${num}\n\n` +
               `Dear WhatsApp Support Team,\n\n` +
               `My registered mobile number (${num}) has been abruptly suspended from using WhatsApp. I believe this restriction was placed erroneously due to automated safety algorithms.\n\n` +
               `I strictly adhere to the WhatsApp Terms of Service and do not participate in unsolicited spam, automated abuse, or prohibited activities. This account is essential for my daily communication.\n\n` +
               `I kindly request an immediate human review to unban my account.\n\n` +
               `Sincerely,\nAccount Owner (${num})`;
    }

    if (type === 'gc') {
        return `📨 *OFFICIAL GROUP UNBAN REPORT (${lang.toUpperCase()})*\n` +
               `📧 *Send Email To:* support@whatsapp.com\n` +
               `📌 *Subject:* WhatsApp Group Restriction Appeal\n\n` +
               `Dear WhatsApp Team,\n\n` +
               `Our community group has been temporarily restricted. We operate strictly for family, educational, and social networking under WhatsApp community guidelines. Please review our group chat telemetry and restore normal messaging operations immediately.\n\n` +
               `Regards,\nGroup Administration`;
    }

    // OTP unban
    return `📨 *SMS OTP COOLDOWN RECOVERY APPEAL (${lang.toUpperCase()})*\n` +
           `📧 *Send Email To:* support@whatsapp.com\n` +
           `📌 *Subject:* Verification Code Delivery Timeout on ${num}\n\n` +
           `Dear WhatsApp Support,\n\n` +
           `I am experiencing a severe verification SMS / Call cooldown timer on my phone number ${num}. The verification code fails to arrive, and the timer is increasing. Please reset my account verification gateway so I can receive the 6-digit OTP code.\n\n` +
           `Thank you,\nAccount Owner`;
}

module.exports = {
    name: 'unbanAppeals',

    async handle(sock, msg, cmd, args, from) {
        // .nounban1 to .nounban30
        const noMatch = cmd.match(/^nounban([1-9]|[12][0-9]|30)$/);
        if (noMatch) {
            const idx = parseInt(noMatch[1], 10);
            const appeal = generateAppeal('no', idx, args[0]);
            await sock.sendMessage(from, { text: appeal }, { quoted: msg });
            return true;
        }

        // .gcunban1 to .gcunban30
        const gcMatch = cmd.match(/^gcunban([1-9]|[12][0-9]|30)$/);
        if (gcMatch) {
            const idx = parseInt(gcMatch[1], 10);
            const appeal = generateAppeal('gc', idx, args[0]);
            await sock.sendMessage(from, { text: appeal }, { quoted: msg });
            return true;
        }

        // .otpunban1 to .otpunban30
        const otpMatch = cmd.match(/^otpunban([1-9]|[12][0-9]|30)$/);
        if (otpMatch) {
            const idx = parseInt(otpMatch[1], 10);
            const appeal = generateAppeal('otp', idx, args[0]);
            await sock.sendMessage(from, { text: appeal }, { quoted: msg });
            return true;
        }

        return false;
    }
};
