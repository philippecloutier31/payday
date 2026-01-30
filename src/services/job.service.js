import { paymentSessionManager } from './payment-session.service.js';
import { confirmationService } from './confirmation.service.js';
import { forwardingService } from './forwarding.service.js';
import logger from '../utils/logger.js';

/**
 * Background Job Service
 * Handles periodic tasks like checking for missed webhooks
 */
class JobService {
    constructor() {
        this.checkInterval = 60000; // 1 minute
        this.intervalId = null;
    }

    startParams() {
        if (this.intervalId) return;

        logger.info('[JobService] Starting background polling service...');
        this.intervalId = setInterval(() => this.checkPendingSessions(), this.checkInterval);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    /**
     * Check all pending/confirming sessions for updates
     * This acts as a fallback if webhooks are missed
     */
    async checkPendingSessions() {
        try {
            logger.info('[JobService] Starting session check...');

            const sessions = paymentSessionManager.getAllSessions();
            const activeSessions = sessions.filter(s =>
                s.status === 'pending' || s.status === 'detected' || s.status === 'confirming'
            );

            logger.info(`[JobService] Found ${activeSessions.length} active sessions to check`);

            if (activeSessions.length === 0) {
                logger.debug('[JobService] No active sessions, skipping verification');
            } else {
                logger.debug(`[JobService] Checking ${activeSessions.length} active sessions...`);

                for (const session of activeSessions) {
                    // If it has a TX hash, we can verify it directly
                    if (session.txHash) {
                        logger.debug(`[JobService] Verifying session ${session.id}...`);
                        await this.verifySession(session);
                    }
                }
            }

            logger.info('[JobService] Session check completed');
        } catch (error) {
            logger.error(`[JobService] Error in session polling: ${error.message}`);
        }

        // Also check for failed forwardings
        await this.retryFailedForwardings();
    }

    /**
     * Retry any sessions that failed their auto-forwarding
     */
    async retryFailedForwardings() {
        try {
            const sessions = paymentSessionManager.getAllSessions();
            const failedSessions = sessions.filter(s =>
                s.status === 'completed' &&
                s.metadata?.autoForwardFailed === true &&
                s.metadata?.autoForwarded !== true // CRITICAL FIX: Don't retry if it eventually succeeded
            );

            if (failedSessions.length === 0) return;

            logger.info(`[JobService] Found ${failedSessions.length} sessions with failed forwarding. Retrying...`);

            for (const session of failedSessions) {
                // Clear the error flag first to prevent infinite loop if it fails again instantly
                // The forwarding service will re-set it if it fails again
                await forwardingService.processForwarding({
                    sessionId: session.id,
                    cryptocurrency: session.cryptocurrency,
                    amount: session.finalAmount || session.receivedAmount,
                    paymentAddress: session.paymentAddress,
                    forwardingAddress: session.forwardingAddress,
                    userId: session.userId,
                    metadata: session.metadata
                });
            }
        } catch (error) {
            logger.error(`[JobService] Error in forwarding retry: ${error.message}`);
        }
    }

    async verifySession(session) {
        try {
            // Use the confirmation service's verification logic
            const result = await confirmationService.verifyTransaction(session.id);

            if (result.success && result.session) {
                const currentFn = result.session.confirmations || 0;

                logger.debug(`[JobService] Verify result for ${session.id}: ${currentFn} confs (Local knows: ${session.confirmations})`);

                // If we found more confirmations than we knew about, update!
                if (currentFn > session.confirmations) {
                    logger.info(`[JobService] Found update for ${session.id}: ${session.confirmations} -> ${currentFn} confirmations`);

                    // Trigger the same logic as if a webhook arrived
                    await confirmationService.processTransaction({
                        sessionId: session.id,
                        txHash: session.txHash,
                        confirmations: currentFn,
                        // We don't have full payload but we have what matters
                        blockHeight: result.addressInfo?.block_height
                    });
                }
            }
        } catch (error) {
            // Ignore errors for individual sessions to keep loop running
            // logger.warn(`[JobService] Failed to verify ${session.id}: ${error.message}`);
        }
    }
}

export const jobService = new JobService();
export default jobService;
