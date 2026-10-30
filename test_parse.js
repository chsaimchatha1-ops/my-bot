function parse(input, list) {
    let c = input.toLowerCase()
        .replace(/^(status|state|story|estatus|استیٹس|اسٹیٹس|سٹوری|استوری)\s*[:=\-]?\s*/i, '')
        .replace(/^(group|gcs|gc|گروپ)\s*[:=\-]?\s*/i, '')
        .replace(/^(number|num|no|نمبر)\s*[:=\-]?\s*/i, '')
        .trim();

    if (c === 'all' || input.toLowerCase().includes('all')) return list;

    const targets = [];
    const numMatches = c.match(/\b\d+\b/g);
    if (numMatches) {
        for (const n of numMatches) {
            const idx = parseInt(n, 10);
            if (idx >= 1 && idx <= list.length) {
                const g = list[idx - 1];
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
        'academy': 'toppers'
    };
    const searchKey = aliasMap[c] || c;
    for (const g of list) {
        const name = (g.subject || g.name || '').toLowerCase();
        if (name.includes(searchKey) || name.includes(c)) {
            if (!targets.some(x => x.id === g.id)) targets.push(g);
        }
    }
    return targets;
}

const list = [
    { id: '1', subject: 'Sasify Solutions' },
    { id: '2', subject: 'PLAB2' },
    { id: '3', subject: 'Prep' },
    { id: '4', subject: 'Boys' }
];

console.log('Test "status 4":', parse('status 4', list).map(g => g.subject));
console.log('Test "4":', parse('4', list).map(g => g.subject));
console.log('Test "status boys":', parse('status boys', list).map(g => g.subject));
console.log('Test "voice":', parse('voice', list).map(g => g.subject));
console.log('Test "اسٹیٹس 4":', parse('اسٹیٹس 4', list).map(g => g.subject));
console.log('Test "group 4":', parse('group 4', list).map(g => g.subject));
console.log('Test "all":', parse('all', list).map(g => g.subject));
