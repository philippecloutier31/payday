
import fs from 'fs';
const SESSIONS_FILE = 'c:/Users/Administrator/Desktop/payment/payment/payday/data/sessions.json';
try {
    const sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    const s = sessions.find(s => s.txHash === 'c9079647efc715e732206872ad9c876fcd5b88d9fe7f7d17783dcb1b48b522db');
    if (s) {
        console.log(`Session: ${s.id}`);
        console.log(`Payment Address: ${s.paymentAddress}`);
        console.log(`Forwarding Address: ${s.forwardingAddress}`);
        console.log(`Status: ${s.status}`);
        console.log(`Amount USD: ${s.metadata?.amountUSD}`);
        console.log(`Forwarded: ${s.metadata?.autoForwarded}`);
        console.log(`Forwarding TX: ${s.metadata?.forwardingTxHash}`);
        console.log(`Forwarded Amount: ${s.metadata?.forwardedAmount}`);
        console.log(`Error: ${s.metadata?.forwardingError}`);
    } else {
        console.log("Session not found");
    }
} catch (e) { console.error(e); }
