import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PAYMENT_PORT || 3001;
const LOCAL_SERVER = `http://localhost:${PORT}`;
const SECRET = process.env.PAYMENT_WEBHOOK_SECRET;

async function testAutoForward() {
    console.log('--- Testing Automatic 97.5% Forwarding ---');

    try {
        // 1. Create a session
        console.log('1. Creating bcy_test session...');
        const regRes = await fetch(`${LOCAL_SERVER}/address`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cryptocurrency: 'bcy_test',
                userId: 'test-user-forward',
                amount: 1000000 // 0.01 BCY
            })
        });
        const regData = await regRes.json();
        const { paymentAddress, sessionId } = regData.data;
        console.log(`   Address: ${paymentAddress}`);

        // 2. Simulate a CONFIRMED webhook (3 confirmations)
        // This should trigger the Auto-Forwarding Service
        console.log('\n2. Simulating a CONFIRMED webhook (3 confirmations)...');
        const webhookUrl = `${LOCAL_SERVER}/webhook/blockcypher?secret=${SECRET}`;

        const webhookPayload = {
            hash: 'simulated-tx-hash-' + Date.now(),
            addresses: [paymentAddress],
            confirmations: 3,
            total: 1000000,
            received: 1000000,
            outputs: [
                {
                    value: 1000000,
                    addresses: [paymentAddress]
                }
            ]
        };

        const webRes = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(webhookPayload)
        });

        const webData = await webRes.json();
        console.log('   Webhook handled:', webData);

        console.log('\n3. Checking server logs to see if Auto-Forward triggered...');
        console.log('   Check the console where "npm run dev" is running.');

        // 3. Optional: Polling status to check metadata
        console.log('\n4. Polling session metadata for tx hash...');
        setTimeout(async () => {
            const statusRes = await fetch(`${LOCAL_SERVER}/session/${sessionId}`);
            const statusData = await statusRes.json();
            const metadata = statusData.data.metadata;
            if (metadata.forwardingTxHash) {
                console.log('   ✔ SUCCESS! Forwarding TX Hash found in metadata:', metadata.forwardingTxHash);
                console.log(`   ✔ Amount Forwarded: ${metadata.forwardedAmount}`);
            } else {
                console.log('   Forwarding still in progress or check server logs.');
            }
        }, 5000);

    } catch (e) {
        console.error('Test failed:', e.message);
    }
}

testAutoForward();
