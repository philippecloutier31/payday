
import { addressService } from './src/services/address.service.js';
async function run() {
    const res = await addressService.getAddressInfo('eth', '0x020D2011aE45A135193198fD1a3f7a8A47EdFA27');
    console.log(JSON.stringify(res, null, 2));
}
run();
