
import fs from 'fs';

const SESSIONS_FILE = 'c:/Users/Administrator/Desktop/payment/payment/payday/data/sessions.json';
const OUTPUT_FILE = 'fee_report_v2.txt';

try {
    const sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));

    let stats = {
        btc: { totalReceived: 0, feesCollected: 0, pendingFees: 0, count: 0 },
        eth: { totalReceived: 0, feesCollected: 0, pendingFees: 0, count: 0 },
        bcy: { totalReceived: 0, feesCollected: 0, pendingFees: 0, count: 0 },
        beth: { totalReceived: 0, feesCollected: 0, pendingFees: 0, count: 0 }
    };

    sessions.forEach(s => {
        if (s.status === 'completed' || s.status === 'forwarded') {
            const crypto = s.cryptocurrency;
            if (!stats[crypto]) stats[crypto] = { totalReceived: 0, feesCollected: 0, pendingFees: 0, count: 0 };

            const amount = s.receivedAmount || s.finalAmount || 0;
            stats[crypto].totalReceived += amount;
            stats[crypto].count++;

            const feeAmount = s.metadata?.feeAmount || s.metadata?.feeRemaining || 0;
            if (s.metadata?.feesCollected) {
                stats[crypto].feesCollected += feeAmount;
            } else if (feeAmount > 0) {
                stats[crypto].pendingFees += feeAmount;
            }
        }
    });

    let output = '--- FEE SUMMARY ---\n';
    Object.keys(stats).forEach(crypto => {
        if (stats[crypto].count > 0) {
            output += `\n[${crypto.toUpperCase()}]\n`;
            output += `  Transactions: ${stats[crypto].count}\n`;
            output += `  Total Volume: ${stats[crypto].totalReceived.toFixed(8)}\n`;
            output += `  Fees Collected: ${stats[crypto].feesCollected.toFixed(8)}\n`;
            output += `  Pending Fees: ${stats[crypto].pendingFees.toFixed(8)}\n`;
            output += `  Grand Total Fees: ${(stats[crypto].feesCollected + stats[crypto].pendingFees).toFixed(8)}\n`;
        }
    });

    fs.writeFileSync(OUTPUT_FILE, output, 'utf8');
} catch (error) {
    fs.writeFileSync(OUTPUT_FILE, error.stack, 'utf8');
}
