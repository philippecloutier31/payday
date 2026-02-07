
import fs from 'fs';
import path from 'path';

const SESSIONS_FILE = 'c:/Users/Administrator/Desktop/payment/payment/payday/data/sessions.json';

try {
    const sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    const successful = sessions
        .filter(s => ['completed', 'forwarded', 'confirmed'].includes(s.status))
        .map(s => ({
            id: s.id,
            crypto: s.cryptocurrency,
            amount: s.receivedAmount || s.finalAmount,
            status: s.status,
            txHash: s.txHash,
            completedAt: s.completedAt || s.confirmedAt || s.updatedAt,
            address: s.paymentAddress
        }))
        .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

    console.log(JSON.stringify(successful, null, 2));
} catch (error) {
    console.error('Error:', error.message);
}
