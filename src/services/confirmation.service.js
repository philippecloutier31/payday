import { paymentSessionManager } from './payment-session.service.js';
import config from '../config/env.js';

/**
 * Transaction Confirmation Service
 * 
 * Handles processing of transaction confirmations and determines
 * when a payment should be considered complete.
 * 
 * Confirmation Thresholds:
 * - BTC: Default 3 confirmations (~30 minutes)
 * - ETH: Default 12 confirmations (~3 minutes)
 * 
 * These can be configured via environment variables.
 */
class ConfirmationService {
    constructor() {
        this.confirmationThresholds = {
            btc: config.BTC_CONFIRMATIONS_REQUIRED,
            eth: config.ETH_CONFIRMATIONS_REQUIRED
        };

        // Callbacks for different events
        this.eventHandlers = {
            onPaymentDetected: [],
            onConfirmationUpdate: [],
            onPaymentConfirmed: [],
            onPaymentCompleted: [],
            onPaymentFailed: []
        };
    }

    /**
     * Register an event handler
     * 
     * @param {string} event - Event name
     * @param {Function} handler - Handler function
     */
    on(event, handler) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event].push(handler);
        }
    }

    /**
     * Emit an event to all handlers
     * 
     * @param {string} event - Event name
     * @param {Object} data - Event data
     */
    async emit(event, data) {
        const handlers = this.eventHandlers[event] || [];
        console.log(`[DEBUG] Emitting event: ${event} (${handlers.length} handlers)`);
        for (const handler of handlers) {

            try {
                await handler(data);
            } catch (error) {
                console.error(`Error in ${event} handler:`, error);
            }
        }
    }

    /**
     * Process an incoming transaction from BlockCypher webhook
     * 
     * @param {Object} txData - Transaction data from webhook
     * @returns {Object} Processing result
     */
    async processTransaction(txData) {
        const {
            sessionId,
            txHash,
            confirmations,
            outputs,
            total,
            received,
            blockHeight,
            rawPayload
        } = txData;

        console.log(`Processing transaction for session ${sessionId}`);
        console.log(`TX Hash: ${txHash}, Confirmations: ${confirmations}`);

        // Get the session
        const session = paymentSessionManager.getSession(sessionId);
        if (!session) {
            console.error(`Session ${sessionId} not found`);
            return {
                success: false,
                error: 'Session not found',
                status: 'error'
            };
        }

        // Check if session is in a valid state for updates
        if (['completed', 'cancelled', 'expired', 'failed'].includes(session.status)) {
            console.log(`Session ${sessionId} is in terminal state: ${session.status}`);
            return {
                success: true,
                message: `Session already in terminal state: ${session.status}`,
                status: session.status
            };
        }

        // Calculate received amount from outputs
        const amount = this.calculateReceivedAmount(session, outputs, total, received);

        // Handle based on confirmation count
        if (confirmations === 0) {
            // Transaction detected but unconfirmed
            return await this.handleUnconfirmedTransaction(session, txHash, amount, rawPayload);
        } else {
            // Transaction has confirmations
            return await this.handleConfirmedTransaction(session, txHash, confirmations, amount, blockHeight, rawPayload);
        }
    }

    /**
     * Calculate the received amount from transaction outputs
     * 
     * @param {Object} session - Payment session
     * @param {Array} outputs - Transaction outputs
     * @param {number} total - Total transaction value (from BlockCypher)
     * @param {number} received - Received value (from BlockCypher)
     * @returns {number} Received amount in crypto units
     */
    calculateReceivedAmount(session, outputs, total, received) {
        // If BlockCypher provides received amount directly, use it
        if (received !== undefined && received !== null) {
            const divisor = (session.cryptocurrency.startsWith('btc') || session.cryptocurrency.startsWith('bcy')) ? 1e8 : 1e18;
            return received / divisor;
        }

        // Otherwise, calculate from outputs
        if (outputs && Array.isArray(outputs)) {
            const divisor = (session.cryptocurrency.startsWith('btc') || session.cryptocurrency.startsWith('bcy')) ? 1e8 : 1e18;
            let totalReceived = 0;

            for (const output of outputs) {
                // Check if this output is to our payment address
                if (output.addresses && output.addresses.includes(session.paymentAddress)) {
                    totalReceived += output.value || 0;
                }
            }

            return totalReceived / divisor;
        }

        // Fallback to total
        if (total !== undefined && total !== null) {
            const divisor = (session.cryptocurrency.startsWith('btc') || session.cryptocurrency.startsWith('bcy')) ? 1e8 : 1e18;
            return total / divisor;
        }

        return 0;
    }

    /**
     * Handle unconfirmed transaction (detected in mempool)
     * 
     * @param {Object} session - Payment session
     * @param {string} txHash - Transaction hash
     * @param {number} amount - Received amount
     * @param {Object} rawPayload - Raw webhook payload
     * @returns {Object} Processing result
     */
    async handleUnconfirmedTransaction(session, txHash, amount, rawPayload) {
        console.log(`Unconfirmed transaction detected for session ${session.id}`);
        console.log(`Amount: ${amount} ${session.cryptocurrency.toUpperCase()}`);

        // Update session with transaction details
        paymentSessionManager.markPaymentDetected(session.id, {
            txHash,
            amount
        });

        // Emit event
        await this.emit('onPaymentDetected', {
            sessionId: session.id,
            userId: session.userId,
            txHash,
            amount,
            cryptocurrency: session.cryptocurrency,
            rawPayload
        });

        return {
            success: true,
            status: 'detected',
            message: 'Transaction detected, waiting for confirmations',
            txHash,
            amount,
            confirmations: 0,
            requiredConfirmations: session.requiredConfirmations
        };
    }

    /**
     * Handle transaction with confirmations
     * 
     * @param {Object} session - Payment session
     * @param {string} txHash - Transaction hash
     * @param {number} confirmations - Current confirmation count
     * @param {number} amount - Received amount
     * @param {number} blockHeight - Block height
     * @param {Object} rawPayload - Raw webhook payload
     * @returns {Object} Processing result
     */
    async handleConfirmedTransaction(session, txHash, confirmations, amount, blockHeight, rawPayload) {
        console.log(`Transaction confirmation update for session ${session.id}`);
        console.log(`Confirmations: ${confirmations}/${session.requiredConfirmations}`);

        // Update session
        const updatedSession = paymentSessionManager.updateConfirmations(session.id, confirmations, {
            blockHeight,
            txHash
        });

        // Also update amount if not set
        if (!session.receivedAmount && amount > 0) {
            paymentSessionManager.updateSession(session.id, { receivedAmount: amount });
        }

        // Emit confirmation update event
        await this.emit('onConfirmationUpdate', {
            sessionId: session.id,
            userId: session.userId,
            txHash,
            confirmations,
            requiredConfirmations: session.requiredConfirmations,
            cryptocurrency: session.cryptocurrency,
            amount: amount || session.receivedAmount
        });

        // Check if we've reached required confirmations
        if (confirmations >= session.requiredConfirmations) {
            return await this.handlePaymentConfirmed(updatedSession || session, txHash, confirmations, amount || session.receivedAmount, rawPayload);
        }

        return {
            success: true,
            status: 'confirming',
            message: `Transaction confirming (${confirmations}/${session.requiredConfirmations})`,
            txHash,
            confirmations,
            requiredConfirmations: session.requiredConfirmations,
            amount: amount || session.receivedAmount
        };
    }

    /**
     * Handle payment that has reached required confirmations
     * 
     * @param {Object} session - Payment session
     * @param {string} txHash - Transaction hash
     * @param {number} confirmations - Confirmation count
     * @param {number} amount - Received amount
     * @param {Object} rawPayload - Raw webhook payload
     * @returns {Object} Processing result
     */
    async handlePaymentConfirmed(session, txHash, confirmations, amount, rawPayload) {
        console.log(`Payment confirmed for session ${session.id}!`);
        console.log(`Amount: ${amount} ${session.cryptocurrency.toUpperCase()}`);

        // Emit confirmed event
        await this.emit('onPaymentConfirmed', {
            sessionId: session.id,
            userId: session.userId,
            txHash,
            confirmations,
            amount,
            cryptocurrency: session.cryptocurrency,
            paymentAddress: session.paymentAddress,
            metadata: session.metadata
        });

        // Mark session as completed
        // In a real implementation, you would:
        // 1. Update user balance in database
        // 2. Create a transaction record
        // 3. Send notification to user
        // 4. Then mark as completed

        const completionData = {
            finalAmount: amount,
            finalConfirmations: confirmations,
            txHash
        };

        paymentSessionManager.markCompleted(session.id, completionData);

        // Emit completed event
        await this.emit('onPaymentCompleted', {
            sessionId: session.id,
            userId: session.userId,
            txHash,
            amount,
            cryptocurrency: session.cryptocurrency,
            paymentAddress: session.paymentAddress,
            forwardingAddress: session.forwardingAddress,
            metadata: session.metadata
        });

        return {
            success: true,
            status: 'completed',
            message: 'Payment confirmed and completed',
            txHash,
            confirmations,
            amount,
            sessionId: session.id,
            userId: session.userId
        };
    }

    /**
     * Manually verify a transaction using BlockCypher API
     * Useful for checking status outside of webhooks
     * 
     * @param {string} sessionId - Session ID
     * @returns {Object} Verification result
     */
    async verifyTransaction(sessionId) {
        const session = paymentSessionManager.getSession(sessionId);
        if (!session) {
            return {
                success: false,
                error: 'Session not found'
            };
        }

        if (!session.txHash) {
            return {
                success: false,
                error: 'No transaction hash found for session'
            };
        }

        // Import address service to check transaction
        const { addressService } = await import('./address.service.js');

        // Get address info to check for transactions
        const addressInfo = await addressService.getAddressInfo(
            session.cryptocurrency,
            session.paymentAddress
        );

        if (!addressInfo.success) {
            return {
                success: false,
                error: addressInfo.error
            };
        }

        return {
            success: true,
            session: {
                id: session.id,
                status: session.status,
                confirmations: session.confirmations,
                requiredConfirmations: session.requiredConfirmations
            },
            addressInfo: {
                balance: addressInfo.balance,
                txCount: addressInfo.txCount
            }
        };
    }

    /**
     * Check if an amount matches expected amount (with tolerance)
     * 
     * @param {number} expected - Expected amount
     * @param {number} received - Received amount
     * @param {number} tolerance - Tolerance percentage (default: 1%)
     * @returns {Object} Match result
     */
    checkAmountMatch(expected, received, tolerance = 0.01) {
        if (!expected || expected <= 0) {
            // No expected amount set, any amount is valid
            return {
                match: true,
                exact: false,
                difference: 0,
                differencePercent: 0
            };
        }

        const difference = received - expected;
        const differencePercent = Math.abs(difference) / expected;

        // Check if within tolerance
        const match = differencePercent <= tolerance || received >= expected;

        return {
            match,
            exact: difference === 0,
            difference,
            differencePercent,
            underpaid: received < expected,
            overpaid: received > expected
        };
    }

    /**
     * Get confirmation threshold for a cryptocurrency
     * 
     * @param {string} crypto - 'btc' or 'eth'
     * @returns {number} Required confirmations
     */
    getConfirmationThreshold(crypto) {
        return this.confirmationThresholds[crypto] || this.confirmationThresholds.btc;
    }

    /**
     * Estimate time to confirmation based on crypto type
     * 
     * @param {string} crypto - 'btc' or 'eth'
     * @param {number} currentConfirmations - Current confirmation count
     * @returns {Object} Time estimate
     */
    estimateConfirmationTime(crypto, currentConfirmations = 0) {
        const required = this.getConfirmationThreshold(crypto);
        const remaining = Math.max(0, required - currentConfirmations);

        // Average block times
        const blockTimes = {
            btc: 10 * 60, // 10 minutes
            eth: 15       // 15 seconds
        };

        const blockTime = blockTimes[crypto] || blockTimes.btc;
        const estimatedSeconds = remaining * blockTime;

        return {
            currentConfirmations,
            requiredConfirmations: required,
            remainingConfirmations: remaining,
            estimatedSeconds,
            estimatedMinutes: Math.ceil(estimatedSeconds / 60),
            blockTimeSeconds: blockTime
        };
    }
}

// Export singleton instance
export const confirmationService = new ConfirmationService();
export default confirmationService;
