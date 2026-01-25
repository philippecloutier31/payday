/**
 * Unit tests for Confirmation Service
 */

import { jest } from '@jest/globals';

// Mock the config
jest.unstable_mockModule('../config/env.js', () => ({
    default: {
        BTC_CONFIRMATIONS_REQUIRED: 3,
        ETH_CONFIRMATIONS_REQUIRED: 12,
        SESSION_EXPIRY_MS: 3600000
    },
    BTC_CONFIRMATIONS_REQUIRED: 3,
    ETH_CONFIRMATIONS_REQUIRED: 12,
    SESSION_EXPIRY_MS: 3600000
}));

const { paymentSessionManager } = await import('../services/payment-session.service.js');
const { confirmationService } = await import('../services/confirmation.service.js');

describe('ConfirmationService', () => {
    beforeEach(() => {
        paymentSessionManager.clearAll();
    });

    afterAll(() => {
        paymentSessionManager.stopCleanupInterval();
    });

    describe('getConfirmationThreshold', () => {
        it('should return correct threshold for BTC', () => {
            const threshold = confirmationService.getConfirmationThreshold('btc');
            expect(threshold).toBe(3);
        });

        it('should return correct threshold for ETH', () => {
            const threshold = confirmationService.getConfirmationThreshold('eth');
            expect(threshold).toBe(12);
        });

        it('should return BTC threshold for unknown crypto', () => {
            const threshold = confirmationService.getConfirmationThreshold('unknown');
            expect(threshold).toBe(3);
        });
    });

    describe('estimateConfirmationTime', () => {
        it('should estimate BTC confirmation time correctly', () => {
            const estimate = confirmationService.estimateConfirmationTime('btc', 1);

            expect(estimate.currentConfirmations).toBe(1);
            expect(estimate.requiredConfirmations).toBe(3);
            expect(estimate.remainingConfirmations).toBe(2);
            expect(estimate.blockTimeSeconds).toBe(600); // 10 minutes
            expect(estimate.estimatedSeconds).toBe(1200); // 20 minutes
        });

        it('should estimate ETH confirmation time correctly', () => {
            const estimate = confirmationService.estimateConfirmationTime('eth', 6);

            expect(estimate.remainingConfirmations).toBe(6);
            expect(estimate.blockTimeSeconds).toBe(15);
            expect(estimate.estimatedSeconds).toBe(90);
        });

        it('should return 0 remaining when threshold met', () => {
            const estimate = confirmationService.estimateConfirmationTime('btc', 5);

            expect(estimate.remainingConfirmations).toBe(0);
            expect(estimate.estimatedSeconds).toBe(0);
        });
    });

    describe('checkAmountMatch', () => {
        it('should return match for exact amount', () => {
            const result = confirmationService.checkAmountMatch(1.0, 1.0);

            expect(result.match).toBe(true);
            expect(result.exact).toBe(true);
            expect(result.difference).toBe(0);
        });

        it('should return match for amount within tolerance', () => {
            const result = confirmationService.checkAmountMatch(1.0, 0.995);

            expect(result.match).toBe(true);
            expect(result.exact).toBe(false);
            expect(result.underpaid).toBe(true);
        });

        it('should return no match for amount outside tolerance', () => {
            const result = confirmationService.checkAmountMatch(1.0, 0.9);

            expect(result.match).toBe(false);
            expect(result.underpaid).toBe(true);
        });

        it('should return match for overpayment', () => {
            const result = confirmationService.checkAmountMatch(1.0, 1.5);

            expect(result.match).toBe(true);
            expect(result.overpaid).toBe(true);
        });

        it('should return match when no expected amount', () => {
            const result = confirmationService.checkAmountMatch(null, 0.5);

            expect(result.match).toBe(true);
        });
    });

    describe('calculateReceivedAmount', () => {
        it('should use received value when provided', () => {
            const session = { cryptocurrency: 'btc', paymentAddress: 'addr1' };
            const amount = confirmationService.calculateReceivedAmount(
                session,
                null,
                null,
                50000000 // 0.5 BTC in satoshis
            );

            expect(amount).toBe(0.5);
        });

        it('should calculate from outputs when received not provided', () => {
            const session = { cryptocurrency: 'btc', paymentAddress: 'addr1' };
            const outputs = [
                { addresses: ['addr1'], value: 100000000 },
                { addresses: ['addr2'], value: 50000000 }
            ];

            const amount = confirmationService.calculateReceivedAmount(
                session,
                outputs,
                null,
                null
            );

            expect(amount).toBe(1); // 1 BTC
        });

        it('should use total as fallback', () => {
            const session = { cryptocurrency: 'eth', paymentAddress: 'addr1' };
            const amount = confirmationService.calculateReceivedAmount(
                session,
                null,
                2000000000000000000, // 2 ETH in wei
                null
            );

            expect(amount).toBe(2);
        });

        it('should return 0 when no data available', () => {
            const session = { cryptocurrency: 'btc', paymentAddress: 'addr1' };
            const amount = confirmationService.calculateReceivedAmount(session, null, null, null);

            expect(amount).toBe(0);
        });
    });

    describe('processTransaction', () => {
        it('should handle unconfirmed transaction', async () => {
            const session = paymentSessionManager.createSession({
                userId: 'user123',
                cryptocurrency: 'btc',
                paymentAddress: '1PaymentAddr',
                forwardingAddress: '1MainAddr'
            });

            const result = await confirmationService.processTransaction({
                sessionId: session.id,
                txHash: 'tx123',
                confirmations: 0,
                received: 50000000 // 0.5 BTC
            });

            expect(result.success).toBe(true);
            expect(result.status).toBe('detected');
            expect(result.amount).toBe(0.5);

            const updatedSession = paymentSessionManager.getSession(session.id);
            expect(updatedSession.status).toBe('detected');
            expect(updatedSession.txHash).toBe('tx123');
        });

        it('should handle transaction with partial confirmations', async () => {
            const session = paymentSessionManager.createSession({
                userId: 'user123',
                cryptocurrency: 'btc',
                paymentAddress: '1PaymentAddr',
                forwardingAddress: '1MainAddr'
            });

            const result = await confirmationService.processTransaction({
                sessionId: session.id,
                txHash: 'tx123',
                confirmations: 2,
                received: 50000000
            });

            expect(result.success).toBe(true);
            expect(result.status).toBe('confirming');
            expect(result.confirmations).toBe(2);
            expect(result.requiredConfirmations).toBe(3);

            const updatedSession = paymentSessionManager.getSession(session.id);
            expect(updatedSession.status).toBe('confirming');
            expect(updatedSession.confirmations).toBe(2);
        });

        it('should handle transaction reaching required confirmations', async () => {
            const session = paymentSessionManager.createSession({
                userId: 'user123',
                cryptocurrency: 'btc',
                paymentAddress: '1PaymentAddr',
                forwardingAddress: '1MainAddr'
            });

            const result = await confirmationService.processTransaction({
                sessionId: session.id,
                txHash: 'tx123',
                confirmations: 3,
                received: 50000000
            });

            expect(result.success).toBe(true);
            expect(result.status).toBe('completed');

            const updatedSession = paymentSessionManager.getSession(session.id);
            expect(updatedSession.status).toBe('completed');
            expect(updatedSession.confirmedAt).toBeDefined();
            expect(updatedSession.completedAt).toBeDefined();
        });

        it('should return error for non-existent session', async () => {
            const result = await confirmationService.processTransaction({
                sessionId: 'non-existent',
                txHash: 'tx123',
                confirmations: 1
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe('Session not found');
        });

        it('should ignore updates for completed sessions', async () => {
            const session = paymentSessionManager.createSession({
                userId: 'user123',
                cryptocurrency: 'btc',
                paymentAddress: '1PaymentAddr',
                forwardingAddress: '1MainAddr'
            });

            paymentSessionManager.markCompleted(session.id);

            const result = await confirmationService.processTransaction({
                sessionId: session.id,
                txHash: 'tx123',
                confirmations: 5
            });

            expect(result.success).toBe(true);
            expect(result.status).toBe('completed');
            expect(result.message).toContain('terminal state');
        });

        it('should ignore updates for cancelled sessions', async () => {
            const session = paymentSessionManager.createSession({
                userId: 'user123',
                cryptocurrency: 'btc',
                paymentAddress: '1PaymentAddr',
                forwardingAddress: '1MainAddr'
            });

            paymentSessionManager.updateSession(session.id, { status: 'cancelled' });

            const result = await confirmationService.processTransaction({
                sessionId: session.id,
                txHash: 'tx123',
                confirmations: 1
            });

            expect(result.status).toBe('cancelled');
        });
    });

    describe('event handlers', () => {
        it('should emit onPaymentDetected event', async () => {
            const handler = jest.fn();
            confirmationService.on('onPaymentDetected', handler);

            const session = paymentSessionManager.createSession({
                userId: 'user123',
                cryptocurrency: 'btc',
                paymentAddress: '1PaymentAddr',
                forwardingAddress: '1MainAddr'
            });

            await confirmationService.processTransaction({
                sessionId: session.id,
                txHash: 'tx123',
                confirmations: 0,
                received: 50000000
            });

            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({
                    sessionId: session.id,
                    userId: 'user123',
                    txHash: 'tx123'
                })
            );
        });

        it('should emit onPaymentCompleted event', async () => {
            const handler = jest.fn();
            confirmationService.on('onPaymentCompleted', handler);

            const session = paymentSessionManager.createSession({
                userId: 'user123',
                cryptocurrency: 'btc',
                paymentAddress: '1PaymentAddr',
                forwardingAddress: '1MainAddr'
            });

            await confirmationService.processTransaction({
                sessionId: session.id,
                txHash: 'tx123',
                confirmations: 3,
                received: 50000000
            });

            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({
                    sessionId: session.id,
                    userId: 'user123',
                    cryptocurrency: 'btc'
                })
            );
        });
    });
});
