/**
 * Unit tests for Webhook Controller
 * Tests webhook secret validation and payload processing
 */

import { jest } from '@jest/globals';

// Mock the config
jest.unstable_mockModule('../config/env.js', () => ({
    default: {
        WEBHOOK_SECRET: 'test-webhook-secret',
        NODE_ENV: 'development'
    },
    WEBHOOK_SECRET: 'test-webhook-secret',
    NODE_ENV: 'development'
}));

// Mock the payment session manager
const mockGetSessionByAddress = jest.fn();
jest.unstable_mockModule('../services/payment-session.service.js', () => ({
    paymentSessionManager: {
        getSessionByAddress: mockGetSessionByAddress
    }
}));

// Mock the confirmation service
const mockProcessTransaction = jest.fn();
jest.unstable_mockModule('../services/confirmation.service.js', () => ({
    confirmationService: {
        processTransaction: mockProcessTransaction
    }
}));

const { handleBlockCypherWebhook } = await import('../controllers/webhook.controller.js');

describe('Webhook Controller', () => {
    let mockReq;
    let mockRes;
    let mockNext;

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockReq = {
            query: {},
            body: {}
        };
        
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };
        
        mockNext = jest.fn();
    });

    describe('Webhook Secret Validation', () => {
        it('should reject requests without secret', async () => {
            mockReq.query = {}; // No secret
            mockReq.body = { hash: 'tx123', addresses: ['addr1'] };

            await handleBlockCypherWebhook(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                error: 'Unauthorized: Invalid webhook secret'
            });
        });

        it('should reject requests with wrong secret', async () => {
            mockReq.query = { secret: 'wrong-secret' };
            mockReq.body = { hash: 'tx123', addresses: ['addr1'] };

            await handleBlockCypherWebhook(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                error: 'Unauthorized: Invalid webhook secret'
            });
        });

        it('should accept requests with correct secret', async () => {
            mockReq.query = { secret: 'test-webhook-secret' };
            mockReq.body = { 
                hash: 'tx123', 
                addresses: ['addr1'],
                confirmations: 1
            };

            // Mock no session found
            mockGetSessionByAddress.mockReturnValue(null);

            await handleBlockCypherWebhook(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: true,
                message: 'Webhook received but no matching session found'
            });
        });
    });

    describe('Payload Processing', () => {
        beforeEach(() => {
            // Set valid secret for all payload tests
            mockReq.query = { secret: 'test-webhook-secret' };
        });

        it('should return 400 for empty payload', async () => {
            mockReq.body = null;

            await handleBlockCypherWebhook(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                error: 'Empty webhook payload'
            });
        });

        it('should process webhook when session is found', async () => {
            const mockSession = {
                id: 'session-123',
                address: 'addr1',
                status: 'pending'
            };

            mockReq.body = {
                hash: 'tx123',
                addresses: ['addr1', 'addr2'],
                confirmations: 2,
                outputs: [{ value: 100000, addresses: ['addr1'] }],
                total: 100000,
                received: '2024-01-01T00:00:00Z',
                block_height: 12345
            };

            mockGetSessionByAddress.mockReturnValue(mockSession);
            mockProcessTransaction.mockResolvedValue({ status: 'confirming' });

            await handleBlockCypherWebhook(mockReq, mockRes, mockNext);

            expect(mockGetSessionByAddress).toHaveBeenCalledWith('addr1');
            expect(mockProcessTransaction).toHaveBeenCalledWith({
                sessionId: 'session-123',
                txHash: 'tx123',
                confirmations: 2,
                outputs: [{ value: 100000, addresses: ['addr1'] }],
                total: 100000,
                received: '2024-01-01T00:00:00Z',
                blockHeight: 12345,
                rawPayload: mockReq.body
            });

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: true,
                message: 'Webhook processed',
                sessionId: 'session-123',
                status: 'confirming'
            });
        });

        it('should try multiple addresses to find session', async () => {
            const mockSession = {
                id: 'session-456',
                address: 'addr2',
                status: 'pending'
            };

            mockReq.body = {
                hash: 'tx456',
                addresses: ['addr1', 'addr2', 'addr3'],
                confirmations: 1
            };

            // First address doesn't match, second does
            mockGetSessionByAddress
                .mockReturnValueOnce(null)
                .mockReturnValueOnce(mockSession);
            
            mockProcessTransaction.mockResolvedValue({ status: 'detected' });

            await handleBlockCypherWebhook(mockReq, mockRes, mockNext);

            expect(mockGetSessionByAddress).toHaveBeenCalledTimes(2);
            expect(mockGetSessionByAddress).toHaveBeenNthCalledWith(1, 'addr1');
            expect(mockGetSessionByAddress).toHaveBeenNthCalledWith(2, 'addr2');
        });

        it('should handle processing errors gracefully', async () => {
            const mockSession = {
                id: 'session-789',
                address: 'addr1'
            };

            mockReq.body = {
                hash: 'tx789',
                addresses: ['addr1'],
                confirmations: 1
            };

            mockGetSessionByAddress.mockReturnValue(mockSession);
            mockProcessTransaction.mockRejectedValue(new Error('Processing failed'));

            await handleBlockCypherWebhook(mockReq, mockRes, mockNext);

            // Should return 200 to prevent BlockCypher retries
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({
                success: false,
                error: 'Processing failed'
            });
        });
    });
});

describe('Webhook Controller - Production Mode', () => {
    // Test production mode where unconfigured secret should be rejected
    // This requires re-importing with different config
});
