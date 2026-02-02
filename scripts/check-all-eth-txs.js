/**
 * Check all ETH transactions from server sessions on 2026-01-30
 */

import axios from 'axios';
import fs from 'fs/promises';

const TARGET_DATE = '2026-01-30';
const START_TIMESTAMP = 1769731200; // 2026-01-30 00:00:00 UTC
const END_TIMESTAMP = 1769817600;   // 2026-01-31 00:00:00 UTC

async function checkAddressEtherscan(address) {
    try {
        // Etherscan API - need API key for production, but works without for low usage
        const response = await axios.get(`https://api.etherscan.io/api?module=account&action=txlist&address=${address}&starttimestamp=${START_TIMESTAMP}&endtimestamp=${END_TIMESTAMP}&sort=asc`);

        if (response.data.status === '1' && response.data.result) {
            return response.data.result.map(tx => ({
                time: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
                hash: tx.hash,
                value: parseInt(tx.value) / 1e18, // Convert Wei to ETH
                from: tx.from,
                to: tx.to,
                isError: tx.isError === '1'
            }));
        }
        return [];
    } catch (error) {
        console.error('Error checking ' + address + ': ' + error.message);
        return [];
    }
}

async function main() {
    console.log('Checking ETH transactions for ' + TARGET_DATE + '...\n');

    // Read sessions to get all unique ETH payment addresses
    const sessionsData = JSON.parse(await fs.readFile('./data/sessions.json', 'utf-8'));
    const uniqueAddresses = [...new Set(sessionsData
        .filter(s => s.cryptocurrency === 'eth')
        .map(s => s.paymentAddress))];

    console.log('Found ' + uniqueAddresses.length + ' unique ETH addresses in sessions\n');

    let allTxs = [];
    for (const addr of uniqueAddresses) {
        console.log('Checking: ' + addr);
        const txs = await checkAddressEtherscan(addr);

        // Filter for today (2026-01-30) and incoming to our address
        const filteredTxs = txs.filter(tx => {
            const txDate = tx.time.split('T')[0];
            return txDate === TARGET_DATE && tx.to.toLowerCase() === addr.toLowerCase();
        });

        allTxs = allTxs.concat(filteredTxs);
        await new Promise(r => setTimeout(r, 200)); // Rate limit
    }

    // Sort by time
    allTxs.sort((a, b) => new Date(a.time) - new Date(b.time));

    console.log('\n' + '='.repeat(100));
    console.log('Time (UTC)'.padEnd(20) + 'Amount (ETH)'.padEnd(15) + 'Transaction Hash');
    console.log('='.repeat(100));

    let total = 0;
    for (const tx of allTxs) {
        const time = tx.time.split('T')[1].split('.')[0];
        console.log((tx.time.split('T')[0] + ' ' + time).padEnd(20) +
            tx.value.toFixed(6).padEnd(15) +
            tx.hash);
        total += tx.value;
    }

    console.log('='.repeat(100));
    console.log('Total ETH received today: ' + total.toFixed(6) + ' ETH');
}

main();
