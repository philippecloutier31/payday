import express from 'express';
import { collectFees } from '../controllers/fee.controller.js';

const router = express.Router();

/**
 * POST /fees/collect
 * Manually collect all accumulated 2.5% fees from completed sessions
 * 
 * Body:
 * - cryptocurrency: 'btc' | 'eth' | 'btc_test' | 'eth_test' | 'bcy_test' (required)
 */
router.post('/collect', collectFees);

export default router;
