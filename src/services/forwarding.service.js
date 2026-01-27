import { confirmationService } from './confirmation.service.js';
import { walletService } from './wallet.service.js';
import { addressService } from './address.service.js';
import { paymentSessionManager } from './payment-session.service.js';
import config from '../config/env.js';

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
            console.log(`✓ Forwarding Service: ACTIVE (${this.percentage * 100}% auto-forward, ${(1 - this.percentage) * 100}% fees remain)`);
            this.init();
        } else {
            console.log('○ Forwarding Service: DISABLED');
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

        console.log(`\n[Auto-Forward] Payment completed for session ${sessionId}`);
        console.log(`[Auto-Forward] Amount: ${amount} ${cryptocurrency.toUpperCase()}`);

        if (!this.enabled) {
            console.log('[Auto-Forward] Service is disabled. Skipping.');
            return;
        }

        if (!forwardingAddress) {
            console.warn(`[Auto-Forward] No forwarding address configured. Skipping.`);
            return;
        }

        try {
            // 1. Get the session to find the derivation index
            const session = paymentSessionManager.getSession(sessionId);
            if (!session || session.addressIndex === null) {
                throw new Error('Session or address index not found');
            }

            // 2. Determine if we should take a fee based on payment size
            // For now, we use a simple heuristic: if expectedAmount was set and is below threshold
            // In production, you'd fetch real-time USD prices
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
                console.log(`[Auto-Forward] Payment ≥ $${config.MINIMUM_FEE_THRESHOLD_USD} - Taking ${feePercentage}% fee`);
            } else {
                // Small payment: Forward 100% (no fee)
                amountToForward = amount;
                feeAmount = 0;
                feePercentage = 0;
                console.log(`[Auto-Forward] Payment < $${config.MINIMUM_FEE_THRESHOLD_USD} - No fee (100% forward)`);
            }

            // 3. Regenerate the local wallet to get the private key
            const localWallet = walletService.generateLocalAddress(cryptocurrency, session.addressIndex);

            console.log(`[Auto-Forward] Forwarding ${amountToForward} ${cryptocurrency.toUpperCase()} (${100 - feePercentage}%)`);
            if (feeAmount > 0) {
                console.log(`[Auto-Forward] Fee remaining: ${feeAmount} ${cryptocurrency.toUpperCase()} (${feePercentage}%)`);
            }
            console.log(`[Auto-Forward] From: ${paymentAddress}`);
            console.log(`[Auto-Forward] To: ${forwardingAddress}`);

            // 4. Send the transaction
            const result = await addressService.sendTransaction(
                cryptocurrency,
                localWallet.privateKey,
                forwardingAddress,
                amountToForward
            );

            if (result.success) {
                console.log(`[Auto-Forward] ✓ SUCCESS!`);
                console.log(`[Auto-Forward] TX Hash: ${result.txHash}`);
                console.log(`[Auto-Forward] Network Fees: ${result.fees} ${cryptocurrency.toUpperCase()}`);

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
                console.error(`[Auto-Forward] ✗ FAILED: ${result.error}`);

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
            console.error(`[Auto-Forward] ✗ ERROR:`, error.message);
        }
    }

    /**
     * Collect all accumulated fees from used addresses in a SINGLE transaction
     * This pays network fees only ONCE regardless of how many addresses have fees
     * (Bitcoin/BCY only - uses batch transactions)
     */
    async collectAllFees(cryptocurrency) {
        console.log(`\n[Fee Collection] Starting fee collection for ${cryptocurrency.toUpperCase()}...`);

        const feeCollectionAddress = config.FEE_COLLECTION_ADDRESS;
        if (!feeCollectionAddress) {
            return {
                success: false,
                error: 'FEE_COLLECTION_ADDRESS not configured in .env'
            };
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
        console.log(`[Fee Collection] Using BATCH mode (single network fee)`);

        try {
            // Import the batch transaction service
            const { batchTransactionService } = await import('./batch-transaction.service.js');

            // Get all completed sessions for this cryptocurrency
            const allSessions = paymentSessionManager.getAllSessions();
            const completedSessions = allSessions.filter(s =>
                s.cryptocurrency === cryptocurrency &&
                s.status === 'completed' &&
                s.metadata?.autoForwarded === true &&
                !s.metadata?.feesCollected
            );

            console.log(`[Fee Collection] Found ${completedSessions.length} sessions with uncollected fees`);

            if (completedSessions.length === 0) {
                return {
                    success: true,
                    message: 'No fees to collect',
                    totalCollected: 0,
                    sessionsProcessed: 0
                };
            }

            // Prepare inputs for batch transaction
            const inputs = [];
            let totalFeesExpected = 0;

            for (const session of completedSessions) {
                const feeAmount = session.metadata.feeRemaining || 0;

                if (feeAmount <= 0) {
                    console.log(`[Fee Collection] Skipping session ${session.id} (no fees)`);
                    continue;
                }

                // Regenerate the wallet to get the private key
                const localWallet = walletService.generateLocalAddress(cryptocurrency, session.addressIndex);

                // Fetch UTXOs for this address
                console.log(`[Fee Collection] Fetching UTXOs for ${localWallet.address}...`);
                const utxoResult = await batchTransactionService.getUTXOs(cryptocurrency, localWallet.address);

                if (utxoResult.success && utxoResult.utxos.length > 0) {
                    inputs.push({
                        address: localWallet.address,
                        privateKey: localWallet.privateKey,
                        utxos: utxoResult.utxos,
                        sessionId: session.id
                    });
                    totalFeesExpected += utxoResult.balance;
                    console.log(`[Fee Collection] Added ${localWallet.address}: ${utxoResult.balance} sats`);
                } else {
                    console.warn(`[Fee Collection] No UTXOs found for ${localWallet.address}`);
                }
            }

            if (inputs.length === 0) {
                return {
                    success: false,
                    error: 'No valid UTXOs found to collect'
                };
            }

            console.log(`[Fee Collection] Creating batch transaction with ${inputs.length} inputs...`);
            console.log(`[Fee Collection] Total fees to collect: ${totalFeesExpected} sats`);

            // Create the batch transaction
            const txResult = await batchTransactionService.createBatchTransaction(
                cryptocurrency,
                inputs,
                feeCollectionAddress,
                1 // 1 sat/byte fee rate
            );

            if (!txResult.success) {
                return {
                    success: false,
                    error: txResult.error
                };
            }

            // Broadcast the transaction
            console.log(`[Fee Collection] Broadcasting transaction...`);
            const broadcastResult = await batchTransactionService.broadcastTransaction(
                cryptocurrency,
                txResult.txHex
            );

            if (!broadcastResult.success) {
                return {
                    success: false,
                    error: `Failed to broadcast: ${broadcastResult.error}`
                };
            }

            // Mark all sessions as fees collected
            console.log(`[Fee Collection] Marking ${inputs.length} sessions as collected...`);
            for (const input of inputs) {
                const session = completedSessions.find(s => s.id === input.sessionId);
                if (session) {
                    paymentSessionManager.updateSession(session.id, {
                        metadata: {
                            ...session.metadata,
                            feesCollected: true,
                            feeCollectionTxHash: broadcastResult.txHash,
                            feeCollectedAt: new Date().toISOString(),
                            batchCollection: true
                        }
                    });
                }
            }

            const totalCollected = txResult.output / 1e8; // Convert sats to BTC
            const networkFee = txResult.fee / 1e8;

            console.log(`[Fee Collection] ✓ SUCCESS!`);
            console.log(`[Fee Collection] TX Hash: ${broadcastResult.txHash}`);
            console.log(`[Fee Collection] Total collected: ${totalCollected} ${cryptocurrency.toUpperCase()}`);
            console.log(`[Fee Collection] Network fee (ONLY ONCE): ${networkFee} ${cryptocurrency.toUpperCase()}`);
            console.log(`[Fee Collection] Addresses consolidated: ${inputs.length}`);

            return {
                success: true,
                txHash: broadcastResult.txHash,
                totalCollected,
                networkFee,
                sessionsProcessed: inputs.length,
                inputCount: txResult.inputCount,
                collectionMethod: 'batch',
                message: `Collected ${totalCollected} ${cryptocurrency.toUpperCase()} from ${inputs.length} addresses with single network fee of ${networkFee}`
            };

        } catch (error) {
            console.error('[Fee Collection] Error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Sequential fee collection for Ethereum (one transaction per address)
     */
    async collectFeesSequential(cryptocurrency, feeCollectionAddress) {
        console.log(`[Fee Collection] Using SEQUENTIAL mode (separate gas fee per address)`);

        try {
            // Get all completed sessions for this cryptocurrency
            const allSessions = paymentSessionManager.getAllSessions();
            const completedSessions = allSessions.filter(s =>
                s.cryptocurrency === cryptocurrency &&
                s.status === 'completed' &&
                s.metadata?.autoForwarded === true &&
                !s.metadata?.feesCollected
            );

            console.log(`[Fee Collection] Found ${completedSessions.length} sessions with uncollected fees`);

            if (completedSessions.length === 0) {
                return {
                    success: true,
                    message: 'No fees to collect',
                    totalCollected: 0,
                    sessionsProcessed: 0
                };
            }

            const results = [];
            let totalFeesCollected = 0;
            let totalGasPaid = 0;

            for (const session of completedSessions) {
                const feeAmount = session.metadata.feeRemaining || 0;

                if (feeAmount <= 0) {
                    console.log(`[Fee Collection] Skipping session ${session.id} (no fees)`);
                    continue;
                }

                console.log(`[Fee Collection] Collecting ${feeAmount} from session ${session.id}...`);

                // Regenerate the wallet to get the private key
                const localWallet = walletService.generateLocalAddress(cryptocurrency, session.addressIndex);

                // Send the fee to the collection address
                const result = await addressService.sendTransaction(
                    cryptocurrency,
                    localWallet.privateKey,
                    feeCollectionAddress,
                    feeAmount
                );

                if (result.success) {
                    console.log(`[Fee Collection] ✓ Collected ${feeAmount} - TX: ${result.txHash}`);
                    totalFeesCollected += feeAmount;
                    totalGasPaid += result.fees || 0;

                    // Mark fees as collected
                    paymentSessionManager.updateSession(session.id, {
                        metadata: {
                            ...session.metadata,
                            feesCollected: true,
                            feeCollectionTxHash: result.txHash,
                            feeCollectedAt: new Date().toISOString(),
                            batchCollection: false
                        }
                    });

                    results.push({
                        sessionId: session.id,
                        success: true,
                        amount: feeAmount,
                        txHash: result.txHash,
                        gasPaid: result.fees || 0
                    });
                } else {
                    console.error(`[Fee Collection] ✗ Failed for session ${session.id}: ${result.error}`);
                    results.push({
                        sessionId: session.id,
                        success: false,
                        error: result.error
                    });
                }
            }

            const successCount = results.filter(r => r.success).length;

            console.log(`[Fee Collection] ✓ Complete!`);
            console.log(`[Fee Collection] Total collected: ${totalFeesCollected} ${cryptocurrency.toUpperCase()}`);
            console.log(`[Fee Collection] Total gas paid: ${totalGasPaid} ${cryptocurrency.toUpperCase()} (${successCount} transactions)`);
            console.log(`[Fee Collection] Success rate: ${successCount}/${completedSessions.length}`);

            return {
                success: true,
                totalCollected: totalFeesCollected,
                totalGasPaid,
                sessionsProcessed: completedSessions.length,
                successfulTransactions: successCount,
                collectionMethod: 'sequential',
                results,
                message: `Collected ${totalFeesCollected} ${cryptocurrency.toUpperCase()} from ${successCount} addresses with total gas of ${totalGasPaid}`
            };

        } catch (error) {
            console.error('[Fee Collection] Error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Export singleton
export const forwardingService = new ForwardingService();
export default forwardingService;
