import { db } from '../../firebaseConfig';
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
            // Market Hours Check (Request to disable for testing)
            // if (!OrderService.isMarketOpen()) {
            //      throw "Market is Closed. Trading hours are 09:15 AM to 03:30 PM.";
            // }

            const {
                instrumentKey,
                symbol,
                qty,
                price,
                type, // 'BUY' or 'SELL'
                product, // 'PAPER' or 'FUTURES'
                marginRequired, // Explicit margin amount for FUTURES
                // New Fields
                orderClass, // 'MARKET' or 'LIMIT'
                limitPrice,
                sl,
                tp,
                // Meta fields
                expiry,
                strike,
                optionType
            } = orderDetails;

            // Determine Cost Basis: use marginRequired if provided, else full value
            // For Limit Orders, use limitPrice. For Market, use current price.
            const effectivePrice = (orderClass === 'LIMIT' && limitPrice) ? limitPrice : price;
            const effectiveCost = (product === 'FUTURES' && marginRequired) ? marginRequired : (effectivePrice * qty);
            const orderValue = effectivePrice * qty; // Full Notional Value

            const accountRef = doc(db, "challenges", account.id);

            // Transaction to ensure balance and position are updated together
            const result = await runTransaction(db, async (transaction) => {
                let closedTradeData = null; // Initialize to avoid ReferenceError

                // ==========================================
                // 1. READ ALL DATA FIRST (Read-Before-Write Rule)
                // ==========================================

                // Read Account
                const accountDoc = await transaction.get(accountRef);
                if (!accountDoc.exists()) throw "Account not found!";

                // Read Position
                // Use a deterministic ID for the position document: `${accountId}_${instrumentKey}`
                const safeKey = instrumentKey.replace(/\|/g, '_').replace(/:/g, '_');
                const positionId = `${account.id}_${safeKey}`;
                const positionRef = doc(db, "positions", positionId);
                const positionDoc = await transaction.get(positionRef);

                // ==========================================
                // 2. PERFORM LOGIC
                // ==========================================
                const currentBalance = accountDoc.data().currentBalance || 0;
                const initialBalance = accountDoc.data().balance || 0;
                const investedAmount = accountDoc.data().investedAmount || 0;

                const currentEquity = currentBalance + investedAmount;

                const accountSize = accountDoc.data().accountSize || initialBalance;

                // Risk Rules Check (Based on Account Size)
                const lossLimitLevel = accountSize * 0.92; // 8% Max Loss
                const profitTargetLevel = accountSize * 1.15; // 15% Profit Target

                let status = accountDoc.data().status || 'ongoing';
                let statusChanged = false;

                // 1. Check Failure
                if (currentEquity < lossLimitLevel) {
                    if (status !== 'failed') {
                        status = 'failed';
                        statusChanged = true;
                        transaction.update(accountRef, { status: 'failed' });
                    }
                }
                // 2. Check Pass
                else if (currentEquity >= profitTargetLevel) {
                    if (status !== 'passed') {
                        status = 'passed';
                        statusChanged = true;
                        transaction.update(accountRef, { status: 'passed' });
                    }
                }

                // Enforcement
                if (status === 'failed') {
                    // Block Opening New Trades (BUY), Allow Closing (SELL)
                    if (type === 'BUY') {
                        // If we just failed, return failure reason to update UI
                        if (statusChanged) {
                            return { failure: true, reason: "Max Loss (8%) Hit! Account FAILED. Buy orders blocked." };
                        }
                        throw "Account is FAILED. Trading disabled.";
                    }
                }

                if (status === 'passed') {
                    // Block Opening New Trades (BUY), Allow Closing (SELL)
                    if (type === 'BUY') {
                        if (statusChanged) {
                            return { failure: true, reason: "Target (15%) Hit! Account PASSED. Buy orders blocked." };
                        }
                        throw "Account PASSED! New positions blocked. Please close open trades.";
                    }
                }

                // 3. Margin Call Warning Checks (6.5% Loss)
                // 100% - 6.5% = 93.5% (Factor 0.935)
                const marginCallLevel = accountSize * 0.935;

                if (status === 'ongoing' && currentEquity < marginCallLevel) {
                    if (type === 'BUY') {
                        throw "🚨 Margin Call (6.5% Loss)! New orders blocked. Please reduce positions.";
                    }
                }

                let newBalance = currentBalance;
                let newInvestedAmount = investedAmount;

                if (type === 'BUY') {
                    // 2. Check Insufficient Funds (Cash only)
                    if (currentBalance < effectiveCost) {
                        throw "Insufficient Funds!";
                    }
                    newBalance = currentBalance - effectiveCost;
                    newInvestedAmount = investedAmount + effectiveCost;
                } else {
                    // SELL logic handled in position update
                }

                // Calculate Position Updates
                let positionAction = 'NONE'; // 'CREATE', 'UPDATE', 'CLOSE', 'ERROR'
                let newPosData = {};

                if (positionDoc.exists() && positionDoc.data().status === 'OPEN') {
                    const pos = positionDoc.data();
                    let newQty = pos.qty;
                    let newAvg = pos.avgPrice;

                    if (type === 'BUY') {
                        // Averaging
                        const totalCost = (pos.avgPrice * pos.qty) + orderValue; // Notional Cost
                        newQty += qty;
                        newAvg = totalCost / newQty;

                        positionAction = 'UPDATE';
                        newPosData = {
                            qty: newQty,
                            avgPrice: newAvg,
                            lastUpdated: serverTimestamp(),
                            product: product || pos.product || 'PAPER',
                            expiry: expiry || pos.expiry || '',
                            optionType: optionType || pos.optionType || '',
                            strike: strike || pos.strike || ''
                        };
                    } else {
                        // Selling (Partial or Full Exit)
                        newQty -= qty;

                        if (newQty < 0) {
                            throw "Cannot Sell more than you own!";
                        }

                        // Reduce Invested Amount by Cost Basis of sold items
                        let costOfSold = pos.avgPrice * qty;
                        if (pos.product === 'FUTURES') {
                            costOfSold = costOfSold / 10;
                        }

                        newInvestedAmount = investedAmount - costOfSold;
                        if (newInvestedAmount < 0) newInvestedAmount = 0; // Safety

                        // Calculate Realized PnL for THIS chunk
                        const realizedPnL = (price - pos.avgPrice) * qty;

                        // Update Balance on Sell:
                        newBalance = currentBalance + costOfSold + realizedPnL;

                        // Create Trade Record for this exit
                        closedTradeData = {
                            accountId: account.id,
                            avgPrice: pos.avgPrice,
                            closedAt: serverTimestamp(),
                            expiry: expiry || pos.expiry || '',
                            id: new Date().toISOString(),
                            instrument: symbol.split(' ')[0] || "INDEX",
                            optionType: optionType || pos.optionType || '',
                            pnl: realizedPnL,
                            price: price, // Exit Price
                            quantity: qty, // Qty of THIS exit
                            strike: strike || pos.strike || '',
                            type: "BUY", // Original side was BUY
                            action: "SELL", // This action is SELL
                            userId: userId
                        };

                        if (newQty === 0) {
                            positionAction = 'CLOSE';
                            newPosData = {
                                qty: 0,
                                status: 'CLOSED',
                                sellPrice: price,
                                lastUpdated: serverTimestamp()
                            };
                        } else {
                            positionAction = 'UPDATE';
                            newPosData = {
                                qty: newQty,
                                lastUpdated: serverTimestamp()
                            };
                        }
                    }
                } else {
                    if (type === 'BUY') {
                        positionAction = 'CREATE';
                        newPosData = {
                            userId,
                            accountId: account.id,
                            instrumentKey,
                            symbol,
                            qty,
                            avgPrice: price,
                            status: 'OPEN',
                            product: product || 'PAPER', // Store product type
                            expiry: expiry || '',
                            optionType: optionType || '',
                            strike: strike || '',
                            timestamp: serverTimestamp()
                        };
                    } else {
                        throw "Cannot Sell without Open Position!";
                    }
                }

                // ==========================================
                // 3. WRITE ALL DATA (Atomic Commit)
                // ==========================================

                // Calculate Real-time PnL for Database
                const newEquity = newBalance + newInvestedAmount;
                const totalPnL = newEquity - initialBalance;

                // Update Balance, Invested Amount, and PnL fields
                transaction.update(accountRef, {
                    currentBalance: newBalance,
                    investedAmount: newInvestedAmount,
                    currentProfit: totalPnL > 0 ? totalPnL : 0,
                    currentLoss: totalPnL < 0 ? Math.abs(totalPnL) : 0
                });

                if (orderClass === 'LIMIT') {
                    // LIMIT ORDER LOGIC
                    const orderRef = doc(collection(db, "orders"));
                    transaction.set(orderRef, {
                        userId,
                        accountId: account.id,
                        instrumentKey,
                        symbol,
                        qty,
                        price: effectivePrice, // Desired Price
                        type,
                        product: product || 'PAPER',
                        status: 'PENDING', // Wait for match
                        orderClass: 'LIMIT',
                        sl: sl || null,
                        tp: tp || null,
                        timestamp: serverTimestamp()
                    });

                } else {
                    // MARKET ORDER LOGIC (Immediate)

                    // Create EXECUTED Order
                    const orderRef = doc(collection(db, "orders"));
                    transaction.set(orderRef, {
                        userId,
                        accountId: account.id,
                        instrumentKey,
                        symbol,
                        qty,
                        price, // Execution Price
                        type,
                        product: product || 'PAPER',
                        status: 'EXECUTED',
                        orderClass: 'MARKET',
                        sl: sl || null,
                        tp: tp || null,
                        timestamp: serverTimestamp()
                    });

                    // Update Position
                    if (positionAction === 'CREATE' || positionAction === 'UPDATE') {
                        if (sl) newPosData.sl = sl;
                        if (tp) newPosData.tp = tp;
                    }

                    if (positionAction === 'CREATE') {
                        transaction.set(positionRef, newPosData);
                    } else if (positionAction === 'UPDATE' || positionAction === 'CLOSE') {
                        transaction.update(positionRef, newPosData);
                    }

                    if (closedTradeData) {
                        const tradeRef = doc(collection(db, "trades"));
                        transaction.set(tradeRef, closedTradeData);
                    }
                }
            });

            // Check if transaction returned a failure (Status Update)
            if (result && result.failure) {
                throw result.reason;
            }

            return { success: true };
        } catch (error) {
            console.log("Order processing failed:", error);

            // Log Failed Order to DB (outside transaction)
            try {
                const failedOrder = {
                    userId,
                    accountId: account.id,
                    instrumentKey: orderDetails.instrumentKey,
                    symbol: orderDetails.symbol,
                    qty: orderDetails.qty,
                    price: orderDetails.price,
                    type: orderDetails.type,
                    status: 'REJECTED',
                    reason: error.message || error.toString(),
                    timestamp: serverTimestamp()
                };
                addDoc(collection(db, "orders"), failedOrder);
            } catch (logErr) {
                console.error("Failed to log failed order:", logErr);
            }

            return { success: false, error: error.message || error };
        }
    },

    /**
     * Fetches open positions for an account.
     */
    getPositions: async (accountId) => {
        try {
            const q = query(
                collection(db, "positions"),
                where("accountId", "==", accountId),
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
            const q = query(
                collection(db, "orders"),
                where("accountId", "==", accountId)
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
            const q = query(
                collection(db, "trades"),
                where("accountId", "==", accountId)
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
        const orderRef = doc(db, "orders", orderId);
        const accountRef = doc(db, "challenges", account.id);

        try {
            await runTransaction(db, async (transaction) => {
                // 1. READ ALL DATA FIRST
                const orderDoc = await transaction.get(orderRef);
                if (!orderDoc.exists()) throw "Order not found";

                const order = orderDoc.data();
                if (order.status !== 'PENDING') throw "Order not Pending";

                const accountDoc = await transaction.get(accountRef);
                if (!accountDoc.exists()) throw "Account not found";

                // Position Read
                const safeKey = order.instrumentKey.replace(/\|/g, '_').replace(/:/g, '_');
                const positionId = `${account.id}_${safeKey}`;
                const positionRef = doc(db, "positions", positionId);
                const positionDoc = await transaction.get(positionRef);

                const currentBalance = accountDoc.data().currentBalance || 0;
                const investedAmount = accountDoc.data().investedAmount || 0;

                // Determine Refund (if any)
                // Limit Price: 100 // We deducted 100 from Balance.
                // Fill Price: 90 // Actual Cost 90.
                // Refund: 10.
                // New Invested must be reduced by 10 (Cost basis adjustment).

                // Diff
                const expectedCost = order.price * order.qty;
                const actualCost = fillPrice * order.qty;
                const refund = expectedCost - actualCost;

                const newBalance = currentBalance + refund;
                const newInvestedAmount = investedAmount - refund;

                // 2. WRITE OPERATIONS

                // Update Account
                if (refund !== 0) {
                    transaction.update(accountRef, {
                        currentBalance: newBalance,
                        investedAmount: newInvestedAmount
                    });
                }

                // Update Order Status
                transaction.update(orderRef, {
                    status: 'EXECUTED',
                    price: fillPrice, // Update to actual fill price
                    executionTime: serverTimestamp()
                });

                // Create Position
                let newPosData = {};
                if (positionDoc.exists() && positionDoc.data().status === 'OPEN') {
                    const pos = positionDoc.data();
                    let newQty = pos.qty + order.qty;
                    // Improved Average
                    let totalCost = (pos.avgPrice * pos.qty) + actualCost;
                    let newAvg = totalCost / newQty;

                    newPosData = {
                        qty: newQty,
                        avgPrice: newAvg,
                        lastUpdated: serverTimestamp()
                    };
                    transaction.update(positionRef, newPosData);
                } else {
                    newPosData = {
                        userId: order.userId,
                        accountId: account.id,
                        instrumentKey: order.instrumentKey,
                        symbol: order.symbol,
                        qty: order.qty,
                        avgPrice: fillPrice,
                        status: 'OPEN',
                        product: order.product || 'PAPER',
                        sl: order.sl || null,
                        tp: order.tp || null,
                        timestamp: serverTimestamp()
                    };
                    transaction.set(positionRef, newPosData);
                }
            });
            return { success: true };
        } catch (error) {
            console.error("Exec Limit Error:", error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Cancel a Pending Order
     */
    cancelOrder: async (orderId, account) => {
        const orderRef = doc(db, "orders", orderId);
        const accountRef = doc(db, "challenges", account.id);

        try {
            await runTransaction(db, async (transaction) => {
                const orderDoc = await transaction.get(orderRef);
                if (!orderDoc.exists()) throw "Order not found";
                const order = orderDoc.data();

                if (order.status !== 'PENDING') throw "Order not Pending";

                // Refund the blocked margin
                const refundAmount = order.price * order.qty; // Limit Price * Qty

                const accountDoc = await transaction.get(accountRef);
                const currentBalance = accountDoc.data().currentBalance || 0;
                const investedAmount = accountDoc.data().investedAmount || 0;

                transaction.update(accountRef, {
                    currentBalance: currentBalance + refundAmount,
                    investedAmount: investedAmount - refundAmount
                });

                transaction.update(orderRef, {
                    status: 'CANCELLED',
                    cancelledAt: serverTimestamp()
                });
            });
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
                        // Execute as MARKET order (immediate) at the Limit Price
                        await OrderService.placeOrder({
                            instrumentKey: order.instrumentKey,
                            symbol: order.symbol,
                            qty: order.qty,
                            price: order.price,
                            type: order.type,
                            product: order.product,
                            orderClass: 'MARKET', // Force execution
                            expiry: order.expiry,
                            strike: order.strike,
                            optionType: order.optionType
                        }, account, userId);

                        // Remove pending order doc since placeOrder created a new "Executed" doc
                        await deleteDoc(doc(db, "orders", order.id));

                    } catch (err) {
                        console.error(`[LimitTrigger] Failed to execute ${order.symbol}:`, err);
                    }
                }
            }
        } catch (error) {
            console.error("[LimitTrigger] Error checking pending orders:", error);
        }
    }
};
