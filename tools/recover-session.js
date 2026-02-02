import { paymentSessionManager } from './src/services/payment-session.service.js';
import { forwardingService } from './src/services/forwarding.service.js';
import { confirmationService } from './src/services/confirmation.service.js';

async function recover() {
    const sessionId = '8b511b83-2532-4c38-8ac2-97ec30044ded';
    const session = paymentSessionManager.getSession(sessionId);

    if (!session) {
        console.error('Session not found');
        return;
    }

    console.log(`Recovering session ${sessionId}...`);
    console.log(`Current status: ${session.status}, Received: ${session.receivedAmount}`);

    // Correct data
    const correctAmount = 0.00006064;
    const txHash = '72f9987f6bc384684d00ac656ef5d2f602dc99d97f006c848f58d1d305f7ddcd';

    // 1. Update session to correct values and status
    paymentSessionManager.updateSession(sessionId, {
        receivedAmount: correctAmount,
        status: 'confirmed', // Back to confirmed so we can complete it
        metadata: {
            ...session.metadata,
            correctedAmount: true,
            originalErrorAmount: session.receivedAmount
        }
    });

    console.log('Session updated with correct amount.');

    // 2. Mark as completed (this triggers the event)
    const completionData = {
        finalAmount: correctAmount,
        finalConfirmations: 1,
        txHash: txHash
    };

    paymentSessionManager.markCompleted(sessionId, completionData);
    console.log('Session marked as completed.');

    // 3. Manually trigger forwarding
    console.log('Triggering auto-forward...');
    await forwardingService.processForwarding({
        sessionId,
        cryptocurrency: 'btc',
        amount: correctAmount,
        paymentAddress: session.paymentAddress,
        forwardingAddress: session.forwardingAddress
    });

    console.log('Recovery complete.');
    process.exit(0);
}

recover();
