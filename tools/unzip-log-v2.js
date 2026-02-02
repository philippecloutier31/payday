import fs from 'fs';
import zlib from 'zlib';

const input = 'c:/Users/Administrator/Desktop/payment/payment/payday/logs/combined-2026-01-30.log.gz';
const output = 'c:/Users/Administrator/Desktop/payment/payment/payday/logs/combined-2026-01-30_v2.log';

const fileContents = fs.createReadStream(input);
const writeStream = fs.createWriteStream(output);
const unzip = zlib.createGunzip();

fileContents.pipe(unzip).pipe(writeStream)
    .on('finish', () => {
        console.log('Unzipped successfully');
        process.exit(0);
    })
    .on('error', (err) => {
        console.error('Error unzipping:', err);
        process.exit(1);
    });
