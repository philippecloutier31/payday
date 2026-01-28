import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INDEX_FILE = path.join(__dirname, '../../data/wallet-index.json');
const SESSIONS_FILE = path.join(__dirname, '../../data/sessions.json');

/**
 * Payment Session Manager
 * 
 * Manages payment sessions in memory with a mock DB interface
 * for easy future migration to a real database.
 * 
 * Session States:
 * - pending: Waiting for payment
 * - detected: Transaction detected in mempool (unconfirmed)
 * - confirming: Transaction has some confirmations
 * - confirmed: Transaction has required confirmations
 * - forwarded: Funds have been forwarded to main address
 * - completed: Payment fully processed, user balance updated
 * - expired: Session expired without payment
 * - cancelled: Session manually cancelled
 * - failed: Payment processing failed
 */

/**
 * Session schema definition (for documentation and validation)
 */
const SessionSchema = {
    id: 'string',               // Unique session ID (UUID)
    userId: 'string',           // User ID from main application
    cryptocurrency: 'string',   // 'btc' or 'eth'
    paymentAddress: 'string',   // Temporary address for receiving payment
    forwardingAddress: 'string', // Main address where funds are forwarded
    forwardingId: 'string',     // BlockCypher forwarding ID
    webhookId: 'string',        // BlockCypher webhook ID
    expectedAmount: 'number',   // Expected payment amount (optional)
    receivedAmount: 'number',   // Actual received amount
    status: 'string',           // Session status
    confirmations: 'number',    // Current confirmation count
    requiredConfirmations: 'number', // Required confirmations for completion
    txHash: 'string',           // Transaction hash
    blockHeight: 'number',      // Block height of transaction
    metadata: 'object',         // Additional metadata
    createdAt: 'string',        // ISO timestamp
    updatedAt: 'string',        // ISO timestamp
    expiresAt: 'string',        // ISO timestamp
    detectedAt: 'string',       // When transaction was first detected
    confirmedAt: 'string',      // When required confirmations reached
    completedAt: 'string',      // When payment was fully processed
    transactionHistory: 'array' // History of transaction updates
};

class PaymentSessionManager {
    constructor() {
        // In-memory storage (replace with DB in production)
        this.sessions = new Map();
        // Index by payment address for quick lookup
        this.addressIndex = new Map();
        // Index by user ID
        this.userIndex = new Map();

        // Load persistable data
        this.walletIndices = this.loadWalletIndices();
        this.loadSessions();

        // Start cleanup interval for expired sessions
        this.startCleanupInterval();
    }

    /**
     * Load sessions from disk
     */
    loadSessions() {
        try {
            if (fs.existsSync(SESSIONS_FILE)) {
                const content = fs.readFileSync(SESSIONS_FILE, 'utf8');
                const data = JSON.parse(content);

                for (const session of data) {
                    // Only load non-expired sessions
                    if (new Date(session.expiresAt) > new Date() || session.status === 'completed') {
                        this.sessions.set(session.id, session);
                        this.addressIndex.set(session.paymentAddress.toLowerCase(), session.id);
                        this.userIndex.set(session.userId, session.id);
                    }
                }
                console.log(`[SessionManager] Loaded ${this.sessions.size} sessions from disk`);
            }
        } catch (error) {
            console.error('[SessionManager] Error loading sessions:', error);
        }
    }

    /**
     * Save sessions to disk
     */
    saveSessions() {
        try {
            const data = Array.from(this.sessions.values());
            fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('[SessionManager] Error saving sessions:', error);
        }
    }

    /**
     * Create a new payment session
     * 
     * @param {Object} data - Session data
     * @returns {Object} Created session
     */
    createSession(data) {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + config.SESSION_EXPIRY_MS);

        const session = {
            id: uuidv4(),
            userId: data.userId,
            cryptocurrency: data.cryptocurrency,
            paymentAddress: data.paymentAddress,
            forwardingAddress: data.forwardingAddress,
            forwardingId: data.forwardingId || null,
            webhookId: data.webhookId || null,
            expectedAmount: data.expectedAmount || null,
            receivedAmount: null,
            status: 'pending',
            confirmations: 0,
            requiredConfirmations: data.cryptocurrency === 'bcy'
                ? config.BCY_CONFIRMATIONS_REQUIRED
                : data.cryptocurrency === 'beth'
                    ? config.BETH_CONFIRMATIONS_REQUIRED
                    : data.cryptocurrency.startsWith('btc')
                        ? config.BTC_CONFIRMATIONS_REQUIRED
                        : config.ETH_CONFIRMATIONS_REQUIRED,
            txHash: null,
            blockHeight: null,
            addressIndex: data.addressIndex || null,
            metadata: data.metadata || {},
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
            expiresAt: expiresAt.toISOString(),
            detectedAt: null,
            confirmedAt: null,
            completedAt: null,
            transactionHistory: []
        };

        // Store in main map
        this.sessions.set(session.id, session);

        // Add to address index
        this.addressIndex.set(session.paymentAddress.toLowerCase(), session.id);

        // Add to user index
        if (!this.userIndex.has(session.userId)) {
            this.userIndex.set(session.userId, new Set());
        }
        this.userIndex.get(session.userId).add(session.id);

        console.log(`Created payment session: ${session.id} for user ${session.userId}`);

        // Persist to disk
        this.saveSessions();

        return { ...session };
    }

    /**
     * Get a session by ID
     * 
     * @param {string} sessionId - Session ID
     * @returns {Object|null} Session or null if not found
     */
    getSession(sessionId) {
        const session = this.sessions.get(sessionId);
        return session ? { ...session } : null;
    }

    /**
     * Get a session by payment address
     * 
     * @param {string} address - Payment address
     * @returns {Object|null} Session or null if not found
     */
    getSessionByAddress(address) {
        const sessionId = this.addressIndex.get(address.toLowerCase());
        if (!sessionId) return null;
        return this.getSession(sessionId);
    }

    /**
     * Get all sessions for a user
     * 
     * @param {string} userId - User ID
     * @returns {Array} Array of sessions
     */
    getSessionsByUser(userId) {
        const sessionIds = this.userIndex.get(userId);
        if (!sessionIds) return [];

        return Array.from(sessionIds)
            .map(id => this.getSession(id))
            .filter(Boolean);
    }

    /**
     * Get all sessions
     * 
     * @returns {Array} Array of all sessions
     */
    getAllSessions() {
        return Array.from(this.sessions.values()).map(s => ({ ...s }));
    }

    /**
     * Update a session
     * 
     * @param {string} sessionId - Session ID
     * @param {Object} updates - Fields to update
     * @returns {Object|null} Updated session or null if not found
     */
    updateSession(sessionId, updates) {
        const session = this.sessions.get(sessionId);
        if (!session) return null;

        // Prevent updating immutable fields
        const { id, createdAt, userId, paymentAddress, ...allowedUpdates } = updates;

        // Apply updates
        Object.assign(session, allowedUpdates, {
            updatedAt: new Date().toISOString()
        });

        console.log(`Updated session ${sessionId}:`, allowedUpdates);

        // Persist to disk
        this.saveSessions();

        return { ...session };
    }

    /**
     * Add a transaction event to session history
     * 
     * @param {string} sessionId - Session ID
     * @param {Object} event - Transaction event data
     * @returns {Object|null} Updated session or null if not found
     */
    addTransactionEvent(sessionId, event) {
        const session = this.sessions.get(sessionId);
        if (!session) return null;

        const historyEntry = {
            timestamp: new Date().toISOString(),
            ...event
        };

        session.transactionHistory.push(historyEntry);
        session.updatedAt = new Date().toISOString();

        return { ...session };
    }

    /**
     * Mark session as payment detected (unconfirmed transaction)
     * 
     * @param {string} sessionId - Session ID
     * @param {Object} txData - Transaction data
     * @returns {Object|null} Updated session or null
     */
    markPaymentDetected(sessionId, txData) {
        const session = this.sessions.get(sessionId);
        if (!session) return null;

        const updates = {
            status: 'detected',
            txHash: txData.txHash,
            receivedAmount: txData.amount,
            detectedAt: new Date().toISOString()
        };

        this.addTransactionEvent(sessionId, {
            type: 'payment_detected',
            txHash: txData.txHash,
            amount: txData.amount,
            confirmations: 0
        });

        return this.updateSession(sessionId, updates);
    }

    /**
     * Update confirmation count
     * 
     * @param {string} sessionId - Session ID
     * @param {number} confirmations - New confirmation count
     * @param {Object} txData - Additional transaction data
     * @returns {Object|null} Updated session or null
     */
    updateConfirmations(sessionId, confirmations, txData = {}) {
        const session = this.sessions.get(sessionId);
        if (!session) return null;

        const updates = {
            confirmations,
            status: confirmations >= session.requiredConfirmations ? 'confirmed' : 'confirming'
        };

        if (txData.blockHeight) {
            updates.blockHeight = txData.blockHeight;
        }

        if (updates.status === 'confirmed' && !session.confirmedAt) {
            updates.confirmedAt = new Date().toISOString();
        }

        this.addTransactionEvent(sessionId, {
            type: 'confirmation_update',
            confirmations,
            blockHeight: txData.blockHeight
        });

        return this.updateSession(sessionId, updates);
    }

    /**
     * Mark session as completed
     * 
     * @param {string} sessionId - Session ID
     * @param {Object} completionData - Completion data
     * @returns {Object|null} Updated session or null
     */
    markCompleted(sessionId, completionData = {}) {
        const session = this.sessions.get(sessionId);
        if (!session) return null;

        const updates = {
            status: 'completed',
            completedAt: new Date().toISOString(),
            ...completionData
        };

        this.addTransactionEvent(sessionId, {
            type: 'payment_completed',
            ...completionData
        });

        return this.updateSession(sessionId, updates);
    }

    /**
     * Mark session as failed
     * 
     * @param {string} sessionId - Session ID
     * @param {string} reason - Failure reason
     * @returns {Object|null} Updated session or null
     */
    markFailed(sessionId, reason) {
        const session = this.sessions.get(sessionId);
        if (!session) return null;

        this.addTransactionEvent(sessionId, {
            type: 'payment_failed',
            reason
        });

        return this.updateSession(sessionId, {
            status: 'failed',
            metadata: {
                ...session.metadata,
                failureReason: reason
            }
        });
    }

    /**
     * Delete a session
     * 
     * @param {string} sessionId - Session ID
     * @returns {boolean} True if deleted, false if not found
     */
    deleteSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) return false;

        // Remove from indexes
        this.addressIndex.delete(session.paymentAddress.toLowerCase());

        const userSessions = this.userIndex.get(session.userId);
        if (userSessions) {
            userSessions.delete(sessionId);
            if (userSessions.size === 0) {
                this.userIndex.delete(session.userId);
            }
        }

        // Remove from main map
        this.sessions.delete(sessionId);

        console.log(`Deleted session: ${sessionId}`);
        return true;
    }

    /**
     * Check and expire old sessions
     * 
     * @returns {number} Number of sessions expired
     */
    expireOldSessions() {
        const now = new Date();
        let expiredCount = 0;

        for (const [sessionId, session] of this.sessions) {
            if (session.status === 'pending' && new Date(session.expiresAt) < now) {
                this.updateSession(sessionId, { status: 'expired' });
                expiredCount++;
                console.log(`Expired session: ${sessionId}`);
            }
        }

        return expiredCount;
    }

    /**
     * Start interval to clean up expired sessions
     */
    startCleanupInterval() {
        // Run cleanup every 5 minutes
        this.cleanupInterval = setInterval(() => {
            const expired = this.expireOldSessions();
            if (expired > 0) {
                console.log(`Cleanup: Expired ${expired} sessions`);
            }
        }, 5 * 60 * 1000);

        // Don't prevent Node.js from exiting
        if (this.cleanupInterval.unref) {
            this.cleanupInterval.unref();
        }
    }

    /**
     * Stop the cleanup interval
     */
    stopCleanupInterval() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    /**
     * Get session statistics
     * 
     * @returns {Object} Statistics object
     */
    getStatistics() {
        const sessions = Array.from(this.sessions.values());

        const stats = {
            total: sessions.length,
            byStatus: {},
            byCrypto: {},
            activeUsers: this.userIndex.size
        };

        for (const session of sessions) {
            // Count by status
            stats.byStatus[session.status] = (stats.byStatus[session.status] || 0) + 1;
            // Count by crypto
            stats.byCrypto[session.cryptocurrency] = (stats.byCrypto[session.cryptocurrency] || 0) + 1;
        }

        return stats;
    }

    /**
     * Clear all sessions (for testing)
     */
    clearAll() {
        this.sessions.clear();
        this.addressIndex.clear();
        this.userIndex.clear();
        console.log('All sessions cleared');
    }

    /**
     * Load wallet indices from file
     */
    loadWalletIndices() {
        try {
            const dataDir = path.dirname(INDEX_FILE);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            if (fs.existsSync(INDEX_FILE)) {
                const content = fs.readFileSync(INDEX_FILE, 'utf8');
                return JSON.parse(content);
            }
        } catch (error) {
            console.error('Error loading wallet indices:', error);
        }
        return { btc: 0, eth: 0, btc_test: 0, eth_test: 0, bcy: 0, beth: 0 };
    }

    /**
     * Save wallet indices to file
     */
    saveWalletIndices() {
        try {
            fs.writeFileSync(INDEX_FILE, JSON.stringify(this.walletIndices, null, 2));
        } catch (error) {
            console.error('Error saving wallet indices:', error);
        }
    }

    /**
     * Get next index for a cryptocurrency and increment
     */
    getNextIndex(crypto) {
        const key = crypto.toLowerCase();
        const index = this.walletIndices[key] || 0;
        this.walletIndices[key] = index + 1;
        this.saveWalletIndices();
        return index;
    }
}

// Export singleton instance
export const paymentSessionManager = new PaymentSessionManager();
export default paymentSessionManager;
