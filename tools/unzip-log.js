import fs from 'fs';
import zlib from 'zlib';
import path from 'path';

const input = 'c:/Users/Administrator/Desktop/payment/payment/payday/logs/combined-2026-01-30.log.gz';
const output = 'c:/Users/Administrator/Desktop/payment/payment/payday/logs/combined-2026-01-30.log';

const fileContents = fs.createReadStream(input);
const writeStream = fs.createWriteStream(output);
const unzip = zlib.createGunzip();

fileContents.pipe(unzip).pipe(writeStream).on('finish', () => {
    console.log('Unzipped combined-2026-01-30.log.gz');
});
