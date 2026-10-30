/**
 * Nova WA Bot - Master Configuration
 * Customize your brand identity, security keys, admin list, and bot parameters here.
 */
require('dotenv').config();

module.exports = {
    // --------------------------------------------------------------------------
    // BRAND IDENTITY
    // --------------------------------------------------------------------------
    brand: {
        name: process.env.BRAND_NAME || 'Nova WA Bot',
        shortName: 'Nova',
        tagline: 'Next-Gen Multi-Session WhatsApp Companion Infrastructure',
        version: 'v2.2.0',
        badgeText: '⚡ OFFICIAL WHATSAPP WEB COMPANION • MULTI-SESSION',
        channelUrl: process.env.CHANNEL_URL || 'https://whatsapp.com/channel/0029VbDpWd4EgGfVj3dRJr3C',
        channelTitle: '📢 Official Community Channel',
        channelSubtitle: 'Get VIP Access Keys, Updates & Instant Support',
        supportContact: process.env.SUPPORT_CONTACT || '+1 (555) 019-2834',
        theme: {
            primary: '#22c55e',        // WhatsApp Emerald Neon
            primaryGlow: 'rgba(34, 197, 94, 0.35)',
            bgDark: '#05070a',
            bgSurface: 'rgba(13, 19, 30, 0.75)'
        }
    },

    // --------------------------------------------------------------------------
    // SERVER & CLOUD CONFIG
    // --------------------------------------------------------------------------
    server: {
        id: process.env.SERVER_ID || 'nova-node-01',
        port: process.env.PORT || 3000,
        cooldownSeconds: 30, // Prevents WhatsApp companion device rate limits
        maxSessionsPerNode: 15
    },

    // --------------------------------------------------------------------------
    // MULTI-NODE INFRASTRUCTURE REGISTRY (For frontend load balancing)
    // --------------------------------------------------------------------------
    nodes: [
        {
            id: 'node-01',
            name: 'Primary Node (US-East)',
            url: process.env.PRIMARY_SERVER_URL || '',
            defaultDesc: 'High Performance Dyno',
            isRecommended: true
        },
        {
            id: 'node-02',
            name: 'Secondary Node (EU-West)',
            url: process.env.SECONDARY_SERVER_URL || '',
            defaultDesc: 'Backup Failover Node',
            isRecommended: false
        }
    ],

    // --------------------------------------------------------------------------
    // ACCESS KEYS & VIP AUTHORIZATION
    // --------------------------------------------------------------------------
    auth: {
        // Valid VIP and standard user passcodes
        validKeys: (process.env.VIP_KEYS || 'NOVA-VIP-2026,NOVA-PASS-ULTRA,VIP-KEY-001,ACCESS-TOKEN-2026')
            .split(',')
            .map(k => k.trim()),

        // Whitelisted phone numbers that bypass VIP key checks
        adminNumbers: (process.env.ADMIN_NUMBERS || '3318447030,3285118386')
            .split(',')
            .map(n => n.trim().replace(/\D/g, ''))
    },

    // --------------------------------------------------------------------------
    // BOT BEHAVIORS & AUTOMATION MODULES
    // --------------------------------------------------------------------------
    bot: {
        commandPrefix: '.',
        browserIdentity: ['Ubuntu', 'Chrome', '22.04.4'], // WhatsApp Web Companion Spoofing

        // Anti-Call Protection (Disabled: Never reject or message callers)
        antiCall: {
            enabled: false,
            rejectMessage: ''
        },

        // Auto-React (Disabled)
        autoReact: {
            enabled: false,
            triggers: []
        },

        // Anti-Delete (Disabled: Never send alerts)
        antiDelete: {
            enabled: false,
            forwardToOwner: false
        },

        // AI Assistant Auto-Reply (Optional LLM Integration)
        aiAssistant: {
            enabled: false,
            geminiApiKey: process.env.GEMINI_API_KEY || '',
            systemPrompt: 'You are Nova, an ultra-fast, helpful WhatsApp AI assistant.'
        }
    }
};
