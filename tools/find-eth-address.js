
import { ethers } from 'ethers';

const SEED = 'discover harsh version rotate will provide unveil panel notice acquire that rigid';
const target = '0x5d53A1de1f8F28A805aAd5A321fb2104B342fe84'.toLowerCase();

async function check() {
    const mnemonic = ethers.Mnemonic.fromPhrase(SEED);
    console.log(`Searching for ${target} in HD wallet...\n`);

    for (let i = 0; i < 200; i++) {
        const path = `m/44'/60'/0'/0/${i}`;
        const wallet = ethers.HDNodeWallet.fromMnemonic(mnemonic, path);
        if (wallet.address.toLowerCase() === target) {
            console.log(`✓ FOUND at index ${i}`);
            console.log(`Address: ${wallet.address}`);
            console.log(`Path: ${path}`);
            return;
        }
    }
    console.log('✗ NOT FOUND in first 200 indices.');
    console.log('This is NOT one of your HD wallet addresses.');
}

check();
