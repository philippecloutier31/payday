import fetch from 'node-fetch';
import config from '../config/env.js';

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
     * Send a transaction from a local address
     * 
     * @param {string} crypto - 'btc', 'bcy_test', or 'eth'
     * @param {string} fromPrivateKey - Private key of sender
     * @param {string} toAddress - Destination address
     * @param {number} amount - Amount in UNIT (BTC/ETH)
     * @returns {Promise<Object>} Transaction result
     */
    async sendTransaction(crypto, fromPrivateKey, toAddress, amount) {
        try {
            const chainId = this.getChainId(crypto);
            const isBitcoinLike = crypto.includes('btc') || (crypto.includes('bcy') && !crypto.includes('beth'));
            const isEtherLike = crypto.includes('eth') || crypto.includes('beth');

            if (isBitcoinLike) {
                // Use BlockCypher Micro-transaction API (handles UTXO and fees automatically)
                const url = `${this.apiUrl}/${chainId}/txs/micro?token=${this.apiToken}`;
                const amountSats = Math.floor(amount * 1e8);

                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        from_private: fromPrivateKey,
                        to_address: toAddress,
                        value_satoshis: amountSats
                    })
                });

                const data = await response.json();
                if (!response.ok) throw new Error(data.error || JSON.stringify(data));

                return { success: true, txHash: data.hash, fees: data.fees / 1e8 };
            } else if (isEtherLike) {
                // Use ethers.js for ETH mainnet/testnet
                const { ethers } = await import('ethers');

                // Use Cloudflare for Mainnet, or standard testnet providers
                const rpcUrls = {
                    'eth/main': 'https://cloudflare-eth.com',
                    'beth/test': 'https://ethereum-holesky-rpc.publicnode.com' // Example for BETH
                };

                const rpcUrl = rpcUrls[chainId] || 'https://cloudflare-eth.com';
                const provider = new ethers.JsonRpcProvider(rpcUrl);
                const wallet = new ethers.Wallet(fromPrivateKey, provider);

                const tx = {
                    to: toAddress,
                    value: ethers.parseEther(amount.toString())
                };

                const response = await wallet.sendTransaction(tx);
                const receipt = await response.wait();

                return {
                    success: true,
                    txHash: response.hash,
                    fees: ethers.formatEther(receipt.fee || 0)
                };
            } else {
                return { success: false, error: `Unsupported network for transactions: ${crypto}` };
            }
        } catch (error) {
            console.error(`Error sending ${crypto} transaction:`, error);
            return { success: false, error: error.message };
        }
    }
}

export const addressService = new AddressService();
export default addressService;
