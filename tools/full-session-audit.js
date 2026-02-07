
import fs from 'fs';
const sessions = JSON.parse(fs.readFileSync('data/sessions.json', 'utf8'));
const s = sessions.find(s => s.id === 'd4637884-47d4-4ce4-8a64-f1012476ae63');

console.log("=== SESSION DETAILS ===");
console.log("ID:", s.id);
console.log("Crypto:", s.cryptocurrency);
console.log("Status:", s.status);
console.log("Payment Address:", s.paymentAddress);
console.log("Forwarding Address:", s.forwardingAddress);
console.log("Address Index:", s.addressIndex);
console.log("Received Amount:", s.receivedAmount);
console.log("Expected Amount:", s.expectedAmount);
console.log("\n=== METADATA ===");
console.log("Amount USD:", s.metadata?.amountUSD);
console.log("Address Source:", s.metadata?.addressSource);
console.log("Auto Forwarded:", s.metadata?.autoForwarded);
console.log("Auto Forward Failed:", s.metadata?.autoForwardFailed);
console.log("Forwarding Error:", s.metadata?.forwardingError);
console.log("\n=== TRANSACTION HISTORY ===");
s.transactionHistory?.forEach((h, i) => {
    console.log(`${i + 1}. ${h.timestamp} - ${h.type} (confirmations: ${h.confirmations || 'N/A'})`);
});
