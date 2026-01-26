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
                error: 'cryptocurrency is required (btc, eth, bcy, btc_test, or eth_test)'
            });
        }

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'userId is required'
            });
        }

        const crypto = cryptocurrency.toLowerCase().trim();
        if (!['btc', 'eth', 'bcy', 'btc_test', 'eth_test'].includes(crypto)) {
            return res.status(400).json({
                success: false,
                error: `cryptocurrency must be one of: btc, eth, bcy, btc_test, or eth_test. Received: "${cryptocurrency}"`
            });
        }

        // Log chain and amount for payment address creation
        console.log(`[PaymentGateway] Creating payment address - Chain: ${crypto.toUpperCase()}, Amount: ${amount || 'N/A'}, UserId: ${userId}`);

        // Get main address based on cryptocurrency (for eventual manual/auto forwarding)
        let mainAddress;
        if (crypto === 'bcy') {
            mainAddress = config.BCY_MAIN_ADDRESS;
        } else if (crypto.startsWith('btc')) {
            mainAddress = config.BTC_MAIN_ADDRESS;
        } else {
            mainAddress = config.ETH_MAIN_ADDRESS;
        }

        // Get next derivation index
        const index = paymentSessionManager.getNextIndex(crypto);

        let paymentAddress;
        let addressSource;

        // BCY uses BlockCypher API to generate addresses (proprietary test chain)
        // BTC, ETH, and their testnets use local HD wallet derivation
        if (crypto === 'bcy') {
            // Generate BCY address via BlockCypher API
            const bcyResult = await addressService.generateAddress('bcy');
            if (!bcyResult.success) {
                console.error(`[PaymentGateway] Failed to generate BCY address via BlockCypher API:`, bcyResult.error);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to generate BCY address. BlockCypher API error.'
                });
            }
            paymentAddress = bcyResult.address;
            addressSource = 'blockcypher_api';
            console.log(`[PaymentGateway] BCY address generated via BlockCypher API: ${paymentAddress}`);
        } else {
            // Generate address locally using HD wallet derivation
            let localWallet;
            try {
                localWallet = walletService.generateLocalAddress(crypto, index);
            } catch (error) {
                console.error(`[PaymentGateway] Failed to generate local address:`, error.message);
                return res.status(500).json({
                    success: false,
                    error: 'Master Seed Phrase not configured or invalid. Please check your .env file.'
                });
            }
            paymentAddress = localWallet.address;
            addressSource = 'local_hd_wallet';
        }

        // Create payment session
        const session = paymentSessionManager.createSession({
            userId,
            cryptocurrency: crypto,
            paymentAddress: paymentAddress,
            forwardingAddress: mainAddress,
            addressIndex: index,
            expectedAmount: amount || null,
            metadata: { ...metadata, addressSource } || { addressSource }
        });

        // Register webhook for transaction confirmations on this address
        // BlockCypher monitors the address for us
        const webhookResult = await webhookService.registerAddressWebhook(
            crypto,
            paymentAddress,
            session.id
        );

        if (!webhookResult.success) {
            console.warn(`[PaymentGateway] Failed to register BlockCypher webhook - Chain: ${crypto.toUpperCase()}, Amount: ${amount || 'N/A'}:`, webhookResult.error);
            // We can still manually check transactions later if needed
        } else {
            // Update session with webhook ID
            paymentSessionManager.updateSession(session.id, {
                webhookId: webhookResult.webhookId
            });
            console.log(`[PaymentGateway] Payment address created successfully - Chain: ${crypto.toUpperCase()}, Amount: ${amount || 'N/A'}, Address: ${paymentAddress}, SessionId: ${session.id}, Source: ${addressSource}`);
        }

        res.status(201).json({
            success: true,
            data: {
                sessionId: session.id,
                paymentAddress: paymentAddress,
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
