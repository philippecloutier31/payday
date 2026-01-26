import fetch from 'node-fetch';
import config from './src/config/env.js';

const API_ROOT = 'https://api.blockcypher.com/v1';
const TOKEN = config.BLOCKCYPHER_API_TOKEN;

async function check() {
    const res = await fetch(`${API_ROOT}/btc/test3/hooks?token=${TOKEN}`);
    const hooks = await res.json();
    console.log('COUNT:', hooks.length);
    hooks.forEach(h => {
        console.log(`ID: ${h.id} | ERRORS: ${h.callback_errors} | URL: ${h.url}`);
    });
}

check();
