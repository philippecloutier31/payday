import * as bip39 from 'bip39';
import { BIP32Factory } from 'bip32';
import * as ecc from 'tiny-secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import { ethers } from 'ethers';
import config from '../config/env.js';

const bip32 = BIP32Factory(ecc);

class WalletService {
    constructor() {
        this.mnemonic = config.MASTER_SEED_PHRASE;
        if (!this.mnemonic && config.NODE_ENV !== 'test') {
            console.warn('WARNING: MASTER_SEED_PHRASE is not set. Local address generation will fail.');
        }
    }

    /**
     * Generate a new mnemonic phrase (for setup)
     * @returns {string} 12-word mnemonic
     */
    generateMnemonic() {
        return bip39.generateMnemonic();
    }

    /**
     * Get BTC address and private key at a specific index
     * @param {number} index - Derivation index
     * @param {boolean} isTestnet - Whether to use testnet
     * @returns {Object} { address, privateKey, wif }
     */
    getBitcoinAddress(index, isTestnet = false) {
        if (!this.mnemonic) throw new Error('Mnemonic not configured');

        const seed = bip39.mnemonicToSeedSync(this.mnemonic);
        const network = isTestnet ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;
        const root = bip32.fromSeed(seed, network);

        // Path: m/84'/0'/0'/0/index for Mainnet (Bech32)
        // Path: m/84'/1'/0'/0/index for Testnet (Bech32)
        const path = `m/84'/${isTestnet ? '1' : '0'}'/0'/0/${index}`;
        const child = root.derivePath(path);

        const { address } = bitcoin.payments.p2wpkh({
            pubkey: child.publicKey,
            network
        });

        return {
            address,
            privateKey: Buffer.from(child.privateKey).toString('hex'),
            wif: child.toWIF(),
            path
        };
    }

    /**
     * Get ETH address and private key at a specific index
     * @param {number} index - Derivation index
     * @returns {Object} { address, privateKey }
     */
    getEthereumAddress(index) {
        if (!this.mnemonic) throw new Error('Mnemonic not configured');

        // Path: m/44'/60'/0'/0/index
        const path = `m/44'/60'/0'/0/${index}`;
        const wallet = ethers.HDNodeWallet.fromMnemonic(
            ethers.Mnemonic.fromPhrase(this.mnemonic),
            path
        );

        return {
            address: wallet.address,
            privateKey: wallet.privateKey,
            path
        };
    }

    /**
     * Generate address for given crypto and index
     * @param {string} crypto - 'btc', 'btc_test', 'eth', 'eth_test'
     * @param {number} index - Index for derivation
     * @returns {Object} { address, privateKey, wif (for BTC), path }
     * @throws {Error} If crypto is 'bcy' (must use BlockCypher API) or unsupported
     */
    generateLocalAddress(crypto, index) {
        // BCY cannot be generated locally - must use BlockCypher API
        if (crypto === 'bcy') {
            throw new Error('BCY addresses cannot be generated locally. Use BlockCypher API instead.');
        }

        const isTestnet = crypto.includes('_test');
        const type = crypto.split('_')[0];

        if (type === 'btc') {
            return this.getBitcoinAddress(index, isTestnet);
        } else if (type === 'eth') {
            return this.getEthereumAddress(index);
        } else {
            throw new Error(`Unsupported cryptocurrency: ${crypto}`);
        }
    }

    /**
     * Check if a cryptocurrency can be generated locally
     * @param {string} crypto - Cryptocurrency identifier
     * @returns {boolean} True if can be generated locally
     */
    canGenerateLocally(crypto) {
        return ['btc', 'btc_test', 'eth', 'eth_test'].includes(crypto.toLowerCase());
    }
}

export const walletService = new WalletService();
export default walletService;
