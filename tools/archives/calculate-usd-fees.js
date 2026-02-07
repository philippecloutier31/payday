
import fs from 'fs';

const SESSIONS_FILE = 'c:/Users/Administrator/Desktop/payment/payment/payday/data/sessions.json';

try {
    const sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));

    // Approximate current prices (will refine if needed)
    const BTC_PRICE = 96000;
    const ETH_PRICE = 2100;

    let totalUSD = 0;
    let btcFeesUSD = 0;
    let ethFeesUSD = 0;

    console.log('--- DETAILED FEE AUDIT (USD) ---');
    console.log('ID | CRYPTO | AMOUNT | USD_VAL | FEE_USD');
    console.log('---|--------|--------|---------|---------');

    sessions.forEach(s => {
        if (s.status === 'completed' || s.status === 'forwarded') {
            const crypto = s.cryptocurrency;
            const amount = s.receivedAmount || s.finalAmount || 0;
            const amountUSD = s.metadata?.amountUSD || (crypto === 'btc' ? amount * BTC_PRICE : amount * ETH_PRICE);

            let feeUSD = 0;

            // 1. Check if metadata already has fee info
            if (s.metadata?.feeAmountUSD) {
                feeUSD = s.metadata.feeAmountUSD;
            } else if (s.metadata?.feeRemaining) {
                const feeCrypto = s.metadata.feeRemaining;
                feeUSD = crypto === 'btc' ? feeCrypto * BTC_PRICE : feeCrypto * ETH_PRICE;
            } else if (amountUSD >= 250) {
                // 2. If it's a large payment and no fee recorded yet, calculate what it should be (2.5%)
                feeUSD = amountUSD * 0.025;
            }

            if (feeUSD > 0) {
                console.log(`${s.id.substring(0, 8)} | ${crypto.toUpperCase()} | ${amount.toFixed(6)} | $${amountUSD.toFixed(2)} | $${feeUSD.toFixed(2)}`);
                totalUSD += feeUSD;
                if (crypto === 'btc') btcFeesUSD += feeUSD;
                else if (crypto === 'eth') ethFeesUSD += feeUSD;
            }
        }
    });

    console.log('\n--- TOTALS ---');
    console.log(`BTC Fees: $${btcFeesUSD.toFixed(2)}`);
    console.log(`ETH Fees: $${ethFeesUSD.toFixed(2)}`);
    console.log(`GRAND TOTAL: $${totalUSD.toFixed(2)}`);

} catch (error) {
    console.error('Error:', error.stack);
}
