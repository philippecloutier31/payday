
import fs from 'fs';
const sessions = JSON.parse(fs.readFileSync('data/sessions.json', 'utf8'));
const s = sessions.find(s => s.id === 'd4637884-47d4-4ce4-8a64-f1012476ae63');
console.log("SESSION_ID:", s.id);
console.log("PAYMENT_ADDR:", s.paymentAddress);
console.log("FORWARD_ADDR:", s.forwardingAddress);
console.log("STATUS:", s.status);
console.log("RECEIVED:", s.receivedAmount);
console.log("FINAL:", s.finalAmount);
console.log("AUTO_FORWARD:", s.metadata?.autoForwarded);
console.log("AUTO_FORWARD_FAILED:", s.metadata?.autoForwardFailed);
console.log("FORWARD_TX:", s.metadata?.forwardingTxHash);
console.log("FORWARD_ERROR:", s.metadata?.forwardingError);
