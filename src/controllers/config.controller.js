import { walletConfigService } from '../services/wallet-config.service.js';
import {
    WALLET_SYNC_SECRET,
    getBtcMainAddress,
    getEthMainAddress,
    getBcyMainAddress,
    getBethMainAddress,
    getUsdtMainAddress
} from '../config/env.js';

/**
 * Update wallet addresses
 * Protected by shared secret from main backend
 */
export const updateWalletAddresses = async (req, res) => {
    try {
        // Validate secret
        const { secret } = req.body;

        if (!WALLET_SYNC_SECRET) {
            console.warn('[Config] WALLET_SYNC_SECRET not configured');
            return res.status(500).json({
                success: false,
                error: 'Wallet sync not configured on payment service'
            });
        }

        if (secret !== WALLET_SYNC_SECRET) {
            console.warn('[Config] Invalid wallet sync secret received');
            return res.status(401).json({
                success: false,
                error: 'Unauthorized: Invalid secret'
            });
        }

        const { btcAddress, ethAddress, usdtAddress, bcyAddress, bethAddress } = req.body;

        console.log('[Config] Updating wallet addresses:', {
            btc: btcAddress ? `${btcAddress.substring(0, 10)}...` : 'not set',
            eth: ethAddress ? `${ethAddress.substring(0, 10)}...` : 'not set',
            usdt: usdtAddress ? `${usdtAddress.substring(0, 10)}...` : 'not set',
            bcy: bcyAddress ? `${bcyAddress.substring(0, 10)}...` : 'not set',
            beth: bethAddress ? `${bethAddress.substring(0, 10)}...` : 'not set'
        });

        const updated = walletConfigService.updateAddresses({
            btcAddress: btcAddress || null,
            ethAddress: ethAddress || null,
            usdtAddress: usdtAddress || null,
            bcyAddress: bcyAddress || null,
            bethAddress: bethAddress || null
        });

        if (updated) {
            console.log('[Config] Wallet addresses updated successfully');
            res.json({
                success: true,
                message: 'Wallet addresses updated'
            });
        } else {
            console.error('[Config] Failed to save wallet config');
            res.status(500).json({
                success: false,
                error: 'Failed to save wallet config'
            });
        }
    } catch (error) {
        console.error('[Config] Error updating wallet addresses:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * Get current wallet addresses (for debugging)
 */
export const getWalletAddresses = async (req, res) => {
    try {
        const config = walletConfigService.getConfig();

        res.json({
            success: true,
            data: {
                btc: getBtcMainAddress(),
                eth: getEthMainAddress(),
                usdt: getUsdtMainAddress(),
                bcy: getBcyMainAddress(),
                beth: getBethMainAddress(),
                source: config ? 'database' : 'environment',
                updatedAt: config?.updatedAt || null
            }
        });
    } catch (error) {
        console.error('[Config] Error getting wallet addresses:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
