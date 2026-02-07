import fs from 'fs';

const sessions = JSON.parse(fs.readFileSync('./data/sessions.json', 'utf8'));
const completed = sessions.filter(s => s.status === 'completed');

const summary = {};
completed.forEach(s => {
    const c = s.cryptocurrency;
    if (!summary[c]) summary[c] = { count: 0, amount: 0, usd: 0 };
    summary[c].count++;
    summary[c].amount += (s.finalAmount || s.amount || 0);
    summary[c].usd += (s.metadata?.amountUSD || 0);
});

console.log('--- SUMMARY ---');
for (const [crypto, data] of Object.entries(summary)) {
    console.log(`${crypto.toUpperCase()}: ${data.count} transactions`);
    console.log(`  Total: ${data.amount.toFixed(8)} ${crypto.toUpperCase()}`);
    console.log(`  USD value: $${data.usd.toFixed(2)}`);
}

console.log('\n--- LAST 5 COMPLETED ---');
completed.slice(-5).reverse().forEach(s => {
    console.log(`${s.completedAt || s.createdAt} | ${s.cryptocurrency.toUpperCase()} | ${s.finalAmount || s.amount} | $${s.metadata?.amountUSD || 0}`);
});
