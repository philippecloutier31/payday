import { addressService } from '../services/address.service.js';
import { paymentSessionManager } from '../services/payment-session.service.js';
import { webhookService } from '../services/webhook.service.js';
import { walletService } from '../services/wallet.service.js';
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
                error: 'cryptocurrency is required (btc, eth, btc_test, or eth_test)'
            });
        }

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'userId is required'
            });
        }

        const crypto = cryptocurrency.toLowerCase();
        if (!['btc', 'eth', 'btc_test', 'eth_test'].includes(crypto)) {
            return res.status(400).json({
                success: false,
                error: 'cryptocurrency must be btc, eth, btc_test, or eth_test'
            });
        }

        // Get main address based on cryptocurrency (for eventual manual/auto forwarding)
        const mainAddress = crypto.startsWith('btc') ? config.BTC_MAIN_ADDRESS : config.ETH_MAIN_ADDRESS;

        // Get next derivation index
        const index = paymentSessionManager.getNextIndex(crypto);

        // Generate address locally
        let localWallet;
        try {
            localWallet = walletService.generateLocalAddress(crypto, index);
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: 'Master Seed Phrase not configured or invalid. Please check your .env file.'
            });
        }

        // Create payment session
        const session = paymentSessionManager.createSession({
            userId,
            cryptocurrency: crypto,
            paymentAddress: localWallet.address,
            forwardingAddress: mainAddress,
            addressIndex: index,
            expectedAmount: amount || null,
            metadata: metadata || {}
        });

        // Register webhook for transaction confirmations on this address
        // BlockCypher still monitors the address for us, but we hold the keys!
        const webhookResult = await webhookService.registerAddressWebhook(
            crypto,
            localWallet.address,
            session.id
        );

        if (!webhookResult.success) {
            console.warn('Failed to register BlockCypher webhook:', webhookResult.error);
            // We can still manually check transactions later if needed
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
                paymentAddress: localWallet.address,
                cryptocurrency: crypto,
                expectedAmount: amount || null,
                expiresAt: session.expiresAt,
                status: session.status,
                derivationIndex: index
            }
        });

    } catch (error) {
        next(error);
    }
};
