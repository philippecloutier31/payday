import { addressService } from '../services/address.service.js';
import { paymentSessionManager } from '../services/payment-session.service.js';
import { webhookService } from '../services/webhook.service.js';
import { walletService } from '../services/wallet.service.js';
import config, {
    getBtcMainAddress,
    getEthMainAddress,
    getBcyMainAddress,
    getBethMainAddress
} from '../config/env.js';

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
                error: 'cryptocurrency is required (btc, eth, bcy, beth, btc_test, or eth_test)'
            });
        }

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'userId is required'
            });
        }

        const crypto = cryptocurrency.toLowerCase();
        if (!['btc', 'eth', 'btc_test', 'eth_test', 'bcy', 'beth'].includes(crypto)) {
            return res.status(400).json({
                success: false,
                error: 'cryptocurrency must be btc, eth, btc_test, eth_test, bcy, or beth'
            });
        }

        // Log chain and amount for payment address creation
        console.log(`[PaymentGateway] Creating payment address - Chain: ${crypto.toUpperCase()}, Amount: ${amount || 'N/A'}, UserId: ${userId}`);

        // Get main address based on cryptocurrency (uses dynamic config, falls back to .env)
        let mainAddress;
        if (crypto === 'beth') {
            mainAddress = getBethMainAddress();
        } else if (crypto === 'bcy') {
            mainAddress = getBcyMainAddress();
        } else if (crypto.includes('btc')) {
            mainAddress = getBtcMainAddress();
        } else {
            mainAddress = getEthMainAddress();
        }


        // Get random derivation index (for privacy and security)
        // This makes it harder to guess other addresses and isolates keys
        const index = paymentSessionManager.getRandomIndex(crypto);

        let paymentAddress;
        let addressSource;

        // BCY and BETH use BlockCypher API to generate addresses (proprietary test chains)
        // BTC, ETH, and their testnets use local HD wallet derivation
        if (crypto === 'bcy' || crypto === 'beth') {
            // Generate BCY/BETH address via BlockCypher API
            const testResult = await addressService.generateAddress(crypto);
            if (!testResult.success) {
                console.error(`[PaymentGateway] Failed to generate ${crypto.toUpperCase()} address via BlockCypher API:`, testResult.error);
                return res.status(500).json({
                    success: false,
                    error: `Failed to generate ${crypto.toUpperCase()} address. BlockCypher API error.`
                });
            }
            paymentAddress = testResult.address;
            addressSource = 'blockcypher_api';
            console.log(`[PaymentGateway] ${crypto.toUpperCase()} address generated via BlockCypher API: ${paymentAddress}`);
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
