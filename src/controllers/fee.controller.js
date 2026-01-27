import { forwardingService } from '../services/forwarding.service.js';

/**
 * Collect all accumulated fees
 * POST /fees/collect
 */
export const collectFees = async (req, res, next) => {
    try {
        const { cryptocurrency } = req.body;

        if (!cryptocurrency) {
            return res.status(400).json({
                success: false,
                error: 'cryptocurrency is required (btc, eth, btc_test, eth_test, bcy_test)'
            });
        }

        const crypto = cryptocurrency.toLowerCase();
        if (!['btc', 'eth', 'btc_test', 'eth_test', 'bcy_test'].includes(crypto)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid cryptocurrency'
            });
        }

        console.log(`\n=== Fee Collection Request for ${crypto.toUpperCase()} ===`);

        const result = await forwardingService.collectAllFees(crypto);

        if (result.success) {
            res.status(200).json({
                success: true,
                message: `Collected ${result.totalCollected} ${crypto.toUpperCase()} in fees`,
                data: {
                    totalCollected: result.totalCollected,
                    sessionsProcessed: result.sessionsProcessed,
                    cryptocurrency: crypto,
                    results: result.results
                }
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error
            });
        }

    } catch (error) {
        next(error);
    }
};
