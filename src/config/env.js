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

// Ethereum RPC Provider URLs
// Using multiple public RPCs for reliability
export const ETH_RPC_URL = process.env.ETH_RPC_URL || 'https://eth.llamarpc.com';
export const ETH_RPC_URL_BACKUP = process.env.ETH_RPC_URL_BACKUP || 'https://rpc.ankr.com/eth';
export const BETH_RPC_URL = process.env.BETH_RPC_URL || 'https://holesky.drpc.org';

// Transaction fee configuration
// Use 1-2 sat/vbyte for normal priority, 3+ for urgent
// BlockCypher requires minimum ~1 sat/vbyte for standard transactions
export const BTC_FEE_RATE_SATS_PER_BYTE = parseInt(process.env.BTC_FEE_RATE_SATS_PER_BYTE || '2', 10);
export const BCY_FEE_RATE_SATS_PER_BYTE = parseInt(process.env.BCY_FEE_RATE_SATS_PER_BYTE || '1', 10);

// Server configuration
export const PORT = process.env.PAYMENT_PORT || 3001;
export const NODE_ENV = process.env.NODE_ENV || 'development';

// Webhook configuration
export const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL || 'http://localhost:3001';
export const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || 'default-secret-change-me';
export const MASTER_SEED_PHRASE = process.env.MASTER_SEED_PHRASE || '';
export const AUTO_FORWARD_ENABLED = process.env.AUTO_FORWARD_ENABLED === 'true';
export const FORWARDING_PERCENTAGE = parseFloat(process.env.FORWARDING_PERCENTAGE || '0.975');
export const MINIMUM_FEE_THRESHOLD_USD = parseFloat(process.env.MINIMUM_FEE_THRESHOLD_USD || '50');
export const FEE_COLLECTION_ADDRESS = process.env.FEE_COLLECTION_ADDRESS || '';
export const FEE_COLLECTION_ADDRESS_BTC = process.env.FEE_COLLECTION_ADDRESS_BTC || process.env.FEE_COLLECTION_ADDRESS || '';
export const FEE_COLLECTION_ADDRESS_ETH = process.env.FEE_COLLECTION_ADDRESS_ETH || process.env.FEE_COLLECTION_ADDRESS || '';

// Main wallet addresses (where funds will be forwarded)
export const BTC_MAIN_ADDRESS = process.env.BTC_MAIN_ADDRESS || '';
export const ETH_MAIN_ADDRESS = process.env.ETH_MAIN_ADDRESS || '';
export const BCY_MAIN_ADDRESS = process.env.BCY_MAIN_ADDRESS || process.env.TEST_RECEIVING_ADDRESS || '';
export const BETH_MAIN_ADDRESS = process.env.BETH_MAIN_ADDRESS || process.env.TEST_RECEIVING_ADDRESS || '';

// Confirmation thresholds
export const BTC_CONFIRMATIONS_REQUIRED = parseInt(process.env.BTC_CONFIRMATIONS_REQUIRED || '3', 10);
export const ETH_CONFIRMATIONS_REQUIRED = parseInt(process.env.ETH_CONFIRMATIONS_REQUIRED || '12', 10);
export const BCY_CONFIRMATIONS_REQUIRED = parseInt(process.env.BCY_CONFIRMATIONS_REQUIRED || '1', 10);
export const BETH_CONFIRMATIONS_REQUIRED = parseInt(process.env.BETH_CONFIRMATIONS_REQUIRED || '1', 10);

// Payment session expiry (in milliseconds)
export const SESSION_EXPIRY_MS = parseInt(process.env.SESSION_EXPIRY_MS || '3600000', 10); // 1 hour default

// Main backend configuration (for callback on payment completion)
export const MAIN_BACKEND_URL = process.env.MAIN_BACKEND_URL || 'http://localhost:5000';
export const MAIN_BACKEND_WEBHOOK_SECRET = process.env.MAIN_BACKEND_WEBHOOK_SECRET || '';

// Test wallet configuration (BlockCypher Test Chain - bcy/test)
export const TEST_SENDING_PRIVATE_KEY = process.env.TEST_SENDING_PRIVATE_KEY || '';
export const TEST_SENDING_ADDRESS = process.env.TEST_SENDING_ADDRESS || '';
export const TEST_RECEIVING_ADDRESS = process.env.TEST_RECEIVING_ADDRESS || '';

// Export all config as object for convenience
export default {
    BLOCKCYPHER_API_TOKEN,
    BLOCKCYPHER_API_URL,
    ETH_RPC_URL,
    BETH_RPC_URL,
    BTC_FEE_RATE_SATS_PER_BYTE,
    BCY_FEE_RATE_SATS_PER_BYTE,
    PORT,
    NODE_ENV,
    WEBHOOK_BASE_URL,
    WEBHOOK_SECRET,
    BTC_MAIN_ADDRESS,
    ETH_MAIN_ADDRESS,
    BCY_MAIN_ADDRESS,
    BETH_MAIN_ADDRESS,
    BTC_CONFIRMATIONS_REQUIRED,
    ETH_CONFIRMATIONS_REQUIRED,
    BCY_CONFIRMATIONS_REQUIRED,
    BETH_CONFIRMATIONS_REQUIRED,
    SESSION_EXPIRY_MS,
    MASTER_SEED_PHRASE,
    MAIN_BACKEND_URL,
    MAIN_BACKEND_WEBHOOK_SECRET,
    TEST_SENDING_PRIVATE_KEY,
    TEST_SENDING_ADDRESS,
    TEST_RECEIVING_ADDRESS,
    AUTO_FORWARD_ENABLED,
    FORWARDING_PERCENTAGE,
    MINIMUM_FEE_THRESHOLD_USD,
    FEE_COLLECTION_ADDRESS,
    FEE_COLLECTION_ADDRESS_BTC,
    FEE_COLLECTION_ADDRESS_ETH
};
