/**
 * Get transaction history for a BTC address
 * Usage: node scripts/get-tx-history.js <ADDRESS> [DATE_YYYY-MM-DD]
 */

import axios from 'axios';

const ADDRESS = 'bc1q7zyk9pkfp5puwcu26ca737df0uq0meh9nng6lx';
const TARGET_DATE = '2026-01-30';

async function getTransactions(address) {
    try {
        console.log(`Fetching transactions for: ${address}\n`);

        const response = await axios.get(`https://mempool.space/api/address/${address}/txs`);
        const txs = response.data;

        console.log(`Found ${txs.length} transactions\n`);
        console.log('='.repeat(80));
        console.log('Date/Time'.padEnd(20) + 'Hash'.padEnd(64) + 'Amount (BTC)'.padEnd(15) + 'Confirmations');
        console.log('='.repeat(80));

        let totalReceived = 0;
        let totalSent = 0;
        const filteredTxs = [];

        for (const tx of txs) {
            const txDate = new Date(tx.status.block_time * 1000);
            const dateStr = txDate.toISOString().split('T')[0];

            if (dateStr === TARGET_DATE) {
                // Calculate amount (sum of vouts that go to this address minus vin value)
                let amount = 0;
                for (const vout of tx.vout) {
                    if (vout.scriptpubkey_address === address) {
                        amount += vout.value;
                    }
                }

                // Subtract inputs (what was spent)
                // For a simple view, we'll just show the received amount
                const txHash = tx.txid;
                const confirmations = tx.status.confirmed ? 'Confirmed' : 'Unconfirmed';

                filteredTxs.push({
                    date: txDate.toISOString(),
                    hash: txHash,
                    amount: amount,
                    confirmations: tx.status.confirmed ? 'Confirmed' : 'Unconfirmed'
                });

                totalReceived += amount;
            }
        }

        // Sort by time
        filteredTxs.sort((a, b) => new Date(a.date) - new Date(b.date));

        console.log(`\nTransactions on ${TARGET_DATE}:`);
        console.log('-'.repeat(80));

        for (const tx of filteredTxs) {
            const time = tx.date.split('T')[1].split('.')[0];
            const amountBtc = (tx.amount / 100000000).toFixed(8);
            console.log(`${tx.date.split('T')[0]} ${time}  ${tx.hash}  ${amountBtc.padStart(15)}  ${tx.confirmations}`);
        }

        console.log('-'.repeat(80));
        console.log(`Total received on ${TARGET_DATE}: ${(totalReceived / 100000000).toFixed(8)} BTC`);

        return filteredTxs;
    } catch (error) {
        console.error('Error fetching transactions:', error.message);
        throw error;
    }
}

// Main
getTransactions(ADDRESS);
