/**
 * Unit tests for Address Service
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
        BTC_CONFIRMATIONS_REQUIRED: 3,
        ETH_CONFIRMATIONS_REQUIRED: 12
    },
    BLOCKCYPHER_API_URL: 'https://api.blockcypher.com/v1',
    BLOCKCYPHER_API_TOKEN: 'test-token',
    WEBHOOK_BASE_URL: 'https://example.com',
    BTC_CONFIRMATIONS_REQUIRED: 3,
    ETH_CONFIRMATIONS_REQUIRED: 12
}));

// Mock node-fetch
jest.unstable_mockModule('node-fetch', () => ({
    default: mockFetch
}));

const { addressService } = await import('../services/address.service.js');

describe('AddressService', () => {
    beforeEach(() => {
        mockFetch.mockClear();
    });

    describe('getChainId', () => {
        it('should return correct chain ID for BTC', () => {
            const chainId = addressService.getChainId('btc');
            expect(chainId).toBe('btc/main');
        });

        it('should return correct chain ID for ETH', () => {
            const chainId = addressService.getChainId('eth');
            expect(chainId).toBe('eth/main');
        });

        it('should return BTC chain ID for unknown crypto', () => {
            const chainId = addressService.getChainId('unknown');
            expect(chainId).toBe('btc/main');
        });
    });

    describe('createForwardingAddress', () => {
        it('should create a BTC forwarding address successfully', async () => {
            const mockResponse = {
                id: 'forward-123',
                input_address: '1TempAddress123',
                destination: '1MainAddress456',
                callback_url: 'https://example.com/webhook/blockcypher',
                token: 'test-token'
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse
            });

            const result = await addressService.createForwardingAddress('btc', '1MainAddress456');

            expect(result.success).toBe(true);
            expect(result.id).toBe('forward-123');
            expect(result.inputAddress).toBe('1TempAddress123');
            expect(result.destinationAddress).toBe('1MainAddress456');

            // Verify fetch was called with correct URL
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('btc/main/payments'),
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                })
            );
        });

        it('should create an ETH forwarding address successfully', async () => {
            const mockResponse = {
                id: 'forward-eth-123',
                input_address: '0xTempAddress',
                destination: '0xMainAddress',
                callback_url: 'https://example.com/webhook/blockcypher'
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse
            });

            const result = await addressService.createForwardingAddress('eth', '0xMainAddress');

            expect(result.success).toBe(true);
            expect(result.id).toBe('forward-eth-123');
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('eth/main/payments'),
                expect.any(Object)
            );
        });

        it('should handle API error response', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: async () => ({ error: 'Invalid destination address' })
            });

            const result = await addressService.createForwardingAddress('btc', 'invalid');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid destination address');
            expect(result.statusCode).toBe(400);
        });

        it('should handle network error', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const result = await addressService.createForwardingAddress('btc', '1MainAddress');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Network error');
        });
    });

    describe('getForwardingAddress', () => {
        it('should retrieve forwarding address details', async () => {
            const mockResponse = {
                id: 'forward-123',
                input_address: '1TempAddress',
                destination: '1MainAddress',
                callback_url: 'https://example.com/webhook'
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse
            });

            const result = await addressService.getForwardingAddress('btc', 'forward-123');

            expect(result.success).toBe(true);
            expect(result.id).toBe('forward-123');
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('btc/main/payments/forward-123')
            );
        });

        it('should handle not found error', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                json: async () => ({ error: 'Payment not found' })
            });

            const result = await addressService.getForwardingAddress('btc', 'non-existent');

            expect(result.success).toBe(false);
            expect(result.statusCode).toBe(404);
        });
    });

    describe('listForwardingAddresses', () => {
        it('should list all forwarding addresses', async () => {
            const mockResponse = [
                { id: 'forward-1', input_address: 'addr1' },
                { id: 'forward-2', input_address: 'addr2' }
            ];

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse
            });

            const result = await addressService.listForwardingAddresses('btc');

            expect(result.success).toBe(true);
            expect(result.payments).toHaveLength(2);
            expect(result.count).toBe(2);
        });
    });

    describe('deleteForwardingAddress', () => {
        it('should delete a forwarding address', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true
            });

            const result = await addressService.deleteForwardingAddress('btc', 'forward-123');

            expect(result.success).toBe(true);
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('forward-123'),
                expect.objectContaining({ method: 'DELETE' })
            );
        });

        it('should handle delete error', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                json: async () => ({ error: 'Not found' })
            });

            const result = await addressService.deleteForwardingAddress('btc', 'non-existent');

            expect(result.success).toBe(false);
        });
    });

    describe('getAddressInfo', () => {
        it('should get BTC address info with correct balance conversion', async () => {
            const mockResponse = {
                address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
                balance: 100000000, // 1 BTC in satoshis
                unconfirmed_balance: 50000000,
                total_received: 200000000,
                total_sent: 100000000,
                n_tx: 10,
                unconfirmed_n_tx: 2
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse
            });

            const result = await addressService.getAddressInfo('btc', '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2');

            expect(result.success).toBe(true);
            expect(result.balance).toBe(1); // 1 BTC
            expect(result.unconfirmedBalance).toBe(0.5);
            expect(result.totalReceived).toBe(2);
            expect(result.totalSent).toBe(1);
            expect(result.txCount).toBe(10);
        });

        it('should get ETH address info with correct balance conversion', async () => {
            const mockResponse = {
                address: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE35',
                balance: 1000000000000000000, // 1 ETH in wei
                n_tx: 5
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse
            });

            const result = await addressService.getAddressInfo('eth', '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE35');

            expect(result.success).toBe(true);
            expect(result.balance).toBe(1); // 1 ETH
        });
    });

    describe('generateAddress', () => {
        it('should generate a new address', async () => {
            const mockResponse = {
                address: '1NewAddress123',
                public: 'publicKey123',
                private: 'privateKey123',
                wif: 'wifKey123'
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse
            });

            const result = await addressService.generateAddress('btc');

            expect(result.success).toBe(true);
            expect(result.address).toBe('1NewAddress123');
            expect(result.publicKey).toBe('publicKey123');
            expect(result.privateKey).toBe('privateKey123');
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('btc/main/addrs'),
                expect.objectContaining({ method: 'POST' })
            );
        });
    });
});
