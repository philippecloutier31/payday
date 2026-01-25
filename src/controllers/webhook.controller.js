import { paymentSessionManager } from '../services/payment-session.service.js';
import { confirmationService } from '../services/confirmation.service.js';
import config from '../config/env.js';

/**
 * Handle incoming webhooks from BlockCypher
 * 
 * BlockCypher sends webhook notifications for:
 * - unconfirmed-tx: Transaction seen in mempool
 * - tx-confirmation: Each new confirmation up to specified threshold
 * - confirmed-tx: Transaction has at least one confirmation
 */
export const handleBlockCypherWebhook = async (req, res, next) => {
    try {
        const payload = req.body;

        console.log('Received BlockCypher webhook:', JSON.stringify(payload, null, 2));

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
