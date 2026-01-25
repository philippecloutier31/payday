import express from 'express';
import { getSession, getAllSessions, cancelSession } from '../controllers/session.controller.js';

const router = express.Router();

/**
 * GET /session/:id
 * Get payment session by ID
 */
router.get('/:id', getSession);

/**
 * GET /session
 * Get all payment sessions (for debugging/admin)
 */
router.get('/', getAllSessions);

/**
 * DELETE /session/:id
 * Cancel a payment session
 */
router.delete('/:id', cancelSession);

export default router;
