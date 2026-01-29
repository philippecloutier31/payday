import { ethers } from 'ethers';

/**
 * Test ETH RPC connection
 */

// Test with multiple RPC endpoints
const rpcEndpoints = {
    eth: [
        'https://eth.llamarpc.com',
        'https://rpc.ankr.com/eth',
        'https://eth.public-rpc.com',
        'https://cloudflare-eth.com'
    ],
    beth: [
        'https://holesky.eth.public-rpc.com',
        'https://holesky.drpc.org'
    ]
};

async function testEthRpc() {
    console.log('Testing ETH RPC connections...\n');

    for (const rpcUrl of rpcEndpoints.eth) {
        console.log(`Testing: ${rpcUrl}`);
        try {
            const provider = new ethers.JsonRpcProvider(rpcUrl, null, {
                staticNetwork: ethers.Network.from(1)
            });

            const blockNumber = await provider.getBlockNumber();
            const block = await provider.getBlock(blockNumber);

            console.log(`  ✓ Connected! Block: ${blockNumber}`);
            console.log(`  ✓ Timestamp: ${new Date(block.timestamp * 1000).toISOString()}`);
            console.log(`  ✓ Network: ${(await provider.getNetwork()).name}`);
            console.log(`\n✅ ETH RPC working: ${rpcUrl}\n`);
            return rpcUrl;
        } catch (error) {
            console.log(`  ✗ Failed: ${error.message?.substring(0, 50)}...`);
        }
    }
    console.log('❌ All ETH RPC endpoints failed');
    return null;
}

async function testbethRpc() {
    console.log('\nTesting BETH (Holesky) RPC connections...\n');

    for (const rpcUrl of rpcEndpoints.beth) {
        console.log(`Testing: ${rpcUrl}`);
        try {
            const provider = new ethers.JsonRpcProvider(rpcUrl, null, {
                staticNetwork: ethers.Network.from(17000)
            });

            const blockNumber = await provider.getBlockNumber();
            const block = await provider.getBlock(blockNumber);

            console.log(`  ✓ Connected! Block: ${blockNumber}`);
            console.log(`  ✓ Timestamp: ${new Date(block.timestamp * 1000).toISOString()}`);
            console.log(`  ✓ Network: ${(await provider.getNetwork()).name}`);
            console.log(`\n✅ BETH RPC working: ${rpcUrl}\n`);
            return rpcUrl;
        } catch (error) {
            console.log(`  ✗ Failed: ${error.message?.substring(0, 50)}...`);
        }
    }
    console.log('❌ All BETH RPC endpoints failed');
    return null;
}

const ethWorking = await testEthRpc();
const bethWorking = await testbethRpc();

console.log('\n========== SUMMARY ==========');
if (ethWorking) {
    console.log(`ETH:  Use ETH_RPC_URL=${ethWorking}`);
}
if (bethWorking) {
    console.log(`BETH: Use BETH_RPC_URL=${bethWorking}`);
}
