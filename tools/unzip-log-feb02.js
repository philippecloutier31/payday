import fs from 'fs';
import zlib from 'zlib';

const input = 'c:/Users/Administrator/Desktop/payment/payment/payday/logs/combined-2026-02-02.log.gz';
const output = 'c:/Users/Administrator/Desktop/payment/payment/payday/logs/combined-2026-02-02_full.log';

const fileContents = fs.createReadStream(input);
const writeStream = fs.createWriteStream(output);
const unzip = zlib.createGunzip();

fileContents.pipe(unzip).pipe(writeStream)
    .on('finish', () => {
        const stats = fs.statSync(output);
        console.log(`Unzipped successfully. Size: ${stats.size} bytes`);
        process.exit(0);
    })
    .on('error', (err) => {
        console.error('Error unzipping:', err);
        process.exit(1);
    });
