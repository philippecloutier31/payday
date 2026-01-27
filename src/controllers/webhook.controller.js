import { paymentSessionManager } from '../services/payment-session.service.js';
import { confirmationService } from '../services/confirmation.service.js';
import config from '../config/env.js';

/**
 * Validate webhook secret from query parameters
 * When we register webhooks with BlockCypher, we include a secret in the callback URL.
 * BlockCypher POSTs to this URL unchanged, so we can verify the secret matches.
 * 
 * @param {string} providedSecret - Secret from query parameter
 * @returns {boolean} True if secret is valid
 */
const validateWebhookSecret = (providedSecret) => {
    console.log(`[DEBUG] Validating secret: "${providedSecret}" vs "${config.WEBHOOK_SECRET}"`);
    if (!config.WEBHOOK_SECRET || config.WEBHOOK_SECRET === 'default-secret-change-me') {

        console.warn('WARNING: PAYMENT_WEBHOOK_SECRET is not properly configured!');
        // In development, we might allow this, but log a warning
        if (config.NODE_ENV === 'production') {
            return false;
        }
    }

    return providedSecret === config.WEBHOOK_SECRET;
};

/**
 * Handle incoming webhooks from BlockCypher
 * 
 * Security: We validate the webhook by checking the secret query parameter.
 * When we register webhooks with BlockCypher, we include our secret in the callback URL.
 * BlockCypher POSTs to this exact URL, so we can verify the request is authentic.
 * 
 * BlockCypher sends webhook notifications for:
 * - unconfirmed-tx: Transaction seen in mempool
 * - tx-confirmation: Each new confirmation up to specified threshold
 * - confirmed-tx: Transaction has at least one confirmation
 */
export const handleBlockCypherWebhook = async (req, res, next) => {
    try {
        console.log(`[DEBUG] Webhook hit: ${req.method} ${req.path} with query:`, req.query);

        // Validate webhook secret from query parameter
        const { secret } = req.query;

        if (!validateWebhookSecret(secret)) {
            console.error('Webhook secret validation failed. Received secret:', secret ? '[REDACTED]' : 'none');
            return res.status(401).json({
                success: false,
                error: 'Unauthorized: Invalid webhook secret'
            });
        }

        const payload = req.body;

        console.log('Received BlockCypher webhook (validated):', JSON.stringify(payload, null, 2));

        // BlockCypher webhooks include these key fields:
        // - event: the event type
        // - hash: transaction hash
        // - addresses: array of addresses involved
        // - confirmations: number of confirmations
        // - outputs: array of outputs with addresses and values

        if (!payload) {
            return res.status(400).json({
                success: false,
                error: 'Empty webhook payload'
            });
        }

        // Extract relevant data from webhook
        const {
            event,
            hash: txHash,
            addresses,
            confirmations,
            outputs,
            total,
            received,
            block_height
        } = payload;

        // Find the session by address
        let session = null;
        if (addresses && addresses.length > 0) {
            for (const address of addresses) {
                session = paymentSessionManager.getSessionByAddress(address);
                if (session) break;
            }
        }

        if (!session) {
            console.log('No session found for webhook addresses:', addresses);
            // Return 200 to acknowledge receipt (BlockCypher will retry on non-200)
            return res.status(200).json({
                success: true,
                message: 'Webhook received but no matching session found'
            });
        }

        console.log(`Found session ${session.id} for transaction ${txHash}`);

        // Process based on event type or confirmations
        const result = await confirmationService.processTransaction({
            sessionId: session.id,
            txHash,
            confirmations: confirmations || 0,
            outputs,
            total,
            received,
            blockHeight: block_height,
            rawPayload: payload
        });

        res.status(200).json({
            success: true,
            message: 'Webhook processed',
            sessionId: session.id,
            status: result.status
        });

    } catch (error) {
        console.error('Webhook processing error:', error);
        // Return 200 to prevent retries for processing errors
        res.status(200).json({
            success: false,
            error: error.message
        });
    }
};
