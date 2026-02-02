import { ethers } from 'ethers';

const RPC_ENDPOINT = 'https://holesky.drpc.org';
const SEED = 'discover harsh version rotate will provide unveil panel notice acquire that rigid';

async function check() {
    const provider = new ethers.JsonRpcProvider(RPC_ENDPOINT);
    const mnemonic = ethers.Mnemonic.fromPhrase(SEED);

    console.log('Checking beth (Holesky) addresses around index 28...');

    for (let i = 20; i < 40; i++) {
        const path = `m/44'/60'/0'/0/${i}`;
        const wallet = ethers.HDNodeWallet.fromMnemonic(mnemonic, path);
        try {
            const balance = await provider.getBalance(wallet.address);
            const balanceEth = ethers.formatEther(balance);
            console.log(`Index ${i}: ${wallet.address} - ${balanceEth} ETH`);
        } catch (e) {
            console.log(`Index ${i}: Error: ${e.message}`);
        }
    }
}

check();
