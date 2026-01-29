import fetch from 'node-fetch';
import config from '../config/env.js';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { ECPairFactory } from 'ecpair';
const ECPair = ECPairFactory(ecc.default || ecc);
import { ethers } from 'ethers';

/**
 * BlockCypher Address Service
 * 
 * Handles creation of forwarding addresses for BTC and ETH
 * Using BlockCypher's Payment Forwarding API
 * 
 * Documentation: https://www.blockcypher.com/dev/bitcoin/#create-payment-endpoint
 */
class AddressService {
    constructor() {
        this.apiUrl = config.BLOCKCYPHER_API_URL;
        this.apiToken = config.BLOCKCYPHER_API_TOKEN;
    }

    /**
     * Get the BlockCypher chain identifier for a cryptocurrency
     * @param {string} crypto - 'btc', 'eth', 'bcy', or 'beth'
     * @returns {string} Chain identifier for BlockCypher API
     */
    getChainId(crypto) {
        const chains = {
            btc: 'btc/main',      // Bitcoin mainnet
            eth: 'eth/main',      // Ethereum mainnet
            bcy: 'bcy/test',      // BlockCypher Bitcoin Test Chain (free test coins)
            beth: 'beth/test',    // BlockCypher Ethereum Test Chain (free test coins)
            // Test networks (can be used for development)
            btc_test: 'btc/test3', // Bitcoin testnet
            eth_test: 'beth/test',  // BlockCypher Ethereum testnet
            bcy_test: 'bcy/test'
        };
        return chains[crypto] || chains.btc;
    }

    /**
     * Create a payment forwarding address
     * 
     * This creates a temporary address that automatically forwards
     * incoming funds to the specified destination address.
     * 
     * @param {string} crypto - 'btc' or 'eth'
     * @param {string} destinationAddress - Main wallet address to forward funds to
     * @param {Object} options - Additional options
     * @param {string} options.callbackUrl - URL for webhook callbacks
     * @param {number} options.confirmations - Confirmations before forwarding (default: 3 for BTC, 12 for ETH)
     * @returns {Promise<Object>} Result with inputAddress, id, and other details
     */
    async createForwardingAddress(crypto, destinationAddress, options = {}) {
        try {
            const chainId = this.getChainId(crypto);
            const url = `${this.apiUrl}/${chainId}/payments?token=${this.apiToken}`;

            // Set default confirmations based on cryptocurrency
            let defaultConfirmations;
            if (crypto === 'bcy' || crypto === 'beth') {
                defaultConfirmations = crypto === 'bcy' ? config.BCY_CONFIRMATIONS_REQUIRED : config.BETH_CONFIRMATIONS_REQUIRED;
            } else if (crypto === 'btc' || crypto === 'btc_test') {
                defaultConfirmations = config.BTC_CONFIRMATIONS_REQUIRED;
            } else {
                defaultConfirmations = config.ETH_CONFIRMATIONS_REQUIRED;
            }

            const requestBody = {
                destination: destinationAddress,
                callback_url: options.callbackUrl || `${config.WEBHOOK_BASE_URL}/webhook/blockcypher`,
                // Process payment after specified confirmations
                process_fees_address: destinationAddress, // Fees paid from destination
                process_fees_percent: 0, // No additional fee percentage
                // For ETH, we can optionally track specific tokens
                ...(crypto === 'eth' && options.tokenAddress && {
                    token_address: options.tokenAddress
                })
            };

            console.log(`Creating ${crypto.toUpperCase()} forwarding address to ${destinationAddress}`);
            console.log('Request URL:', url);
            console.log('Request body:', JSON.stringify(requestBody, null, 2));

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (!response.ok) {
                console.error('BlockCypher API error:', data);
                return {
                    success: false,
                    error: data.error || data.errors?.join(', ') || 'Failed to create forwarding address',
                    statusCode: response.status
                };
            }

            console.log('Forwarding address created:', data);

            return {
                success: true,
                id: data.id,
                inputAddress: data.input_address,
                destinationAddress: data.destination,
                callbackUrl: data.callback_url,
                token: data.token,
                // Additional info from response
                rawResponse: data
            };

        } catch (error) {
            console.error('Error creating forwarding address:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get details of an existing payment forwarding
     * 
     * @param {string} crypto - 'btc' or 'eth'
     * @param {string} paymentId - The payment forwarding ID
     * @returns {Promise<Object>} Payment forwarding details
     */
    async getForwardingAddress(crypto, paymentId) {
        try {
            const chainId = this.getChainId(crypto);
            const url = `${this.apiUrl}/${chainId}/payments/${paymentId}?token=${this.apiToken}`;

            const response = await fetch(url);
            const data = await response.json();

            if (!response.ok) {
                return {
                    success: false,
                    error: data.error || 'Failed to get forwarding address',
                    statusCode: response.status
                };
            }

            return {
                success: true,
                id: data.id,
                inputAddress: data.input_address,
                destinationAddress: data.destination,
                callbackUrl: data.callback_url,
                rawResponse: data
            };

        } catch (error) {
            console.error('Error getting forwarding address:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * List all payment forwardings
     * 
     * @param {string} crypto - 'btc' or 'eth'
     * @returns {Promise<Object>} List of payment forwardings
     */
    async listForwardingAddresses(crypto) {
        try {
            const chainId = this.getChainId(crypto);
            const url = `${this.apiUrl}/${chainId}/payments?token=${this.apiToken}`;

            const response = await fetch(url);
            const data = await response.json();

            if (!response.ok) {
                return {
                    success: false,
                    error: data.error || 'Failed to list forwarding addresses',
                    statusCode: response.status
                };
            }

            return {
                success: true,
                payments: data,
                count: Array.isArray(data) ? data.length : 0
            };

        } catch (error) {
            console.error('Error listing forwarding addresses:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Delete a payment forwarding
     * 
     * @param {string} crypto - 'btc' or 'eth'
     * @param {string} paymentId - The payment forwarding ID to delete
     * @returns {Promise<Object>} Result of deletion
     */
    async deleteForwardingAddress(crypto, paymentId) {
        try {
            const chainId = this.getChainId(crypto);
            const url = `${this.apiUrl}/${chainId}/payments/${paymentId}?token=${this.apiToken}`;

            const response = await fetch(url, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                return {
                    success: false,
                    error: data.error || 'Failed to delete forwarding address',
                    statusCode: response.status
                };
            }

            return {
                success: true,
                message: 'Forwarding address deleted successfully'
            };

        } catch (error) {
            console.error('Error deleting forwarding address:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Generate a new address (not forwarding, just a fresh address)
     * This is an alternative if you want to manage funds manually
     * 
     * @param {string} crypto - 'btc' or 'eth'
     * @returns {Promise<Object>} Generated address details
     */
    async generateAddress(crypto) {
        try {
            const chainId = this.getChainId(crypto);
            const url = `${this.apiUrl}/${chainId}/addrs?token=${this.apiToken}`;

            const response = await fetch(url, {
                method: 'POST'
            });

            const data = await response.json();

            if (!response.ok) {
                return {
                    success: false,
                    error: data.error || 'Failed to generate address',
                    statusCode: response.status
                };
            }

            // WARNING: This returns private key - handle with extreme care!
            return {
                success: true,
                address: data.address,
                publicKey: data.public,
                privateKey: data.private, // SENSITIVE - encrypt before storing!
                wif: data.wif, // Wallet Import Format (BTC only)
                rawResponse: data
            };

        } catch (error) {
            console.error('Error generating address:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get address balance and transaction info
     * 
     * @param {string} crypto - 'btc' or 'eth'
     * @param {string} address - The address to check
     * @returns {Promise<Object>} Address balance and info
     */
    async getAddressInfo(crypto, address) {
        try {
            const chainId = this.getChainId(crypto);
            const url = `${this.apiUrl}/${chainId}/addrs/${address}?token=${this.apiToken}`;

            const response = await fetch(url);
            const data = await response.json();

            if (!response.ok) {
                return {
                    success: false,
                    error: data.error || 'Failed to get address info',
                    statusCode: response.status
                };
            }

            // Convert satoshis/wei to BTC/ETH
            const divisor = crypto === 'btc' ? 1e8 : 1e18;

            return {
                success: true,
                address: data.address,
                balance: data.balance / divisor,
                balanceRaw: data.balance,
                unconfirmedBalance: (data.unconfirmed_balance || 0) / divisor,
                totalReceived: (data.total_received || 0) / divisor,
                totalSent: (data.total_sent || 0) / divisor,
                txCount: data.n_tx || 0,
                unconfirmedTxCount: data.unconfirmed_n_tx || 0,
                rawResponse: data
            };

        } catch (error) {
            console.error('Error getting address info:', error);
            return {
                success: false,
                error: error.message
            };
        }
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
     * Get fee rate for a cryptocurrency
     */
    getFeeRate(crypto) {
        if (crypto.includes('bcy')) {
            return config.BCY_FEE_RATE_SATS_PER_BYTE;
        } else if (crypto.includes('btc')) {
            return config.BTC_FEE_RATE_SATS_PER_BYTE;
        }
        return 1; // default
    }

    /**
     * Fetch UTXOs for an address
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

            console.log(`[TX] Broadcast successful! TX Hash: ${data.tx.hash}`);

            return {
                success: true,
                txHash: data.tx.hash,
                rawResponse: data
            };

        } catch (error) {
            console.error('[TX] Broadcast failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Send Bitcoin transaction using local PSBT signing
     * Private keys never leave the server
     */
    async _sendBitcoinTransaction(crypto, fromPrivateKey, toAddress, amount) {
        try {
            console.log(`[TX] Starting BTC transaction: ${amount} ${crypto.toUpperCase()} to ${toAddress}`);

            const network = this.getNetwork(crypto);
            const feeRate = this.getFeeRate(crypto);

            // 1. Derive source address from private key
            const keyPair = ECPair.fromPrivateKey(
                Buffer.from(fromPrivateKey, 'hex'),
                { network }
            );

            const payment = crypto.includes('bcy')
                ? bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey, network })
                : bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network });

            const fromAddress = payment.address;
            console.log(`[TX] Source address: ${fromAddress}`);

            // Check address type for fee estimation
            const isBech32 = fromAddress.startsWith('bc1') || fromAddress.startsWith('tb1');

            // 2. Fetch UTXOs
            const utxoResult = await this.getUTXOs(crypto, fromAddress);
            if (!utxoResult.success || utxoResult.utxos.length === 0) {
                return {
                    success: false,
                    error: 'No unspent outputs found for address'
                };
            }

            // 3. Filter confirmed UTXOs and calculate total
            const confirmedUtxos = utxoResult.utxos.filter(utxo => utxo.confirmations > 0);
            if (confirmedUtxos.length === 0) {
                return {
                    success: false,
                    error: 'No confirmed UTXOs available'
                };
            }

            const totalInput = confirmedUtxos.reduce((sum, utxo) => sum + utxo.value, 0);
            console.log(`[TX] Found ${confirmedUtxos.length} UTXOs, total: ${totalInput} sats`);

            // 4. Estimate fee
            // SegWit (P2WPKH): ~68 vbytes per input (vs 180 for legacy)
            const inputVBytes = isBech32 ? 68 : 180;
            const estimatedVBytes = (confirmedUtxos.length * inputVBytes) + 34 + 10;
            const estimatedFee = estimatedVBytes * feeRate;
            console.log(`[TX] Estimated fee: ${estimatedFee} sats (${estimatedVBytes} vbytes @ ${feeRate} sat/vbyte)`);

            // 5. Calculate output
            const amountSats = Math.floor(amount * 1e8);
            const outputValue = amountSats;

            // Check if we have enough funds
            if (totalInput < outputValue + estimatedFee) {
                return {
                    success: false,
                    error: `Insufficient funds: need ${outputValue + estimatedFee} sats, have ${totalInput} sats`
                };
            }

            // Check dust limit
            if (outputValue < 546) {
                return {
                    success: false,
                    error: `Output below dust limit (546 sats)`
                };
            }

            console.log(`[TX] Output value: ${outputValue} sats`);

            // 6. Build PSBT
            const psbt = new bitcoin.Psbt({ network });

            for (const utxo of confirmedUtxos) {
                const txData = await this.getTransactionHex(crypto, utxo.txHash);
                if (!txData.success) {
                    console.warn(`[TX] Failed to fetch TX ${utxo.txHash}, skipping`);
                    continue;
                }

                // Add input to PSBT. Handle Bech32 (SegWit) vs Legacy
                const txHex = Buffer.from(txData.hex, 'hex');
                const isBech32 = fromAddress.startsWith('bc1') || fromAddress.startsWith('tb1');

                if (isBech32) {
                    // For SegWit, we need specific output data
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
            }

            // Add output (destination)
            psbt.addOutput({
                address: toAddress,
                value: BigInt(outputValue)
            });

            // Calculate change and add change output if there's excess
            const changeValue = totalInput - outputValue - estimatedFee;
            if (changeValue >= 546) {
                console.log(`[TX] Change output: ${changeValue} sats back to ${fromAddress}`);
                psbt.addOutput({
                    address: fromAddress,
                    value: BigInt(changeValue)
                });
            } else {
                console.log(`[TX] No change output (dust: ${changeValue} sats < 546)`);
            }

            // 7. Sign transaction locally
            console.log(`[TX] Signing ${psbt.data.inputs.length} inputs locally...`);
            for (let i = 0; i < psbt.data.inputs.length; i++) {
                psbt.signInput(i, keyPair);
            }

            // 8. Finalize and extract
            psbt.finalizeAllInputs();
            const tx = psbt.extractTransaction();
            const txHex = tx.toHex();
            const txId = tx.getId();

            console.log(`[TX] Transaction built successfully. TX ID: ${txId}`);
            console.log(`[TX] Size: ${tx.byteLength()} bytes`);

            // 9. Broadcast
            const broadcastResult = await this.broadcastTransaction(crypto, txHex);

            if (broadcastResult.success) {
                return {
                    success: true,
                    txHash: broadcastResult.txHash,
                    fees: estimatedFee / 1e8,
                    amountForwarded: outputValue / 1e8
                };
            } else {
                return broadcastResult;
            }

        } catch (error) {
            console.error(`[TX] Error in BTC transaction:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Sweep all UTXOs from an address to a destination (minus network fee)
     * Useful for forwarding when UTXO is smaller than expected payment
     */
    async sweepAddress(crypto, fromPrivateKey, toAddress) {
        try {
            console.log(`[TX] Sweeping BTC from address to ${toAddress}`);

            const network = this.getNetwork(crypto);
            const feeRate = this.getFeeRate(crypto);

            // 1. Derive source address from private key
            const keyPair = ECPair.fromPrivateKey(
                Buffer.from(fromPrivateKey, 'hex'),
                { network }
            );

            const payment = crypto.includes('bcy')
                ? bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey, network })
                : bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network });

            const fromAddress = payment.address;
            console.log(`[TX] Sweeping from: ${fromAddress}`);

            // 2. Fetch UTXOs
            const utxoResult = await this.getUTXOs(crypto, fromAddress);
            if (!utxoResult.success || utxoResult.utxos.length === 0) {
                return {
                    success: false,
                    error: 'No unspent outputs found for address'
                };
            }

            // 3. Filter confirmed UTXOs
            const confirmedUtxos = utxoResult.utxos.filter(utxo => utxo.confirmations > 0);
            if (confirmedUtxos.length === 0) {
                return {
                    success: false,
                    error: 'No confirmed UTXOs available'
                };
            }

            const totalInput = confirmedUtxos.reduce((sum, utxo) => sum + utxo.value, 0);
            console.log(`[TX] Found ${confirmedUtxos.length} UTXOs, total: ${totalInput} sats`);

            // 4. Check address type for fee estimation
            const isBech32 = fromAddress.startsWith('bc1') || fromAddress.startsWith('tb1');
            const inputVBytes = isBech32 ? 68 : 180;
            const estimatedVBytes = (confirmedUtxos.length * inputVBytes) + 34 + 10;
            const estimatedFee = estimatedVBytes * feeRate;

            // 5. Calculate sweep amount (all inputs minus fee)
            const sweepAmount = totalInput - estimatedFee;

            if (sweepAmount < 546) {
                return {
                    success: false,
                    error: `Sweep amount too small (${sweepAmount} sats < 546 dust limit)`
                };
            }

            console.log(`[TX] Sweeping ${sweepAmount} sats (fee: ${estimatedFee} sats)`);

            // 6. Build PSBT
            const psbt = new bitcoin.Psbt({ network });

            for (const utxo of confirmedUtxos) {
                const txData = await this.getTransactionHex(crypto, utxo.txHash);
                if (!txData.success) {
                    console.warn(`[TX] Failed to fetch TX ${utxo.txHash}, skipping`);
                    continue;
                }

                const txHex = Buffer.from(txData.hex, 'hex');

                if (isBech32) {
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
                    psbt.addInput({
                        hash: utxo.txHash,
                        index: utxo.outputIndex,
                        nonWitnessUtxo: txHex
                    });
                }
            }

            // Add single output (sweep)
            psbt.addOutput({
                address: toAddress,
                value: BigInt(sweepAmount)
            });

            // 7. Sign and finalize
            console.log(`[TX] Signing ${psbt.data.inputs.length} inputs...`);
            for (let i = 0; i < psbt.data.inputs.length; i++) {
                psbt.signInput(i, keyPair);
            }

            psbt.finalizeAllInputs();
            const tx = psbt.extractTransaction();
            const txHex = tx.toHex();
            const txId = tx.getId();

            // 8. Broadcast
            const broadcastResult = await this.broadcastTransaction(crypto, txHex);

            if (broadcastResult.success) {
                return {
                    success: true,
                    txHash: broadcastResult.txHash,
                    fees: estimatedFee / 1e8,
                    amountForwarded: sweepAmount / 1e8,
                    isSweep: true
                };
            } else {
                return broadcastResult;
            }

        } catch (error) {
            console.error(`[TX] Error in sweep:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Send Ethereum transaction using ethers.js
     * Private keys never leave the server
     */
    async _sendEthereumTransaction(crypto, fromPrivateKey, toAddress, amount) {
        try {
            console.log(`[TX] Starting ETH transaction: ${amount} ${crypto.toUpperCase()} to ${toAddress}`);

            // 1. Initialize RPC provider with Fallback
            const rpcUrl = crypto === 'beth' ? config.BETH_RPC_URL : config.ETH_RPC_URL;
            const backupRpcUrl = crypto === 'beth' ? null : config.ETH_RPC_URL_BACKUP;

            console.log(`[TX] Using RPC provider: ${rpcUrl}`);

            let provider;
            try {
                // Try primary
                provider = new ethers.JsonRpcProvider(rpcUrl, null, {
                    staticNetwork: crypto === 'beth' ? ethers.Network.from(17000) : ethers.Network.from(1)
                });
                // Test connection
                await provider.getBlockNumber();
            } catch (e) {
                if (backupRpcUrl) {
                    console.warn(`[TX] Primary RPC failed, switching to backup: ${backupRpcUrl}`);
                    provider = new ethers.JsonRpcProvider(backupRpcUrl, null, {
                        staticNetwork: ethers.Network.from(1)
                    });
                } else {
                    throw e; // No backup for testnet configured
                }
            }

            // 2. Create wallet from private key
            const wallet = new ethers.Wallet(fromPrivateKey, provider);
            console.log(`[TX] Source address: ${wallet.address}`);

            // 3. Get current balance
            const balance = await provider.getBalance(wallet.address);
            const balanceEth = parseFloat(ethers.formatEther(balance));
            console.log(`[TX] Balance: ${balanceEth} ETH`);

            // 4. Estimate gas
            const valueWei = ethers.parseEther(amount.toString());
            let estimatedGas;
            try {
                estimatedGas = await provider.estimateGas({
                    from: wallet.address,
                    to: toAddress,
                    value: valueWei
                });
            } catch (error) {
                // Fallback to standard transfer gas
                estimatedGas = 21000n;
                console.log(`[TX] Using standard gas limit: ${estimatedGas}`);
            }

            // 5. Get current gas price
            const feeData = await provider.getFeeData();
            const gasPrice = feeData.gasPrice;
            console.log(`[TX] Gas price: ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);

            // 6. Calculate total fee
            const totalFee = estimatedGas * gasPrice;
            const feeInEth = parseFloat(ethers.formatEther(totalFee));
            console.log(`[TX] Estimated fee: ${feeInEth} ETH`);

            // 7. Validate sufficient balance and adjust if needed (Max Send logic)
            let finalValueWei = valueWei;
            const totalCost = valueWei + totalFee;

            if (balance < totalCost) {
                console.log(`[TX] Requested amount + gas exceeds balance. Adjusting to max sendable...`);
                // Final value is Whatever is in the wallet MINUS the cost of gas
                if (balance > totalFee) {
                    finalValueWei = balance - totalFee;
                    console.log(`[TX] Adjusted amount: ${ethers.formatEther(finalValueWei)} ETH (Original: ${amount})`);
                } else {
                    return {
                        success: false,
                        error: `Balance too low even to cover gas: need ${ethers.formatEther(totalFee)} ETH, have ${balanceEth} ETH`
                    };
                }
            }

            // 8. Build transaction
            const tx = {
                to: toAddress,
                value: finalValueWei,
                gasLimit: estimatedGas,
                gasPrice: gasPrice
            };

            // 9. Sign and send transaction
            console.log(`[TX] Signing and sending transaction...`);
            const txResponse = await wallet.sendTransaction(tx);
            console.log(`[TX] Transaction submitted: ${txResponse.hash}`);

            // 10. Wait for confirmation
            console.log(`[TX] Waiting for confirmation...`);
            const receipt = await txResponse.wait(1);

            // 11. Calculate actual fees
            const actualFee = receipt.gasUsed * receipt.gasPrice;
            const actualFeeEth = parseFloat(ethers.formatEther(actualFee));

            console.log(`[TX] Transaction confirmed! Block: ${receipt.blockNumber}`);
            console.log(`[TX] Actual fee: ${actualFeeEth} ETH`);

            return {
                success: true,
                txHash: receipt.hash,
                fees: actualFeeEth
            };

        } catch (error) {
            console.error(`[TX] Error in ETH transaction:`, error);

            // Provide more helpful error messages
            let errorMessage = error.message;
            if (error.code === 'INSUFFICIENT_FUNDS') {
                errorMessage = 'Insufficient funds for transaction + gas';
            } else if (error.code === 'NETWORK_ERROR') {
                errorMessage = 'Cannot connect to Ethereum provider. Check ETH_RPC_URL configuration.';
            } else if (error.code === 'NONCE_EXPIRED') {
                errorMessage = 'Transaction nonce conflict. Please retry.';
            }

            return {
                success: false,
                error: errorMessage
            };
        }
    }

    /**
     * Send a transaction from a local address
     * Uses local signing - private keys never transmitted to external APIs
     *
     * @param {string} crypto - 'btc', 'bcy_test', 'eth', or 'beth'
     * @param {string} fromPrivateKey - Private key of sender
     * @param {string} toAddress - Destination address
     * @param {number} amount - Amount in UNIT (BTC/ETH)
     * @returns {Promise<Object>} Transaction result
     */
    async sendTransaction(crypto, fromPrivateKey, toAddress, amount) {
        const isBitcoinLike = crypto.includes('btc') || crypto.includes('bcy');

        if (isBitcoinLike) {
            return await this._sendBitcoinTransaction(crypto, fromPrivateKey, toAddress, amount);
        } else if (crypto === 'eth' || crypto === 'beth') {
            return await this._sendEthereumTransaction(crypto, fromPrivateKey, toAddress, amount);
        } else {
            return {
                success: false,
                error: `Unsupported cryptocurrency: ${crypto}`
            };
        }
    }
}

export const addressService = new AddressService();
export default addressService;
