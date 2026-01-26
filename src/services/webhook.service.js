import fetch from 'node-fetch';
import config from '../config/env.js';

/**
 * BlockCypher Webhook Service
 * 
 * Manages webhook subscriptions for transaction monitoring
 * 
 * Event Types:
 * - unconfirmed-tx: Transaction seen in mempool
 * - new-block: New block mined
 * - confirmed-tx: Transaction has at least one confirmation
 * - tx-confirmation: Each confirmation (up to 6 for BTC, configurable)
 * - double-spend-tx: Double spend detected
 * - tx-confidence: Transaction confidence score update
 * 
 * Documentation: https://www.blockcypher.com/dev/bitcoin/#using-webhooks
 */
class WebhookService {
    constructor() {
        this.apiUrl = config.BLOCKCYPHER_API_URL;
        this.apiToken = config.BLOCKCYPHER_API_TOKEN;
        this.webhookBaseUrl = config.WEBHOOK_BASE_URL;
        this.webhookSecret = config.WEBHOOK_SECRET;
    }

    /**
     * Build the callback URL with secret parameter for webhook validation
     * BlockCypher will POST to this URL with the secret intact, allowing us to verify authenticity
     * @returns {string} Callback URL with secret parameter
     */
    buildCallbackUrl() {
        return `${this.webhookBaseUrl}/webhook/blockcypher?secret=${encodeURIComponent(this.webhookSecret)}`;
    }

    /**
     * Get the BlockCypher chain identifier for a cryptocurrency
     * @param {string} crypto - 'btc' or 'eth'
     * @returns {string} Chain identifier for BlockCypher API
     */
    getChainId(crypto) {
        const chains = {
            btc: 'btc/main',
            eth: 'eth/main',
            btc_test: 'btc/test3',
            eth_test: 'beth/test'
        };
        return chains[crypto] || chains.btc;
    }

    /**
     * Register a webhook for an address to receive transaction notifications
     * 
     * @param {string} crypto - 'btc' or 'eth'
     * @param {string} address - Address to monitor
     * @param {string} sessionId - Payment session ID for reference
     * @param {Object} options - Additional options
     * @param {string} options.event - Event type (default: 'tx-confirmation')
     * @param {number} options.confirmations - Number of confirmations to track (default: 6 for BTC, 12 for ETH)
     * @returns {Promise<Object>} Webhook registration result
     */
    async registerAddressWebhook(crypto, address, sessionId, options = {}) {
        try {
            const chainId = this.getChainId(crypto);
            const url = `${this.apiUrl}/${chainId}/hooks?token=${this.apiToken}`;

            // Default confirmations based on crypto
            const confirmations = options.confirmations ||
                (crypto.startsWith('btc') ? config.BTC_CONFIRMATIONS_REQUIRED : config.ETH_CONFIRMATIONS_REQUIRED);

            // We use tx-confirmation to track each confirmation up to our threshold
            // Include secret in callback URL for webhook validation
            const requestBody = {
                event: options.event || 'tx-confirmation',
                address: address,
                url: this.buildCallbackUrl(),
                confirmations: confirmations,
                // Optional: filter by script type (for BTC)
                // script: 'pay-to-pubkey-hash'
            };

            console.log(`Registering webhook for ${crypto.toUpperCase()} address: ${address}`);
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
                console.error('BlockCypher webhook registration error:', data);
                return {
                    success: false,
                    error: data.error || data.errors?.join(', ') || 'Failed to register webhook',
                    statusCode: response.status
                };
            }

            console.log('Webhook registered:', data);

            return {
                success: true,
                webhookId: data.id,
                event: data.event,
                address: data.address,
                callbackUrl: data.url,
                confirmations: data.confirmations,
                rawResponse: data
            };

        } catch (error) {
            console.error('Error registering webhook:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Register a webhook for unconfirmed transactions (mempool)
     * Useful for showing "pending" status to users immediately
     * 
     * @param {string} crypto - 'btc' or 'eth'
     * @param {string} address - Address to monitor
     * @returns {Promise<Object>} Webhook registration result
     */
    async registerUnconfirmedTxWebhook(crypto, address) {
        try {
            const chainId = this.getChainId(crypto);
            const url = `${this.apiUrl}/${chainId}/hooks?token=${this.apiToken}`;

            const requestBody = {
                event: 'unconfirmed-tx',
                address: address,
                url: this.buildCallbackUrl()
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (!response.ok) {
                return {
                    success: false,
                    error: data.error || 'Failed to register unconfirmed-tx webhook',
                    statusCode: response.status
                };
            }

            return {
                success: true,
                webhookId: data.id,
                event: data.event,
                address: data.address,
                rawResponse: data
            };

        } catch (error) {
            console.error('Error registering unconfirmed-tx webhook:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Register a webhook for transaction confidence updates
     * BlockCypher provides confidence scores before confirmations
     * 
     * @param {string} crypto - 'btc' or 'eth'  
     * @param {string} address - Address to monitor
     * @param {number} confidenceThreshold - Confidence percentage (0-1, e.g., 0.99 for 99%)
     * @returns {Promise<Object>} Webhook registration result
     */
    async registerConfidenceWebhook(crypto, address, confidenceThreshold = 0.99) {
        try {
            const chainId = this.getChainId(crypto);
            const url = `${this.apiUrl}/${chainId}/hooks?token=${this.apiToken}`;

            const requestBody = {
                event: 'tx-confidence',
                address: address,
                url: this.buildCallbackUrl(),
                confidence: confidenceThreshold
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (!response.ok) {
                return {
                    success: false,
                    error: data.error || 'Failed to register confidence webhook',
                    statusCode: response.status
                };
            }

            return {
                success: true,
                webhookId: data.id,
                event: data.event,
                address: data.address,
                confidence: data.confidence,
                rawResponse: data
            };

        } catch (error) {
            console.error('Error registering confidence webhook:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get details of an existing webhook
     * 
     * @param {string} crypto - 'btc' or 'eth'
     * @param {string} webhookId - The webhook ID
     * @returns {Promise<Object>} Webhook details
     */
    async getWebhook(crypto, webhookId) {
        try {
            const chainId = this.getChainId(crypto);
            const url = `${this.apiUrl}/${chainId}/hooks/${webhookId}?token=${this.apiToken}`;

            const response = await fetch(url);
            const data = await response.json();

            if (!response.ok) {
                return {
                    success: false,
                    error: data.error || 'Failed to get webhook',
                    statusCode: response.status
                };
            }

            return {
                success: true,
                webhookId: data.id,
                event: data.event,
                address: data.address,
                callbackUrl: data.url,
                rawResponse: data
            };

        } catch (error) {
            console.error('Error getting webhook:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * List all webhooks for a cryptocurrency
     * 
     * @param {string} crypto - 'btc' or 'eth'
     * @returns {Promise<Object>} List of webhooks
     */
    async listWebhooks(crypto) {
        try {
            const chainId = this.getChainId(crypto);
            const url = `${this.apiUrl}/${chainId}/hooks?token=${this.apiToken}`;

            const response = await fetch(url);
            const data = await response.json();

            if (!response.ok) {
                return {
                    success: false,
                    error: data.error || 'Failed to list webhooks',
                    statusCode: response.status
                };
            }

            return {
                success: true,
                webhooks: data,
                count: Array.isArray(data) ? data.length : 0
            };

        } catch (error) {
            console.error('Error listing webhooks:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Delete a webhook
     * 
     * @param {string} crypto - 'btc' or 'eth'
     * @param {string} webhookId - The webhook ID to delete
     * @returns {Promise<Object>} Result of deletion
     */
    async deleteWebhook(crypto, webhookId) {
        try {
            const chainId = this.getChainId(crypto);
            const url = `${this.apiUrl}/${chainId}/hooks/${webhookId}?token=${this.apiToken}`;

            const response = await fetch(url, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                return {
                    success: false,
                    error: data.error || 'Failed to delete webhook',
                    statusCode: response.status
                };
            }

            return {
                success: true,
                message: 'Webhook deleted successfully'
            };

        } catch (error) {
            console.error('Error deleting webhook:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Delete all webhooks for a cryptocurrency
     * Useful for cleanup during development
     * 
     * @param {string} crypto - 'btc' or 'eth'
     * @returns {Promise<Object>} Result of bulk deletion
     */
    async deleteAllWebhooks(crypto) {
        try {
            const listResult = await this.listWebhooks(crypto);

            if (!listResult.success) {
                return listResult;
            }

            const webhooks = listResult.webhooks || [];
            const deleteResults = [];

            for (const webhook of webhooks) {
                const result = await this.deleteWebhook(crypto, webhook.id);
                deleteResults.push({
                    id: webhook.id,
                    ...result
                });
            }

            return {
                success: true,
                deleted: deleteResults.filter(r => r.success).length,
                failed: deleteResults.filter(r => !r.success).length,
                results: deleteResults
            };

        } catch (error) {
            console.error('Error deleting all webhooks:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Export singleton instance
export const webhookService = new WebhookService();
export default webhookService;
