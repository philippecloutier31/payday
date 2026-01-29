import * as bitcoin from 'bitcoinjs-lib';
import { BIP32Factory } from 'bip32';
import * as ecc from 'tiny-secp256k1';
import fetch from 'node-fetch';
import config from '../config/env.js';

const bip32 = BIP32Factory(ecc);

/**
 * Batch Transaction Service
 * 
 * Creates multi-input transactions to consolidate funds from multiple addresses
 * into a single destination, paying network fees only once.
 */
class BatchTransactionService {
    constructor() {
        this.apiUrl = config.BLOCKCYPHER_API_URL;
        this.apiToken = config.BLOCKCYPHER_API_TOKEN;
    }

    /**
     * Get the network configuration for a cryptocurrency
     */
    getNetwork(crypto) {
        const networks = {
            btc: bitcoin.networks.bitcoin,
            btc_test: bitcoin.networks.testnet,
            bcy_test: {
                messagePrefix: '\x18Bitcoin Signed Message:\n',
                bech32: 'bc',
                bip32: {
                    public: 0x0488b21e,
                    private: 0x0488ade4,
                },
                pubKeyHash: 0x1b,
                scriptHash: 0x1f,
                wif: 0x49,
            }
        };
        return networks[crypto] || networks.btc_test;
    }

    /**
     * Get the BlockCypher chain ID
     */
    getChainId(crypto) {
        const chains = {
            btc: 'btc/main',
            btc_test: 'btc/test3',
            bcy_test: 'bcy/test'
        };
        return chains[crypto] || chains.btc_test;
    }

    /**
     * Fetch UTXOs (unspent outputs) for an address
     */
    async getUTXOs(crypto, address) {
        try {
            const chainId = this.getChainId(crypto);
            const url = `${this.apiUrl}/${chainId}/addrs/${address}?unspentOnly=true&token=${this.apiToken}`;

            const response = await fetch(url);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch UTXOs');
            }

            // Extract unspent transaction references
            const utxos = (data.txrefs || []).map(ref => ({
                txHash: ref.tx_hash,
                outputIndex: ref.tx_output_n,
                value: ref.value,
                confirmations: ref.confirmations
            }));

            return {
                success: true,
                utxos,
                balance: data.balance || 0
            };

        } catch (error) {
            console.error(`Error fetching UTXOs for ${address}:`, error.message);
            return {
                success: false,
                error: error.message,
                utxos: [],
                balance: 0
            };
        }
    }

    /**
     * Create a batch transaction with multiple inputs and one output
     * 
     * @param {string} crypto - Cryptocurrency (btc, btc_test, bcy_test)
     * @param {Array} inputs - Array of {address, privateKey, utxos}
     * @param {string} destinationAddress - Where to send consolidated funds
     * @param {number} feeRate - Satoshis per byte (optional, defaults to 1)
     * @returns {Promise<Object>} Transaction result
     */
    async createBatchTransaction(crypto, inputs, destinationAddress, feeRate = 1) {
        try {
            const network = this.getNetwork(crypto);
            const psbt = new bitcoin.Psbt({ network });

            let totalInputValue = 0;
            const inputDetails = [];

            console.log(`\n[Batch TX] Building transaction for ${crypto.toUpperCase()}`);
            console.log(`[Batch TX] Destination: ${destinationAddress}`);
            console.log(`[Batch TX] Processing ${inputs.length} input addresses...`);

            // Add all inputs to the transaction
            for (const input of inputs) {
                const { address, privateKey, utxos } = input;

                if (!utxos || utxos.length === 0) {
                    console.log(`[Batch TX] Skipping ${address} (no UTXOs)`);
                    continue;
                }

                for (const utxo of utxos) {
                    // Fetch the full transaction data for this UTXO
                    const txData = await this.getTransactionHex(crypto, utxo.txHash);

                    if (!txData.success) {
                        console.warn(`[Batch TX] Failed to fetch TX ${utxo.txHash}, skipping`);
                        continue;
                    }

                    // Add input to PSBT. Handle Bech32 (SegWit) vs Legacy
                    const txHex = Buffer.from(txData.hex, 'hex');
                    const isBech32 = address.startsWith('bc1') || address.startsWith('tb1') || address.startsWith('bcy');

                    if (isBech32) {
                        // For SegWit, we need the specific output data
                        const tx = bitcoin.Transaction.fromHex(txData.hex);
                        const output = tx.outs[utxo.outputIndex];
                        psbt.addInput({
                            hash: utxo.txHash,
                            index: utxo.outputIndex,
                            witnessUtxo: {
                                script: output.script,
                                value: BigInt(utxo.value)
                            }
                        });
                    } else {
                        // For Legacy
                        psbt.addInput({
                            hash: utxo.txHash,
                            index: utxo.outputIndex,
                            nonWitnessUtxo: txHex
                        });
                    }

                    totalInputValue += utxo.value;
                    inputDetails.push({
                        address,
                        privateKey,
                        value: utxo.value,
                        inputIndex: psbt.data.inputs.length - 1
                    });

                    console.log(`[Batch TX] Added input: ${utxo.value} sats from ${address}`);
                }
            }

            if (totalInputValue === 0) {
                return {
                    success: false,
                    error: 'No valid UTXOs found to consolidate'
                };
            }

            // Estimate transaction size and fee
            // Rough estimate: 180 bytes per input + 34 bytes per output + 10 bytes overhead
            const estimatedSize = (inputDetails.length * 180) + 34 + 10;
            const estimatedFee = estimatedSize * feeRate;

            const outputValue = totalInputValue - estimatedFee;

            if (outputValue <= 0) {
                return {
                    success: false,
                    error: `Insufficient funds. Total: ${totalInputValue} sats, Fee: ${estimatedFee} sats`
                };
            }

            console.log(`[Batch TX] Total input: ${totalInputValue} sats`);
            console.log(`[Batch TX] Estimated fee: ${estimatedFee} sats (${estimatedSize} bytes @ ${feeRate} sat/byte)`);
            console.log(`[Batch TX] Output value: ${outputValue} sats`);

            // Add output
            psbt.addOutput({
                address: destinationAddress,
                value: BigInt(outputValue)
            });

            // Sign all inputs
            console.log(`[Batch TX] Signing ${inputDetails.length} inputs...`);
            for (const detail of inputDetails) {
                const keyPair = bitcoin.ECPair.fromPrivateKey(
                    Buffer.from(detail.privateKey, 'hex'),
                    { network }
                );
                psbt.signInput(detail.inputIndex, keyPair);
            }

            // Finalize and extract transaction
            psbt.finalizeAllInputs();
            const tx = psbt.extractTransaction();
            const txHex = tx.toHex();
            const txId = tx.getId();

            console.log(`[Batch TX] Transaction built successfully`);
            console.log(`[Batch TX] TX ID: ${txId}`);
            console.log(`[Batch TX] Size: ${tx.byteLength()} bytes`);

            return {
                success: true,
                txHex,
                txId,
                totalInput: totalInputValue,
                fee: estimatedFee,
                output: outputValue,
                inputCount: inputDetails.length
            };

        } catch (error) {
            console.error('[Batch TX] Error creating transaction:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Fetch raw transaction hex from BlockCypher
     */
    async getTransactionHex(crypto, txHash) {
        try {
            const chainId = this.getChainId(crypto);
            const url = `${this.apiUrl}/${chainId}/txs/${txHash}?includeHex=true&token=${this.apiToken}`;

            const response = await fetch(url);
            const data = await response.json();

            if (!response.ok || !data.hex) {
                throw new Error('Transaction hex not available');
            }

            return {
                success: true,
                hex: data.hex
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Broadcast a signed transaction to the network
     */
    async broadcastTransaction(crypto, txHex) {
        try {
            const chainId = this.getChainId(crypto);
            const url = `${this.apiUrl}/${chainId}/txs/push?token=${this.apiToken}`;

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tx: txHex })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || JSON.stringify(data));
            }

            console.log(`[Batch TX] ✓ Broadcast successful!`);
            console.log(`[Batch TX] TX Hash: ${data.tx.hash}`);

            return {
                success: true,
                txHash: data.tx.hash,
                rawResponse: data
            };

        } catch (error) {
            console.error('[Batch TX] Broadcast failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

export const batchTransactionService = new BatchTransactionService();
export default batchTransactionService;
