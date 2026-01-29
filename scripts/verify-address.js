import { ECPairFactory } from 'ecpair';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';

const ECPair = ECPairFactory(ecc.default || ecc);

/**
 * Verify address derivation from private key
 * Usage: node scripts/verify-address.js <private-key-hex>
 */

const privateKeyHex = process.argv[2];

if (!privateKeyHex) {
    console.log('\n❌ ERROR: Please provide a private key hex');
    console.log('Usage: node scripts/verify-address.js <private-key-hex>\n');
    process.exit(1);
}

try {
    const keyPair = ECPair.fromPrivateKey(Buffer.from(privateKeyHex, 'hex'));

    console.log('\n--- 📋 ADDRESS VERIFICATION ---');

    // Native SegWit (P2WPKH) - what the system uses
    const p2wpkh = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: bitcoin.networks.bitcoin });
    console.log(`SegWit (bc1):    ${p2wpkh.address}`);

    // P2SH-wrapped SegWit (P2SH-P2WPKH)
    const p2shWrapped = bitcoin.payments.p2sh({
        redeem: bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: bitcoin.networks.bitcoin }),
        network: bitcoin.networks.bitcoin
    });
    console.log(`P2SH (3):        ${p2shWrapped.address}`);

    // Legacy P2PKH
    const p2pkh = bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey, network: bitcoin.networks.bitcoin });
    console.log(`Legacy (1):      ${p2pkh.address}`);

    console.log('-------------------------------\n');

    console.log('💡 TIP: Use the WIF format when importing to wallets:');
    console.log(`   WIF: ${keyPair.toWIF()}\n`);

    console.log('⚠️  IMPORTANT: Your wallet may default to legacy (1) or P2SH (3) address.');
    console.log('   For SegWit, use the bc1 address with the WIF key.\n');

} catch (error) {
    console.error(`\n❌ ERROR: ${error.message}\n`);
}
