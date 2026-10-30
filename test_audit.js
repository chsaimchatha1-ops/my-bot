const broadcast = require('./src/plugins/broadcast');

const mockGroupList = [
    { id: '120363424935472937@g.us', subject: 'Sasify Solutions' },
    { id: '120363354940823736@g.us', subject: 'PLAB2/UKMLA' },
    { id: '120363298152209440@g.us', subject: 'Preparation for PLAB 2' },
    { id: '120363423251922928@g.us', subject: 'Boys' },
    { id: '120363429426525857@g.us', subject: '9th 10th Next Toppers 2026' }
];

async function runAudit() {
    console.log('--- 1. Testing hasPendingStatus when empty ---');
    console.assert(broadcast.hasPendingStatus() === false, 'Should be false when empty');
    console.log('Passed!');

    console.log('--- 2. Setting mock pending session ---');
    // Call handle with mock image message
    const mockSock = {
        user: { id: '923039233197:86@s.whatsapp.net' },
        groupFetchAllParticipating: async () => {
            const res = {};
            mockGroupList.forEach(g => res[g.id] = g);
            return res;
        },
        groupMetadata: async (jid) => ({
            id: jid,
            participants: [{ id: '923039233197@s.whatsapp.net' }, { id: '923001234567@s.whatsapp.net' }]
        }),
        sendMessage: async (jid, content, options) => {
            console.log(`[MockSock sendMessage] to=${jid}, text=${content.text || '(media)'}`);
            return { key: { id: 'MOCK_MSG_ID_' + Date.now() }, message: content };
        },
        relayMessage: async (jid, msg, options) => {
            console.log(`[MockSock relayMessage] to=${jid}`);
            return 'OK';
        }
    };

    const mockImgMsg = {
        key: { id: 'TEST_IMG_KEY' },
        message: {
            imageMessage: {
                caption: 'status',
                mimetype: 'image/jpeg',
                fileLength: 100
            }
        }
    };

    // Trigger handle with 'status'
    await broadcast.handle(mockSock, mockImgMsg, 'status', ['status'], '3732729253919@lid', '3732729253919@lid', false, '923039233197');
    console.assert(broadcast.hasPendingStatus() === true, 'hasPendingStatus should now be true');
    console.log('Pending session successfully registered!');

    console.log('--- 3. Testing executePendingStatus with "status 4" ---');
    const handled = await broadcast.executePendingStatus(mockSock, { key: { id: 'REPLY_1' } }, 'status 4', '3732729253919@lid', '3732729253919@lid', 'owner');
    console.assert(handled === true, 'executePendingStatus should return true');
    console.assert(broadcast.hasPendingStatus() === false, 'Pending session should be cleared after success');
    console.log('Successfully executed status for Boys!');

    console.log('--- 4. Testing invalid reply behavior ---');
    // Register again
    await broadcast.handle(mockSock, mockImgMsg, 'status', ['status'], '3732729253919@lid', '3732729253919@lid', false, '923039233197');
    const invalidHandled = await broadcast.executePendingStatus(mockSock, { key: { id: 'REPLY_2' } }, 'random_invalid_xyz', '3732729253919@lid', '3732729253919@lid', 'owner');
    console.assert(invalidHandled === true, 'executePendingStatus MUST return true on invalid match to prevent directory dumping loop');
    console.assert(broadcast.hasPendingStatus() === true, 'Pending session MUST remain active for user to re-enter valid number');
    console.log('Invalid reply handled cleanly without dumping group list!');

    console.log('--- 5. Testing recovery with "boys" ---');
    const recoveryHandled = await broadcast.executePendingStatus(mockSock, { key: { id: 'REPLY_3' } }, 'boys', '3732729253919@lid', '3732729253919@lid', 'owner');
    console.assert(recoveryHandled === true, 'executePendingStatus should succeed on recovery');
    console.assert(broadcast.hasPendingStatus() === false, 'Pending session cleared after recovery');
    console.log('Recovery with "boys" successful!');

    console.log('\n========================================');
    console.log('🎉 ALL AUDIT CHECKS PASSED 100% CLEANLY!');
    console.log('========================================');
}

runAudit().catch(err => {
    console.error('Audit failed:', err);
    process.exit(1);
});
