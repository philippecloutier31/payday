import fetch from 'node-fetch';

const TX_HASH = '6d56cf03ecccb91984d1f2a384c2a881aa08f64dbfa0ea7e218c729f5fb865e0';
const URL = `https://api.blockcypher.com/v1/eth/main/txs/${TX_HASH}`;

async function check() {
    console.log(`Checking TX: ${TX_HASH}...`);
    try {
        const res = await fetch(URL);
        const data = await res.json();

        console.log('\n--- BlockCypher View ---');
        console.log(`Confirmations: ${data.confirmations}`);
        console.log(`Block Height: ${data.block_height}`);
        console.log(`Received: ${data.received}`);
        console.log('------------------------\n');

        if (data.confirmations < 10) {
            console.log('👉 CONCLUSION: BlockCypher is lagging. It has not indexed the newer blocks yet.');
        } else {
            console.log('👉 CONCLUSION: BlockCypher sees the confirmations! The webhook should have fired.');
        }
    } catch (e) {
        console.error(e);
    }
}

check();
