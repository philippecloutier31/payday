
import fs from 'fs';
import { walletService } from '../src/services/wallet.service.js';
import { addressService } from '../src/services/address.service.js';

async function checkAllBTCFees() {
    console.log('=== CHECKING ALL BTC FEE ADDRESSES ===\n');

    const sessions = JSON.parse(fs.readFileSync('data/sessions.json', 'utf8'));

    // Find all BTC sessions that should have fees
    const btcSessions = sessions.filter(s =>
        s.cryptocurrency === 'btc' &&
        s.status === 'completed' &&
        s.metadata?.autoForwarded === true &&
        !s.metadata?.feesCollected
    );

    console.log(`Found ${btcSessions.length} BTC sessions with uncollected fees\n`);

    let totalExpectedFees = 0;
    let totalActualBalance = 0;
    let missingFees = 0;

    for (const session of btcSessions) {
        const expectedFee = session.metadata?.feeRemaining || 0;
        if (expectedFee <= 0) continue;

        console.log(`\n--- Session ${session.id.substring(0, 8)} ---`);
        console.log(`Address: ${session.paymentAddress}`);
        console.log(`Index: ${session.addressIndex}`);
        console.log(`Expected Fee: ${expectedFee} BTC ($${(expectedFee * 96000).toFixed(2)})`);

        // Check actual balance
        const info = await addressService.getAddressInfo('btc', session.paymentAddress);

        if (info.success) {
            const actualBalance = info.balance || 0;
            console.log(`Actual Balance: ${actualBalance} BTC`);
            console.log(`TX Count: ${info.txCount}`);

            totalExpectedFees += expectedFee;
            totalActualBalance += actualBalance;

            if (actualBalance < expectedFee * 0.9) { // Allow 10% variance for fees
                const missing = expectedFee - actualBalance;
                missingFees += missing;
                console.log(`⚠️  MISSING: ${missing.toFixed(8)} BTC ($${(missing * 96000).toFixed(2)})`);
            } else {
                console.log(`✓ Fee still present`);
            }
        } else {
            console.log(`❌ Error checking balance: ${info.error}`);
        }

        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('\n\n=== SUMMARY ===');
    console.log(`Total Expected Fees: ${totalExpectedFees.toFixed(8)} BTC ($${(totalExpectedFees * 96000).toFixed(2)})`);
    console.log(`Total Actual Balance: ${totalActualBalance.toFixed(8)} BTC ($${(totalActualBalance * 96000).toFixed(2)})`);
    console.log(`Missing Fees: ${missingFees.toFixed(8)} BTC ($${(missingFees * 96000).toFixed(2)})`);

    if (missingFees > 0) {
        console.log('\n⚠️  WARNING: Some fees are missing! Possible unauthorized access.');
    } else {
        console.log('\n✓ All fees are accounted for.');
    }
}

checkAllBTCFees().catch(console.error);
