import express from 'express';
import { handleBlockCypherWebhook } from '../controllers/webhook.controller.js';

const router = express.Router();

/**
 * POST /webhook/blockcypher
 * Handle incoming webhooks from BlockCypher
 * 
 * This endpoint receives transaction notifications from BlockCypher
 * for address forwarding and transaction confirmations
 */
router.post('/blockcypher', handleBlockCypherWebhook);

export default router;
