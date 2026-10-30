/**
 * Nova WA Bot - Enterprise Diagnostic & Audit Logger
 * Features:
 * - Rotating file logs: logs/app.log, logs/status.log, logs/error.log
 * - In-memory ring buffer for instant retrieval via WhatsApp (!logs) and Web Dashboard (/api/logs)
 * - Specialized status pipeline tracking: [MEDIA], [AUDIENCE], [STORY_RELAY], [GROUP_BIND], [ERROR]
 * - Dual timestamping (ISO + Pakistan Standard Time PKT)
 */

const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
    try {
        fs.mkdirSync(logsDir, { recursive: true });
    } catch (_) {}
}

const APP_LOG_PATH = path.join(logsDir, 'app.log');
const STATUS_LOG_PATH = path.join(logsDir, 'status.log');
const ERROR_LOG_PATH = path.join(logsDir, 'error.log');

const MAX_RING_BUFFER = 250;
const ringBuffer = [];
const statusRingBuffer = [];

function getPKTString(date = new Date()) {
    try {
        return new Intl.DateTimeFormat('en-PK', {
            timeZone: 'Asia/Karachi',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).format(date);
    } catch (_) {
        return date.toTimeString().split(' ')[0];
    }
}

function getPKTDateString(date = new Date()) {
    try {
        return new Intl.DateTimeFormat('en-PK', {
            timeZone: 'Asia/Karachi',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).format(date);
    } catch (_) {
        return date.toISOString();
    }
}

function appendToFile(filePath, line) {
    try {
        // Rotate if file exceeds 5MB
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            if (stats.size > 5 * 1024 * 1024) {
                const oldPath = filePath + '.1';
                try { if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); } catch (_) {}
                fs.renameSync(filePath, oldPath);
            }
        }
        fs.appendFileSync(filePath, line + '\n', 'utf8');
    } catch (_) {}
}

function addLog(level, category, message, meta = null) {
    const timestampPKT = getPKTString();
    const datePKT = getPKTDateString();
    const iso = new Date().toISOString();

    const entry = {
        iso,
        pkt: timestampPKT,
        datePkt: datePKT,
        level: level.toUpperCase(),
        category: category.toUpperCase(),
        message: typeof message === 'string' ? message : JSON.stringify(message),
        meta: meta ? (meta instanceof Error ? { message: meta.message, stack: meta.stack } : meta) : null
    };

    // Format log string
    let logLine = `[${datePKT}] [${entry.level}] [${entry.category}] ${entry.message}`;
    if (entry.meta) {
        logLine += ` | Meta: ${JSON.stringify(entry.meta)}`;
    }

    // Console output with symbols
    const sym = {
        INFO: 'ℹ️',
        STATUS: '⭕',
        DEBUG: '🔍',
        WARN: '⚠️',
        ERROR: '❌'
    }[entry.level] || '•';

    console.log(`${sym} [${timestampPKT}] [${entry.category}] ${entry.message}`);
    if (level === 'ERROR' && meta?.stack) {
        console.error(meta.stack);
    }

    // Write to app.log
    appendToFile(APP_LOG_PATH, logLine);

    // Write to status.log if category is related to status/media/broadcast
    if (['STATUS', 'MEDIA', 'BROADCAST', 'AUDIENCE', 'STORY'].includes(entry.category)) {
        appendToFile(STATUS_LOG_PATH, logLine);
        statusRingBuffer.push(entry);
        if (statusRingBuffer.length > MAX_RING_BUFFER) statusRingBuffer.shift();
    }

    // Write to error.log
    if (level === 'ERROR' || level === 'WARN') {
        appendToFile(ERROR_LOG_PATH, logLine);
    }

    // In-memory buffer
    ringBuffer.push(entry);
    if (ringBuffer.length > MAX_RING_BUFFER) ringBuffer.shift();

    return entry;
}

const logger = {
    info(category, message, meta) {
        return addLog('INFO', category, message, meta);
    },

    status(category, message, meta) {
        return addLog('STATUS', category, message, meta);
    },

    debug(category, message, meta) {
        return addLog('DEBUG', category, message, meta);
    },

    warn(category, message, meta) {
        return addLog('WARN', category, message, meta);
    },

    error(category, message, meta) {
        return addLog('ERROR', category, message, meta);
    },

    getRecentLogs(limit = 50) {
        return ringBuffer.slice(-limit);
    },

    getStatusLogs(limit = 50) {
        return statusRingBuffer.slice(-limit);
    },

    getWhatsAppFormattedLogs(limit = 15) {
        const logs = ringBuffer.slice(-limit);
        if (logs.length === 0) {
            return `📋 *NOVA BOT SYSTEM LOGS*\n\n_No logs recorded yet in current session._`;
        }

        const icons = {
            INFO: 'ℹ️',
            STATUS: '⭕',
            DEBUG: '🔹',
            WARN: '⚠️',
            ERROR: '❌'
        };

        let output = `📋 *NOVA BOT REALTIME AUDIT LOGS (Last ${logs.length})*\n` +
                     `⏰ Timezone: Pakistan Standard Time (PKT)\n` +
                     `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

        logs.forEach(l => {
            const icon = icons[l.level] || '•';
            output += `${icon} \`[${l.pkt}]\` *[${l.category}]*\n   ${l.message}\n`;
        });

        output += `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `💡 _Type \`!logs\` or \`debug\` anytime to get live updates._`;

        return output;
    }
};

module.exports = logger;
