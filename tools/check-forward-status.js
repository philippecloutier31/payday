
import fs from 'fs';

const sessions = JSON.parse(fs.readFileSync('data/sessions.json', 'utf8'));
const s = sessions.find(s => s.paymentAddress.toLowerCase() === '0x020D2011aE45A135193198fD1a3f7a8A47EdFA27'.toLowerCase());

console.log('=== FORWARDING STATUS ===');
console.log('Auto Forwarded:', s.metadata?.autoForwarded);
console.log('Auto Forward Failed:', s.metadata?.autoForwardFailed);
console.log('Forwarding TX Hash:', s.metadata?.forwardingTxHash);
console.log('Forwarded At:', s.metadata?.forwardedAt);
console.log('Forwarded Amount:', s.metadata?.forwardedAmount);
console.log('Forwarding Error:', s.metadata?.forwardingError);
console.log('\n=== MANUAL FORWARD ===');
console.log('Manual Forward:', s.metadata?.manualForward);
console.log('Manual Forward Reason:', s.metadata?.manualForwardReason);
