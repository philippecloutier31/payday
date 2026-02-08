
import { paymentSessionManager } from '../src/services/payment-session.service.js';

console.log('Testing Random Index Generation:');

for (let i = 0; i < 5; i++) {
    const idx = paymentSessionManager.getRandomIndex('btc');
    console.log(`Run ${i + 1}: Index ${idx}`);
}

console.log('\nTesting complete.');
