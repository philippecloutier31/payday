#!/usr/bin/env node

/**
 * BlockCypher Test Workflow Script
 * 
 * This script tests the complete payment flow on BlockCypher's Test Chain (bcy/test):
 * 1. Generate a local payment address (like wallet.service.js does for BTC)
 * 2. Register a webhook for transaction confirmations
 * 3. Send 0.001 BCY from TEST_SENDING_ADDRESS to the payment address
 * 4. Wait for webhook confirmations
 * 
 * Note: BCY is BlockCypher's proprietary test chain. Unlike BTC where we can generate
 * addresses locally using bitcoinjs-lib (wallet.service.js), BCY addresses must be
 * generated via BlockCypher's API. This simulates the same flow as wallet.service.js
 * but for the BCY test chain.
 * 
 * Usage: npm run dev:test:workflow
 */

import fetch from 'node-fetch';
import express from 'express';
import * as ecc from 'tiny-secp256k1';
import config from '../src/config/env.js';

// Constants
const CHAIN = 'bcy/test';
const API_BASE = `${config.BLOCKCYPHER_API_URL}/${CHAIN}`;
const AMOUNT_SATOSHIS = 10000; // 0.0001 BCY (low amount to ensure fees are covered)
const REQUIRED_CONFIRMATIONS = 1; // BCY test chain confirms quickly
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes timeout

// Test wallet configuration
const TEST_SENDER = {
    address: config.TEST_SENDING_ADDRESS,
    privateKey: config.TEST_SENDING_PRIVATE_KEY
};
const TEST_RECEIVER = config.TEST_RECEIVING_ADDRESS;

// State
let webhookServer = null;
let webhookId = null;
let paymentAddress = null; // The locally generated payment address
let paymentAddressPrivateKey = null; // Private key for the payment address
let confirmationResolve = null;
let confirmations = 0;

/**
 * Log with timestamp
 */
function log(message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
    if (data) {
        console.log(JSON.stringify(data, null, 2));
    }
}

/**
 * Make API request to BlockCypher
 */
async function apiRequest(endpoint, method = 'GET', body = null) {
    const url = `${API_BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}token=${config.BLOCKCYPHER_API_TOKEN}`;
    
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };
    
    if (body) {
        options.body = JSON.stringify(body);
    }
    
    const response = await fetch(url, options);
    
    // Handle DELETE requests that return no content
    if (method === 'DELETE' && response.status === 204) {
        return { success: true };
    }
    
    // Handle empty responses
    const text = await response.text();
    if (!text) {
        if (response.ok) return { success: true };
        throw new Error(`API Error: Empty response with status ${response.status}`);
    }
    
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        throw new Error(`API Error: Invalid JSON response - ${text.substring(0, 200)}`);
    }
    
    if (!response.ok) {
        // Log full error for debugging
        console.error('BlockCypher API Error Response:', JSON.stringify(data, null, 2));
        
        // Handle different error formats from BlockCypher
        let errorMsg = 'Unknown error';
        if (Array.isArray(data.errors)) {
            // errors can be array of strings or objects
            errorMsg = data.errors.map(e => typeof e === 'string' ? e : JSON.stringify(e)).join(', ');
        } else if (typeof data.error === 'string') {
            errorMsg = data.error;
        } else if (data.error) {
            errorMsg = JSON.stringify(data.error);
        } else if (data.message) {
            errorMsg = data.message;
        } else {
            errorMsg = JSON.stringify(data);
        }
        throw new Error(`API Error (${response.status}): ${errorMsg}`);
    }
    
    return data;
}

/**
 * Step 1: Generate a local payment address
 * 
 * This is equivalent to what wallet.service.js does for BTC:
 * - Generates a new address that we fully control
 * - Stores the private key locally (not using BlockCypher's forwarding)
 * - The address acts as an intermediary for receiving payments
 * 
 * For BCY test chain, we use BlockCypher's /addrs endpoint since BCY addresses
 * cannot be generated locally with bitcoinjs-lib (BCY is proprietary).
 */
async function generatePaymentAddress() {
    log('Step 1: Generating local payment address...');
    log('(Equivalent to wallet.service.js address generation for BTC)');
    
    // Generate a new BCY address - this gives us full control with private key
    // Similar to how wallet.service.js generates BTC addresses locally
    const data = await apiRequest('/addrs', 'POST');
    
    // Store the address and private key (like wallet.service stores derived keys)
    paymentAddress = data.address;
    paymentAddressPrivateKey = data.private;
    
    log('Payment address generated:', {
        address: data.address,
        public: data.public,
        // Note: In production, never log private keys!
        private_key_stored: '(stored securely for signing)'
    });
    
    log(`This address will receive payments and can forward to: ${TEST_RECEIVER}`);
    
    return data.address;
}

/**
 * Step 2: Register webhook for transaction confirmations
 */
async function registerWebhook(address) {
    log('Step 2: Registering webhook for confirmations...');
    
    const callbackUrl = `${config.WEBHOOK_BASE_URL}/webhook/blockcypher?secret=${encodeURIComponent(config.WEBHOOK_SECRET)}`;
    
    const data = await apiRequest('/hooks', 'POST', {
        event: 'tx-confirmation',
        address: address,
        url: callbackUrl,
        confirmations: REQUIRED_CONFIRMATIONS
    });
    
    webhookId = data.id;
    log('Webhook registered:', {
        id: data.id,
        event: data.event,
        address: data.address,
        confirmations: data.confirmations
    });
    
    return data.id;
}

/**
 * Sign a hash with a private key using ECDSA (secp256k1)
 * Returns DER-encoded signature as hex string
 */
function signHash(hashHex, privateKeyHex) {
    const hash = Buffer.from(hashHex, 'hex');
    const privateKey = Buffer.from(privateKeyHex, 'hex');
    
    // Sign using tiny-secp256k1
    const signature = ecc.sign(hash, privateKey);
    
    // Convert to DER format
    const r = signature.slice(0, 32);
    const s = signature.slice(32, 64);
    
    // Remove leading zeros and ensure positive
    function encodeInt(buf) {
        let i = 0;
        while (i < buf.length && buf[i] === 0) i++;
        if (i === buf.length) return Buffer.from([0]);
        // If high bit is set, prepend 0x00
        if (buf[i] & 0x80) {
            return Buffer.concat([Buffer.from([0]), buf.slice(i)]);
        }
        return buf.slice(i);
    }
    
    const rEnc = encodeInt(r);
    const sEnc = encodeInt(s);
    
    // DER format: 0x30 [total-len] 0x02 [r-len] [r] 0x02 [s-len] [s]
    const der = Buffer.concat([
        Buffer.from([0x30, rEnc.length + sEnc.length + 4]),
        Buffer.from([0x02, rEnc.length]),
        rEnc,
        Buffer.from([0x02, sEnc.length]),
        sEnc
    ]);
    
    return der.toString('hex');
}

/**
 * Get public key from private key
 */
function getPublicKey(privateKeyHex) {
    const privateKey = Buffer.from(privateKeyHex, 'hex');
    const publicKey = ecc.pointFromScalar(privateKey, true); // compressed
    return Buffer.from(publicKey).toString('hex');
}

/**
 * Step 3: Send BCY from test sender to the payment address
 * Uses BlockCypher's two-phase transaction API with local signing
 */
async function sendTransaction(toAddress) {
    log('Step 3: Sending transaction...');
    log(`From: ${TEST_SENDER.address}`);
    log(`To: ${toAddress} (payment address)`);
    log(`Amount: ${AMOUNT_SATOSHIS} satoshis (${AMOUNT_SATOSHIS / 1e8} BCY)`);
    
    // Phase 1: Create unsigned transaction skeleton
    log('Creating transaction skeleton...');
    const txSkeleton = await apiRequest('/txs/new', 'POST', {
        inputs: [{ addresses: [TEST_SENDER.address] }],
        outputs: [{ addresses: [toAddress], value: AMOUNT_SATOSHIS }]
    });
    
    log('Transaction skeleton created:', {
        hash: txSkeleton.tx.hash,
        fees: txSkeleton.tx.fees,
        inputs: txSkeleton.tx.inputs?.length || 0,
        outputs: txSkeleton.tx.outputs?.length || 0,
        tosign_count: txSkeleton.tosign?.length || 0
    });
    
    // Phase 2: Sign the tosign hashes locally
    log('Signing transaction locally...');
    const pubkey = getPublicKey(TEST_SENDER.privateKey);
    
    txSkeleton.signatures = [];
    txSkeleton.pubkeys = [];
    
    for (const toSign of txSkeleton.tosign) {
        const signature = signHash(toSign, TEST_SENDER.privateKey);
        txSkeleton.signatures.push(signature);
        txSkeleton.pubkeys.push(pubkey);
    }
    
    log('Transaction signed:', {
        signatures: txSkeleton.signatures.length,
        pubkeys: txSkeleton.pubkeys.length
    });
    
    // Phase 3: Broadcast the signed transaction
    log('Broadcasting transaction...');
    const result = await apiRequest('/txs/send', 'POST', txSkeleton);
    
    const txHash = result.tx.hash;
    log('='.repeat(60));
    log(`TRANSACTION HASH: ${txHash}`);
    log('='.repeat(60));
    log('Transaction details:', {
        hash: result.tx.hash,
        total: result.tx.total,
        fees: result.tx.fees,
        confirmations: result.tx.confirmations
    });
    
    return txHash;
}

/**
 * Step 4: Start webhook server and wait for confirmations
 */
async function startWebhookServer() {
    return new Promise((resolve, reject) => {
        const app = express();
        app.use(express.json());
        
        // Webhook endpoint
        app.post('/webhook/blockcypher', (req, res) => {
            const secret = req.query.secret;
            
            // Validate secret
            if (secret !== config.WEBHOOK_SECRET) {
                log('WARNING: Invalid webhook secret received');
                return res.status(401).json({ error: 'Invalid secret' });
            }
            
            const payload = req.body;
            log('Webhook received:', {
                hash: payload.hash,
                confirmations: payload.confirmations,
                outputs: payload.outputs?.length || 0
            });
            
            // Update confirmation count
            if (payload.confirmations !== undefined) {
                confirmations = payload.confirmations;
                log(`Confirmation update: ${confirmations}/${REQUIRED_CONFIRMATIONS}`);
                
                if (confirmations >= REQUIRED_CONFIRMATIONS && confirmationResolve) {
                    confirmationResolve(payload);
                }
            }
            
            res.status(200).json({ received: true });
        });
        
        // Health check
        app.get('/health', (req, res) => {
            res.json({ status: 'ok', confirmations });
        });
        
        // Start server
        const port = parseInt(config.PORT) || 3001;
        webhookServer = app.listen(port, () => {
            log(`Webhook server started on port ${port}`);
            log(`Webhook URL: ${config.WEBHOOK_BASE_URL}/webhook/blockcypher`);
            resolve(webhookServer);
        });
        
        webhookServer.on('error', reject);
    });
}

/**
 * Wait for confirmations via webhook
 */
async function waitForConfirmations() {
    log('Step 4: Waiting for confirmations via webhook...');
    log(`Required confirmations: ${REQUIRED_CONFIRMATIONS}`);
    log(`Timeout: ${TIMEOUT_MS / 1000} seconds`);
    
    return new Promise((resolve, reject) => {
        // Set up the resolve function for webhook callback
        confirmationResolve = resolve;
        
        // Set up timeout
        const timeout = setTimeout(() => {
            reject(new Error(`Timeout waiting for confirmations after ${TIMEOUT_MS / 1000} seconds`));
        }, TIMEOUT_MS);
        
        // Wrap resolve to clear timeout
        const originalResolve = confirmationResolve;
        confirmationResolve = (data) => {
            clearTimeout(timeout);
            originalResolve(data);
        };
    });
}

/**
 * Cleanup resources
 */
async function cleanup() {
    log('Cleaning up...');
    
    // Delete webhook if created
    if (webhookId) {
        try {
            await apiRequest(`/hooks/${webhookId}`, 'DELETE');
            log(`Webhook ${webhookId} deleted`);
        } catch (error) {
            log(`Failed to delete webhook: ${error.message}`);
        }
    }
    
    // Stop webhook server
    if (webhookServer) {
        webhookServer.close();
        log('Webhook server stopped');
    }
}

/**
 * Main workflow
 */
async function main() {
    console.log('\n' + '='.repeat(60));
    console.log('BlockCypher Test Workflow (Local Address Generation)');
    console.log('Chain: bcy/test (BlockCypher Test Chain)');
    console.log('='.repeat(60) + '\n');
    
    // Validate configuration
    if (!config.BLOCKCYPHER_API_TOKEN) {
        throw new Error('BLOCKCYPHER_API_TOKEN not configured');
    }
    if (!TEST_SENDER.address || !TEST_SENDER.privateKey) {
        throw new Error('TEST_SENDING_ADDRESS or TEST_SENDING_PRIVATE_KEY not configured');
    }
    if (!TEST_RECEIVER) {
        throw new Error('TEST_RECEIVING_ADDRESS not configured');
    }
    if (!config.WEBHOOK_BASE_URL || config.WEBHOOK_BASE_URL.includes('localhost')) {
        log('WARNING: WEBHOOK_BASE_URL appears to be localhost. Webhooks require a public URL.');
        log('Consider using ngrok or similar for testing.');
    }
    
    log('Configuration validated');
    log(`Sender: ${TEST_SENDER.address}`);
    log(`Final Receiver: ${TEST_RECEIVER}`);
    log(`Webhook URL: ${config.WEBHOOK_BASE_URL}`);
    
    try {
        // Start webhook server first
        await startWebhookServer();
        
        // Step 1: Generate local payment address (like wallet.service.js)
        const generatedAddress = await generatePaymentAddress();
        
        // Step 2: Register webhook on the payment address
        await registerWebhook(generatedAddress);
        
        // Step 3: Send transaction from TEST_SENDER to payment address
        const txHash = await sendTransaction(generatedAddress);
        
        // Step 4: Wait for confirmations via webhook
        const finalTx = await waitForConfirmations();
        
        console.log('\n' + '='.repeat(60));
        console.log('TEST WORKFLOW COMPLETED SUCCESSFULLY');
        console.log('='.repeat(60));
        log('Final transaction:', {
            hash: finalTx.hash,
            confirmations: finalTx.confirmations,
            received: finalTx.received
        });
        log(`Payment received at: ${generatedAddress}`);
        log(`Ready to forward to: ${TEST_RECEIVER}`);
        log('(In production, funds would be forwarded to the main wallet)');
        
    } catch (error) {
        console.error('\n' + '='.repeat(60));
        console.error('TEST WORKFLOW FAILED');
        console.error('='.repeat(60));
        console.error('Error:', error.message);
        process.exitCode = 1;
    } finally {
        await cleanup();
    }
}

// Run the workflow
main();
