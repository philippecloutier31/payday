import fs from 'fs';

const sessions = JSON.parse(fs.readFileSync('./data/sessions.json', 'utf8'));

const completedSessions = sessions.filter(s => s.status === 'completed');

console.log(`Total Successful Transactions: ${completedSessions.length}`);
console.log('--- Breakdown by Cryptocurrency ---');

const summary = completedSessions.reduce((acc, s) => {
    const crypto = s.cryptocurrency;
    const amount = s.finalAmount || s.amount || 0;
    const amountUSD = s.metadata?.amountUSD || 0;

    if (!acc[crypto]) {
        acc[crypto] = { count: 0, totalAmount: 0, totalUSD: 0 };
    }

    acc[crypto].count += 1;
    acc[crypto].totalAmount += amount;
    acc[crypto].totalUSD += amountUSD;

    return acc;
}, {});

Object.entries(summary).forEach(([crypto, data]) => {
    console.log(`${crypto.toUpperCase()}:`);
    console.log(`  Count: ${data.count}`);
    console.log(`  Total Amount: ${data.totalAmount.toFixed(8)}`);
    console.log(`  Estimated USD: $${data.totalUSD.toFixed(2)}`);
});

console.log('\n--- Recent Transactions ---');
completedSessions.slice(-10).forEach(s => {
    console.log(`${s.completedAt || s.createdAt} | ${s.cryptocurrency.toUpperCase()} | ${s.finalAmount || s.amount} | $${s.metadata?.amountUSD || 0}`);
});
