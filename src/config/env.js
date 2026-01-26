import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try to load from .env file
const envPath = resolve(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
    config({ path: envPath });
} else {
    console.log('No .env file found, using environment variables');
}

// BlockCypher API configuration
export const BLOCKCYPHER_API_TOKEN = process.env.BLOCKCYPHER_API_TOKEN || '';
export const BLOCKCYPHER_API_URL = process.env.BLOCKCYPHER_API_URL || 'https://api.blockcypher.com/v1';

// Server configuration
export const PORT = process.env.PAYMENT_PORT || 3001;
export const NODE_ENV = process.env.NODE_ENV || 'development';

// Webhook configuration
export const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL || 'http://localhost:3001';
export const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || 'default-secret-change-me';
export const MASTER_SEED_PHRASE = process.env.MASTER_SEED_PHRASE || '';

// Main wallet addresses (where funds will be forwarded)
export const BTC_MAIN_ADDRESS = process.env.BTC_MAIN_ADDRESS || '';
export const ETH_MAIN_ADDRESS = process.env.ETH_MAIN_ADDRESS || '';

// Confirmation thresholds
export const BTC_CONFIRMATIONS_REQUIRED = parseInt(process.env.BTC_CONFIRMATIONS_REQUIRED || '3', 10);
export const ETH_CONFIRMATIONS_REQUIRED = parseInt(process.env.ETH_CONFIRMATIONS_REQUIRED || '12', 10);

// Payment session expiry (in milliseconds)
export const SESSION_EXPIRY_MS = parseInt(process.env.SESSION_EXPIRY_MS || '3600000', 10); // 1 hour default

// Export all config as object for convenience
export default {
    BLOCKCYPHER_API_TOKEN,
    BLOCKCYPHER_API_URL,
    PORT,
    NODE_ENV,
    WEBHOOK_BASE_URL,
    WEBHOOK_SECRET,
    BTC_MAIN_ADDRESS,
    ETH_MAIN_ADDRESS,
    BTC_CONFIRMATIONS_REQUIRED,
    ETH_CONFIRMATIONS_REQUIRED,
    SESSION_EXPIRY_MS,
    MASTER_SEED_PHRASE
};
