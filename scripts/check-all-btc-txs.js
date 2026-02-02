/**
 * Check all BTC addresses from server sessions for transactions on 2026-01-30
 */

import axios from 'axios';

// All BTC payment addresses from sessions.json
const btcAddresses = [
    'bc1qvj8wxwqva0lw8zah7hqsp95nfp4clrysm28c7w',  // index 6
    'bc1q8luv9l5ndz4f9g4nysxyj2g452m0ahuhqv0n3p',  // index 7
    'bc1qjqcslck0nw8nepq953f7h7zmv5ugx04m55raw9',  // index 8
    'bc1qnm4ual7552x8hjvtjxx86k6azh88z475rv8pul',  // index 9
    'bc1q7zyk9pkfp5puwcu26ca737df0uq0meh9nng6lx',  // index 10
    'bc1qfunfch3lgd7ac9f8hrmqkrzjkm8ylnezy6lcyh',  // index 11
    'bc1q90hlyjlwppu0gdgjtgxyclvhhu6pazsjnlqumj',  // index 12
    'bc1q4r557zs6wljcr5gynxgadzryydhmaauuya2hlg',  // index 13
    '12CuKENGce2WQevWVf4NhzJa1DRr8Ah67N'           // legacy main wallet
];

const TARGET_DATE = '2026-01-30';

async function checkAddress(address) {
    try {
        const response = await axios.get('https://mempool.space/api/address/' + address + '/txs');
        const txs = response.data;

        const filteredTxs = txs.filter(tx => {
            const txDate = new Date(tx.status.block_time * 1000).toISOString().split('T')[0];
            return txDate === TARGET_DATE;
        });

        return filteredTxs.map(tx => {
            const out = tx.vout.find(v => v.scriptpubkey_address === address);
            return {
                time: new Date(tx.status.block_time * 1000).toISOString(),
                txid: tx.txid,
                amount: out ? out.value / 100000000 : 0,
                address: address
            };
        });
    } catch (error) {
        console.error('Error checking ' + address + ': ' + error.message);
        return [];
    }
}

async function main() {
    console.log('Checking BTC transactions for ' + TARGET_DATE + '...\n');

    let allTxs = [];
    for (const addr of btcAddresses) {
        const txs = await checkAddress(addr);
        allTxs = allTxs.concat(txs);
        await new Promise(r => setTimeout(r, 100)); // rate limit
    }

    // Sort by time
    allTxs.sort((a, b) => new Date(a.time) - new Date(b.time));

    console.log('='.repeat(90));
    console.log('Time (UTC)'.padEnd(20) + 'Amount (BTC)'.padEnd(15) + 'Transaction Hash');
    console.log('='.repeat(90));

    let total = 0;
    for (const tx of allTxs) {
        const time = tx.time.split('T')[1].split('.')[0];
        console.log((tx.time.split('T')[0] + ' ' + time).padEnd(20) +
            tx.amount.toFixed(8).padEnd(15) +
            tx.txid);
        total += tx.amount;
    }

    console.log('='.repeat(90));
    console.log('Total: ' + total.toFixed(8) + ' BTC');
}

main();
