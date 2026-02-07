
import fs from 'fs';
import { ethers } from 'ethers';
import fetch from 'node-fetch';

const SUSPICIOUS = '0x5d53A1de1f8F28A805aAd5A321fb2104B342fe84'.toLowerCase(); // The destination
const API_URL = 'https://api.blockcypher.com/v1/eth/main';

let env = {};
try {
    const raw = fs.readFileSync('.env', 'utf8');
    raw.split('\n').forEach(line => {
        const parts = line.split('=');
        if (parts.length >= 2) {
            const key = parts[0].trim();
            const val = parts.slice(1).join('=').trim();
            if (key && !key.startsWith('#')) env[key] = val;
        }
    });
} catch (e) { console.error("No .env"); process.exit(1); }

const SEED = env.MASTER_SEED_PHRASE;
const TOKEN = env.BLOCKCYPHER_API_TOKEN;

async function run() {
    const mnemonic = ethers.Mnemonic.fromPhrase(SEED);
    const i = 25;
    const path = `m/44'/60'/0'/0/${i}`;
    const wallet = ethers.HDNodeWallet.fromMnemonic(mnemonic, path);

    console.log(`Checking Index 25: ${wallet.address}`);

    const res = await fetch(`${API_URL}/addrs/${wallet.address}?token=${TOKEN}`);
    const data = await res.json();

    console.log(`TxRefs found: ${data.txrefs?.length || 0}`);

    if (data.txrefs) {
        data.txrefs.forEach(t => {
            console.log(`\nTX: ${t.tx_hash}`);
            console.log(`   Value: ${t.value}`);
            console.log(`   Input N: ${t.tx_input_n}`);
            console.log(`   Output N: ${t.tx_output_n}`);

            if (t.tx_input_n !== -1) {
                console.log(`   -> IDENTIFIED AS SPEND`);
            }
        });

        // Check the specific suspicious TX
        const suspiciousTxHash = '0x7811a60d2811da5621b85c9797ec1a0c3c2dd71d6cf0d37aa81d3f7c062f3a19';
        console.log(`\nFetching suspicious TX details: ${suspiciousTxHash}`);

        const txRes = await fetch(`${API_URL}/txs/${suspiciousTxHash}?token=${TOKEN}`);
        const tx = await txRes.json();

        console.log('Outputs:');
        tx.outputs?.forEach((o, idx) => {
            console.log(`   [${idx}] Value: ${o.value}`);
            console.log(`   [${idx}] Addresses: ${JSON.stringify(o.addresses)}`);
            if (o.addresses?.some(a => a.toLowerCase() === SUSPICIOUS)) {
                console.log('   !!! MATCH FOUND HERE !!!');
            }
        });
    }
}

run();
