
import fs from 'fs';

const SESSIONS_FILE = 'c:/Users/Administrator/Desktop/payment/payment/payday/data/sessions.json';

const fixes = {
    '25315f48108e2f81c419a112e392e6fa0043a1e49e35592a120b81231cc26290': 0.003118,
    'c9079647efc715e732206872ad9c876fcd5b88d9fe7f7d17783dcb1b48b522db': 0.27942715
};

try {
    const sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    let fixedCount = 0;

    sessions.forEach(s => {
        if (fixes[s.txHash]) {
            const amount = fixes[s.txHash];
            if (s.receivedAmount === 0 || s.receivedAmount === null) {
                s.receivedAmount = amount;
                s.finalAmount = amount;
                fixedCount++;

                // Also fix metadata if it was forwarded
                if (s.metadata && s.metadata.autoForwarded) {
                    // Re-calculate expected fee if needed
                    // In this case, 0.2794 is > $250, so fee was likely taken
                }
            }
        }
    });

    if (fixedCount > 0) {
        fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf8');
        console.log(`Successfully fixed ${fixedCount} sessions.`);
    } else {
        console.log('No sessions needed fixing.');
    }
} catch (error) {
    console.error('Error:', error.message);
}
