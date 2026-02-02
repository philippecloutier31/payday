import fetch from 'node-fetch';
import config from './src/config/env.js';

const API_ROOT = 'https://api.blockcypher.com/v1';
const TOKEN = config.BLOCKCYPHER_API_TOKEN;

async function cleanup() {
    console.log('--- Cleaning Webhooks on btc/test3 ---');
    const res = await fetch(`${API_ROOT}/btc/test3/hooks?token=${TOKEN}`);
    const hooks = await res.json();

    if (Array.isArray(hooks)) {
        for (const h of hooks) {
            console.log(`Deleting hook: ${h.id}`);
            await fetch(`${API_ROOT}/btc/test3/hooks/${h.id}?token=${TOKEN}`, { method: 'DELETE' });
        }
    }
    console.log('Cleanup Done.');
}

cleanup();
