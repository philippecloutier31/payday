
import fs from 'fs';
import { walletService } from '../src/services/wallet.service.js';
import { addressService } from '../src/services/address.service.js';

async function checkAllETHAddresses() {
    let output = '=== ETH ADDRESS AUDIT ===\n\n';

    const sessions = JSON.parse(fs.readFileSync('data/sessions.json', 'utf8'));

    // Get ALL completed ETH sessions
    const ethSessions = sessions.filter(s =>
        s.cryptocurrency === 'eth' &&
        s.status === 'completed'
    );

    output += `Found ${ethSessions.length} completed ETH sessions\n\n`;

    let totalReceived = 0;
    let totalStillPresent = 0;
    let totalMissing = 0;
    const results = [];

    for (const session of ethSessions) {
        const receivedAmount = session.receivedAmount || session.finalAmount || 0;
        if (receivedAmount <= 0) continue;

        const info = await addressService.getAddressInfo('eth', session.paymentAddress);

        if (info.success) {
            const currentBalance = info.balance || 0;
            const totalSent = info.totalSent || 0;

            totalReceived += receivedAmount;
            totalStillPresent += currentBalance;

            let status = 'FORWARDED';
            if (currentBalance > 0.0001) {
                status = 'FUNDS_PRESENT';
            } else if (currentBalance > 0) {
                status = 'DUST';
            }

            // Check if forwarding was recorded
            const forwardRecorded = session.metadata?.autoForwarded || session.metadata?.forwardingTxHash;
            const forwardTx = session.metadata?.forwardingTxHash || 'N/A';

            results.push({
                sessionId: session.id.substring(0, 8),
                address: session.paymentAddress,
                index: session.addressIndex,
                received: receivedAmount,
                currentBalance,
                totalSent,
                forwardRecorded,
                forwardTx,
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
        output += `Received: ${r.received.toFixed(8)} ETH\n`;
        output += `Current Balance: ${r.currentBalance.toFixed(8)} ETH\n`;
        output += `Total Sent: ${r.totalSent.toFixed(8)} ETH\n`;
        output += `Forward Recorded: ${r.forwardRecorded ? 'YES' : 'NO'}\n`;
        output += `Forward TX: ${r.forwardTx}\n`;
        output += `Status: ${r.status}\n\n`;
    });

    output += '\n=== SUMMARY ===\n';
    output += `Total Received: ${totalReceived.toFixed(8)} ETH ($${(totalReceived * 2100).toFixed(2)})\n`;
    output += `Still in Addresses: ${totalStillPresent.toFixed(8)} ETH ($${(totalStillPresent * 2100).toFixed(2)})\n`;

    fs.writeFileSync('reports/eth_address_audit.txt', output, 'utf8');
    console.log(output);
}

checkAllETHAddresses().catch(console.error);
