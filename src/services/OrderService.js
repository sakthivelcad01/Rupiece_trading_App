import { db, auth } from '../../firebaseConfig';
import {
    collection,
    addDoc,
    updateDoc,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    serverTimestamp,
    runTransaction,
    deleteDoc
} from 'firebase/firestore';
import { MarketService } from './MarketService';
import { FeatureFlagService } from './FeatureFlagService';
import { API_URL } from '../config/ApiConfig';

export const OrderService = {

    /**
     * Helper to check if market is open (09:15 to 15:30)
     */
    isMarketOpen: () => {
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();

        // Convert to minutes for easier comparison
        const currentMinutes = hour * 60 + minute;
        const startMinutes = 9 * 60 + 15; // 09:15 = 555
        const endMinutes = 15 * 60 + 30;  // 15:30 = 930

        return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    },

    /**
     * Places a new order and updates positions/balance atomically.
     * @param {Object} orderDetails 
     * @param {Object} account (Selected Challenge Account)
     * @param {string} userId
     */
    placeOrder: async (orderDetails, account, userId) => {
        try {
            // Market Hours Check
            if (!OrderService.isMarketOpen()) {
                throw "Market is Closed. Trading hours are 09:15 AM to 03:30 PM.";
            }

            // Get Auth Token
            if (!auth.currentUser) throw "User not authenticated";
            const authToken = await auth.currentUser.getIdToken();

            // API Call
            // const API_URL = "http://localhost:3000"; // Moved to config
            console.log(`[OrderService] Placing Order to: ${API_URL}/placeOrder`);

            const response = await fetch(`${API_URL}/placeOrder`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    orderDetails,
                    accountId: account.id,
                    authToken
                })
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                // Determine if it was a "Logic Failure" (e.g. Max Loss) or "Error"
                if (result.failure) {
                    throw result.reason; // Logic Rejection
                }
                throw result.error || "Server Request Failed";
            }

            return { success: true };

        } catch (error) {
            console.log("Order processing failed:", error);
            return { success: false, error: error.message || error };
        }
    },

    /**
     * Fetches open positions for an account.
     */
    getPositions: async (accountId) => {
        try {
            if (!auth.currentUser) return [];

            const q = query(
                collection(db, "positions"),
                where("accountId", "==", accountId),
                where("userId", "==", auth.currentUser.uid), // Added Security Constraint
                where("status", "==", "OPEN")
            );
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Fetch Positions Error:", error);
            return [];
        }
    },

    /**
     * Fetches ALL orders (Executed, Rejected, Cancelled) for an account.
     */
    getOrderHistory: async (accountId) => {
        try {
            if (!auth.currentUser) return [];

            const q = query(
                collection(db, "orders"),
                where("accountId", "==", accountId),
                where("userId", "==", auth.currentUser.uid) // Added Security Constraint
            );
            const snapshot = await getDocs(q);
            const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Sort Descending locally
            orders.sort((a, b) => {
                const tA = a.timestamp?.toDate ? a.timestamp.toDate() : 0;
                const tB = b.timestamp?.toDate ? b.timestamp.toDate() : 0;
                return tB - tA;
            });

            return orders;
        } catch (error) {
            console.error("Fetch Orders Error:", error);
            return [];
        }
    },

    /**
     * Fetches trade history (closed positions) for an account.
     */
    getTrades: async (accountId) => {
        try {
            if (!auth.currentUser) return [];

            const q = query(
                collection(db, "trades"),
                where("accountId", "==", accountId),
                where("userId", "==", auth.currentUser.uid) // Added Security Constraint
            );
            const snapshot = await getDocs(q);
            const trades = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Sort Descending locally
            trades.sort((a, b) => {
                const tA = a.closedAt?.toDate ? a.closedAt.toDate() : 0;
                const tB = b.closedAt?.toDate ? b.closedAt.toDate() : 0;
                return tB - tA;
            });

            return trades;
        } catch (error) {
            console.error("Fetch Trades Error:", error);
            return [];
        }
    },

    /**
     * Updates account stats (currentBalance, currentProfit, currentLoss) based on EOD prices.
     * To be called manually or by scheduler.
     */
    updateEndOfDayStats: async (accountId) => {
        try {
            const accountRef = doc(db, "challenges", accountId);

            // 1. Get Positions

            // Simplification: We already have logic in placeOrder. 
            // We just need to Re-Calculate Equity.
            // 1. Get Positions
            const positions = await OrderService.getPositions(accountId);

            let investedAmount = 0;
            let currentEquity = 0;

            if (positions.length > 0) {
                // Import MarketService dynamically to avoid circular dep if any, or assume it's there.
                const { MarketService } = require('./MarketService');
                const keys = positions.map(p => p.instrumentKey);
                const quotes = await MarketService.getQuotes(keys);

                // Calculate Equity
                const currentCash = (await getDoc(accountRef)).data().currentBalance;

                let marketValue = 0;
                positions.forEach(p => {
                    const q = quotes[p.instrumentKey];
                    const price = q ? q.last_price : p.avgPrice;
                    marketValue += (price * p.qty);
                });

                investedAmount = marketValue;
                currentEquity = currentCash + marketValue;
            } else {
                const d = (await getDoc(accountRef)).data();
                currentEquity = d.currentBalance;
                investedAmount = 0;
            }

            // 2. Update DB
            await runTransaction(db, async (transaction) => {
                const ref = doc(db, "challenges", accountId);
                const docSnap = await transaction.get(ref);
                if (!docSnap.exists()) return;

                const accData = docSnap.data();
                const initial = accData.balance;
                const accountSize = accData.accountSize || initial;

                const totalPnL = currentEquity - initial;

                // Risk Checks
                const lossLimitLevel = accountSize * 0.92;
                const profitTargetLevel = accountSize * 1.15;

                let newStatus = accData.status || 'ongoing';

                if (currentEquity < lossLimitLevel && newStatus !== 'failed') {
                    newStatus = 'failed';
                } else if (currentEquity >= profitTargetLevel && newStatus !== 'passed') {
                    newStatus = 'passed';
                }

                transaction.update(ref, {
                    currentProfit: totalPnL > 0 ? totalPnL : 0,
                    currentLoss: totalPnL < 0 ? Math.abs(totalPnL) : 0,
                    status: newStatus,
                    lastUpdated: serverTimestamp()
                });
            });

            return { success: true };
        } catch (err) {
            console.error(err);
            return { success: false };
        }
    },

    /**
     * Explicitly Close a Position (Helper).
     * Calculates the necessary 'SELL' order to close an open 'BUY' position.
     */
    closePosition: async (position, currentPrice, account, userId) => {
        try {
            if (!position || position.status !== 'OPEN') throw "Invalid Position";

            // Logic: Place a SELL order for the full quantity
            const orderDetails = {
                instrumentKey: position.instrumentKey,
                symbol: position.symbol,
                qty: position.qty,
                price: currentPrice,
                type: 'SELL',   // Closing a Long Position
                product: position.product || 'PAPER',
                orderClass: 'MARKET', // Usually Close is Market
                // Meta
                expiry: position.expiry || '',
                strike: position.strike || '',
                optionType: position.optionType || ''
            };

            return await OrderService.placeOrder(orderDetails, account, userId);
        } catch (error) {
            return { success: false, error: error.message || error };
        }
    },

    /**
     * Executes a PENDING Limit Order (Called by Monitor).
     * @param {string} orderId 
     * @param {number} fillPrice 
     * @param {Object} account 
     */
    executeLimitOrder: async (orderId, fillPrice, account) => {
        try {
            // Get Auth Token
            if (!auth.currentUser) throw "User not authenticated";
            const authToken = await auth.currentUser.getIdToken();

            // const API_URL = "http://localhost:3000";

            const response = await fetch(`${API_URL}/executeLimitOrder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId,
                    fillPrice,
                    accountId: account.id,
                    authToken
                })
            });

            const result = await response.json();
            if (!response.ok || !result.success) {
                throw result.error || "Execution Failed";
            }
            return { success: true };

        } catch (error) {
            console.error("Execute Limit Order Error:", error);
            return { success: false, error: error.message || error.toString() };
        }
    },

    /**
     * Modifies a Pending Limit Order.
     * @param {string} orderId 
     * @param {number} newPrice 
     * @param {number} newQty 
     * @param {Object} account 
     */
    modifyPendingOrder: async (orderId, newPrice, newQty, account) => {
        try {
            if (!auth.currentUser) throw "User not authenticated";
            const authToken = await auth.currentUser.getIdToken();
            // const API_URL = "http://localhost:3000";

            const response = await fetch(`${API_URL}/modifyOrder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId, newPrice, newQty, accountId: account.id, authToken
                })
            });

            const result = await response.json();
            if (!result.success) throw result.error || "Modify Failed";
            return { success: true };
        } catch (error) {
            console.error("Modify Order Error:", error);
            return { success: false, error: error.message || error };
        }
    },

    /**
     * Updates SL/TP for an Open Position.
     * @param {Object} account 
     * @param {string} positionId 
     * @param {number|null} sl 
     * @param {number|null} tp 
     */
    updatePositionSLTP: async (account, positionId, sl, tp) => {
        try {
            if (!auth.currentUser) throw "User not authenticated";
            const authToken = await auth.currentUser.getIdToken();
            // const API_URL = "http://localhost:3000";

            const response = await fetch(`${API_URL}/updateSLTP`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    positionId, sl, tp, authToken
                })
            });

            const result = await response.json();
            if (!result.success) throw result.error || "Update SL/TP Failed";
            return { success: true };
        } catch (error) {
            console.error("Update SL/TP Error:", error);
            return { success: false, error: error.message || error };
        }
    },

    /**
     * Cancel a Pending Order
     */
    cancelOrder: async (orderId, account) => {
        try {
            if (!auth.currentUser) throw "User not authenticated";
            const authToken = await auth.currentUser.getIdToken();
            // const API_URL = "http://localhost:3000";

            const response = await fetch(`${API_URL}/cancelOrder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId, accountId: account.id, authToken
                })
            });

            const result = await response.json();
            if (!result.success) throw result.error || "Cancellation Failed";
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    /**
     * SIMULATION: Trigger 7% Loss (Simulate Margin Call)
     */
    simulateMarginCall: async (accountId) => {
        const accountRef = doc(db, "challenges", accountId);

        await runTransaction(db, async (transaction) => {
            const docSnap = await transaction.get(accountRef);
            if (!docSnap.exists()) return;

            const data = docSnap.data();
            const accountSize = data.accountSize || 1000000;
            const invested = data.investedAmount || 0;

            // Target Equity: 93% of accountSize (7% Loss => hits 6.5% warning)
            // Equity = Balance + Invested. 
            // NewBalance = TargetEquity - Invested.
            const targetEquity = accountSize * 0.93;
            const newBalance = targetEquity - invested;

            transaction.update(accountRef, {
                currentBalance: newBalance,
                status: 'ongoing' // Ensure it's not Failed
            });
        });
        return { success: true };
    },

    /**
     * SIMULATION: Reset Balance (Undo Margin Call)
     */
    resetBalance: async (accountId) => {
        const accountRef = doc(db, "challenges", accountId);

        await runTransaction(db, async (transaction) => {
            const docSnap = await transaction.get(accountRef);
            if (!docSnap.exists()) return;

            const data = docSnap.data();
            const accountSize = data.accountSize || 1000000; // Default to 10L

            transaction.update(accountRef, {
                currentBalance: accountSize, // Reset to full size
                investedAmount: 0,
                status: 'ongoing'
            });
        });
        return { success: true };
    },

    /**
     * Checks for expired positions and auto-squares them off if multiple days of delivery
     */
    checkAndSquareOffExpiredPositions: async (account, userId) => {
        if (!account || !account.id) return;

        try {
            const positions = await OrderService.getPositions(account.id);
            const openPositions = positions.filter(p => p.status === 'OPEN');
            const today = new Date();
            // Reset time to 00:00:00 for simple date comparison
            today.setHours(0, 0, 0, 0);

            for (const pos of openPositions) {
                if (pos.product === 'INTRADAY') continue; // Intraday handled separately usually
                if (!pos.expiry) continue;

                // Handle DD-MMM-YYYY format if necessary, assuming ISO or parseable string
                const expiryDate = new Date(pos.expiry);
                expiryDate.setHours(0, 0, 0, 0);

                // If today is >= expiry date, we must close it
                if (today > expiryDate) {
                    console.log(`[AutoSquareOff] Position ${pos.symbol} expired on ${pos.expiry}. Closing now.`);

                    try {
                        await OrderService.placeOrder({
                            instrumentKey: pos.instrumentKey,
                            symbol: pos.symbol,
                            qty: pos.qty,
                            price: pos.ltp || pos.avgPrice, // Best effort: use LTP if available or just execute Market
                            type: pos.qty > 0 ? 'SELL' : 'BUY', // Opposing side
                            product: pos.product,
                            orderClass: 'MARKET',
                            expiry: pos.expiry,
                            strike: pos.strike,
                            optionType: pos.optionType
                        }, account, userId);
                    } catch (err) {
                        console.error(`[AutoSquareOff] Failed to close ${pos.symbol}:`, err);
                    }
                }
            }
        } catch (error) {
            console.error("[AutoSquareOff] Error checking positions:", error);
        }
    },

    /**
     * Checks all PENDING orders for the account and executes them if Limit Price is hit.
     */
    checkPendingOrders: async (account, userId) => {
        if (!account || !account.id) return;

        try {
            // 1. Fetch Pending Orders
            const q = query(
                collection(db, "orders"),
                where("accountId", "==", account.id),
                where("status", "==", "PENDING")
            );
            const snapshot = await getDocs(q);
            if (snapshot.empty) return;

            const pendingOrders = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));

            // 2. Fetch Live Prices
            const keysToFetch = [...new Set(pendingOrders.map(o => o.instrumentKey))];
            const quotes = await MarketService.getQuotes(keysToFetch);

            for (const order of pendingOrders) {
                const quote = quotes[order.instrumentKey];
                if (!quote) continue;

                const ltp = quote.last_price;
                if (!ltp) continue;

                let shouldExecute = false;
                // BUY hits if Market Price <= Limit Price
                if (order.type === 'BUY' && ltp <= order.price) shouldExecute = true;
                // SELL hits if Market Price >= Limit Price
                else if (order.type === 'SELL' && ltp >= order.price) shouldExecute = true;

                if (shouldExecute) {
                    console.log(`[LimitTrigger] Executing ${order.symbol} Limit: ${order.price} LTP: ${ltp}`);

                    try {
                        // Use Server API to execute Limit Order (Handles refunds, position updates)
                        await OrderService.executeLimitOrder(order.id, ltp, account);
                    } catch (err) {
                        console.error(`[LimitTrigger] Failed to execute ${order.symbol}:`, err);
                    }
                }
            }
        } catch (error) {
            console.error("[LimitTrigger] Error checking pending orders:", error);
        }
    },

    executeLimitOrder: async (orderId, fillPrice, account) => {
        try {
            // Get Auth Token
            if (!auth.currentUser) throw "User not authenticated";
            const authToken = await auth.currentUser.getIdToken();

            const API_URL = "http://localhost:3000";

            const response = await fetch(`${API_URL}/executeLimitOrder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId,
                    fillPrice,
                    accountId: account.id,
                    authToken
                })
            });

            const result = await response.json();
            if (!response.ok || !result.success) {
                throw result.error || "Execution Failed";
            }
            return { success: true };

        } catch (error) {
            console.error("Execute Limit Order Error:", error);
            return { success: false, error: error.message || error.toString() };
        }
    }
};
