import { supabase } from './SupabaseService';
import { MarketService } from './MarketService';
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
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw "User not authenticated";
            const authToken = session.access_token;

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
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return [];

            const { data, error } = await supabase
                .from('positions')
                .select('*')
                .eq('accountId', accountId)
                .eq('userId', user.id)
                .eq('status', 'OPEN');

            if (error) throw error;
            return data || [];
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
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return [];

            const { data, error } = await supabase
                .from('orders')
                .select('*')
                .eq('accountId', accountId)
                .eq('userId', user.id)
                .order('timestamp', { ascending: false });

            if (error) throw error;
            return data || [];
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
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return [];

            const { data, error } = await supabase
                .from('trades')
                .select('*')
                .eq('accountId', accountId)
                .eq('userId', user.id)
                .order('closedAt', { ascending: false });

            if (error) throw error;
            return data || [];
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
            // Simplified: Just log for now as strict transaction support requires server side code
            // ideally we call an RPC here
            console.warn("[OrderService] updateEndOfDayStats - Not fully implemented on client pending server RPC");

            // 1. Get Positions
            const positions = await OrderService.getPositions(accountId);

            // ... (Logic same as before but need separate update calls or RPC)
            // For now we assume server handles this via cron or we implement a simple update

            return { success: true };
        } catch (err) {
            console.error(err);
            return { success: false };
        }
    },

    /**
     * Explicitly Close a Position (Helper).
     */
    closePosition: async (position, currentPrice, account, userId) => {
        try {
            if (!position || position.status !== 'OPEN') throw "Invalid Position";

            const orderDetails = {
                instrumentKey: position.instrumentKey,
                symbol: position.symbol,
                qty: position.qty,
                price: currentPrice,
                type: 'SELL',   // Closing a Long Position (Assuming Long only for now)
                product: position.product || 'PAPER',
                orderClass: 'MARKET',
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
     */
    executeLimitOrder: async (orderId, fillPrice, account) => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw "User not authenticated";
            const authToken = session.access_token;

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
     */
    modifyPendingOrder: async (orderId, newPrice, newQty, account) => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw "User not authenticated";
            const authToken = session.access_token;

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
     */
    updatePositionSLTP: async (account, positionId, sl, tp) => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw "User not authenticated";
            const authToken = session.access_token;

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
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw "User not authenticated";
            const authToken = session.access_token;

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
        try {
            // Fetch current
            const { data: account, error } = await supabase.from('accounts').select('*').eq('id', accountId).single();
            if (error) throw error;

            const accountSize = account.accountSize || 1000000;
            const invested = account.investedAmount || 0;
            const targetEquity = accountSize * 0.93;
            const newBalance = targetEquity - invested;

            // Update
            await supabase.from('accounts').update({
                currentBalance: newBalance,
                status: 'ongoing'
            }).eq('id', accountId);

            return { success: true };
        } catch (err) {
            console.error("Simulate Error", err);
            return { success: false };
        }
    },

    /**
     * SIMULATION: Reset Balance (Undo Margin Call)
     */
    resetBalance: async (accountId) => {
        try {
            const { data: account, error } = await supabase.from('accounts').select('*').eq('id', accountId).single();
            if (error) throw error;
            const accountSize = account.accountSize || 1000000;

            await supabase.from('accounts').update({
                currentBalance: accountSize,
                investedAmount: 0,
                status: 'ongoing',
                currentProfit: 0,
                currentLoss: 0
            }).eq('id', accountId);

            return { success: true };
        } catch (err) {
            console.error("Reset Error", err);
            return { success: false };
        }
    },

    /**
     * Checks for expired positions and auto-squares them off if multiple days of delivery
     */
    checkAndSquareOffExpiredPositions: async (account, userId) => {
        if (!account || !account.id) return;
        try {
            const positions = await OrderService.getPositions(account.id);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            for (const pos of positions) {
                if (pos.product === 'INTRADAY') continue;
                if (!pos.expiry) continue;

                const expiryDate = new Date(pos.expiry);
                expiryDate.setHours(0, 0, 0, 0);

                if (today > expiryDate) {
                    console.log(`[AutoSquareOff] Position ${pos.symbol} expired on ${pos.expiry}. Closing now.`);
                    try {
                        await OrderService.placeOrder({
                            instrumentKey: pos.instrumentKey,
                            symbol: pos.symbol,
                            qty: pos.qty,
                            price: pos.ltp || pos.avgPrice,
                            type: pos.qty > 0 ? 'SELL' : 'BUY',
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
            const { data: pendingOrders, error } = await supabase
                .from('orders')
                .select('*')
                .eq('accountId', account.id)
                .eq('status', 'PENDING');

            if (error || !pendingOrders || pendingOrders.length === 0) return;

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
                        await OrderService.executeLimitOrder(order.id, ltp, account);
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
