import express from 'express';
import { createPaymentAddress } from '../controllers/address.controller.js';

const router = express.Router();

/**
 * POST /address
 * Create a new payment address for receiving crypto payments
 * 
 * Body:
 * - cryptocurrency: 'btc' | 'eth' (required)
 * - userId: string (required) - ID of the user requesting payment
 * - amount: number (optional) - Expected amount in crypto
 * - metadata: object (optional) - Additional metadata to attach to session
 */
router.post('/', createPaymentAddress);

export default router;
