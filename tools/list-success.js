
import fs from 'fs';
import path from 'path';

const SESSIONS_FILE = 'c:/Users/Administrator/Desktop/payment/payment/payday/data/sessions.json';
const OUTPUT_FILE = 'c:/Users/Administrator/Desktop/payment/payment/payday/successful_list.txt';

try {
    const sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    const successful = sessions
        .filter(s => ['completed', 'forwarded', 'confirmed'].includes(s.status))
        .map(s => ({
            crypto: s.cryptocurrency.toUpperCase(),
            amount: s.receivedAmount || s.finalAmount || 0,
            status: s.status,
            date: s.completedAt || s.confirmedAt || s.updatedAt,
            txHash: s.txHash
        }))
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    let output = 'CRYPTO | AMOUNT | STATUS | DATE | TX HASH\n';
    output += '-------|--------|--------|------|---------\n';
    successful.slice(0, 30).forEach(s => {
        output += `${s.crypto} | ${s.amount} | ${s.status} | ${s.date} | ${s.txHash}\n`;
    });

    fs.writeFileSync(OUTPUT_FILE, output, 'utf8');
    console.log(`Saved ${successful.length} transactions to ${OUTPUT_FILE}`);
} catch (error) {
    console.error('Error:', error.message);
}
