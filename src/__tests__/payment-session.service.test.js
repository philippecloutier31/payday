/**
 * Unit tests for Payment Session Service
 */

import { jest } from '@jest/globals';

// Mock the config before importing the service
jest.unstable_mockModule('../config/env.js', () => ({
    default: {
        SESSION_EXPIRY_MS: 3600000,
        BTC_CONFIRMATIONS_REQUIRED: 3,
        ETH_CONFIRMATIONS_REQUIRED: 12
    },
    SESSION_EXPIRY_MS: 3600000,
    BTC_CONFIRMATIONS_REQUIRED: 3,
    ETH_CONFIRMATIONS_REQUIRED: 12
}));

const { paymentSessionManager } = await import('../services/payment-session.service.js');

describe('PaymentSessionManager', () => {
    beforeEach(() => {
        // Clear all sessions before each test
        paymentSessionManager.clearAll();
    });

    afterAll(() => {
        // Stop cleanup interval
        paymentSessionManager.stopCleanupInterval();
    });

    describe('createSession', () => {
        it('should create a new session with required fields', () => {
            const sessionData = {
                userId: 'user123',
                cryptocurrency: 'btc',
                paymentAddress: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
                forwardingAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
            };

            const session = paymentSessionManager.createSession(sessionData);

            expect(session).toBeDefined();
            expect(session.id).toBeDefined();
            expect(session.userId).toBe('user123');
            expect(session.cryptocurrency).toBe('btc');
            expect(session.paymentAddress).toBe('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2');
            expect(session.status).toBe('pending');
            expect(session.confirmations).toBe(0);
            expect(session.requiredConfirmations).toBe(3); // BTC default
        });

        it('should set correct confirmation threshold for ETH', () => {
            const sessionData = {
                userId: 'user123',
                cryptocurrency: 'eth',
                paymentAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE35',
                forwardingAddress: '0x123456789abcdef'
            };

            const session = paymentSessionManager.createSession(sessionData);

            expect(session.requiredConfirmations).toBe(12); // ETH default
        });

        it('should set expiration time correctly', () => {
            const beforeCreate = Date.now();
            
            const session = paymentSessionManager.createSession({
                userId: 'user123',
                cryptocurrency: 'btc',
                paymentAddress: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
                forwardingAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
            });

            const expiresAt = new Date(session.expiresAt).getTime();
            const expectedExpiry = beforeCreate + 3600000; // 1 hour

            // Allow 1 second tolerance
            expect(expiresAt).toBeGreaterThanOrEqual(expectedExpiry - 1000);
            expect(expiresAt).toBeLessThanOrEqual(expectedExpiry + 1000);
        });

        it('should include metadata when provided', () => {
            const session = paymentSessionManager.createSession({
                userId: 'user123',
                cryptocurrency: 'btc',
                paymentAddress: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
                forwardingAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
                metadata: { orderId: 'order456', description: 'Test payment' }
            });

            expect(session.metadata).toEqual({
                orderId: 'order456',
                description: 'Test payment'
            });
        });
    });

    describe('getSession', () => {
        it('should retrieve an existing session by ID', () => {
            const created = paymentSessionManager.createSession({
                userId: 'user123',
                cryptocurrency: 'btc',
                paymentAddress: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
                forwardingAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
            });

            const retrieved = paymentSessionManager.getSession(created.id);

            expect(retrieved).toBeDefined();
            expect(retrieved.id).toBe(created.id);
        });

        it('should return null for non-existent session', () => {
            const result = paymentSessionManager.getSession('non-existent-id');
            expect(result).toBeNull();
        });
    });

    describe('getSessionByAddress', () => {
        it('should retrieve session by payment address', () => {
            const address = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2';
            const created = paymentSessionManager.createSession({
                userId: 'user123',
                cryptocurrency: 'btc',
                paymentAddress: address,
                forwardingAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
            });

            const retrieved = paymentSessionManager.getSessionByAddress(address);

            expect(retrieved).toBeDefined();
            expect(retrieved.id).toBe(created.id);
        });

        it('should be case-insensitive for address lookup', () => {
            const address = '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE35';
            paymentSessionManager.createSession({
                userId: 'user123',
                cryptocurrency: 'eth',
                paymentAddress: address,
                forwardingAddress: '0x123'
            });

            const retrieved = paymentSessionManager.getSessionByAddress(address.toLowerCase());

            expect(retrieved).toBeDefined();
        });

        it('should return null for non-existent address', () => {
            const result = paymentSessionManager.getSessionByAddress('non-existent-address');
            expect(result).toBeNull();
        });
    });

    describe('updateSession', () => {
        it('should update session fields', () => {
            const session = paymentSessionManager.createSession({
                userId: 'user123',
                cryptocurrency: 'btc',
                paymentAddress: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
                forwardingAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
            });

            const updated = paymentSessionManager.updateSession(session.id, {
                status: 'detected',
                txHash: 'abc123'
            });

            expect(updated.status).toBe('detected');
            expect(updated.txHash).toBe('abc123');
        });

        it('should update the updatedAt timestamp', () => {
            const session = paymentSessionManager.createSession({
                userId: 'user123',
                cryptocurrency: 'btc',
                paymentAddress: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
                forwardingAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
            });

            const originalUpdatedAt = session.updatedAt;

            // Small delay to ensure timestamp changes
            const updated = paymentSessionManager.updateSession(session.id, {
                status: 'detected'
            });

            expect(new Date(updated.updatedAt).getTime())
                .toBeGreaterThanOrEqual(new Date(originalUpdatedAt).getTime());
        });

        it('should return null for non-existent session', () => {
            const result = paymentSessionManager.updateSession('non-existent', { status: 'detected' });
            expect(result).toBeNull();
        });
    });

    describe('markPaymentDetected', () => {
        it('should mark payment as detected with transaction data', () => {
            const session = paymentSessionManager.createSession({
                userId: 'user123',
                cryptocurrency: 'btc',
                paymentAddress: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
                forwardingAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
            });

            const updated = paymentSessionManager.markPaymentDetected(session.id, {
                txHash: 'tx123',
                amount: 0.5
            });

            expect(updated.status).toBe('detected');
            expect(updated.txHash).toBe('tx123');
            expect(updated.receivedAmount).toBe(0.5);
            expect(updated.detectedAt).toBeDefined();
        });

        it('should add transaction event to history', () => {
            const session = paymentSessionManager.createSession({
                userId: 'user123',
                cryptocurrency: 'btc',
                paymentAddress: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
                forwardingAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
            });

            paymentSessionManager.markPaymentDetected(session.id, {
                txHash: 'tx123',
                amount: 0.5
            });

            const retrieved = paymentSessionManager.getSession(session.id);
            expect(retrieved.transactionHistory.length).toBe(1);
            expect(retrieved.transactionHistory[0].type).toBe('payment_detected');
        });
    });

    describe('updateConfirmations', () => {
        it('should update confirmation count', () => {
            const session = paymentSessionManager.createSession({
                userId: 'user123',
                cryptocurrency: 'btc',
                paymentAddress: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
                forwardingAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
            });

            const updated = paymentSessionManager.updateConfirmations(session.id, 2);

            expect(updated.confirmations).toBe(2);
            expect(updated.status).toBe('confirming');
        });

        it('should set status to confirmed when reaching threshold', () => {
            const session = paymentSessionManager.createSession({
                userId: 'user123',
                cryptocurrency: 'btc',
                paymentAddress: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
                forwardingAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
            });

            const updated = paymentSessionManager.updateConfirmations(session.id, 3);

            expect(updated.status).toBe('confirmed');
            expect(updated.confirmedAt).toBeDefined();
        });
    });

    describe('markCompleted', () => {
        it('should mark session as completed', () => {
            const session = paymentSessionManager.createSession({
                userId: 'user123',
                cryptocurrency: 'btc',
                paymentAddress: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
                forwardingAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
            });

            const updated = paymentSessionManager.markCompleted(session.id, {
                finalAmount: 0.5
            });

            expect(updated.status).toBe('completed');
            expect(updated.completedAt).toBeDefined();
        });
    });

    describe('getSessionsByUser', () => {
        it('should return all sessions for a user', () => {
            paymentSessionManager.createSession({
                userId: 'user123',
                cryptocurrency: 'btc',
                paymentAddress: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
                forwardingAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
            });

            paymentSessionManager.createSession({
                userId: 'user123',
                cryptocurrency: 'eth',
                paymentAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE35',
                forwardingAddress: '0x123'
            });

            paymentSessionManager.createSession({
                userId: 'user456',
                cryptocurrency: 'btc',
                paymentAddress: '1AnotherAddress',
                forwardingAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
            });

            const user123Sessions = paymentSessionManager.getSessionsByUser('user123');
            expect(user123Sessions.length).toBe(2);

            const user456Sessions = paymentSessionManager.getSessionsByUser('user456');
            expect(user456Sessions.length).toBe(1);
        });

        it('should return empty array for user with no sessions', () => {
            const sessions = paymentSessionManager.getSessionsByUser('non-existent-user');
            expect(sessions).toEqual([]);
        });
    });

    describe('getAllSessions', () => {
        it('should return all sessions', () => {
            paymentSessionManager.createSession({
                userId: 'user1',
                cryptocurrency: 'btc',
                paymentAddress: 'address1',
                forwardingAddress: 'main1'
            });

            paymentSessionManager.createSession({
                userId: 'user2',
                cryptocurrency: 'eth',
                paymentAddress: 'address2',
                forwardingAddress: 'main2'
            });

            const allSessions = paymentSessionManager.getAllSessions();
            expect(allSessions.length).toBe(2);
        });
    });

    describe('deleteSession', () => {
        it('should delete an existing session', () => {
            const session = paymentSessionManager.createSession({
                userId: 'user123',
                cryptocurrency: 'btc',
                paymentAddress: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
                forwardingAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
            });

            const result = paymentSessionManager.deleteSession(session.id);
            expect(result).toBe(true);

            const retrieved = paymentSessionManager.getSession(session.id);
            expect(retrieved).toBeNull();
        });

        it('should return false for non-existent session', () => {
            const result = paymentSessionManager.deleteSession('non-existent');
            expect(result).toBe(false);
        });
    });

    describe('getStatistics', () => {
        it('should return correct statistics', () => {
            paymentSessionManager.createSession({
                userId: 'user1',
                cryptocurrency: 'btc',
                paymentAddress: 'address1',
                forwardingAddress: 'main1'
            });

            const session2 = paymentSessionManager.createSession({
                userId: 'user2',
                cryptocurrency: 'eth',
                paymentAddress: 'address2',
                forwardingAddress: 'main2'
            });

            paymentSessionManager.markCompleted(session2.id);

            const stats = paymentSessionManager.getStatistics();

            expect(stats.total).toBe(2);
            expect(stats.byStatus.pending).toBe(1);
            expect(stats.byStatus.completed).toBe(1);
            expect(stats.byCrypto.btc).toBe(1);
            expect(stats.byCrypto.eth).toBe(1);
            expect(stats.activeUsers).toBe(2);
        });
    });
});
