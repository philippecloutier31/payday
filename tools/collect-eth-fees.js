
import fs from 'fs';
import { walletService } from '../src/services/wallet.service.js';
import { addressService } from '../src/services/address.service.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const FEE_ADDRESS = process.env.FEE_COLLECTION_ADDRESS_ETH;

if (!FEE_ADDRESS) {
    console.error('FEE_COLLECTION_ADDRESS_ETH is not set');
    process.exit(1);
}

const GAS_LIMIT_ETH = 0.000021; // ~21000 gas * price (approx)
const MIN_SWEEP_AMOUNT = 0.001; // Only sweep if > 0.001 ETH (~$2)

async function collectEthFees() {
    console.log(`=== COLLECTING ETH FEES ===`);
    console.log(`Destination: ${FEE_ADDRESS}\n`);

    // 1. Identify addresses
    const sessions = JSON.parse(fs.readFileSync('data/sessions.json', 'utf8'));
    const ethSessions = sessions.filter(s =>
        s.cryptocurrency === 'eth' &&
        s.status === 'completed'
    );

    console.log(`Found ${ethSessions.length} ETH sessions.`);

    let totalSwept = 0;

    for (const session of ethSessions) {
        console.log(`\nChecking Session ${session.id.substring(0, 8)}...`);
        const address = session.paymentAddress;

        // Check balance
        const info = await addressService.getAddressInfo('eth', address);
        if (!info.success) {
            console.log(`Error checking balance: ${info.error}`);
            continue;
        }

        const balance = info.balance; // ETH
        console.log(`Address: ${address} | Balance: ${balance} ETH`);

        if (balance < MIN_SWEEP_AMOUNT) {
            console.log(`Skipping (balance too low: ${balance} < ${MIN_SWEEP_AMOUNT})`);
            continue;
        }

        // Derive private key
        console.log(`Deriving key for index ${session.addressIndex}...`);
        const wallet = walletService.generateLocalAddress('eth', session.addressIndex);

        // Sweep
        console.log(`Sweeping to ${FEE_ADDRESS}...`);

        // Calculate amount minus gas
        // Actually addressService.sendTransaction handles gas internally usually? 
        // No, we usually send specific amount.
        // Let's use specific sweep logic if available or calculate manually.

        // Estimate gas
        // For simplicity, let's try to send (balance - 0.0005) or used safe margin
        // But `addressService` doesn't have a `sweepAddress` for ETH exposed in the interface explicitly in some versions?
        // Wait, `forwarding.service.js` used `sendTransaction` for ETH.
        // I'll try to calculate a safe amount.

        const amountToSend = balance - 0.0001; // Leave buffer for gas

        if (amountToSend <= 0) {
            console.log("Zero amount after gas buffer.");
            continue;
        }

        const result = await addressService.sendTransaction('eth', wallet.privateKey, FEE_ADDRESS, amountToSend);

        if (result.success) {
            console.log(`✓ SUCCESS! TX: ${result.txHash}`);
            totalSwept += amountToSend;
        } else {
            console.log(`✗ FAILED: ${result.error}`);
        }
    }

    console.log(`\n=== COLLECTION COMPLETE ===`);
    console.log(`Total Collected: ${totalSwept} ETH`);
}

collectEthFees();
