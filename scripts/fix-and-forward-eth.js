
import fs from 'fs';
import { walletService } from '../src/services/wallet.service.js';
import { addressService } from '../src/services/address.service.js';
import { paymentSessionManager } from '../src/services/payment-session.service.js';

const SESSION_ID = 'd4637884-47d4-4ce4-8a64-f1012476ae63';
const CORRECT_AMOUNT = 0.27942715;

async function fixAndForward() {
    console.log('=== FIXING ETH SESSION AND FORWARDING ===\n');

    // 1. Load and update the session
    const session = paymentSessionManager.getSession(SESSION_ID);
    if (!session) {
        console.error('Session not found!');
        return;
    }

    console.log(`Session: ${session.id}`);
    console.log(`Payment Address: ${session.paymentAddress}`);
    console.log(`Current Received Amount: ${session.receivedAmount}`);
    console.log(`Correct Amount: ${CORRECT_AMOUNT} ETH\n`);

    // 2. Update the session with correct amount
    paymentSessionManager.updateSession(SESSION_ID, {
        receivedAmount: CORRECT_AMOUNT,
        finalAmount: CORRECT_AMOUNT
    });

    console.log('✓ Session updated with correct amount\n');

    // 3. Calculate forwarding amounts
    const amountUSD = session.metadata?.amountUSD || 533;
    const shouldTakeFee = amountUSD >= 250;

    let amountToForward;
    let feeAmount;

    if (shouldTakeFee) {
        // Take 2.5% fee
        const networkFeeETH = 0.000003; // Estimated gas
        const amountAfterGas = CORRECT_AMOUNT - networkFeeETH;
        amountToForward = amountAfterGas * 0.975; // 97.5%
        feeAmount = amountAfterGas * 0.025; // 2.5%
        console.log(`Fee Structure: 2.5% service fee ($${(amountUSD * 0.025).toFixed(2)})`);
    } else {
        const networkFeeETH = 0.000003;
        amountToForward = CORRECT_AMOUNT - networkFeeETH;
        feeAmount = 0;
        console.log(`Fee Structure: No service fee (under $250 threshold)`);
    }

    console.log(`Amount to Forward: ${amountToForward.toFixed(8)} ETH`);
    console.log(`Fee Remaining: ${feeAmount.toFixed(8)} ETH\n`);

    // 4. Get the private key for this address
    const localWallet = walletService.generateLocalAddress('eth', session.addressIndex);
    console.log(`Derived wallet at index ${session.addressIndex}`);
    console.log(`Address matches: ${localWallet.address.toLowerCase() === session.paymentAddress.toLowerCase()}\n`);

    // 5. Check current balance
    console.log('Checking current balance...');
    const addressInfo = await addressService.getAddressInfo('eth', session.paymentAddress);
    if (addressInfo.success) {
        console.log(`Current Balance: ${addressInfo.balance} ETH`);
        console.log(`Total Received: ${addressInfo.totalReceived} ETH`);
        console.log(`TX Count: ${addressInfo.txCount}\n`);
    }

    // 6. Forward the funds
    console.log(`Forwarding ${amountToForward.toFixed(8)} ETH to ${session.forwardingAddress}...`);

    const result = await addressService.sendTransaction(
        'eth',
        localWallet.privateKey,
        session.forwardingAddress,
        amountToForward
    );

    if (result.success) {
        console.log(`\n✓ SUCCESS! Forwarding TX: ${result.txHash}`);
        console.log(`Network Fee: ${result.fees} ETH`);

        // Update session metadata
        paymentSessionManager.updateSession(SESSION_ID, {
            metadata: {
                ...session.metadata,
                autoForwarded: true,
                forwardedAt: new Date().toISOString(),
                forwardingTxHash: result.txHash,
                forwardedAmount: amountToForward,
                feeRemaining: feeAmount,
                feeTaken: shouldTakeFee,
                feePercentage: shouldTakeFee ? 2.5 : 0,
                networkFees: result.fees,
                networkFeeDeducted: true,
                originalAmount: CORRECT_AMOUNT,
                manualForward: true,
                manualForwardReason: 'Retroactive fix for null receivedAmount bug'
            }
        });

        console.log('\n✓ Session metadata updated');
    } else {
        console.error(`\n✗ FAILED: ${result.error}`);
    }
}

fixAndForward().catch(console.error);
