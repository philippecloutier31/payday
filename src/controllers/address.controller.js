import { addressService } from '../services/address.service.js';
import { paymentSessionManager } from '../services/payment-session.service.js';
import { webhookService } from '../services/webhook.service.js';
import config from '../config/env.js';

/**
 * Create a new payment address for receiving crypto
 */
export const createPaymentAddress = async (req, res, next) => {
    try {
        const { cryptocurrency, userId, amount, metadata } = req.body;

        // Validate required fields
        if (!cryptocurrency) {
            return res.status(400).json({
                success: false,
                error: 'cryptocurrency is required (btc or eth)'
            });
        }

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'userId is required'
            });
        }

        const crypto = cryptocurrency.toLowerCase();
        if (!['btc', 'eth'].includes(crypto)) {
            return res.status(400).json({
                success: false,
                error: 'cryptocurrency must be btc or eth'
            });
        }

        // Get main address based on cryptocurrency
        const mainAddress = crypto === 'btc' ? config.BTC_MAIN_ADDRESS : config.ETH_MAIN_ADDRESS;
        
        if (!mainAddress) {
            return res.status(500).json({
                success: false,
                error: `Main ${crypto.toUpperCase()} address not configured`
            });
        }

        // Create forwarding address via BlockCypher
        const forwardingResult = await addressService.createForwardingAddress(crypto, mainAddress);

        if (!forwardingResult.success) {
            return res.status(500).json({
                success: false,
                error: forwardingResult.error || 'Failed to create payment address'
            });
        }

        // Create payment session
        const session = paymentSessionManager.createSession({
            userId,
            cryptocurrency: crypto,
            paymentAddress: forwardingResult.inputAddress,
            forwardingAddress: mainAddress,
            forwardingId: forwardingResult.id,
            expectedAmount: amount || null,
            metadata: metadata || {}
        });

        // Register webhook for transaction confirmations on this address
        const webhookResult = await webhookService.registerAddressWebhook(
            crypto,
            forwardingResult.inputAddress,
            session.id
        );

        if (!webhookResult.success) {
            console.warn('Failed to register webhook:', webhookResult.error);
            // Continue anyway - we can still manually check transactions
        } else {
            // Update session with webhook ID
            paymentSessionManager.updateSession(session.id, {
                webhookId: webhookResult.webhookId
            });
        }

        res.status(201).json({
            success: true,
            data: {
                sessionId: session.id,
                paymentAddress: forwardingResult.inputAddress,
                cryptocurrency: crypto,
                expectedAmount: amount || null,
                expiresAt: session.expiresAt,
                status: session.status
            }
        });

    } catch (error) {
        next(error);
    }
};
