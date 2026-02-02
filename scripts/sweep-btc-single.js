/**
 * Simple BTC Sweep Script - Single Private Key
 * 
 * Usage: node scripts/sweep-btc-single.js <PRIVATE_KEY> <RECEIVER_ADDRESS>
 * 
 * Private Key can be:
 *   - WIF format: L1aW4aubDBz4gP9k8ChEYHc6YsmdcQ7jDnCrAeDD5vqXjCHs8iKm
 *   - Raw hex: 08fd8991a3d798aa776a5085d08f55814376a079e6b3f69c3e616a01c928b308
 * 
 * Example: node scripts/sweep-btc-single.js L1aW4aubDBz4gP9k8ChEYHc6YsmdcQ7jDnCrAeDD5vqXjCHs8iKm bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh
 */

import * as bitcoin from 'bitcoinjs-lib';
import axios from 'axios';
import * as ecc from 'tiny-secp256k1';
import { ECPairFactory } from 'ecpair';
const ECPair = ECPairFactory(ecc);

// Configuration
const RPC_ENDPOINTS = [
    'https://blockstream.info/api',
    'https://mempool.space/api',
    'https://api.blockcypher.com/v1/btc/main'
];

async function getBalance(address) {
    for (const endpoint of RPC_ENDPOINTS) {
        try {
            console.log(`Checking balance via: ${endpoint}`);

            let response;
            if (endpoint.includes('blockstream') || endpoint.includes('mempool')) {
                response = await axios.get(`${endpoint}/address/${address}`);
                return {
                    confirmed: response.data.chain_stats.funded_txo_sum - response.data.chain_stats.spent_txo_sum,
                    unconfirmed: response.data.mempool_stats.funded_txo_sum - response.data.mempool_stats.spent_txo_sum,
                    total: (response.data.chain_stats.funded_txo_sum - response.data.chain_stats.spent_txo_sum) +
                        (response.data.mempool_stats.funded_txo_sum - response.data.mempool_stats.spent_txo_sum)
                };
            } else {
                response = await axios.get(`${endpoint}/addrs/${address}/balance`);
                return {
                    confirmed: response.data.balance,
                    unconfirmed: response.data.unconfirmed_balance,
                    total: response.data.balance + response.data.unconfirmed_balance
                };
            }
        } catch (error) {
            console.log(`Failed to get balance from ${endpoint}: ${error.message}`);
        }
    }
    throw new Error('Failed to get balance from all RPC endpoints');
}

async function getUtxos(address) {
    for (const endpoint of RPC_ENDPOINTS) {
        try {
            console.log(`Fetching UTXOs via: ${endpoint}`);

            let response;
            if (endpoint.includes('blockstream') || endpoint.includes('mempool')) {
                response = await axios.get(`${endpoint}/address/${address}/utxo`);
                // Blockstream/Mempool UTXO endpoint doesn't include scriptPubKey
                // We need to fetch the transaction to get the script
                const utxos = [];
                for (const utxo of response.data) {
                    const txResponse = await axios.get(`${endpoint}/tx/${utxo.txid}`);
                    const tx = txResponse.data;
                    const vout = tx.vout[utxo.vout];
                    utxos.push({
                        txid: utxo.txid,
                        vout: utxo.vout,
                        value: utxo.value,
                        scriptPubKey: vout.scriptpubkey
                    });
                }
                return utxos;
            } else {
                response = await axios.get(`${endpoint}/addrs/${address}?unspentOnly=true`);
                return response.data.txrefs.map(utxo => ({
                    txid: utxo.tx_hash,
                    vout: utxo.tx_output_n,
                    value: utxo.value,
                    scriptPubKey: utxo.script
                }));
            }
        } catch (error) {
            console.log(`Failed to get UTXOs from ${endpoint}: ${error.message}`);
        }
    }
    throw new Error('Failed to get UTXOs from all RPC endpoints');
}

async function getFeeRate() {
    for (const endpoint of RPC_ENDPOINTS) {
        try {
            console.log(`Fetching fee rate via: ${endpoint}`);

            let response;
            if (endpoint.includes('blockstream') || endpoint.includes('mempool')) {
                response = await axios.get(`${endpoint}/v1/fees/recommended`);
                return response.data.fastestFee; // satoshis per byte
            } else {
                response = await axios.get(`${endpoint}`);
                return Math.ceil(response.data.medium_fee_per_kb / 1024); // convert to sat/byte
            }
        } catch (error) {
            console.log(`Failed to get fee rate from ${endpoint}: ${error.message}`);
        }
    }
    // Default fallback
    return 10; // 10 satoshis per byte
}

async function broadcastTransaction(txHex) {
    const broadcastEndpoints = [
        'https://blockstream.info/api/tx',
        'https://mempool.space/api/tx',
        'https://api.blockcypher.com/v1/btc/main/txs/push'
    ];

    for (const endpoint of broadcastEndpoints) {
        try {
            console.log(`Broadcasting via: ${endpoint}`);

            let response;
            if (endpoint.includes('blockcypher')) {
                response = await axios.post(endpoint, { tx: txHex });
                return response.data.tx.hash;
            } else {
                response = await axios.post(endpoint, txHex, {
                    headers: { 'Content-Type': 'text/plain' }
                });
                return response.data;
            }
        } catch (error) {
            console.log(`Failed to broadcast via ${endpoint}: ${error.message}`);
        }
    }
    throw new Error('Failed to broadcast transaction to all endpoints');
}

async function sweepBTC(privateKey, receiverAddress) {
    try {
        console.log('\n=== BTC Sweep Script ===');
        console.log(`Receiver Address: ${receiverAddress}`);
        console.log(`Private Key: ${privateKey.substring(0, 10)}...${privateKey.substring(privateKey.length - 5)}`);
        console.log('');

        // Validate receiver address
        try {
            bitcoin.address.toOutputScript(receiverAddress);
        } catch (error) {
            throw new Error('Invalid receiver address');
        }

        // Create key pair from private key
        let keyPair;
        if (privateKey.length === 64) {
            // Raw hex private key
            keyPair = ECPair.fromPrivateKey(Buffer.from(privateKey, 'hex'));
        } else {
            // WIF format
            keyPair = ECPair.fromWIF(privateKey);
        }

        // Generate all possible addresses from the private key
        const addresses = {
            legacy: bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey }).address,
            p2shSegwit: bitcoin.payments.p2sh({
                redeem: bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey })
            }).address,
            nativeSegwit: bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey }).address
        };

        console.log('Derived Addresses:');
        console.log(`  Legacy (P2PKH): ${addresses.legacy}`);
        console.log(`  P2SH-SegWit:    ${addresses.p2shSegwit}`);
        console.log(`  Native-SegWit:  ${addresses.nativeSegwit}`);
        console.log('');

        // Check balances for all address formats and find the one with funds
        let sourceAddress = null;
        let balance = null;

        const addressTypes = [
            { name: 'Legacy (P2PKH)', address: addresses.legacy },
            { name: 'P2SH-SegWit', address: addresses.p2shSegwit },
            { name: 'Native-SegWit', address: addresses.nativeSegwit }
        ];

        for (const addr of addressTypes) {
            if (!addr.address) continue;
            console.log(`Checking balance for ${addr.name} address...`);
            try {
                balance = await getBalance(addr.address);
                if (balance.total > 0) {
                    sourceAddress = addr.address;
                    console.log(`Found balance in ${addr.name} address: ${balance.total} satoshis`);
                    break;
                } else {
                    console.log(`No funds in ${addr.name} address`);
                }
            } catch (error) {
                console.log(`Failed to check balance for ${addr.name}: ${error.message}`);
            }
        }

        if (!sourceAddress) {
            console.log('No funds found in any address derived from this private key. Exiting.');
            return;
        }

        console.log(`\nUsing Source Address: ${sourceAddress}`);
        console.log('');

        // Get UTXOs for the source address
        console.log('Fetching UTXOs...');
        const utxos = await getUtxos(sourceAddress);
        console.log(`Found ${utxos.length} UTXO(s)`);
        console.log('');

        // Get fee rate
        console.log('Fetching fee rate...');
        const feeRate = await getFeeRate();
        console.log(`Fee Rate: ${feeRate} satoshis/byte`);
        console.log('');

        // Build transaction
        console.log('Building transaction...');
        const psbt = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin });

        let totalInput = 0;
        for (const utxo of utxos) {
            psbt.addInput({
                hash: utxo.txid,
                index: utxo.vout,
                witnessUtxo: {
                    script: Buffer.from(utxo.scriptPubKey, 'hex'),
                    value: BigInt(utxo.value)
                }
            });
            totalInput += utxo.value;
        }

        // Estimate transaction size (approximate)
        // P2WPKH (Native SegWit) input: ~68 bytes, P2SH-P2WPKH input: ~91 bytes, P2PKH input: ~148 bytes
        // All have ~34 bytes for output, ~10 bytes overhead
        const isSegwit = sourceAddress.startsWith('bc1') || sourceAddress.startsWith('3');
        const inputSize = isSegwit ? 68 : 148;
        const estimatedSize = (utxos.length * inputSize) + 34 + 10;
        const estimatedFee = estimatedSize * feeRate;
        const outputAmount = totalInput - estimatedFee;

        console.log(`Total Input: ${totalInput} satoshis`);
        console.log(`Estimated Fee: ${estimatedFee} satoshis (${estimatedSize} bytes × ${feeRate} sat/byte)`);
        console.log(`Output Amount: ${outputAmount} satoshis (${(outputAmount / 100000000).toFixed(8)} BTC)`);
        console.log('');

        if (outputAmount <= 0) {
            console.log('Insufficient funds to cover transaction fee. Exiting.');
            return;
        }

        // Add output
        psbt.addOutput({
            address: receiverAddress,
            value: BigInt(outputAmount)
        });

        // Sign all inputs
        for (let i = 0; i < utxos.length; i++) {
            psbt.signInput(i, keyPair);
        }

        psbt.finalizeAllInputs();
        const tx = psbt.extractTransaction();
        const txHex = tx.toHex();

        console.log('Transaction built successfully!');
        console.log(`Transaction ID: ${tx.getId()}`);
        console.log(`Transaction Size: ${txHex.length / 2} bytes`);
        console.log('');

        // Safety countdown
        console.log('⚠️  SAFETY CHECK: Transaction will be broadcast in 5 seconds...');
        console.log('Press Ctrl+C to cancel');
        console.log('');

        await new Promise(resolve => setTimeout(resolve, 5000));

        // Broadcast
        console.log('Broadcasting transaction...');
        const txid = await broadcastTransaction(txHex);
        console.log('');
        console.log('✅ SUCCESS!');
        console.log(`Transaction ID: ${txid}`);
        console.log(`Amount sent: ${(outputAmount / 100000000).toFixed(8)} BTC`);
        console.log(`Fee paid: ${estimatedFee} satoshis`);
        console.log('');
        console.log(`View on Blockstream: https://blockstream.info/tx/${txid}`);
        console.log(`View on Mempool: https://mempool.space/tx/${txid}`);

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Main execution
const args = process.argv.slice(2);
if (args.length !== 2) {
    console.log('Usage: node scripts/sweep-btc-single.js <PRIVATE_KEY> <RECEIVER_ADDRESS>');
    console.log('');
    console.log('Example:');
    console.log('  node scripts/sweep-btc-single.js L1aW4aubDBz4gP9k8ChEYHc6YsmdcQ7jDnCrAeDD5vqXjCHs8iKm bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh');
    process.exit(1);
}

const [privateKey, receiverAddress] = args;
sweepBTC(privateKey, receiverAddress);
