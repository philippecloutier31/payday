/**
 * Unit tests for Webhook Service
 */

import { jest } from '@jest/globals';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock the config
jest.unstable_mockModule('../config/env.js', () => ({
    default: {
        BLOCKCYPHER_API_URL: 'https://api.blockcypher.com/v1',
        BLOCKCYPHER_API_TOKEN: 'test-token',
        WEBHOOK_BASE_URL: 'https://example.com',
        WEBHOOK_SECRET: 'test-webhook-secret',
        BTC_CONFIRMATIONS_REQUIRED: 3,
        ETH_CONFIRMATIONS_REQUIRED: 12
    },
    BLOCKCYPHER_API_URL: 'https://api.blockcypher.com/v1',
    BLOCKCYPHER_API_TOKEN: 'test-token',
    WEBHOOK_BASE_URL: 'https://example.com',
    WEBHOOK_SECRET: 'test-webhook-secret',
    BTC_CONFIRMATIONS_REQUIRED: 3,
    ETH_CONFIRMATIONS_REQUIRED: 12
}));

// Mock node-fetch
jest.unstable_mockModule('node-fetch', () => ({
    default: mockFetch
}));

const { webhookService } = await import('../services/webhook.service.js');

describe('WebhookService', () => {
    beforeEach(() => {
        mockFetch.mockClear();
    });

    describe('getChainId', () => {
        it('should return correct chain IDs', () => {
            expect(webhookService.getChainId('btc')).toBe('btc/main');
            expect(webhookService.getChainId('eth')).toBe('eth/main');
            expect(webhookService.getChainId('btc_test')).toBe('btc/test3');
        });
    });

    describe('buildCallbackUrl', () => {
        it('should build callback URL with secret parameter', () => {
            const url = webhookService.buildCallbackUrl();
            expect(url).toBe('https://example.com/webhook/blockcypher?secret=test-webhook-secret');
        });
    });

    describe('registerAddressWebhook', () => {
        it('should register a webhook for BTC address', async () => {
            const mockResponse = {
                id: 'webhook-123',
                event: 'tx-confirmation',
                address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
                url: 'https://example.com/webhook/blockcypher',
                confirmations: 3
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse
            });

            const result = await webhookService.registerAddressWebhook(
                'btc',
                '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
                'session-123'
            );

            expect(result.success).toBe(true);
            expect(result.webhookId).toBe('webhook-123');
            expect(result.event).toBe('tx-confirmation');
            expect(result.confirmations).toBe(3);

            // Verify request
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('btc/main/hooks'),
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                })
            );

            // Verify request body
            const callArgs = mockFetch.mock.calls[0];
            const requestBody = JSON.parse(callArgs[1].body);
            expect(requestBody.event).toBe('tx-confirmation');
            expect(requestBody.address).toBe('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2');
            // URL should include the secret parameter
            expect(requestBody.url).toBe('https://example.com/webhook/blockcypher?secret=test-webhook-secret');
        });

        it('should use correct confirmations for ETH', async () => {
            const mockResponse = {
                id: 'webhook-eth-123',
                event: 'tx-confirmation',
                address: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE35',
                confirmations: 12
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse
            });

            const result = await webhookService.registerAddressWebhook(
                'eth',
                '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE35',
                'session-456'
            );

            expect(result.success).toBe(true);
            expect(result.confirmations).toBe(12);
        });

        it('should handle API error', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: async () => ({ error: 'Invalid address format' })
            });

            const result = await webhookService.registerAddressWebhook(
                'btc',
                'invalid-address',
                'session-123'
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid address format');
        });

        it('should handle network error', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

            const result = await webhookService.registerAddressWebhook(
                'btc',
                '1ValidAddress',
                'session-123'
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe('Connection refused');
        });
    });

    describe('registerUnconfirmedTxWebhook', () => {
        it('should register webhook for unconfirmed transactions', async () => {
            const mockResponse = {
                id: 'webhook-unconf-123',
                event: 'unconfirmed-tx',
                address: '1Address123'
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse
            });

            const result = await webhookService.registerUnconfirmedTxWebhook(
                'btc',
                '1Address123'
            );

            expect(result.success).toBe(true);
            expect(result.event).toBe('unconfirmed-tx');

            const callArgs = mockFetch.mock.calls[0];
            const requestBody = JSON.parse(callArgs[1].body);
            expect(requestBody.event).toBe('unconfirmed-tx');
        });
    });

    describe('registerConfidenceWebhook', () => {
        it('should register webhook with confidence threshold', async () => {
            const mockResponse = {
                id: 'webhook-conf-123',
                event: 'tx-confidence',
                address: '1Address123',
                confidence: 0.99
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse
            });

            const result = await webhookService.registerConfidenceWebhook(
                'btc',
                '1Address123',
                0.99
            );

            expect(result.success).toBe(true);
            expect(result.confidence).toBe(0.99);

            const callArgs = mockFetch.mock.calls[0];
            const requestBody = JSON.parse(callArgs[1].body);
            expect(requestBody.confidence).toBe(0.99);
        });
    });

    describe('getWebhook', () => {
        it('should retrieve webhook details', async () => {
            const mockResponse = {
                id: 'webhook-123',
                event: 'tx-confirmation',
                address: '1Address123',
                url: 'https://example.com/webhook'
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse
            });

            const result = await webhookService.getWebhook('btc', 'webhook-123');

            expect(result.success).toBe(true);
            expect(result.webhookId).toBe('webhook-123');
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('hooks/webhook-123')
            );
        });
    });

    describe('listWebhooks', () => {
        it('should list all webhooks', async () => {
            const mockResponse = [
                { id: 'webhook-1', event: 'tx-confirmation' },
                { id: 'webhook-2', event: 'unconfirmed-tx' }
            ];

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse
            });

            const result = await webhookService.listWebhooks('btc');

            expect(result.success).toBe(true);
            expect(result.webhooks).toHaveLength(2);
            expect(result.count).toBe(2);
        });

        it('should handle empty webhook list', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => []
            });

            const result = await webhookService.listWebhooks('btc');

            expect(result.success).toBe(true);
            expect(result.webhooks).toHaveLength(0);
            expect(result.count).toBe(0);
        });
    });

    describe('deleteWebhook', () => {
        it('should delete a webhook', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true
            });

            const result = await webhookService.deleteWebhook('btc', 'webhook-123');

            expect(result.success).toBe(true);
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('webhook-123'),
                expect.objectContaining({ method: 'DELETE' })
            );
        });

        it('should handle delete error', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                json: async () => ({ error: 'Webhook not found' })
            });

            const result = await webhookService.deleteWebhook('btc', 'non-existent');

            expect(result.success).toBe(false);
            expect(result.statusCode).toBe(404);
        });
    });

    describe('deleteAllWebhooks', () => {
        it('should delete all webhooks', async () => {
            // Mock list webhooks
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => [
                    { id: 'webhook-1' },
                    { id: 'webhook-2' }
                ]
            });

            // Mock delete calls
            mockFetch.mockResolvedValueOnce({ ok: true });
            mockFetch.mockResolvedValueOnce({ ok: true });

            const result = await webhookService.deleteAllWebhooks('btc');

            expect(result.success).toBe(true);
            expect(result.deleted).toBe(2);
            expect(result.failed).toBe(0);
        });

        it('should handle partial failures', async () => {
            // Mock list webhooks
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => [
                    { id: 'webhook-1' },
                    { id: 'webhook-2' }
                ]
            });

            // Mock delete calls - one success, one failure
            mockFetch.mockResolvedValueOnce({ ok: true });
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: async () => ({ error: 'Server error' })
            });

            const result = await webhookService.deleteAllWebhooks('btc');

            expect(result.success).toBe(true);
            expect(result.deleted).toBe(1);
            expect(result.failed).toBe(1);
        });
    });
});
