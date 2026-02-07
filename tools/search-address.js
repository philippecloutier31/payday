import { ethers } from 'ethers';

const SEED = 'discover harsh version rotate will provide unveil panel notice acquire that rigid';
const target = '0x1cc87a77516f41f17f2d91c57dae1d00b263f2b0'.toLowerCase();

async function check() {
    const mnemonic = ethers.Mnemonic.fromPhrase(SEED);
    console.log('Searching for address in HD wallet...');

    for (let i = 0; i < 100; i++) {
        const path = `m/44'/60'/0'/0/${i}`;
        const wallet = ethers.HDNodeWallet.fromMnemonic(mnemonic, path);
        if (wallet.address.toLowerCase() === target) {
            console.log(`FOUND at index ${i}: ${wallet.address}`);
            return;
        }
    }
    console.log('Not found in first 100 indices.');
}

check();
