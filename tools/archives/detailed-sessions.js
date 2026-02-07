
import fs from 'fs';

const SESSIONS_FILE = 'c:/Users/Administrator/Desktop/payment/payment/payday/data/sessions.json';
const OUTPUT_FILE = 'sessions_detailed.txt';
const hashes = [
    '25315f48108e2f81c419a112e392e6fa0043a1e49e35592a120b81231cc26290',
    'c9079647efc715e732206872ad9c876fcd5b88d9fe7f7d17783dcb1b48b522db'
];

try {
    const sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    const relevant = sessions.filter(s => hashes.includes(s.txHash));

    let output = '';
    relevant.forEach(s => {
        output += `Session ID: ${s.id}\n`;
        output += `Crypto: ${s.cryptocurrency}\n`;
        output += `TX Hash: ${s.txHash}\n`;
        output += `Expected: ${s.expectedAmount}\n`;
        output += `Received: ${s.receivedAmount}\n`;
        output += `Final: ${s.finalAmount}\n`;
        output += `Status: ${s.status}\n`;
        output += `Metadata: ${JSON.stringify(s.metadata, null, 2)}\n`;
        output += `History: ${JSON.stringify(s.transactionHistory, null, 2)}\n`;
        output += '---\n';
    });

    fs.writeFileSync(OUTPUT_FILE, output, 'utf8');
} catch (error) {
    fs.writeFileSync(OUTPUT_FILE, error.stack, 'utf8');
}
