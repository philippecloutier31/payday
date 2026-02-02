/**
 * Simple ETH Sweep Script - Single Private Key
 * 
 * Usage: node scripts/sweep-eth-single.js <PRIVATE_KEY> <RECEIVER_ADDRESS>
 * 
 * Example: node scripts/sweep-eth-single.js 0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
 */

import { ethers } from 'ethers';

// Configuration
const RPC_ENDPOINTS = [
    'https://eth.llamarpc.com',
    'https://rpc.ankr.com/eth',
    'https://ethereum.publicnode.com',
    'https://eth.drpc.org'
];

async function getProvider() {
    for (const endpoint of RPC_ENDPOINTS) {
        try {
            console.log(`Connecting to: ${endpoint}`);
            const provider = new ethers.JsonRpcProvider(endpoint);
            await provider.getBlockNumber(); // Test connection
            return provider;
        } catch (error) {
            console.log(`Failed to connect to ${endpoint}: ${error.message}`);
        }
    }
    throw new Error('Failed to connect to all RPC endpoints');
}

async function sweepETH(privateKey, receiverAddress) {
    try {
        console.log('\n=== ETH Sweep Script ===');
        console.log(`Receiver Address: ${receiverAddress}`);
        console.log(`Private Key: ${privateKey.substring(0, 10)}...${privateKey.substring(privateKey.length - 5)}`);
        console.log('');

        // Validate receiver address
        if (!ethers.isAddress(receiverAddress)) {
            throw new Error('Invalid receiver address');
        }

        // Create wallet from private key
        const wallet = new ethers.Wallet(privateKey);
        console.log(`Source Address: ${wallet.address}`);
        console.log('');

        // Get provider
        console.log('Connecting to Ethereum network...');
        const provider = await getProvider();
        console.log('Connected successfully!');
        console.log('');

        // Connect wallet to provider
        const connectedWallet = wallet.connect(provider);

        // Get balance
        console.log('Checking balance...');
        const balance = await provider.getBalance(wallet.address);
        const balanceEth = ethers.formatEther(balance);
        console.log(`Balance: ${balanceEth} ETH (${balance} wei)`);
        console.log('');

        if (balance === 0n) {
            console.log('No funds to sweep. Exiting.');
            return;
        }

        // Get current gas price
        console.log('Fetching gas price...');
        const feeData = await provider.getFeeData();
        console.log(`Gas Price: ${ethers.formatUnits(feeData.gasPrice, 'gwei')} gwei`);
        console.log('');

        // Estimate gas for transfer
        console.log('Estimating gas...');
        const gasEstimate = await provider.estimateGas({
            to: receiverAddress,
            from: wallet.address,
            value: balance
        });
        console.log(`Estimated Gas Limit: ${gasEstimate.toString()}`);
        console.log('');

        // Calculate total fee
        const gasPrice = feeData.gasPrice || feeData.maxFeePerGas;
        const totalFee = gasEstimate * gasPrice;
        const totalFeeEth = ethers.formatEther(totalFee);
        const amountToSend = balance - totalFee;
        const amountToSendEth = ethers.formatEther(amountToSend);

        console.log(`Total Fee: ${totalFeeEth} ETH (${totalFee} wei)`);
        console.log(`Amount to Send: ${amountToSendEth} ETH (${amountToSend} wei)`);
        console.log('');

        if (amountToSend <= 0n) {
            console.log('Insufficient funds to cover gas fee. Exiting.');
            return;
        }

        // Build transaction
        console.log('Building transaction...');
        const tx = await connectedWallet.populateTransaction({
            to: receiverAddress,
            value: amountToSend,
            gasLimit: gasEstimate,
            gasPrice: gasPrice
        });

        // Sign transaction
        console.log('Signing transaction...');
        const signedTx = await connectedWallet.signTransaction(tx);
        console.log('Transaction signed!');
        console.log('');

        // Safety countdown
        console.log('⚠️  SAFETY CHECK: Transaction will be broadcast in 5 seconds...');
        console.log('Press Ctrl+C to cancel');
        console.log('');

        await new Promise(resolve => setTimeout(resolve, 5000));

        // Broadcast
        console.log('Broadcasting transaction...');
        const txHash = await provider.broadcastTransaction(signedTx);
        console.log('');
        console.log('✅ SUCCESS!');
        console.log(`Transaction Hash: ${txHash}`);
        console.log(`Amount sent: ${amountToSendEth} ETH`);
        console.log(`Fee paid: ${totalFeeEth} ETH`);
        console.log('');
        console.log(`View on Etherscan: https://etherscan.io/tx/${txHash}`);

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Main execution
const args = process.argv.slice(2);
if (args.length !== 2) {
    console.log('Usage: node scripts/sweep-eth-single.js <PRIVATE_KEY> <RECEIVER_ADDRESS>');
    console.log('');
    console.log('Example:');
    console.log('  node scripts/sweep-eth-single.js 0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb');
    process.exit(1);
}

const [privateKey, receiverAddress] = args;
sweepETH(privateKey, receiverAddress);
