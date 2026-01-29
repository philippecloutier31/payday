import { walletService } from '../src/services/wallet.service.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

/**
 * RESCUE UTILITY
 * Usage: node scripts/rescue-keys.js [crypto] [index]
 * Example: node scripts/rescue-keys.js eth 5
 */

const args = process.argv.slice(2);
const crypto = args[0] || 'eth';
const index = parseInt(args[1]);

if (isNaN(index)) {
    console.log('\n❌ ERROR: Please provide the crypto type and the index.');
    console.log('Usage: node scripts/rescue-keys.js <crypto> <index>');
    console.log('Example: node scripts/rescue-keys.js btc 12\n');
    process.exit(1);
}

try {
    const isTestnet = crypto.includes('_test') || crypto === 'bcy' || crypto === 'beth';
    const result = walletService.generateLocalAddress(crypto, index);

    console.log('\n--- 🛡️ PRIVATE KEY RECOVERY ---');
    console.log(`Cryptocurrency: ${crypto.toUpperCase()}`);
    console.log(`Wallet Index:   ${index}`);
    console.log(`Address:        ${result.address}`);
    console.log('-------------------------------');
    console.log(`PRIVATE KEY:    ${result.privateKey}`);
    if (result.wif) {
        console.log(`WIF (for BTC):  ${result.wif}`);
    }
    console.log('-------------------------------\n');
    console.log('⚠️ WARNING: Keep this key secret. Anyone with this key can move the funds.');

} catch (error) {
    console.error(`\n❌ ERROR: ${error.message}\n`);
}
