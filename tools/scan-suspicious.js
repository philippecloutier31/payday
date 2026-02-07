
import fs from 'fs';
import { ethers } from 'ethers';
import fetch from 'node-fetch';

const SUSPICIOUS = '0x5d53A1de1f8F28A805aAd5A321fb2104B342fe84'.toLowerCase();
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

if (!SEED) { console.error("No SEED"); process.exit(1); }

const delay = ms => new Promise(r => setTimeout(r, ms));

async function run() {
    const mnemonic = ethers.Mnemonic.fromPhrase(SEED);
    let found = 0;

    // File log
    const logFile = 'reports/scan_suspicious.txt';
    fs.writeFileSync(logFile, `Scan Start: ${new Date().toISOString()}\nFor: ${SUSPICIOUS}\n\n`);

    console.log(`Scanning indices 0-50...`);

    for (let i = 0; i <= 50; i++) {
        const path = `m/44'/60'/0'/0/${i}`;
        const wallet = ethers.HDNodeWallet.fromMnemonic(mnemonic, path);
        process.stdout.write(`[${i}] ${wallet.address} `);

        try {
            // Rate limit pre-check
            await delay(350);

            const res = await fetch(`${API_URL}/addrs/${wallet.address}?token=${TOKEN}`);
            if (!res.ok) {
                process.stdout.write(`Err ${res.status}\n`);
                continue;
            }
            const data = await res.json();

            if (data.txrefs) {
                const spends = data.txrefs.filter(t => t.tx_input_n !== -1);
                if (spends.length > 0) {
                    process.stdout.write(`-> ${spends.length} Exits. Checking... `);

                    for (const spend of spends) {
                        await delay(250);
                        const txRes = await fetch(`${API_URL}/txs/${spend.tx_hash}?token=${TOKEN}`);
                        if (txRes.ok) {
                            const tx = await txRes.json();
                            // Check outputs
                            const hit = tx.outputs && tx.outputs.some(o => o.addresses && o.addresses.some(a => a.toLowerCase() === SUSPICIOUS));
                            if (hit) {
                                console.log(`\n!!! MATCH !!! ${spend.tx_hash}`);
                                fs.appendFileSync(logFile, `MATCH: Index ${i} (${wallet.address}) -> ${spend.tx_hash}\n`);
                                found++;
                            }
                        }
                    }
                    process.stdout.write(`Done.\n`);
                } else {
                    process.stdout.write(`(Inbox only)\n`);
                }
            } else {
                process.stdout.write(`(Empty)\n`);
            }

        } catch (e) {
            process.stdout.write(`Ex: ${e.message}\n`);
        }
    }

    fs.appendFileSync(logFile, `\nComplete. Found: ${found}\n`);
    console.log(`Scan Complete. Found: ${found}`);
}

run();
