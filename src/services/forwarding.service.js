import { confirmationService } from './confirmation.service.js';
import { walletService } from './wallet.service.js';
import { addressService } from './address.service.js';
import { paymentSessionManager } from './payment-session.service.js';
import config from '../config/env.js';
import logger from '../utils/logger.js';

/**
 * Automatic Forwarding Service (Auto-Sweep)
 * 
 * Automatically forwards 97.5% of confirmed payments to the main wallet.
 * The remaining 2.5% stays in the original address as fees.
 * Fees can be collected later with a manual sweep command.
 */
class ForwardingService {
    constructor() {
        this.enabled = config.AUTO_FORWARD_ENABLED;
        this.percentage = config.FORWARDING_PERCENTAGE;

        if (this.enabled) {
            logger.info(`Forwarding Service: ACTIVE (${this.percentage * 100}% auto-forward, ${(1 - this.percentage) * 100}% fees remain)`);
            this.init();
        } else {
            logger.info('Forwarding Service: DISABLED');
        }
    }

    init() {
        // Subscribe to payment completed event
        confirmationService.on('onPaymentCompleted', async (data) => {
            await this.processForwarding(data);
        });
    }

    /**
     * Process automatic forwarding for a completed payment
     * Implements tiered fee system:
     * - Small payments (< threshold): Forward 100% (no fee)
     * - Large payments (≥ threshold): Forward 97.5% (2.5% fee)
     */
    async processForwarding(data) {
        const { sessionId, cryptocurrency, amount, paymentAddress, forwardingAddress } = data;

        logger.info(`[Auto-Forward] Processing session ${sessionId} (${amount} ${cryptocurrency.toUpperCase()})`);

        if (!this.enabled) {
            logger.debug('[Auto-Forward] Service is disabled. Skipping.');
            return;
        }

        if (!forwardingAddress) {
            logger.warn(`[Auto-Forward] No forwarding address configured for session ${sessionId}. Skipping.`);
            return;
        }

        try {
            // 1. Get the session to find the derivation index
            const session = paymentSessionManager.getSession(sessionId);
            if (!session || session.addressIndex === null) {
                throw new Error('Session or address index not found');
            }

            // 2. Determine if we should take a fee based on payment size
            const expectedAmountUSD = session.metadata?.amountUSD || 0;
            const shouldTakeFee = expectedAmountUSD >= config.MINIMUM_FEE_THRESHOLD_USD;

            let amountToForward;
            let feeAmount;
            let feePercentage;

            if (shouldTakeFee) {
                // Large payment: Take 2.5% fee
                amountToForward = amount * this.percentage;
                feeAmount = amount - amountToForward;
                feePercentage = (1 - this.percentage) * 100;
                logger.info(`[Auto-Forward] Payment ≥ $${config.MINIMUM_FEE_THRESHOLD_USD} - Taking ${feePercentage}% fee`);
            } else {
                // Small payment: Forward 100% (no fee)
                amountToForward = amount;
                feeAmount = 0;
                feePercentage = 0;
                logger.info(`[Auto-Forward] Payment < $${config.MINIMUM_FEE_THRESHOLD_USD} - No fee (100% forward)`);
            }

            // 3. Regenerate the local wallet to get the private key
            const localWallet = walletService.generateLocalAddress(cryptocurrency, session.addressIndex);

            logger.info(`[Auto-Forward] Forwarding ${amountToForward} ${cryptocurrency.toUpperCase()} from ${paymentAddress} to ${forwardingAddress}`);
            if (feeAmount > 0) {
                logger.debug(`[Auto-Forward] Fee remaining: ${feeAmount} ${cryptocurrency.toUpperCase()}`);
            }

            // 4. Send the transaction
            const result = await addressService.sendTransaction(
                cryptocurrency,
                localWallet.privateKey,
                forwardingAddress,
                amountToForward
            );

            if (result.success) {
                logger.info(`[Auto-Forward] ✓ SUCCESS - TX: ${result.txHash}`);

                // Update session metadata with forwarding details
                paymentSessionManager.updateSession(sessionId, {
                    metadata: {
                        ...session.metadata,
                        autoForwarded: true,
                        forwardedAt: new Date().toISOString(),
                        forwardingTxHash: result.txHash,
                        forwardedAmount: amountToForward,
                        feeRemaining: feeAmount,
                        feeTaken: shouldTakeFee,
                        feePercentage: feePercentage,
                        networkFees: result.fees
                    }
                });
            } else {
                logger.error(`[Auto-Forward] ✗ FAILED: ${result.error}`);

                // Mark in metadata that forwarding failed
                paymentSessionManager.updateSession(sessionId, {
                    metadata: {
                        ...session.metadata,
                        autoForwardFailed: true,
                        forwardingError: result.error,
                        failedAt: new Date().toISOString()
                    }
                });
            }

        } catch (error) {
            logger.error(`[Auto-Forward] ✗ ERROR: ${error.message}`);
        }
    }

    /**
     * Collect all accumulated fees from used addresses in a SINGLE transaction
     * (Bitcoin/BCY only - uses batch transactions)
     */
    async collectAllFees(cryptocurrency) {
        logger.info(`[Fee Collection] Starting collection for ${cryptocurrency.toUpperCase()}`);

        const feeCollectionAddress = config.FEE_COLLECTION_ADDRESS;
        if (!feeCollectionAddress) {
            logger.error('[Fee Collection] FEE_COLLECTION_ADDRESS not configured in .env');
            return { success: false, error: 'FEE_COLLECTION_ADDRESS not configured' };
        }

        // Route to appropriate collection method
        const isBitcoinLike = cryptocurrency.includes('btc') || cryptocurrency.includes('bcy');

        if (isBitcoinLike) {
            return await this.collectFeesBatch(cryptocurrency, feeCollectionAddress);
        } else {
            return await this.collectFeesSequential(cryptocurrency, feeCollectionAddress);
        }
    }

    /**
     * Batch fee collection for Bitcoin-like chains (single transaction, one fee)
     */
    async collectFeesBatch(cryptocurrency, feeCollectionAddress) {
        logger.info(`[Fee Collection] Mode: BATCH`);

        try {
            const { batchTransactionService } = await import('./batch-transaction.service.js');

            const allSessions = paymentSessionManager.getAllSessions();
            const completedSessions = allSessions.filter(s =>
                s.cryptocurrency === cryptocurrency &&
                s.status === 'completed' &&
                s.metadata?.autoForwarded === true &&
                !s.metadata?.feesCollected
            );

            logger.info(`[Fee Collection] Found ${completedSessions.length} sessions with uncollected fees`);

            if (completedSessions.length === 0) {
                return { success: true, message: 'No fees to collect', totalCollected: 0, sessionsProcessed: 0 };
            }

            const inputs = [];
            let totalFeesExpected = 0;

            for (const session of completedSessions) {
                const feeAmount = session.metadata.feeRemaining || 0;
                if (feeAmount <= 0) continue;

                const localWallet = walletService.generateLocalAddress(cryptocurrency, session.addressIndex);
                logger.debug(`[Fee Collection] Checking UTXOs for ${localWallet.address}...`);
                const utxoResult = await batchTransactionService.getUTXOs(cryptocurrency, localWallet.address);

                if (utxoResult.success && utxoResult.utxos.length > 0) {
                    inputs.push({
                        address: localWallet.address,
                        privateKey: localWallet.privateKey,
                        utxos: utxoResult.utxos,
                        sessionId: session.id
                    });
                    totalFeesExpected += utxoResult.balance;
                    logger.debug(`[Fee Collection] Added ${localWallet.address}: ${utxoResult.balance} sats`);
                }
            }

            if (inputs.length === 0) {
                logger.warn('[Fee Collection] No valid UTXOs found to collect');
                return { success: false, error: 'No valid UTXOs found' };
            }

            logger.info(`[Fee Collection] Building batch TX with ${inputs.length} inputs...`);
            const txResult = await batchTransactionService.createBatchTransaction(
                cryptocurrency,
                inputs,
                feeCollectionAddress,
                1
            );

            if (!txResult.success) return { success: false, error: txResult.error };

            logger.info(`[Fee Collection] Broadcasting batch transaction...`);
            const broadcastResult = await batchTransactionService.broadcastTransaction(cryptocurrency, txResult.txHex);

            if (!broadcastResult.success) return { success: false, error: broadcastResult.error };

            // Mark all sessions as fees collected
            for (const input of inputs) {
                paymentSessionManager.updateSession(input.sessionId, {
                    metadata: {
                        feesCollected: true,
                        feeCollectionTxHash: broadcastResult.txHash,
                        feeCollectedAt: new Date().toISOString(),
                        batchCollection: true
                    }
                });
            }

            const totalCollected = txResult.output / 1e8;
            const networkFee = txResult.fee / 1e8;

            logger.info(`[Fee Collection] ✓ SUCCESS - TX: ${broadcastResult.txHash}`);
            logger.info(`[Fee Collection] Total: ${totalCollected} ${cryptocurrency.toUpperCase()}, Fee: ${networkFee}`);

            return {
                success: true,
                txHash: broadcastResult.txHash,
                totalCollected,
                networkFee,
                sessionsProcessed: inputs.length,
                collectionMethod: 'batch'
            };

        } catch (error) {
            logger.error(`[Fee Collection] Error: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Sequential fee collection for Ethereum (one transaction per address)
     */
    async collectFeesSequential(cryptocurrency, feeCollectionAddress) {
        logger.info(`[Fee Collection] Mode: SEQUENTIAL`);

        try {
            const allSessions = paymentSessionManager.getAllSessions();
            const completedSessions = allSessions.filter(s =>
                s.cryptocurrency === cryptocurrency &&
                s.status === 'completed' &&
                s.metadata?.autoForwarded === true &&
                !s.metadata?.feesCollected
            );

            logger.info(`[Fee Collection] Found ${completedSessions.length} sessions with uncollected fees`);

            if (completedSessions.length === 0) {
                return { success: true, message: 'No fees to collect', totalCollected: 0, sessionsProcessed: 0 };
            }

            const results = [];
            let totalFeesCollected = 0;
            let totalGasPaid = 0;

            for (const session of completedSessions) {
                const feeAmount = session.metadata.feeRemaining || 0;
                if (feeAmount <= 0) continue;

                logger.info(`[Fee Collection] Collecting ${feeAmount} from ${session.id}...`);
                const localWallet = walletService.generateLocalAddress(cryptocurrency, session.addressIndex);

                const result = await addressService.sendTransaction(
                    cryptocurrency,
                    localWallet.privateKey,
                    feeCollectionAddress,
                    feeAmount
                );

                if (result.success) {
                    logger.info(`[Fee Collection] ✓ SUCCESS - TX: ${result.txHash}`);
                    totalFeesCollected += feeAmount;
                    totalGasPaid += result.fees || 0;

                    paymentSessionManager.updateSession(session.id, {
                        metadata: {
                            feesCollected: true,
                            feeCollectionTxHash: result.txHash,
                            feeCollectedAt: new Date().toISOString(),
                            batchCollection: false
                        }
                    });

                    results.push({ sessionId: session.id, success: true, amount: feeAmount, txHash: result.txHash });
                } else {
                    logger.error(`[Fee Collection] ✗ FAILED for ${session.id}: ${result.error}`);
                    results.push({ sessionId: session.id, success: false, error: result.error });
                }
            }

            const successCount = results.filter(r => r.success).length;
            logger.info(`[Fee Collection] ✓ Complete - Collected: ${totalFeesCollected}, Gas: ${totalGasPaid}`);

            return {
                success: true,
                totalCollected: totalFeesCollected,
                totalGasPaid,
                sessionsProcessed: completedSessions.length,
                successfulTransactions: successCount,
                collectionMethod: 'sequential',
                results
            };

        } catch (error) {
            logger.error(`[Fee Collection] Error: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
}

export const forwardingService = new ForwardingService();
export default forwardingService;
