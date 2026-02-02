import { ethers } from 'ethers';

const RPC_ENDPOINTS = [
    'https://eth.llamarpc.com',
    'https://rpc.ankr.com/eth',
    'https://ethereum.publicnode.com'
];

const addresses = [
    '0x2b8775C97333FCddE84B4a925Be127AB49981BDF',
    '0x03e77852c2b00C9B82AD6F7FF8aD260EFE1C3102',
    '0x2A99B41A4105ACccc0fB6E54Ac269cB27E6E75f2',
    '0xcCBAE07EF4EEa95ffF14275F467FF731D27ff08E'
];

async function getProvider() {
    for (const endpoint of RPC_ENDPOINTS) {
        try {
            const provider = new ethers.JsonRpcProvider(endpoint);
            await provider.getBlockNumber();
            return provider;
        } catch (e) { }
    }
}

async function check() {
    const provider = await getProvider();
    if (!provider) {
        console.error('Failed to connect to RPC');
        return;
    }
    for (const addr of addresses) {
        const balance = await provider.getBalance(addr);
        console.log(`${addr}: ${ethers.formatEther(balance)} ETH`);
    }
}

check();
