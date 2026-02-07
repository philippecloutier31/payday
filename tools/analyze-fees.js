import fs from 'fs';

const sessions = JSON.parse(fs.readFileSync('./data/sessions.json', 'utf8'));

const withFees = sessions.filter(s => s.metadata && s.metadata.feeTaken);
const collected = withFees.filter(s => s.metadata.feesCollected);
const pending = withFees.filter(s => !s.metadata.feesCollected);

console.log(`Total sessions with fees: ${withFees.length}`);
console.log(`Fees already collected: ${collected.length}`);
console.log(`Fees pending collection: ${pending.length}`);

if (collected.length > 0) {
    const colSum = collected.reduce((acc, s) => {
        acc[s.cryptocurrency] = (acc[s.cryptocurrency] || 0) + (s.metadata.forwardedAmount ? (s.metadata.originalAmount - s.metadata.forwardedAmount) : 0);
        return acc;
    }, {});
    console.log('--- Collected Amounts ---');
    console.dir(colSum);
}

if (pending.length > 0) {
    const penSum = pending.reduce((acc, s) => {
        acc[s.cryptocurrency] = (acc[s.cryptocurrency] || 0) + (s.metadata.feeRemaining || 0);
        return acc;
    }, {});
    console.log('--- Pending Amounts (Still in address) ---');
    console.dir(penSum);
}

// Group by date to see history
const history = withFees.reduce((acc, s) => {
    const date = s.createdAt.split('T')[0];
    acc[date] = (acc[date] || 0) + 1;
    return acc;
}, {});
console.log('--- Fee Sessions by Date ---');
console.dir(history);
