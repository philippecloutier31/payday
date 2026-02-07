
import fs from 'fs';
import { walletService } from '../src/services/wallet.service.js';
import { addressService } from '../src/services/address.service.js';

async function checkAllBTCFees() {
    let output = '=== BTC FEE AUDIT ===\n\n';

    const sessions = JSON.parse(fs.readFileSync('data/sessions.json', 'utf8'));

    const btcSessions = sessions.filter(s =>
        s.cryptocurrency === 'btc' &&
        s.status === 'completed' &&
        s.metadata?.autoForwarded === true &&
        !s.metadata?.feesCollected
    );

    output += `Found ${btcSessions.length} BTC sessions with uncollected fees\n\n`;

    let totalExpectedFees = 0;
    let totalActualBalance = 0;
    let missingFees = 0;
    const results = [];

    for (const session of btcSessions) {
        const expectedFee = session.metadata?.feeRemaining || 0;
        if (expectedFee <= 0) continue;

        const info = await addressService.getAddressInfo('btc', session.paymentAddress);

        if (info.success) {
            const actualBalance = info.balance || 0;
            totalExpectedFees += expectedFee;
            totalActualBalance += actualBalance;

            const status = actualBalance < expectedFee * 0.9 ? 'MISSING' : 'OK';
            if (status === 'MISSING') {
                missingFees += (expectedFee - actualBalance);
            }

            results.push({
                sessionId: session.id.substring(0, 8),
                address: session.paymentAddress,
                index: session.addressIndex,
                expectedFee,
                actualBalance,
                status
            });
        }

        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Write results
    results.forEach(r => {
        output += `Session: ${r.sessionId}\n`;
        output += `Address: ${r.address}\n`;
        output += `Index: ${r.index}\n`;
        output += `Expected: ${r.expectedFee.toFixed(8)} BTC\n`;
        output += `Actual: ${r.actualBalance.toFixed(8)} BTC\n`;
        output += `Status: ${r.status}\n\n`;
    });

    output += '\n=== SUMMARY ===\n';
    output += `Total Expected: ${totalExpectedFees.toFixed(8)} BTC ($${(totalExpectedFees * 96000).toFixed(2)})\n`;
    output += `Total Actual: ${totalActualBalance.toFixed(8)} BTC ($${(totalActualBalance * 96000).toFixed(2)})\n`;
    output += `Missing: ${missingFees.toFixed(8)} BTC ($${(missingFees * 96000).toFixed(2)})\n`;

    if (missingFees > 0) {
        output += '\nWARNING: Some fees are missing!\n';
    } else {
        output += '\nAll fees accounted for.\n';
    }

    fs.writeFileSync('reports/btc_fee_audit.txt', output, 'utf8');
    console.log(output);
}

checkAllBTCFees().catch(console.error);
