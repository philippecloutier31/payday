import { ethers } from 'ethers';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const ETH_RPC_URL = process.env.ETH_RPC_URL || 'https://cloudflare-eth.com';
const BETH_RPC_URL = process.env.BETH_RPC_URL || 'https://ethereum-holesky-rpc.publicnode.com';

async function testConnection(name, url, chainId) {
    console.log(`\nTesting ${name} Connection...`);
    console.log(`URL: ${url}`);

    try {
        // This mirrors the fix we applied in address.service.js
        const provider = new ethers.JsonRpcProvider(url, null, {
            staticNetwork: ethers.Network.from(chainId)
        });

        const network = await provider.getNetwork();
        const blockNumber = await provider.getBlockNumber();
        const feeData = await provider.getFeeData();

        console.log(`✅ SUCCESS! Connected to chain ID: ${network.chainId}`);
        console.log(`   Block Height: ${blockNumber}`);
        console.log(`   Gas Price: ${ethers.formatUnits(feeData.gasPrice, 'gwei')} gwei`);
        return true;
    } catch (error) {
        console.log(`❌ FAILED: ${error.message}`);
        return false;
    }
}

async function run() {
    console.log('--- RPC Connectivity Check ---');

    // Test Mainnet (Chain ID 1)
    await testConnection('Ethereum Mainnet', ETH_RPC_URL, 1);

    // Test BETH/Holesky (Chain ID 17000)
    await testConnection('BETH (Holesky)', BETH_RPC_URL, 17000); // 17000 is Holesky

    console.log('\n------------------------------');
}

run();
