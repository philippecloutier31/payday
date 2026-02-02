import axios from 'axios';
import fs from 'fs/promises';

async function main() {
    const address = 'bc1q4r557zs6wljcr5gynxgadzryydhmaauuya2hlg';
    try {
        const response = await axios.get(`https://mempool.space/api/address/${address}/txs`);
        await fs.writeFile('btc_txs_result.json', JSON.stringify(response.data, null, 2), 'utf-8');
        console.log('Saved to btc_txs_result.json');
    } catch (e) {
        console.error(e.message);
    }
}

main();
