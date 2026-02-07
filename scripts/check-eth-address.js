
import { addressService } from '../src/services/address.service.js';

async function checkAddress() {
    const address = '0x020D2011aE45A135193198fD1a3f7a8A47EdFA27';
    console.log(`Checking address: ${address}\n`);

    const info = await addressService.getAddressInfo('eth', address);

    if (info.success) {
        console.log('=== ADDRESS INFO ===');
        console.log(`Balance: ${info.balance} ETH`);
        console.log(`Total Received: ${info.totalReceived} ETH`);
        console.log(`Total Sent: ${info.totalSent} ETH`);
        console.log(`TX Count: ${info.txCount}`);
        console.log(`Unconfirmed TX Count: ${info.unconfirmedTxCount}`);
    } else {
        console.error('Error:', info.error);
    }
}

checkAddress();
