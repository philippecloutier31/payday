import axios from 'axios';

const addresses = [
    '0x2b8775C97333FCddE84B4a925Be127AB49981BDF',
    '0x03e77852c2b00C9B82AD6F7FF8aD260EFE1C3102',
    '0x2A99B41A4105ACccc0fB6E54Ac269cB27E6E75f2',
    '0xcCBAE07EF4EEa95ffF14275F467FF731D27ff08E'
];

async function check() {
    for (const addr of addresses) {
        console.log(`Checking ${addr}...`);
        try {
            const res = await axios.get(`https://api.etherscan.io/api?module=account&action=txlist&address=${addr}&startblock=0&endblock=99999999&sort=desc`);
            if (res.data.status === '1') {
                console.log(`Found ${res.data.result.length} transactions for ${addr}`);
                res.data.result.forEach(tx => {
                    const date = new Date(tx.timeStamp * 1000).toISOString();
                    console.log(`  - ${date}: ${tx.hash} (${tx.value / 1e18} ETH)`);
                });
            } else {
                console.log(`  - No transactions found or error: ${res.data.message}`);
            }
        } catch (e) {
            console.error(`  - Error: ${e.message}`);
        }
    }
}

check();
