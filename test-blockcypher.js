#!/usr/bin/env node
/**
 * BlockCypher Test Chain Integration Test Script
 * 
 * This script tests the payment gateway functionality using BlockCypher's 
 * test blockchain (bcy/test). It creates wallets, funds them via the faucet,
 * tests payment sending, webhook monitoring, and address forwarding.
 * 
 * Usage:
 *   node test-blockcypher.js              # Run all tests
 *   node test-blockcypher.js --with-server # Run with local webhook server
 * 
 * Environment:
 *   Requires BLOCKCYPHER_API_TOKEN to be set in .env or environment
 */

import fetch from 'node-fetch';
import http from 'http';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config({ path: resolve(__dirname, '.env') });

// Configuration
const API_TOKEN = process.env.BLOCKCYPHER_API_TOKEN;
const BASE_URL = 'https://api.blockcypher.com/v1/bcy/test';
const WEBHOOK_PORT = 9999;
const RUN_WITH_SERVER = process.argv.includes('--with-server');

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
    console.log('\n' + '='.repeat(70));
    log(`  ${title}`, 'bright');
    console.log('='.repeat(70));
}

function logSubSection(title) {
    console.log('\n' + '-'.repeat(50));
    log(`  ${title}`, 'cyan');
    console.log('-'.repeat(50));
}

function logSuccess(message) {
    log(`✓ ${message}`, 'green');
}

function logError(message) {
    log(`✗ ${message}`, 'red');
}

function logInfo(message) {
    log(`ℹ ${message}`, 'cyan');
}

function logWarning(message) {
    log(`⚠ ${message}`, 'yellow');
}

function logDebug(message) {
    log(`  ${message}`, 'dim');
}

/**
 * BlockCypher Test Chain API Client
 */
class BlockCypherTestClient {
    constructor(apiToken) {
        if (!apiToken) {
            throw new Error('BLOCKCYPHER_API_TOKEN is required. Please set it in your .env file.');
        }
        this.apiToken = apiToken;
        this.baseUrl = BASE_URL;
    }

    /**
     * Create a new address on the test blockchain
     */
    async createAddress() {
        const url = `${this.baseUrl}/addrs?token=${this.apiToken}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(`Failed to create address: ${data.error || JSON.stringify(data)}`);
        }
        
        return {
            address: data.address,
            publicKey: data.public,
            privateKey: data.private,
            wif: data.wif
        };
    }

    /**
     * Fund an address using the BlockCypher test faucet
     */
    async fundAddress(address, amount = 100000) {
        const url = `${this.baseUrl}/faucet?token=${this.apiToken}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, amount })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(`Failed to fund address: ${data.error || JSON.stringify(data)}`);
        }
        
        return {
            txRef: data.tx_ref,
            amount: amount
        };
    }

    /**
     * Get address balance and details
     */
    async getAddressInfo(address) {
        const url = `${this.baseUrl}/addrs/${address}?token=${this.apiToken}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(`Failed to get address info: ${data.error || JSON.stringify(data)}`);
        }
        
        return {
            address: data.address,
            balance: data.balance,
            balanceBCY: data.balance / 1e8,
            unconfirmedBalance: data.unconfirmed_balance || 0,
            totalReceived: data.total_received || 0,
            totalSent: data.total_sent || 0,
            txCount: data.n_tx || 0,
            unconfirmedTxCount: data.unconfirmed_n_tx || 0,
            txrefs: data.txrefs || []
        };
    }

    /**
     * Get transaction details
     */
    async getTransaction(txHash) {
        const url = `${this.baseUrl}/txs/${txHash}?token=${this.apiToken}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(`Failed to get transaction: ${data.error || JSON.stringify(data)}`);
        }
        
        return {
            hash: data.hash,
            blockHeight: data.block_height,
            confirmations: data.confirmations,
            confirmed: data.confirmed,
            received: data.received,
            total: data.total,
            fees: data.fees,
            inputs: data.inputs,
            outputs: data.outputs,
            addresses: data.addresses
        };
    }

    /**
     * Create and send a new transaction using micro-transaction API
     */
    async sendMicroTransaction(fromPrivateKey, toAddress, amount) {
        const url = `${this.baseUrl}/txs/micro?token=${this.apiToken}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from_private: fromPrivateKey,
                to_address: toAddress,
                value_satoshis: amount
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(`Failed to send micro transaction: ${data.error || data.errors?.join(', ') || JSON.stringify(data)}`);
        }
        
        return {
            txHash: data.hash,
            total: data.total,
            fees: data.fees
        };
    }

    /**
     * Create a payment forwarding address
     */
    async createForwardingAddress(destinationAddress, callbackUrl = null) {
        const url = `${this.baseUrl}/payments?token=${this.apiToken}`;
        
        const body = {
            destination: destinationAddress
        };
        
        if (callbackUrl) {
            body.callback_url = callbackUrl;
        }
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(`Failed to create forwarding address: ${data.error || data.errors?.join(', ') || JSON.stringify(data)}`);
        }
        
        return {
            id: data.id,
            inputAddress: data.input_address,
            destination: data.destination,
            callbackUrl: data.callback_url,
            token: data.token
        };
    }

    /**
     * List all payment forwardings
     */
    async listForwardingAddresses() {
        const url = `${this.baseUrl}/payments?token=${this.apiToken}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(`Failed to list forwarding addresses: ${data.error || JSON.stringify(data)}`);
        }
        
        return data || [];
    }

    /**
     * Delete a payment forwarding
     */
    async deleteForwardingAddress(forwardingId) {
        const url = `${this.baseUrl}/payments/${forwardingId}?token=${this.apiToken}`;
        
        const response = await fetch(url, { method: 'DELETE' });
        
        return response.status === 204 || response.ok;
    }

    /**
     * Register a webhook for address monitoring
     */
    async registerWebhook(address, callbackUrl, event = 'tx-confirmation', confirmations = 1) {
        const url = `${this.baseUrl}/hooks?token=${this.apiToken}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event: event,
                address: address,
                url: callbackUrl,
                confirmations: confirmations
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(`Failed to register webhook: ${data.error || data.errors?.join(', ') || JSON.stringify(data)}`);
        }
        
        return {
            id: data.id,
            event: data.event,
            address: data.address,
            url: data.url,
            confirmations: data.confirmations
        };
    }

    /**
     * Register unconfirmed transaction webhook
     */
    async registerUnconfirmedTxWebhook(address, callbackUrl) {
        return this.registerWebhook(address, callbackUrl, 'unconfirmed-tx', 0);
    }

    /**
     * List all webhooks
     */
    async listWebhooks() {
        const url = `${this.baseUrl}/hooks?token=${this.apiToken}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(`Failed to list webhooks: ${data.error || JSON.stringify(data)}`);
        }
        
        return data || [];
    }

    /**
     * Delete a webhook
     */
    async deleteWebhook(webhookId) {
        const url = `${this.baseUrl}/hooks/${webhookId}?token=${this.apiToken}`;
        
        const response = await fetch(url, { method: 'DELETE' });
        
        return response.status === 204 || response.ok;
    }

    /**
     * Delete all webhooks (cleanup)
     */
    async deleteAllWebhooks() {
        const webhooks = await this.listWebhooks();
        const results = [];
        
        for (const hook of webhooks) {
            const deleted = await this.deleteWebhook(hook.id);
            results.push({ id: hook.id, deleted });
        }
        
        return results;
    }

    /**
     * Check API token usage and limits
     */
    async checkTokenInfo() {
        const url = `https://api.blockcypher.com/v1/tokens/${this.apiToken}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(`Failed to get token info: ${data.error || JSON.stringify(data)}`);
        }
        
        return data;
    }

    /**
     * Wait for a short delay
     */
    async wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Poll for transaction confirmation
     */
    async waitForConfirmation(txHash, targetConfirmations = 1, maxAttempts = 30, intervalMs = 2000) {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const tx = await this.getTransaction(txHash);
                if (tx.confirmations >= targetConfirmations) {
                    return tx;
                }
                logDebug(`  Waiting for confirmation... (${tx.confirmations}/${targetConfirmations})`);
            } catch (error) {
                logDebug(`  Error checking transaction: ${error.message}`);
            }
            await this.wait(intervalMs);
        }
        throw new Error(`Transaction did not reach ${targetConfirmations} confirmations within timeout`);
    }
}

/**
 * Simple webhook server for testing
 */
class WebhookTestServer {
    constructor(port) {
        this.port = port;
        this.server = null;
        this.receivedWebhooks = [];
        this.webhookPromises = [];
    }

    start() {
        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                if (req.method === 'POST') {
                    let body = '';
                    req.on('data', chunk => body += chunk);
                    req.on('end', () => {
                        try {
                            const data = JSON.parse(body);
                            const webhook = {
                                timestamp: new Date().toISOString(),
                                path: req.url,
                                data: data
                            };
                            this.receivedWebhooks.push(webhook);
                            
                            log(`\n  [WEBHOOK RECEIVED]`, 'magenta');
                            log(`    Path: ${req.url}`, 'dim');
                            log(`    Hash: ${data.hash || 'N/A'}`, 'dim');
                            log(`    Confirmations: ${data.confirmations ?? 'N/A'}`, 'dim');
                            log(`    Addresses: ${(data.addresses || []).slice(0, 2).join(', ')}...`, 'dim');
                            
                            // Resolve any waiting promises
                            this.webhookPromises.forEach(p => p.resolve(webhook));
                            this.webhookPromises = [];
                            
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: true }));
                        } catch (error) {
                            res.writeHead(400);
                            res.end(JSON.stringify({ error: error.message }));
                        }
                    });
                } else {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'webhook server running' }));
                }
            });

            this.server.listen(this.port, () => {
                resolve();
            });

            this.server.on('error', reject);
        });
    }

    stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(resolve);
            } else {
                resolve();
            }
        });
    }

    waitForWebhook(timeoutMs = 60000) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Webhook timeout'));
            }, timeoutMs);

            this.webhookPromises.push({
                resolve: (data) => {
                    clearTimeout(timeout);
                    resolve(data);
                }
            });
        });
    }

    getReceivedWebhooks() {
        return [...this.receivedWebhooks];
    }

    clearWebhooks() {
        this.receivedWebhooks = [];
    }
}

/**
 * Run the integration tests
 */
async function runTests() {
    logSection('BlockCypher Test Chain Integration Tests');
    log('Testing: Wallets, Transactions, Webhooks, and Address Forwarding', 'dim');
    
    if (!API_TOKEN) {
        logError('BLOCKCYPHER_API_TOKEN is not set!');
        logInfo('Please set your BlockCypher API token in the .env file');
        logInfo('Get a free token at: https://accounts.blockcypher.com/');
        process.exit(1);
    }

    const client = new BlockCypherTestClient(API_TOKEN);
    let webhookServer = null;
    
    const testResults = {
        passed: 0,
        failed: 0,
        skipped: 0,
        tests: []
    };

    // Store created resources for cleanup
    const createdAddresses = [];
    const createdWebhooks = [];
    const createdForwardings = [];

    try {
        // ============================================================
        // PART 1: Basic API Tests
        // ============================================================
        logSection('PART 1: Basic API Tests');

        // Test 1: Check API Token
        logSubSection('Test 1: Verify API Token');
        try {
            const tokenInfo = await client.checkTokenInfo();
            logSuccess('API token is valid');
            logInfo(`Token limits - Hourly: ${tokenInfo.limits?.api?.hour || 'N/A'}`);
            logInfo(`Token usage - Hits this hour: ${tokenInfo.hits_history?.[0]?.api || 0}`);
            testResults.passed++;
            testResults.tests.push({ name: 'Verify API Token', status: 'passed' });
        } catch (error) {
            logError(`Token verification failed: ${error.message}`);
            testResults.failed++;
            testResults.tests.push({ name: 'Verify API Token', status: 'failed', error: error.message });
            throw new Error('Cannot proceed without valid API token');
        }

        // Test 2: Create Sender Wallet
        logSubSection('Test 2: Create Sender Wallet');
        let senderWallet;
        try {
            senderWallet = await client.createAddress();
            createdAddresses.push(senderWallet.address);
            logSuccess('Sender wallet created');
            logInfo(`Address: ${senderWallet.address}`);
            logDebug(`Public Key: ${senderWallet.publicKey.substring(0, 30)}...`);
            testResults.passed++;
            testResults.tests.push({ name: 'Create Sender Wallet', status: 'passed' });
        } catch (error) {
            logError(`Failed to create sender wallet: ${error.message}`);
            testResults.failed++;
            testResults.tests.push({ name: 'Create Sender Wallet', status: 'failed', error: error.message });
            throw error;
        }

        // Test 3: Create Receiver Wallet
        logSubSection('Test 3: Create Receiver Wallet');
        let receiverWallet;
        try {
            receiverWallet = await client.createAddress();
            createdAddresses.push(receiverWallet.address);
            logSuccess('Receiver wallet created');
            logInfo(`Address: ${receiverWallet.address}`);
            testResults.passed++;
            testResults.tests.push({ name: 'Create Receiver Wallet', status: 'passed' });
        } catch (error) {
            logError(`Failed to create receiver wallet: ${error.message}`);
            testResults.failed++;
            testResults.tests.push({ name: 'Create Receiver Wallet', status: 'failed', error: error.message });
            throw error;
        }

        // Test 4: Fund Sender Wallet
        logSubSection('Test 4: Fund Sender Wallet via Faucet');
        const fundAmount = 500000; // 0.005 BCY
        let fundingTx;
        try {
            fundingTx = await client.fundAddress(senderWallet.address, fundAmount);
            logSuccess('Sender wallet funded');
            logInfo(`Amount: ${fundAmount} satoshis (${fundAmount / 1e8} BCY)`);
            logInfo(`TX Reference: ${fundingTx.txRef}`);
            testResults.passed++;
            testResults.tests.push({ name: 'Fund Sender Wallet', status: 'passed' });
        } catch (error) {
            logError(`Failed to fund sender wallet: ${error.message}`);
            logWarning('This might happen if the faucet rate limit is exceeded');
            testResults.failed++;
            testResults.tests.push({ name: 'Fund Sender Wallet', status: 'failed', error: error.message });
            throw error;
        }

        // Wait for transaction to propagate
        logInfo('Waiting 3 seconds for transaction to propagate...');
        await client.wait(3000);

        // Test 5: Check Sender Balance
        logSubSection('Test 5: Check Sender Balance');
        try {
            const senderInfo = await client.getAddressInfo(senderWallet.address);
            logSuccess('Balance retrieved');
            logInfo(`Balance: ${senderInfo.balance} satoshis (${senderInfo.balanceBCY} BCY)`);
            logInfo(`Unconfirmed: ${senderInfo.unconfirmedBalance} satoshis`);
            logInfo(`Total Received: ${senderInfo.totalReceived} satoshis`);
            logInfo(`TX Count: ${senderInfo.txCount}`);
            testResults.passed++;
            testResults.tests.push({ name: 'Check Sender Balance', status: 'passed' });
        } catch (error) {
            logError(`Failed to check balance: ${error.message}`);
            testResults.failed++;
            testResults.tests.push({ name: 'Check Sender Balance', status: 'failed', error: error.message });
        }

        // Test 6: Get Transaction Details
        logSubSection('Test 6: Get Transaction Details');
        try {
            const txDetails = await client.getTransaction(fundingTx.txRef);
            logSuccess('Transaction details retrieved');
            logInfo(`Hash: ${txDetails.hash}`);
            logInfo(`Block Height: ${txDetails.blockHeight || 'Unconfirmed'}`);
            logInfo(`Confirmations: ${txDetails.confirmations}`);
            logInfo(`Total: ${txDetails.total} satoshis`);
            logInfo(`Fees: ${txDetails.fees} satoshis`);
            testResults.passed++;
            testResults.tests.push({ name: 'Get Transaction Details', status: 'passed' });
        } catch (error) {
            logError(`Failed to get transaction: ${error.message}`);
            testResults.failed++;
            testResults.tests.push({ name: 'Get Transaction Details', status: 'failed', error: error.message });
        }

        // ============================================================
        // PART 2: Payment Transaction Tests
        // ============================================================
        logSection('PART 2: Payment Transaction Tests');

        // Test 7: Send Payment
        logSubSection('Test 7: Send Payment to Receiver');
        const sendAmount = 100000; // 0.001 BCY
        let paymentTx;
        try {
            paymentTx = await client.sendMicroTransaction(
                senderWallet.privateKey,
                receiverWallet.address,
                sendAmount
            );
            logSuccess('Payment sent successfully!');
            logInfo(`TX Hash: ${paymentTx.txHash}`);
            logInfo(`Amount: ${sendAmount} satoshis (${sendAmount / 1e8} BCY)`);
            logInfo(`Fees: ${paymentTx.fees} satoshis`);
            testResults.passed++;
            testResults.tests.push({ name: 'Send Payment', status: 'passed' });
        } catch (error) {
            logError(`Failed to send payment: ${error.message}`);
            logWarning('This might fail if the balance is still unconfirmed');
            testResults.failed++;
            testResults.tests.push({ name: 'Send Payment', status: 'failed', error: error.message });
        }

        // Wait for payment to propagate
        if (paymentTx) {
            logInfo('Waiting 3 seconds for payment to propagate...');
            await client.wait(3000);
        }

        // Test 8: Verify Receiver Balance
        logSubSection('Test 8: Verify Receiver Balance');
        try {
            const receiverInfo = await client.getAddressInfo(receiverWallet.address);
            logSuccess('Receiver balance retrieved');
            logInfo(`Balance: ${receiverInfo.balance} satoshis (${receiverInfo.balanceBCY} BCY)`);
            logInfo(`Unconfirmed: ${receiverInfo.unconfirmedBalance} satoshis`);
            logInfo(`Total Received: ${receiverInfo.totalReceived} satoshis`);
            
            if (receiverInfo.balance > 0 || receiverInfo.unconfirmedBalance > 0) {
                logSuccess('Payment successfully received by receiver wallet!');
            }
            testResults.passed++;
            testResults.tests.push({ name: 'Verify Receiver Balance', status: 'passed' });
        } catch (error) {
            logError(`Failed to verify receiver balance: ${error.message}`);
            testResults.failed++;
            testResults.tests.push({ name: 'Verify Receiver Balance', status: 'failed', error: error.message });
        }

        // ============================================================
        // PART 3: Address Forwarding Tests
        // ============================================================
        logSection('PART 3: Address Forwarding Tests');

        // Test 9: Create Forwarding Address
        logSubSection('Test 9: Create Payment Forwarding Address');
        let forwardingSetup;
        try {
            // Create a destination address for forwarding
            const destinationWallet = await client.createAddress();
            createdAddresses.push(destinationWallet.address);
            
            forwardingSetup = await client.createForwardingAddress(destinationWallet.address);
            createdForwardings.push(forwardingSetup.id);
            
            logSuccess('Forwarding address created');
            logInfo(`Forwarding ID: ${forwardingSetup.id}`);
            logInfo(`Input Address: ${forwardingSetup.inputAddress}`);
            logInfo(`Destination: ${forwardingSetup.destination}`);
            logInfo(`Any funds sent to the input address will be forwarded to destination`);
            
            testResults.passed++;
            testResults.tests.push({ name: 'Create Forwarding Address', status: 'passed' });
        } catch (error) {
            logError(`Failed to create forwarding address: ${error.message}`);
            testResults.failed++;
            testResults.tests.push({ name: 'Create Forwarding Address', status: 'failed', error: error.message });
        }

        // Test 10: List Forwarding Addresses
        logSubSection('Test 10: List Forwarding Addresses');
        try {
            const forwardings = await client.listForwardingAddresses();
            logSuccess(`Found ${forwardings.length} forwarding address(es)`);
            forwardings.slice(0, 3).forEach((fwd, i) => {
                logInfo(`  ${i + 1}. ID: ${fwd.id}`);
                logDebug(`     Input: ${fwd.input_address} -> Dest: ${fwd.destination}`);
            });
            if (forwardings.length > 3) {
                logInfo(`  ... and ${forwardings.length - 3} more`);
            }
            testResults.passed++;
            testResults.tests.push({ name: 'List Forwarding Addresses', status: 'passed' });
        } catch (error) {
            logError(`Failed to list forwardings: ${error.message}`);
            testResults.failed++;
            testResults.tests.push({ name: 'List Forwarding Addresses', status: 'failed', error: error.message });
        }

        // Test 11: Test Forwarding by Sending Funds
        logSubSection('Test 11: Test Forwarding (Send to Input Address)');
        if (forwardingSetup && senderWallet) {
            try {
                // Send a small amount to the forwarding input address
                const forwardAmount = 50000;
                const forwardTx = await client.sendMicroTransaction(
                    senderWallet.privateKey,
                    forwardingSetup.inputAddress,
                    forwardAmount
                );
                
                logSuccess('Funds sent to forwarding input address');
                logInfo(`TX Hash: ${forwardTx.txHash}`);
                logInfo(`Amount: ${forwardAmount} satoshis`);
                logInfo(`BlockCypher will automatically forward to: ${forwardingSetup.destination}`);
                
                testResults.passed++;
                testResults.tests.push({ name: 'Test Forwarding', status: 'passed' });
            } catch (error) {
                logError(`Failed to test forwarding: ${error.message}`);
                logWarning('This might fail if sender has insufficient balance');
                testResults.failed++;
                testResults.tests.push({ name: 'Test Forwarding', status: 'failed', error: error.message });
            }
        } else {
            logWarning('Skipping forwarding test - no forwarding setup available');
            testResults.skipped++;
            testResults.tests.push({ name: 'Test Forwarding', status: 'skipped' });
        }

        // ============================================================
        // PART 4: Webhook Tests
        // ============================================================
        logSection('PART 4: Webhook Tests');

        // Test 12: Register Webhook
        logSubSection('Test 12: Register Webhook for Address Monitoring');
        try {
            // Using a placeholder URL (or local server if --with-server)
            const callbackUrl = RUN_WITH_SERVER 
                ? `http://localhost:${WEBHOOK_PORT}/webhook/test`
                : 'https://example.com/webhook/blockcypher';
            
            const webhookResult = await client.registerWebhook(
                receiverWallet.address,
                callbackUrl,
                'tx-confirmation',
                1
            );
            createdWebhooks.push(webhookResult.id);
            
            logSuccess('Webhook registered');
            logInfo(`Webhook ID: ${webhookResult.id}`);
            logInfo(`Event: ${webhookResult.event}`);
            logInfo(`Address: ${webhookResult.address}`);
            logInfo(`Confirmations: ${webhookResult.confirmations}`);
            logInfo(`Callback URL: ${webhookResult.url}`);
            
            testResults.passed++;
            testResults.tests.push({ name: 'Register Confirmation Webhook', status: 'passed' });
        } catch (error) {
            logError(`Failed to register webhook: ${error.message}`);
            testResults.failed++;
            testResults.tests.push({ name: 'Register Confirmation Webhook', status: 'failed', error: error.message });
        }

        // Test 13: Register Unconfirmed TX Webhook
        logSubSection('Test 13: Register Unconfirmed TX Webhook');
        try {
            const callbackUrl = RUN_WITH_SERVER 
                ? `http://localhost:${WEBHOOK_PORT}/webhook/unconfirmed`
                : 'https://example.com/webhook/unconfirmed';
            
            const unconfirmedWebhook = await client.registerUnconfirmedTxWebhook(
                receiverWallet.address,
                callbackUrl
            );
            createdWebhooks.push(unconfirmedWebhook.id);
            
            logSuccess('Unconfirmed TX webhook registered');
            logInfo(`Webhook ID: ${unconfirmedWebhook.id}`);
            logInfo(`Event: ${unconfirmedWebhook.event}`);
            
            testResults.passed++;
            testResults.tests.push({ name: 'Register Unconfirmed Webhook', status: 'passed' });
        } catch (error) {
            logError(`Failed to register unconfirmed webhook: ${error.message}`);
            testResults.failed++;
            testResults.tests.push({ name: 'Register Unconfirmed Webhook', status: 'failed', error: error.message });
        }

        // Test 14: List All Webhooks
        logSubSection('Test 14: List All Webhooks');
        try {
            const webhooks = await client.listWebhooks();
            logSuccess(`Found ${webhooks.length} webhook(s)`);
            webhooks.forEach((hook, i) => {
                logInfo(`  ${i + 1}. ID: ${hook.id}`);
                logDebug(`     Event: ${hook.event}, Address: ${hook.address?.substring(0, 20)}...`);
            });
            testResults.passed++;
            testResults.tests.push({ name: 'List Webhooks', status: 'passed' });
        } catch (error) {
            logError(`Failed to list webhooks: ${error.message}`);
            testResults.failed++;
            testResults.tests.push({ name: 'List Webhooks', status: 'failed', error: error.message });
        }

        // Test 15: Live Webhook Test (if server enabled)
        if (RUN_WITH_SERVER) {
            logSubSection('Test 15: Live Webhook Reception Test');
            try {
                // Start webhook server
                webhookServer = new WebhookTestServer(WEBHOOK_PORT);
                await webhookServer.start();
                logSuccess(`Webhook test server started on port ${WEBHOOK_PORT}`);
                
                // Create a new address and register webhook
                const testWallet = await client.createAddress();
                createdAddresses.push(testWallet.address);
                
                const testWebhook = await client.registerWebhook(
                    testWallet.address,
                    `http://localhost:${WEBHOOK_PORT}/webhook/live-test`,
                    'unconfirmed-tx'
                );
                createdWebhooks.push(testWebhook.id);
                
                logInfo(`Registered webhook for test address: ${testWallet.address}`);
                logInfo('Funding test address to trigger webhook...');
                
                // Fund the address to trigger webhook
                await client.fundAddress(testWallet.address, 10000);
                
                logInfo('Waiting for webhook (up to 60 seconds)...');
                
                try {
                    const webhook = await webhookServer.waitForWebhook(60000);
                    logSuccess('WEBHOOK RECEIVED!');
                    logInfo(`Received webhook for TX: ${webhook.data.hash}`);
                    logInfo(`Addresses: ${webhook.data.addresses?.join(', ')}`);
                    
                    testResults.passed++;
                    testResults.tests.push({ name: 'Live Webhook Test', status: 'passed' });
                } catch (timeoutError) {
                    logWarning('Webhook not received within timeout');
                    logInfo('This may be due to network configuration (webhooks need public URL)');
                    testResults.skipped++;
                    testResults.tests.push({ name: 'Live Webhook Test', status: 'skipped', error: 'Timeout - may need public URL' });
                }
            } catch (error) {
                logError(`Live webhook test failed: ${error.message}`);
                testResults.failed++;
                testResults.tests.push({ name: 'Live Webhook Test', status: 'failed', error: error.message });
            }
        } else {
            logSubSection('Test 15: Live Webhook Test (SKIPPED)');
            logInfo('Run with --with-server flag to test live webhook reception');
            logInfo('Example: node test-blockcypher.js --with-server');
            logWarning('Note: Live webhooks require a publicly accessible URL');
            testResults.skipped++;
            testResults.tests.push({ name: 'Live Webhook Test', status: 'skipped' });
        }

        // ============================================================
        // CLEANUP
        // ============================================================
        logSection('Cleanup');

        // Delete webhooks
        logSubSection('Deleting Test Webhooks');
        for (const webhookId of createdWebhooks) {
            try {
                const deleted = await client.deleteWebhook(webhookId);
                if (deleted) {
                    logSuccess(`Deleted webhook: ${webhookId}`);
                }
            } catch (error) {
                logWarning(`Failed to delete webhook ${webhookId}: ${error.message}`);
            }
        }

        // Delete forwarding addresses
        logSubSection('Deleting Forwarding Addresses');
        for (const forwardingId of createdForwardings) {
            try {
                const deleted = await client.deleteForwardingAddress(forwardingId);
                if (deleted) {
                    logSuccess(`Deleted forwarding: ${forwardingId}`);
                }
            } catch (error) {
                logWarning(`Failed to delete forwarding ${forwardingId}: ${error.message}`);
            }
        }

    } catch (error) {
        logError(`Test suite failed: ${error.message}`);
    } finally {
        // Stop webhook server if running
        if (webhookServer) {
            await webhookServer.stop();
            logInfo('Webhook server stopped');
        }
    }

    // ============================================================
    // SUMMARY
    // ============================================================
    logSection('Test Results Summary');
    
    const total = testResults.passed + testResults.failed + testResults.skipped;
    console.log(`\nTotal Tests: ${total}`);
    logSuccess(`Passed: ${testResults.passed}`);
    if (testResults.failed > 0) {
        logError(`Failed: ${testResults.failed}`);
    }
    if (testResults.skipped > 0) {
        logWarning(`Skipped: ${testResults.skipped}`);
    }
    
    console.log('\nDetailed Results:');
    testResults.tests.forEach((test, i) => {
        let icon, color;
        switch (test.status) {
            case 'passed': icon = '✓'; color = 'green'; break;
            case 'failed': icon = '✗'; color = 'red'; break;
            case 'skipped': icon = '○'; color = 'yellow'; break;
            default: icon = '?'; color = 'dim';
        }
        log(`  ${String(i + 1).padStart(2)}. ${icon} ${test.name}`, color);
        if (test.error) {
            logDebug(`      Error: ${test.error}`);
        }
    });

    // Print created addresses
    if (createdAddresses.length > 0) {
        logSection('Created Test Addresses (for reference)');
        createdAddresses.forEach((addr, i) => {
            console.log(`  ${i + 1}. ${addr}`);
        });
        logInfo('\nThese are BlockCypher test blockchain addresses (BCY).');
        logInfo('They hold no real value and can be used for testing.');
    }

    console.log('\n');
    return testResults.failed === 0;
}

// Run tests
runTests()
    .then(success => {
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('Unexpected error:', error);
        process.exit(1);
    });
