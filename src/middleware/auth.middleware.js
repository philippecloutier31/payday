import config from '../config/env.js';
import logger from '../utils/logger.js';

/**
 * Middleware to protect routes with API Key authentication
 * Checks for x-api-key header matching WALLET_SYNC_SECRET
 */
export const verifyApiKey = (req, res, next) => {
    // Allow health check endpoint without authentication
    if (req.path === '/health') {
        return next();
    }

    // Skip webhook endpoints as they implement their own signature/secret validation
    // suited for 3rd party providers like BlockCypher
    if (req.originalUrl.startsWith('/webhook')) {
        return next();
    }

    // Check for API key in headers, query params, or body (for legacy compatibility)
    const apiKey = req.headers['x-api-key'] || req.query.api_key || (req.body && req.body.secret);

    if (!apiKey || apiKey !== config.WALLET_SYNC_SECRET) {
        logger.warn(`Unauthorized access attempt to ${req.originalUrl} from IP ${req.ip}`);
        return res.status(401).json({
            success: false,
            error: 'Unauthorized: Invalid API Key'
        });
    }

    next();
};
