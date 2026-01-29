import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_FILE = path.join(__dirname, '../../data/wallet-config.json');

class WalletConfigService {
    constructor() {
        this.config = this.loadConfig();
    }

    loadConfig() {
        try {
            if (fs.existsSync(CONFIG_FILE)) {
                const content = fs.readFileSync(CONFIG_FILE, 'utf8');
                console.log('[WalletConfig] Loaded wallet config from disk');
                return JSON.parse(content);
            }
        } catch (error) {
            console.error('[WalletConfig] Error loading config:', error);
        }
        return null;
    }

    saveConfig(config) {
        try {
            const dataDir = path.dirname(CONFIG_FILE);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
            this.config = config;
            console.log('[WalletConfig] Saved wallet config to disk');
            return true;
        } catch (error) {
            console.error('[WalletConfig] Error saving config:', error);
            return false;
        }
    }

    updateAddresses(addresses) {
        const newConfig = {
            ...this.config,
            ...addresses,
            updatedAt: new Date().toISOString()
        };
        return this.saveConfig(newConfig);
    }

    getAddress(type) {
        // type: 'btc', 'eth', 'usdt', 'bcy', 'beth'
        if (this.config) {
            const key = `${type}Address`;
            if (this.config[key]) {
                return this.config[key];
            }
        }
        return null; // Caller should fall back to env
    }

    getConfig() {
        return this.config;
    }
}

export const walletConfigService = new WalletConfigService();
export default walletConfigService;
