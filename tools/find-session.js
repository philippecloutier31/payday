
import fs from 'fs';
const SESSIONS_FILE = 'c:/Users/Administrator/Desktop/payment/payment/payday/data/sessions.json';
try {
    const sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    const session = sessions.find(s => s.txHash === 'c9079647efc715e732206872ad9c876fcd5b88d9fe7f7d17783dcb1b48b522db' || s.id === 'd4637884-47d4-4ce4-8a64-f1012476ae63');
    console.log(JSON.stringify(session, null, 2));
} catch (e) { console.error(e); }
