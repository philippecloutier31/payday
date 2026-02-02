import { ethers } from 'ethers';

const RPC_ENDPOINT = 'https://eth.llamarpc.com';
const SEED = 'discover harsh version rotate will provide unveil panel notice acquire that rigid';

async function check() {
    const provider = new ethers.JsonRpcProvider(RPC_ENDPOINT);
    const mnemonic = ethers.Mnemonic.fromPhrase(SEED);

    console.log('Checking first 20 ETH addresses...');

    for (let i = 0; i < 20; i++) {
        const path = `m/44'/60'/0'/0/${i}`;
        const wallet = ethers.HDNodeWallet.fromMnemonic(mnemonic, path);
        const balance = await provider.getBalance(wallet.address);
        const balanceEth = ethers.formatEther(balance);
        console.log(`Index ${i}: ${wallet.address} - ${balanceEth} ETH`);
    }
}

check();
