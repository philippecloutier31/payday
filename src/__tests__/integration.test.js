/**
 * Integration tests for the complete payment flow
 * Tests the full lifecycle from address creation to payment confirmation
 */

import { jest } from '@jest/globals';
import express from 'express';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock the config
jest.unstable_mockModule('../config/env.js', () => ({
    default: {
        BLOCKCYPHER_API_URL: 'https://api.blockcypher.com/v1',
        BLOCKCYPHER_API_TOKEN: 'test-token',
        WEBHOOK_BASE_URL: 'https://example.com',
        BTC_CONFIRMATIONS_REQUIRED: 3,
        ETH_CONFIRMATIONS_REQUIRED: 12,
        SESSION_EXPIRY_MS: 3600000,
        BTC_MAIN_ADDRESS: '1MainBTCAddress',
        ETH_MAIN_ADDRESS: '0xMainETHAddress',
        NODE_ENV: 'test',
        PORT: 3001
    },
    BLOCKCYPHER_API_URL: 'https://api.blockcypher.com/v1',
    BLOCKCYPHER_API_TOKEN: 'test-token',
    WEBHOOK_BASE_URL: 'https://example.com',
    BTC_CONFIRMATIONS_REQUIRED: 3,
    ETH_CONFIRMATIONS_REQUIRED: 12,
    SESSION_EXPIRY_MS: 3600000,
    BTC_MAIN_ADDRESS: '1MainBTCAddress',
    ETH_MAIN_ADDRESS: '0xMainETHAddress',
    NODE_ENV: 'test',
    PORT: 3001
}));

// Mock node-fetch
jest.unstable_mockModule('node-fetch', () => ({
    default: mockFetch
}));

// Import modules after mocking
const { paymentSessionManager } = await import('../services/payment-session.service.js');
const { confirmationService } = await import('../services/confirmation.service.js');

// Create a test app
const createTestApp = async () => {
    const { default: addressRoutes } = await import('../routes/address.routes.js');
    const { default: sessionRoutes } = await import('../routes/session.routes.js');
    const { default: webhookRoutes } = await import('../routes/webhook.routes.js');

    const app = express();
    app.use(express.json());
    app.use('/address', addressRoutes);
    app.use('/session', sessionRoutes);
    app.use('/webhook', webhookRoutes);

    // Error handler
    app.use((err, req, res, next) => {
        res.status(err.status || 500).json({
            success: false,
            error: err.message
        });
    });

    return app;
};

// Helper to make requests
const makeRequest = (app, method, path, body = null) => {
    return new Promise((resolve) => {
        const req = {
            method,
            url: path,
            body,
            headers: { 'content-type': 'application/json' }
        };

        const res = {
            statusCode: 200,
            body: null,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(data) {
                this.body = data;
                resolve({ status: this.statusCode, body: data });
            }
        };

        // Simple router simulation
        const mockReq = {
            ...req,
            params: {},
            query: {}
        };

        // Extract params from path
        const pathMatch = path.match(/\/session\/([^/]+)/);
        if (pathMatch) {
            mockReq.params.id = pathMatch[1];
        }

        app.handle({ method, url: path, body, headers: {} }, res, () => {});
    });
};

describe('Payment Gateway Integration Tests', () => {
    let app;
    let createdSessionId;
    let paymentAddress;

    beforeAll(async () => {
        app = await createTestApp();
    });

    beforeEach(() => {
        paymentSessionManager.clearAll();
        mockFetch.mockClear();
    });

    afterAll(() => {
        paymentSessionManager.stopCleanupInterval();
    });

    describe('Complete BTC Payment Flow', () => {
        it('Step 1: Should create a payment address', async () => {
            // Mock BlockCypher create forwarding address
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    id: 'forward-btc-123',
                    input_address: '1TempPaymentAddress',
                    destination: '1MainBTCAddress',
                    callback_url: 'https://example.com/webhook/blockcypher'
                })
            });

            // Mock webhook registration
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    id: 'webhook-btc-123',
                    event: 'tx-confirmation',
                    address: '1TempPaymentAddress',
                    confirmations: 3
                })
            });

            // Simulate the address creation flow
            const { addressService } = await import('../services/address.service.js');
            const { webhookService } = await import('../services/webhook.service.js');

            // Create forwarding address
            const forwardResult = await addressService.createForwardingAddress('btc', '1MainBTCAddress');
            expect(forwardResult.success).toBe(true);
            expect(forwardResult.inputAddress).toBe('1TempPaymentAddress');

            // Create session
            const session = paymentSessionManager.createSession({
                userId: 'user123',
                cryptocurrency: 'btc',
                paymentAddress: forwardResult.inputAddress,
                forwardingAddress: '1MainBTCAddress',
                forwardingId: forwardResult.id,
                expectedAmount: 0.5,
                metadata: { orderId: 'order-123' }
            });

            createdSessionId = session.id;
            paymentAddress = forwardResult.inputAddress;

            expect(session.status).toBe('pending');
            expect(session.paymentAddress).toBe('1TempPaymentAddress');

            // Register webhook
            const webhookResult = await webhookService.registerAddressWebhook(
                'btc',
                forwardResult.inputAddress,
                session.id
            );
            expect(webhookResult.success).toBe(true);

            // Update session with webhook ID
            paymentSessionManager.updateSession(session.id, {
                webhookId: webhookResult.webhookId
            });

            const updatedSession = paymentSessionManager.getSession(session.id);
            expect(updatedSession.webhookId).toBe('webhook-btc-123');
        });

        it('Step 2: Should handle unconfirmed transaction webhook', async () => {
            // Create a session first
            const session = paymentSessionManager.createSession({
                userId: 'user123',
                cryptocurrency: 'btc',
                paymentAddress: '1TempPaymentAddress',
                forwardingAddress: '1MainBTCAddress'
            });

            // Simulate webhook payload for unconfirmed transaction
            const webhookPayload = {
                event: 'unconfirmed-tx',
                hash: 'tx-hash-123',
                addresses: ['1TempPaymentAddress', '1SenderAddress'],
                confirmations: 0,
                outputs: [
                    { addresses: ['1TempPaymentAddress'], value: 50000000 } // 0.5 BTC
                ],
                received: 50000000
            };

            // Process the webhook
            const result = await confirmationService.processTransaction({
                sessionId: session.id,
                txHash: webhookPayload.hash,
                confirmations: webhookPayload.confirmations,
                outputs: webhookPayload.outputs,
                received: webhookPayload.received
            });

            expect(result.success).toBe(true);
            expect(result.status).toBe('detected');
            expect(result.amount).toBe(0.5);

            const updatedSession = paymentSessionManager.getSession(session.id);
            expect(updatedSession.status).toBe('detected');
            expect(updatedSession.txHash).toBe('tx-hash-123');
            expect(updatedSession.receivedAmount).toBe(0.5);
        });

        it('Step 3: Should handle confirmation updates', async () => {
            // Create and detect a session
            const session = paymentSessionManager.createSession({
                userId: 'user123',
                cryptocurrency: 'btc',
                paymentAddress: '1TempPaymentAddress',
                forwardingAddress: '1MainBTCAddress'
            });

            paymentSessionManager.markPaymentDetected(session.id, {
                txHash: 'tx-hash-123',
                amount: 0.5
            });

            // Simulate confirmation webhooks
            for (let i = 1; i <= 2; i++) {
                const result = await confirmationService.processTransaction({
                    sessionId: session.id,
                    txHash: 'tx-hash-123',
                    confirmations: i,
                    blockHeight: 700000 + i
                });

                expect(result.success).toBe(true);
                expect(result.status).toBe('confirming');
                expect(result.confirmations).toBe(i);
            }

            const updatedSession = paymentSessionManager.getSession(session.id);
            expect(updatedSession.status).toBe('confirming');
            expect(updatedSession.confirmations).toBe(2);
        });

        it('Step 4: Should complete payment when reaching required confirmations', async () => {
            // Track events
            const completedEvents = [];
            confirmationService.on('onPaymentCompleted', (data) => {
                completedEvents.push(data);
            });

            // Create and partially confirm a session
            const session = paymentSessionManager.createSession({
                userId: 'user123',
                cryptocurrency: 'btc',
                paymentAddress: '1TempPaymentAddress',
                forwardingAddress: '1MainBTCAddress',
                metadata: { orderId: 'order-456' }
            });

            paymentSessionManager.markPaymentDetected(session.id, {
                txHash: 'tx-hash-456',
                amount: 1.0
            });

            paymentSessionManager.updateConfirmations(session.id, 2);

            // Process final confirmation
            const result = await confirmationService.processTransaction({
                sessionId: session.id,
                txHash: 'tx-hash-456',
                confirmations: 3,
                blockHeight: 700003
            });

            expect(result.success).toBe(true);
            expect(result.status).toBe('completed');

            const completedSession = paymentSessionManager.getSession(session.id);
            expect(completedSession.status).toBe('completed');
            expect(completedSession.confirmations).toBe(3);
            expect(completedSession.confirmedAt).toBeDefined();
            expect(completedSession.completedAt).toBeDefined();

            // Verify event was emitted
            expect(completedEvents.length).toBeGreaterThan(0);
            expect(completedEvents[0].userId).toBe('user123');
            expect(completedEvents[0].metadata.orderId).toBe('order-456');
        });
    });

    describe('Complete ETH Payment Flow', () => {
        it('Should process ETH payment with 12 confirmations', async () => {
            // Mock BlockCypher for ETH
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    id: 'forward-eth-123',
                    input_address: '0xTempPaymentAddress',
                    destination: '0xMainETHAddress'
                })
            });

            const { addressService } = await import('../services/address.service.js');

            // Create forwarding address
            const forwardResult = await addressService.createForwardingAddress('eth', '0xMainETHAddress');
            expect(forwardResult.success).toBe(true);

            // Create session
            const session = paymentSessionManager.createSession({
                userId: 'user789',
                cryptocurrency: 'eth',
                paymentAddress: forwardResult.inputAddress,
                forwardingAddress: '0xMainETHAddress',
                expectedAmount: 2.0
            });

            expect(session.requiredConfirmations).toBe(12);

            // Simulate detection
            await confirmationService.processTransaction({
                sessionId: session.id,
                txHash: 'eth-tx-hash',
                confirmations: 0,
                received: 2000000000000000000 // 2 ETH in wei
            });

            // Simulate confirmations 1-11
            for (let i = 1; i <= 11; i++) {
                const result = await confirmationService.processTransaction({
                    sessionId: session.id,
                    txHash: 'eth-tx-hash',
                    confirmations: i
                });
                expect(result.status).toBe('confirming');
            }

            // Final confirmation
            const result = await confirmationService.processTransaction({
                sessionId: session.id,
                txHash: 'eth-tx-hash',
                confirmations: 12
            });

            expect(result.status).toBe('completed');

            const completedSession = paymentSessionManager.getSession(session.id);
            expect(completedSession.status).toBe('completed');
            expect(completedSession.receivedAmount).toBe(2);
        });
    });

    describe('Edge Cases', () => {
        it('Should handle multiple sessions for same user', async () => {
            const session1 = paymentSessionManager.createSession({
                userId: 'user-multi',
                cryptocurrency: 'btc',
                paymentAddress: 'addr1',
                forwardingAddress: 'main1'
            });

            const session2 = paymentSessionManager.createSession({
                userId: 'user-multi',
                cryptocurrency: 'eth',
                paymentAddress: 'addr2',
                forwardingAddress: 'main2'
            });

            const userSessions = paymentSessionManager.getSessionsByUser('user-multi');
            expect(userSessions.length).toBe(2);

            // Complete one session
            paymentSessionManager.markCompleted(session1.id);

            // Other session should still be pending
            const session2Status = paymentSessionManager.getSession(session2.id);
            expect(session2Status.status).toBe('pending');
        });

        it('Should handle session lookup by address case-insensitively', async () => {
            paymentSessionManager.createSession({
                userId: 'user-case',
                cryptocurrency: 'eth',
                paymentAddress: '0xAbCdEf123456',
                forwardingAddress: '0xMain'
            });

            const session1 = paymentSessionManager.getSessionByAddress('0xAbCdEf123456');
            const session2 = paymentSessionManager.getSessionByAddress('0xabcdef123456');
            const session3 = paymentSessionManager.getSessionByAddress('0XABCDEF123456');

            expect(session1).toBeDefined();
            expect(session2).toBeDefined();
            expect(session3).toBeDefined();
            expect(session1.id).toBe(session2.id);
            expect(session2.id).toBe(session3.id);
        });

        it('Should prevent updates to terminal state sessions', async () => {
            const session = paymentSessionManager.createSession({
                userId: 'user-terminal',
                cryptocurrency: 'btc',
                paymentAddress: 'addr-terminal',
                forwardingAddress: 'main'
            });

            // Complete the session
            paymentSessionManager.markCompleted(session.id);

            // Try to process another transaction
            const result = await confirmationService.processTransaction({
                sessionId: session.id,
                txHash: 'new-tx',
                confirmations: 1
            });

            expect(result.success).toBe(true);
            expect(result.message).toContain('terminal state');

            // Session should still be completed
            const finalSession = paymentSessionManager.getSession(session.id);
            expect(finalSession.status).toBe('completed');
        });

        it('Should track transaction history correctly', async () => {
            const session = paymentSessionManager.createSession({
                userId: 'user-history',
                cryptocurrency: 'btc',
                paymentAddress: 'addr-history',
                forwardingAddress: 'main'
            });

            // Detect payment
            await confirmationService.processTransaction({
                sessionId: session.id,
                txHash: 'tx-history',
                confirmations: 0,
                received: 100000000
            });

            // Add confirmations
            await confirmationService.processTransaction({
                sessionId: session.id,
                txHash: 'tx-history',
                confirmations: 1
            });

            await confirmationService.processTransaction({
                sessionId: session.id,
                txHash: 'tx-history',
                confirmations: 2
            });

            await confirmationService.processTransaction({
                sessionId: session.id,
                txHash: 'tx-history',
                confirmations: 3
            });

            const finalSession = paymentSessionManager.getSession(session.id);

            // Should have: detected + 3 confirmation updates + confirmed + completed
            expect(finalSession.transactionHistory.length).toBeGreaterThanOrEqual(4);
            
            // Check event types
            const eventTypes = finalSession.transactionHistory.map(e => e.type);
            expect(eventTypes).toContain('payment_detected');
            expect(eventTypes).toContain('confirmation_update');
            expect(eventTypes).toContain('payment_completed');
        });
    });

    describe('Session Management', () => {
        it('Should return statistics correctly', () => {
            // Create various sessions
            paymentSessionManager.createSession({
                userId: 'user1',
                cryptocurrency: 'btc',
                paymentAddress: 'addr1',
                forwardingAddress: 'main'
            });

            const session2 = paymentSessionManager.createSession({
                userId: 'user2',
                cryptocurrency: 'eth',
                paymentAddress: 'addr2',
                forwardingAddress: 'main'
            });

            const session3 = paymentSessionManager.createSession({
                userId: 'user3',
                cryptocurrency: 'btc',
                paymentAddress: 'addr3',
                forwardingAddress: 'main'
            });

            paymentSessionManager.markCompleted(session2.id);
            paymentSessionManager.updateSession(session3.id, { status: 'cancelled' });

            const stats = paymentSessionManager.getStatistics();

            expect(stats.total).toBe(3);
            expect(stats.byStatus.pending).toBe(1);
            expect(stats.byStatus.completed).toBe(1);
            expect(stats.byStatus.cancelled).toBe(1);
            expect(stats.byCrypto.btc).toBe(2);
            expect(stats.byCrypto.eth).toBe(1);
        });

        it('Should delete session and clean up indexes', () => {
            const session = paymentSessionManager.createSession({
                userId: 'user-delete',
                cryptocurrency: 'btc',
                paymentAddress: 'addr-delete',
                forwardingAddress: 'main'
            });

            const sessionId = session.id;
            const address = session.paymentAddress;

            // Verify session exists
            expect(paymentSessionManager.getSession(sessionId)).toBeDefined();
            expect(paymentSessionManager.getSessionByAddress(address)).toBeDefined();
            expect(paymentSessionManager.getSessionsByUser('user-delete').length).toBe(1);

            // Delete session
            const deleted = paymentSessionManager.deleteSession(sessionId);
            expect(deleted).toBe(true);

            // Verify cleanup
            expect(paymentSessionManager.getSession(sessionId)).toBeNull();
            expect(paymentSessionManager.getSessionByAddress(address)).toBeNull();
            expect(paymentSessionManager.getSessionsByUser('user-delete').length).toBe(0);
        });
    });
});
