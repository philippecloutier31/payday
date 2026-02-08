
import fs from 'fs';
import { walletService } from '../src/services/wallet.service.js';
import { addressService } from '../src/services/address.service.js';
import dotenv from 'dotenv';
import path from 'path';

// Load .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const FEE_ADDRESS = process.env.FEE_COLLECTION_ADDRESS_BTC;

if (!FEE_ADDRESS) {
    console.error('FEE_COLLECTION_ADDRESS_BTC is not set in .env');
    process.exit(1);
}

async function collectFees() {
    console.log(`=== COLLECTING BTC FEES ===`);
    console.log(`Destination: ${FEE_ADDRESS}\n`);

    // 1. Identify addresses with fees
    const sessions = JSON.parse(fs.readFileSync('data/sessions.json', 'utf8'));
    const btcSessions = sessions.filter(s =>
        s.cryptocurrency === 'btc' &&
        s.status === 'completed' &&
        s.metadata?.autoForwarded === true &&
        !s.metadata?.feesCollected
    );

    console.log(`Found ${btcSessions.length} sessions with potential fees.`);

    let totalSwept = 0;

    for (const session of btcSessions) {
        console.log(`\nChecking Session ${session.id.substring(0, 8)}...`);
        const address = session.paymentAddress;

        // Check balance
        const info = await addressService.getAddressInfo('btc', address);
        if (!info.success) {
            console.log(`Error checking balance: ${info.error}`);
            continue;
        }

        const balance = info.balanceRaw; // Satoshis
        console.log(`Address: ${address} | Balance: ${balance} sats (${info.balance} BTC)`);

        if (balance < 10000) { // Skip dust/small amounts (approx $1) to avoid eating fees
            console.log(`Skipping (balance too low for fee efficient sweep)`);
            continue;
        }

        // Derive private key
        console.log(`Deriving key for index ${session.addressIndex}...`);
        const wallet = walletService.getBitcoinLikeAddress(session.addressIndex, 'btc');

        // Sweep
        console.log(`Sweeping to ${FEE_ADDRESS}...`);
        const result = await addressService.sweepAddress('btc', wallet.privateKey, FEE_ADDRESS);

        if (result.success) {
            console.log(`✓ SUCCESS! TX: ${result.txHash}`);
            console.log(`  Amount: ${result.amountForwarded} BTC`);
            console.log(`  Fee: ${result.fees} BTC`);
            totalSwept += result.amountForwarded;

            // Update session metadata (in memory or file if needed, but for now just log)
            // Ideally we should update sessions.json but let's just log for safety first
        } else {
            console.log(`✗ FAILED: ${result.error}`);
        }

        // Rate limit
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`\n=== COLLECTION COMPLETE ===`);
    console.log(`Total Collected: ${totalSwept} BTC`);
}

collectFees();
