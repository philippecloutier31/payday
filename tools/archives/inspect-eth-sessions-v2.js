
import fs from 'fs';

const SESSIONS_FILE = 'c:/Users/Administrator/Desktop/payment/payment/payday/data/sessions.json';
const hashes = [
    '25315f48108e2f81c419a112e392e6fa0043a1e49e35592a120b81231cc26290',
    'c9079647efc715e732206872ad9c876fcd5b88d9fe7f7d17783dcb1b48b522db'
];

try {
    const sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    const relevant = sessions.filter(s => hashes.includes(s.txHash));

    relevant.forEach(s => {
        console.log(`Session ID: ${s.id}`);
        console.log(`Crypto: ${s.cryptocurrency}`);
        console.log(`Expected: ${s.expectedAmount}`);
        console.log(`Received: ${s.receivedAmount}`);
        console.log(`Final: ${s.finalAmount}`);
        console.log(`Status: ${s.status}`);
        console.log(`Metadata: ${JSON.stringify(s.metadata, null, 2)}`);
        console.log('---');
    });
} catch (error) {
    console.error(error);
}
