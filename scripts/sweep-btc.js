#!/usr/bin/env node

/**
 * BTC Sweep Script
 * 
 * Usage: node scripts/sweep-btc.js <private_key> <destination_address> [network]
 * 
 * Arguments:
 *   private_key: The private key to sweep from (WIF format)
 *   destination_address: The address to send all BTC to
 *   network: Optional - 'mainnet' (default) or 'testnet'
 * 
 * Example:
 *   node scripts/sweep-btc.js L1aW4... 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa
 *   node scripts/sweep-btc.js cV... 2N... testnet
 */

import * as bitcoin from 'bitcoinjs-lib';
import axios from 'axios';
import * as ecc from 'tiny-secp256k1';
import { ECPairFactory } from 'ecpair';
const ECPair = ECPairFactory(ecc);

// API endpoints
const BLOCKCYPHER_MAINNET = 'https://api.blockcypher.com/v1/btc/main';
const BLOCKCYPHER_TESTNET = 'https://api.blockcypher.com/v1/btc/test3';
const MEMPOOL_SPACE = 'https://mempool.space/api';
const BLOCKSTREAM = 'https://blockstream.info/api';

// Fee rates (satoshis per byte)
const FEE_RATES = {
    economy: 1,
    normal: 5,
    priority: 10
};

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getBalance(address, network = 'mainnet') {
    try {
        const api = network === 'testnet' ? BLOCKCYPHER_TESTNET : BLOCKCYPHER_MAINNET;
        const response = await axios.get(`${api}/addrs/${address}/balance`);
        return {
            confirmed: response.data.balance,
            unconfirmed: response.data.unconfirmed_balance,
            total: response.data.balance + response.data.unconfirmed_balance
        };
    } catch (error) {
        console.error('Error fetching balance:', error.message);
        throw error;
    }
}

async function getUtxos(address, network = 'mainnet') {
    try {
        const api = network === 'testnet' ? BLOCKCYPHER_TESTNET : BLOCKCYPHER_MAINNET;
        const response = await axios.get(`${api}/addrs/${address}?unspent=true`);
        return response.data.txrefs || [];
    } catch (error) {
        console.error('Error fetching UTXOs:', error.message);
        throw error;
    }
}

async function getFeeRate(network = 'mainnet') {
    try {
        // Try mempool.space first
        const api = network === 'testnet' ? 'https://mempool.space/testnet/api' : MEMPOOL_SPACE;
        const response = await axios.get(`${api}/v1/fees/recommended`);
        return response.data.fastestFee || FEE_RATES.normal;
    } catch (error) {
        console.warn('Could not fetch fee rate from mempool.space, using default');
        return FEE_RATES.normal;
    }
}

async function broadcastTransaction(txHex, network = 'mainnet') {
    const providers = [
        { name: 'BlockCypher', url: network === 'testnet' ? BLOCKCYPHER_TESTNET : BLOCKCYPHER_MAINNET },
        { name: 'Mempool.space', url: network === 'testnet' ? 'https://mempool.space/testnet/api' : MEMPOOL_SPACE },
        { name: 'Blockstream', url: network === 'testnet' ? 'https://blockstream.info/testnet/api' : BLOCKSTREAM }
    ];

    for (const provider of providers) {
        try {
            console.log(`  Broadcasting via ${provider.name}...`);

            if (provider.name === 'BlockCypher') {
                const response = await axios.post(`${provider.url}/txs/push`, { tx: txHex });
                return { txid: response.data.tx_hash, provider: provider.name };
            } else {
                const response = await axios.post(`${provider.url}/tx`, txHex, {
                    headers: { 'Content-Type': 'text/plain' }
                });
                return { txid: response.data, provider: provider.name };
            }
        } catch (error) {
            console.warn(`  ${provider.name} failed:`, error.response?.data || error.message);
            await sleep(500);
        }
    }

    throw new Error('All broadcast providers failed');
}

function estimateTxSize(inputs, outputs) {
    // Base transaction size
    const baseSize = 10;

    // Input size (P2PKH: 148 bytes per input)
    const inputSize = inputs * 148;

    // Output size (P2PKH: 34 bytes per output)
    const outputSize = outputs * 34;

    return baseSize + inputSize + outputSize;
}

async function sweepBtc(privateKeyWif, destinationAddress, network = 'mainnet') {
    console.log('\n=== BTC Sweep Script ===');
    console.log(`Network: ${network}`);
    console.log(`Destination: ${destinationAddress}`);
    console.log('');

    // Parse private key
    const networkObj = network === 'testnet' ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;
    const keyPair = ECPair.fromWIF(privateKeyWif, networkObj);
    const { address } = bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey, network: networkObj });

    console.log(`Source Address: ${address}`);
    console.log('');

    // Validate destination address
    try {
        bitcoin.address.toOutputScript(destinationAddress, networkObj);
    } catch (error) {
        throw new Error('Invalid destination address for the selected network');
    }

    // Get balance
    console.log('Fetching balance...');
    const balance = await getBalance(address, network);
    console.log(`  Confirmed: ${balance.confirmed} satoshis (${(balance.confirmed / 1e8).toFixed(8)} BTC)`);
    console.log(`  Unconfirmed: ${balance.unconfirmed} satoshis (${(balance.unconfirmed / 1e8).toFixed(8)} BTC)`);
    console.log(`  Total: ${balance.total} satoshis (${(balance.total / 1e8).toFixed(8)} BTC)`);
    console.log('');

    if (balance.total === 0) {
        console.log('No balance to sweep. Exiting.');
        return;
    }

    // Get UTXOs
    console.log('Fetching UTXOs...');
    const utxos = await getUtxos(address, network);
    console.log(`  Found ${utxos.length} UTXO(s)`);
    console.log('');

    if (utxos.length === 0) {
        console.log('No UTXOs found. Exiting.');
        return;
    }

    // Get fee rate
    console.log('Fetching fee rate...');
    const feeRate = await getFeeRate(network);
    console.log(`  Fee rate: ${feeRate} satoshis/byte`);
    console.log('');

    // Build transaction
    console.log('Building transaction...');
    const psbt = new bitcoin.Psbt({ network: networkObj });

    let totalInput = 0;
    for (const utxo of utxos) {
        psbt.addInput({
            hash: utxo.tx_hash,
            index: utxo.tx_output_n,
            witnessUtxo: {
                script: Buffer.from(bitcoin.address.toOutputScript(address, networkObj)),
                value: utxo.value
            }
        });
        totalInput += utxo.value;
    }

    // Estimate fee
    const txSize = estimateTxSize(utxos.length, 1);
    const estimatedFee = txSize * feeRate;
    const amountToSend = totalInput - estimatedFee;

    console.log(`  Transaction size: ~${txSize} bytes`);
    console.log(`  Estimated fee: ${estimatedFee} satoshis (${(estimatedFee / 1e8).toFixed(8)} BTC)`);
    console.log(`  Amount to send: ${amountToSend} satoshis (${(amountToSend / 1e8).toFixed(8)} BTC)`);
    console.log('');

    if (amountToSend <= 0) {
        console.log('Insufficient balance to cover fees. Exiting.');
        return;
    }

    // Add output
    psbt.addOutput({
        address: destinationAddress,
        value: amountToSend
    });

    // Sign inputs
    console.log('Signing transaction...');
    for (let i = 0; i < utxos.length; i++) {
        psbt.signInput(i, keyPair);
    }

    // Finalize
    psbt.finalizeAllInputs();
    const tx = psbt.extractTransaction();
    const txHex = tx.toHex();
    const txid = tx.getId();

    console.log(`  Transaction ID: ${txid}`);
    console.log(`  Transaction size: ${txHex.length / 2} bytes`);
    console.log('');

    // Broadcast
    console.log('Broadcasting transaction...');
    const result = await broadcastTransaction(txHex, network);

    console.log('');
    console.log('=== Success! ===');
    console.log(`Transaction ID: ${result.txid}`);
    console.log(`Broadcasted via: ${result.provider}`);
    console.log(`Amount sent: ${(amountToSend / 1e8).toFixed(8)} BTC`);
    console.log(`Fee paid: ${((totalInput - amountToSend) / 1e8).toFixed(8)} BTC`);
    console.log('');
    console.log(`Explorer: https://blockstream.info/${network === 'testnet' ? 'testnet/' : ''}tx/${result.txid}`);
}

// Main execution
(async () => {
    try {
        const args = process.argv.slice(2);

        if (args.length < 2) {
            console.log('BTC Sweep Script\n');
            console.log('Usage: node scripts/sweep-btc.js <private_key> <destination_address> [network]\n');
            console.log('Arguments:');
            console.log('  private_key: The private key to sweep from (WIF format)');
            console.log('  destination_address: The address to send all BTC to');
            console.log('  network: Optional - "mainnet" (default) or "testnet"\n');
            console.log('Examples:');
            console.log('  node scripts/sweep-btc.js L1aW4... 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
            console.log('  node scripts/sweep-btc.js cV... 2N... testnet\n');
            console.log('Fee rates (satoshis/byte):');
            console.log('  Economy: 1');
            console.log('  Normal: 5');
            console.log('  Priority: 10');
            process.exit(1);
        }

        const [privateKey, destination, network = 'mainnet'] = args;

        if (!['mainnet', 'testnet'].includes(network)) {
            console.error('Invalid network. Use "mainnet" or "testnet".');
            process.exit(1);
        }

        await sweepBtc(privateKey, destination, network);
    } catch (error) {
        console.error('\nError:', error.message);
        if (error.response?.data) {
            console.error('Details:', JSON.stringify(error.response.data, null, 2));
        }
        process.exit(1);
    }
})();
