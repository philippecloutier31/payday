import express from 'express';
import { jobService } from '../services/job.service.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * POST /jobs/trigger
 * Manually trigger the job service to run pending checks and retry failed forwardings
 */
router.post('/trigger', async (req, res) => {
    try {
        logger.info('[Jobs] Manual trigger received');

        // Run pending session checks
        await jobService.checkPendingSessions();

        res.json({ success: true, message: 'Job service triggered successfully' });
    } catch (error) {
        logger.error('[Jobs] Manual trigger failed:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /jobs/retry-failed
 * Manually retry failed forwardings
 */
router.post('/retry-failed', async (req, res) => {
    try {
        logger.info('[Jobs] Manual retry-failed received');

        await jobService.retryFailedForwardings();

        res.json({ success: true, message: 'Failed forwarding retry triggered' });
    } catch (error) {
        logger.error('[Jobs] Retry failed failed:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
