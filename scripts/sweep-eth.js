/**
 * Sweep ETH from all HD wallet addresses to main address
 * Usage: node scripts/sweep-eth.js
 */

import 'dotenv/config';
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const MAIN_ETH_ADDRESS = process.env.ETH_MAIN_ADDRESS;
const INFURA_PROJECT_ID = process.env.INFURA_PROJECT_ID;
const HD_WALLET_MNEMONIC = process.env.HD_WALLET_MNEMONIC;
const HD_WALLET_DERIVATION_PATH = process.env.HD_WALLET_DERIVATION_PATH || "m/44'/60'/0'/0";

// RPC endpoints to try
const RPC_ENDPOINTS = [
    `https://mainnet.infura.io/v3/${INFURA_PROJECT_ID}`,
    'https://eth.llamarpc.com',
    'https://rpc.ankr.com/eth',
    'https://ethereum.publicnode.com'
];

// Gas price multipliers for different priority levels
const GAS_MULTIPLIERS = {
    low: 1.0,
    medium: 1.2,
    high: 1.5
};

async function getProvider() {
    for (const endpoint of RPC_ENDPOINTS) {
        try {
            const provider = new ethers.JsonRpcProvider(endpoint);
            await provider.getBlockNumber();
            console.log(`✓ Connected to RPC: ${endpoint}`);
            return provider;
        } catch (error) {
            console.log(`✗ Failed to connect to ${endpoint}: ${error.message}`);
        }
    }
    throw new Error('Failed to connect to any RPC endpoint');
}

async function getGasPrice(provider, priority = 'medium') {
    try {
        const feeData = await provider.getFeeData();
        const multiplier = GAS_MULTIPLIERS[priority] || 1.2;

        if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
            // EIP-1559
            return {
                maxFeePerGas: feeData.maxFeePerGas * BigInt(Math.floor(multiplier * 100)) / 100n,
                maxPriorityFeePerGas: feeData.maxPriorityFeePerGas * BigInt(Math.floor(multiplier * 100)) / 100n
            };
        } else if (feeData.gasPrice) {
            // Legacy
            return {
                gasPrice: feeData.gasPrice * BigInt(Math.floor(multiplier * 100)) / 100n
            };
        }

        throw new Error('Unable to get gas price');
    } catch (error) {
        console.error('Error getting gas price:', error.message);
        // Fallback to 20 gwei
        return {
            gasPrice: ethers.parseUnits('20', 'gwei')
        };
    }
}

async function getHDWalletAddresses(count = 10) {
    const addresses = [];

    for (let i = 0; i < count; i++) {
        const derivationPath = `${HD_WALLET_DERIVATION_PATH}/${i}`;
        const wallet = ethers.HDNodeWallet.fromPhrase(
            HD_WALLET_MNEMONIC,
            '',
            derivationPath
        );
        addresses.push({
            index: i,
            address: wallet.address,
            privateKey: wallet.privateKey,
            derivationPath
        });
    }

    return addresses;
}

async function checkAddressBalance(provider, address) {
    try {
        const balance = await provider.getBalance(address);
        return balance;
    } catch (error) {
        console.error(`Error checking balance for ${address}:`, error.message);
        return 0n;
    }
}

async function sweepAddress(provider, walletInfo, mainAddress, priority = 'medium') {
    const { address, privateKey } = walletInfo;

    console.log(`\n--- Checking address ${address} (index ${walletInfo.index}) ---`);

    // Check balance
    const balance = await checkAddressBalance(provider, address);
    const balanceEth = ethers.formatEther(balance);

    console.log(`Balance: ${balanceEth} ETH`);

    if (balance === 0n) {
        console.log('No balance to sweep');
        return null;
    }

    // Create wallet
    const wallet = new ethers.Wallet(privateKey, provider);

    // Get gas price
    const gasPrice = await getGasPrice(provider, priority);
    console.log('Gas price:', gasPrice);

    // Estimate gas
    const gasLimit = 21000n; // Standard ETH transfer

    // Calculate total cost
    let gasCost;
    if (gasPrice.gasPrice) {
        gasCost = gasPrice.gasPrice * gasLimit;
    } else {
        gasCost = gasPrice.maxFeePerGas * gasLimit;
    }

    const gasCostEth = ethers.formatEther(gasCost);
    console.log(`Estimated gas cost: ${gasCostEth} ETH`);

    // Calculate amount to send
    const amountToSend = balance - gasCost;

    if (amountToSend <= 0n) {
        console.log('Balance too low to cover gas cost');
        return null;
    }

    const amountToSendEth = ethers.formatEther(amountToSend);
    console.log(`Amount to send: ${amountToSendEth} ETH`);

    // Build transaction
    const tx = {
        to: mainAddress,
        value: amountToSend,
        ...gasPrice,
        gasLimit
    };

    console.log('Transaction:', tx);

    // Ask for confirmation
    console.log('\n⚠️  WARNING: This will send ETH from', address, 'to', mainAddress);
    console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Send transaction
    console.log('Sending transaction...');
    const txResponse = await wallet.sendTransaction(tx);
    console.log('Transaction sent:', txResponse.hash);

    // Wait for confirmation
    console.log('Waiting for confirmation...');
    const receipt = await txResponse.wait();
    console.log('✓ Transaction confirmed in block', receipt.blockNumber);

    return {
        address,
        txHash: txResponse.hash,
        blockNumber: receipt.blockNumber,
        amount: amountToSendEth,
        gasUsed: receipt.gasUsed.toString(),
        gasCost: gasCostEth
    };
}

async function main() {
    console.log('=== ETH Sweep Script ===\n');

    // Validate configuration
    if (!MAIN_ETH_ADDRESS) {
        throw new Error('ETH_MAIN_ADDRESS not set in .env');
    }
    if (!INFURA_PROJECT_ID) {
        throw new Error('INFURA_PROJECT_ID not set in .env');
    }
    if (!HD_WALLET_MNEMONIC) {
        throw new Error('HD_WALLET_MNEMONIC not set in .env');
    }

    console.log('Main ETH address:', MAIN_ETH_ADDRESS);
    console.log('Derivation path:', HD_WALLET_DERIVATION_PATH);

    // Get provider
    const provider = await getProvider();

    // Get HD wallet addresses
    console.log('\nGenerating HD wallet addresses...');
    const addresses = await getHDWalletAddresses(10);
    console.log(`Generated ${addresses.length} addresses`);

    // Sweep each address
    const results = [];
    for (const addressInfo of addresses) {
        try {
            const result = await sweepAddress(provider, addressInfo, MAIN_ETH_ADDRESS, 'medium');
            if (result) {
                results.push(result);
            }
        } catch (error) {
            console.error('Error sweeping address:', error.message);
        }
    }

    // Summary
    console.log('\n=== Sweep Summary ===');
    console.log(`Processed ${addresses.length} addresses`);
    console.log(`Successfully swept ${results.length} addresses`);

    if (results.length > 0) {
        const totalAmount = results.reduce((sum, r) => sum + parseFloat(r.amount), 0);
        console.log(`Total amount swept: ${totalAmount.toFixed(8)} ETH`);
        console.log('\nTransaction hashes:');
        results.forEach(r => {
            console.log(`  ${r.address}: ${r.txHash}`);
        });
    }
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
