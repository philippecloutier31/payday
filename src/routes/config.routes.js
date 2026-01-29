import express from 'express';
import { updateWalletAddresses, getWalletAddresses } from '../controllers/config.controller.js';

const router = express.Router();

// POST /config/wallet-addresses - Update wallet addresses (requires shared secret)
router.post('/wallet-addresses', updateWalletAddresses);

// GET /config/wallet-addresses - Get current wallet addresses (for debugging)
router.get('/wallet-addresses', getWalletAddresses);

export default router;
