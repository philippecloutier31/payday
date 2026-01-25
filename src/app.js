import express from 'express';
import cors from 'cors';
import config from './config/env.js';

// Import routes (will be created later)
import addressRoutes from './routes/address.routes.js';
import sessionRoutes from './routes/session.routes.js';
import webhookRoutes from './routes/webhook.routes.js';

const app = express();

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
    app.listen(config.PORT, () => {
        console.log(`Payment Gateway server running on port ${config.PORT}`);
        console.log(`Environment: ${config.NODE_ENV}`);
        console.log(`Webhook URL: ${config.WEBHOOK_BASE_URL}`);
        
        if (!config.BLOCKCYPHER_API_TOKEN) {
            console.warn('WARNING: BLOCKCYPHER_API_TOKEN is not set!');
        }
        if (!config.BTC_MAIN_ADDRESS) {
            console.warn('WARNING: BTC_MAIN_ADDRESS is not set!');
        }
        if (!config.ETH_MAIN_ADDRESS) {
            console.warn('WARNING: ETH_MAIN_ADDRESS is not set!');
        }
    });
}

export default app;
