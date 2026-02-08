import express from 'express';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import config from './config/env.js';
import logger from './utils/logger.js';
import { jobService } from './services/job.service.js';

// Import routes
import addressRoutes from './routes/address.routes.js';
import sessionRoutes from './routes/session.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import feeRoutes from './routes/fee.routes.js';
import configRoutes from './routes/config.routes.js';
import jobsRoutes from './routes/jobs.routes.js';
import './services/forwarding.service.js'; // Initialize auto-forwarding

// Import confirmation service for event handling
import { confirmationService } from './services/confirmation.service.js';
import { verifyApiKey } from './middleware/auth.middleware.js';

const app = express();

// Trust proxy (required for Cloudflare Tunnel / express-rate-limit)
app.set('trust proxy', 1);

/**
 * Register payment event handlers
 * When a payment is completed, notify the main backend
 */
function registerPaymentEventHandlers() {
    // Handler for when payment is detected (transaction in mempool)
    confirmationService.on('onPaymentDetected', async (data) => {
        logger.info(`[Event] Payment detected for session ${data.sessionId} - TX: ${data.txHash}, Amount: ${data.amount} ${data.cryptocurrency}`);

        await notifyMainBackend({
            ...data,
            paymentStatus: 'detected'
        });
    });

    // Handler for confirmation updates
    confirmationService.on('onConfirmationUpdate', async (data) => {
        logger.debug(`[Event] Confirmation update for session ${data.sessionId} - Confirmations: ${data.confirmations}/${data.requiredConfirmations}`);
    });

    // Handler for when payment is confirmed (reached required confirmations)
    confirmationService.on('onPaymentConfirmed', async (data) => {
        logger.info(`[Event] Payment confirmed for session ${data.sessionId} - Amount: ${data.amount} ${data.cryptocurrency}`);
    });

    // Handler for when payment is fully completed
    confirmationService.on('onPaymentCompleted', async (data) => {
        const mismatchInfo = data.metadata?.amountMismatch ? ` (${data.metadata.amountMismatch})` : '';
        logger.info(`[Event] Payment completed for session ${data.sessionId} - User: ${data.userId}, Amount: ${data.amount} ${data.cryptocurrency}${mismatchInfo}, TX: ${data.txHash}`);

        // Notify main backend for ALL completed payments (including under/over payments)
        // Mismatches will be resolved on the backend via user support
        await notifyMainBackend({
            ...data,
            paymentStatus: 'completed',
            amountMismatch: data.metadata?.amountMismatch || null
        });
    });

    logger.info('Payment event handlers registered');
}

/**
 * Notify the main backend about payment status changes
 * @param {Object} data - Payment data to send
 */
async function notifyMainBackend(data) {
    if (!config.MAIN_BACKEND_URL || !config.MAIN_BACKEND_WEBHOOK_SECRET) {
        logger.warn('Main backend notification skipped: URL or secret missing');
        return;
    }

    try {
        const webhookUrl = `${config.MAIN_BACKEND_URL}/payments/webhook`;
        const payload = {
            secret: config.MAIN_BACKEND_WEBHOOK_SECRET,
            sessionId: data.sessionId,
            userId: data.userId,
            amount: data.amount,
            cryptocurrency: data.cryptocurrency?.toUpperCase(),
            transactionHash: data.txHash,
            confirmations: data.confirmations || 0,
            paymentStatus: data.paymentStatus,
            amountMismatch: data.amountMismatch || null
        };

        logger.debug(`Notifying main backend at ${webhookUrl}`);

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok && result.success) {
            logger.info('Main backend notification successful');
        } else {
            logger.error(`Main backend notification failed: ${result.error || result.message}`);
        }
    } catch (error) {
        logger.error(`Error notifying main backend: ${error.message}`);
    }
}

// Security: Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100, // Limit each IP to 100 requests per window
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Too many requests, please try again later.'
    }
});

// Apply rate limiter to all routes
app.use(limiter);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
    logger.debug(`${req.method} ${req.path} - IP: ${req.ip}`);
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: config.NODE_ENV
    });
});

// API Routes - Protect all routes below with authentication
app.use(verifyApiKey);

app.use('/address', addressRoutes);
app.use('/session', sessionRoutes);
app.use('/webhook', webhookRoutes);
app.use('/fees', feeRoutes);
app.use('/config', configRoutes);
app.use('/jobs', jobsRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error(`Server Error: ${err.message}`, { stack: err.stack });

    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal server error',
        ...(config.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
});

// Start server
if (config.NODE_ENV !== 'test') {
    registerPaymentEventHandlers();
    jobService.start(); // Start polling fallback

    app.listen(config.PORT, () => {
        logger.info(`🚀 Payment Gateway server running on port ${config.PORT}`);
        logger.info(`Environment: ${config.NODE_ENV}`);
        logger.info(`Webhook URL: ${config.WEBHOOK_BASE_URL}`);

        if (!config.BLOCKCYPHER_API_TOKEN) logger.warn('BLOCKCYPHER_API_TOKEN is not set!');
        if (!config.getBtcMainAddress()) logger.warn('BTC_MAIN_ADDRESS is not set!');
        if (!config.getEthMainAddress()) logger.warn('ETH_MAIN_ADDRESS is not set!');

        // Show configured addresses
        logger.info(`BTC Main Address: ${config.getBtcMainAddress() || 'Not configured'}`);
        logger.info(`ETH Main Address: ${config.getEthMainAddress() || 'Not configured'}`);
    });
}

export default app;
