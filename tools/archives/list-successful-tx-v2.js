
import fs from 'fs';
import path from 'path';

const SESSIONS_FILE = 'c:/Users/Administrator/Desktop/payment/payment/payday/data/sessions.json';

try {
    const sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    const successful = sessions
        .filter(s => ['completed', 'forwarded', 'confirmed'].includes(s.status))
        .map(s => ([
            s.cryptocurrency.toUpperCase(),
            (s.receivedAmount || s.finalAmount || 0).toString(),
            s.status,
            s.completedAt || s.confirmedAt || s.updatedAt,
            s.txHash ? s.txHash.substring(0, 10) + '...' : 'N/A'
        ]))
        .sort((a, b) => new Date(b[3]) - new Date(a[3]));

    console.log('CRYPTO | AMOUNT | STATUS | DATE | TX HASH');
    console.log('-------|--------|--------|------|---------');
    successful.slice(0, 20).forEach(row => {
        console.log(row.join(' | '));
    });
} catch (error) {
    console.error('Error:', error.message);
}
