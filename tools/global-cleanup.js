import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '.env') });

const TOKEN = process.env.BLOCKCYPHER_API_TOKEN;
const API_ROOT = 'https://api.blockcypher.com/v1';

const CHAINS = [
    'bcy/test',
    'btc/test3',
    'btc/main',
    'eth/main'
];

async function cleanupChain(chain) {
    console.log(`\n--- Cleaning up resources on ${chain} ---`);

    // 1. Cleanup Webhooks
    try {
        const hooksRes = await fetch(`${API_ROOT}/${chain}/hooks?token=${TOKEN}`);
        if (hooksRes.ok) {
            const hooks = await hooksRes.json();
            if (Array.isArray(hooks)) {
                console.log(`Found ${hooks.length} webhooks on ${chain}`);
                for (const h of hooks) {
                    console.log(`  Deleting hook: ${h.id}`);
                    await fetch(`${API_ROOT}/${chain}/hooks/${h.id}?token=${TOKEN}`, { method: 'DELETE' });
                }
            }
        }
    } catch (e) { console.log(`  Error cleaning webhooks: ${e.message}`); }

    // 2. Cleanup Payment Forwardings
    try {
        const paymentsRes = await fetch(`${API_ROOT}/${chain}/payments?token=${TOKEN}`);
        if (paymentsRes.ok) {
            const payments = await paymentsRes.json();
            if (Array.isArray(payments)) {
                console.log(`Found ${payments.length} forwarding addresses on ${chain}`);
                for (const p of payments) {
                    console.log(`  Deleting forwarding: ${p.id}`);
                    await fetch(`${API_ROOT}/${chain}/payments/${p.id}?token=${TOKEN}`, { method: 'DELETE' });
                }
            }
        }
    } catch (e) { console.log(`  Error cleaning payments: ${e.message}`); }
}

async function runCleanup() {
    if (!TOKEN) {
        console.error('Error: BLOCKCYPHER_API_TOKEN not found in .env');
        return;
    }

    console.log('Starting Global Resource Cleanup for BlockCypher Token...');
    for (const chain of CHAINS) {
        await cleanupChain(chain);
    }
    console.log('\nCleanup Complete. You should have fresh limits now.');
}

runCleanup();
