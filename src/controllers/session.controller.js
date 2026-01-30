import { paymentSessionManager } from '../services/payment-session.service.js';
import { webhookService } from '../services/webhook.service.js';
import { addressService } from '../services/address.service.js';

/**
 * Get a payment session by ID
 */
export const getSession = async (req, res, next) => {
    try {
        const { id } = req.params;

        const session = paymentSessionManager.getSession(id);

        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }

        // Calculate payment ready status
        // Payment is ready only if status is completed AND no partial payment issues
        const isPaymentReady = session.status === 'completed' &&
            !session.metadata?.partialPayment &&
            !session.metadata?.amountMismatch;

        // For sessions with partial payments, override status to 'detecting'
        // This prevents production server from seeing 'completed' status
        const displayStatus = session.metadata?.partialPayment ? 'detecting' : session.status;

        res.json({
            success: true,
            data: {
                ...session,
                status: displayStatus,
                paymentReady: isPaymentReady
            }
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Get all payment sessions (for debugging/admin)
 */
export const getAllSessions = async (req, res, next) => {
    try {
        const { status, userId } = req.query;

        let sessions = paymentSessionManager.getAllSessions();

        // Filter by status if provided
        if (status) {
            sessions = sessions.filter(s => s.status === status);
        }

        // Filter by userId if provided
        if (userId) {
            sessions = sessions.filter(s => s.userId === userId);
        }

        res.json({
            success: true,
            data: sessions,
            count: sessions.length
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Cancel a payment session
 */
export const cancelSession = async (req, res, next) => {
    try {
        const { id } = req.params;

        const session = paymentSessionManager.getSession(id);

        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }

        // Can only cancel pending sessions
        if (session.status !== 'pending') {
            return res.status(400).json({
                success: false,
                error: `Cannot cancel session with status: ${session.status}`
            });
        }

        // Delete the webhook if it exists
        if (session.webhookId) {
            await webhookService.deleteWebhook(session.cryptocurrency, session.webhookId);
        }

        // Delete the forwarding address if it exists
        if (session.forwardingId) {
            await addressService.deleteForwardingAddress(session.cryptocurrency, session.forwardingId);
        }

        // Update session status
        paymentSessionManager.updateSession(id, {
            status: 'cancelled',
            cancelledAt: new Date().toISOString()
        });

        res.json({
            success: true,
            message: 'Session cancelled successfully'
        });

    } catch (error) {
        next(error);
    }
};
