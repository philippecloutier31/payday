
import fs from 'fs';

const SESSIONS_FILE = 'c:/Users/Administrator/Desktop/payment/payment/payday/data/sessions.json';
const OUTPUT_FILE = 'usd_fee_report_v2.txt';

try {
    const sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));

    // Approximate current prices
    const BTC_PRICE = 96000;
    const ETH_PRICE = 2100;

    let totalUSD = 0;
    let btcFeesUSD = 0;
    let ethFeesUSD = 0;

    let output = '--- DETAILED FEE AUDIT (USD) ---\n';
    output += 'ID | CRYPTO | AMOUNT | USD_VAL | FEE_USD\n';
    output += '---|--------|--------|---------|---------\n';

    sessions.forEach(s => {
        if (s.status === 'completed' || s.status === 'forwarded') {
            const crypto = s.cryptocurrency;
            const amount = s.receivedAmount || s.finalAmount || 0;
            const amountUSD = s.metadata?.amountUSD || (crypto === 'btc' ? amount * BTC_PRICE : amount * ETH_PRICE);

            let feeUSD = 0;

            if (s.metadata?.feeAmountUSD) {
                feeUSD = s.metadata.feeAmountUSD;
            } else if (s.metadata?.feeRemaining) {
                const feeCrypto = s.metadata.feeRemaining;
                feeUSD = crypto === 'btc' ? feeCrypto * BTC_PRICE : (crypto === 'eth' ? feeCrypto * ETH_PRICE : 0);
            } else if (amountUSD >= 250) {
                feeUSD = amountUSD * 0.025;
            }

            if (feeUSD > 0) {
                output += `${s.id.substring(0, 8)} | ${crypto.toUpperCase()} | ${amount.toFixed(6)} | $${amountUSD.toFixed(2)} | $${feeUSD.toFixed(2)}\n`;
                totalUSD += feeUSD;
                if (crypto === 'btc' || crypto === 'bcy') btcFeesUSD += feeUSD;
                else if (crypto === 'eth' || crypto === 'beth') ethFeesUSD += feeUSD;
            }
        }
    });

    output += '\n--- TOTALS ---\n';
    output += `BTC Fees: $${btcFeesUSD.toFixed(2)}\n`;
    output += `ETH Fees: $${ethFeesUSD.toFixed(2)}\n`;
    output += `GRAND TOTAL: $${totalUSD.toFixed(2)}\n`;

    fs.writeFileSync(OUTPUT_FILE, output, 'utf8');

} catch (error) {
    fs.writeFileSync(OUTPUT_FILE, error.stack, 'utf8');
}
