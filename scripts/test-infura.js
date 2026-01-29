import { ethers } from 'ethers';

/**
 * Test user's Infura ETH RPC
 */

const infuraUrl = 'https://mainnet.infura.io/v3/ae135622e66844b5b7d0407e736894c5';

console.log('Testing Infura ETH RPC...\n');
console.log(`URL: ${infuraUrl}`);

try {
    const provider = new ethers.JsonRpcProvider(infuraUrl, null, {
        staticNetwork: ethers.Network.from(1)
    });

    const blockNumber = await provider.getBlockNumber();
    const block = await provider.getBlock(blockNumber);
    const network = await provider.getNetwork();

    console.log(`\n✅ SUCCESS!`);
    console.log(`  Block: ${blockNumber}`);
    console.log(`  Timestamp: ${new Date(block.timestamp * 1000).toISOString()}`);
    console.log(`  Network: ${network.name}`);
} catch (error) {
    console.log(`\n❌ FAILED: ${error.message}`);
    console.log('\nPossible issues:');
    console.log('1. Infura project ID may be incorrect');
    console.log('2. Infura API key may not have ETH mainnet access');
    console.log('3. Rate limiting or quota exceeded');
}
