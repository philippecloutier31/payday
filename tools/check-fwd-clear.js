
import fs from 'fs';
const SESSIONS_FILE = 'c:/Users/Administrator/Desktop/payment/payment/payday/data/sessions.json';
try {
    const sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    const s = sessions.find(s => s.txHash === 'c9079647efc715e732206872ad9c876fcd5b88d9fe7f7d17783dcb1b48b522db');
    if (s) {
        process.stdout.write("ADDRESS: " + s.paymentAddress + "\n");
        process.stdout.write("STATUS: " + s.status + "\n");
        process.stdout.write("AUTO_FORWARD: " + (s.metadata?.autoForwarded ? "YES" : "NO") + "\n");
        process.stdout.write("ERROR: " + (s.metadata?.forwardingError || "NONE") + "\n");
        process.stdout.write("FWD_TX: " + (s.metadata?.forwardingTxHash || "NONE") + "\n");
    } else {
        process.stdout.write("NOT FOUND\n");
    }
} catch (e) { console.log(e); }
