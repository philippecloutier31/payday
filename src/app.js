import express from 'express';
import cors from 'cors';
import config from './config/env.js';

// Import routes (will be created later)
import addressRoutes from './routes/address.routes.js';
import sessionRoutes from './routes/session.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import feeRoutes from './routes/fee.routes.js';
import './services/forwarding.service.js'; // Initialize auto-forwarding


// Import confirmation service for event handling
import { confirmationService } from './services/confirmation.service.js';

const app = express();

/**
 * Register payment event handlers
 * When a payment is completed, notify the main backend
 */
function registerPaymentEventHandlers() {
    // Handler for when payment is detected (transaction in mempool)
    confirmationService.on('onPaymentDetected', async (data) => {
        console.log(`[Event] Payment detected for session ${data.sessionId}`);
        console.log(`  TX: ${data.txHash}, Amount: ${data.amount} ${data.cryptocurrency}`);

        // Optionally notify main backend about detected payment
        await notifyMainBackend({
            ...data,
            paymentStatus: 'detected'
        });
    });

    // Handler for confirmation updates
    confirmationService.on('onConfirmationUpdate', async (data) => {
        console.log(`[Event] Confirmation update for session ${data.sessionId}`);
        console.log(`  Confirmations: ${data.confirmations}/${data.requiredConfirmations}`);
    });

    // Handler for when payment is confirmed (reached required confirmations)
    confirmationService.on('onPaymentConfirmed', async (data) => {
        console.log(`[Event] Payment confirmed for session ${data.sessionId}`);
        console.log(`  Amount: ${data.amount} ${data.cryptocurrency}`);
    });

    // Handler for when payment is fully completed
    confirmationService.on('onPaymentCompleted', async (data) => {
        console.log(`[Event] Payment completed for session ${data.sessionId}`);
        console.log(`  User: ${data.userId}, Amount: ${data.amount} ${data.cryptocurrency}`);
        console.log(`  TX: ${data.txHash}`);

        // Notify main backend about completed payment
        await notifyMainBackend({
            ...data,
            paymentStatus: 'completed'
        });
    });

    console.log('Payment event handlers registered');
}

/**
 * Notify the main backend about payment status changes
 * @param {Object} data - Payment data to send
 */
async function notifyMainBackend(data) {
    if (!config.MAIN_BACKEND_URL) {
        console.warn('MAIN_BACKEND_URL not configured, skipping notification');
        return;
    }

    if (!config.MAIN_BACKEND_WEBHOOK_SECRET) {
        console.warn('MAIN_BACKEND_WEBHOOK_SECRET not configured, skipping notification');
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
            paymentStatus: data.paymentStatus
        };

        console.log(`Notifying main backend at ${webhookUrl}`);
        console.log('Payload:', JSON.stringify(payload, null, 2));

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok && result.success) {
            console.log('Main backend notification successful:', result.message);
        } else {
            console.error('Main backend notification failed:', result.error || result.message);
        }
    } catch (error) {
        console.error('Error notifying main backend:', error.message);
    }
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
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

// API Routes
app.use('/address', addressRoutes);
app.use('/session', sessionRoutes);
app.use('/webhook', webhookRoutes);
app.use('/fees', feeRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    console.error(err.stack);

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

// Start server only if not in test mode
if (process.env.NODE_ENV !== 'test') {
    // Register payment event handlers
    registerPaymentEventHandlers();

    app.listen(config.PORT, () => {
        console.log(`Payment Gateway server running on port ${config.PORT}`);
        console.log(`Environment: ${config.NODE_ENV}`);
        console.log(`Webhook URL: ${config.WEBHOOK_BASE_URL}`);
        console.log(`Main Backend URL: ${config.MAIN_BACKEND_URL}`);

        if (!config.BLOCKCYPHER_API_TOKEN) {
            console.warn('WARNING: BLOCKCYPHER_API_TOKEN is not set!');
        }
        if (!config.BTC_MAIN_ADDRESS) {
            console.warn('WARNING: BTC_MAIN_ADDRESS is not set!');
        }
        if (!config.ETH_MAIN_ADDRESS) {
            console.warn('WARNING: ETH_MAIN_ADDRESS is not set!');
        }
        if (!config.MAIN_BACKEND_URL) {
            console.warn('WARNING: MAIN_BACKEND_URL is not set!');
        }
        if (!config.MAIN_BACKEND_WEBHOOK_SECRET) {
            console.warn('WARNING: MAIN_BACKEND_WEBHOOK_SECRET is not set!');
        }
    });
}

export default app;
