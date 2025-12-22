import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { OrderService } from '../services/OrderService';
import { MarketService } from '../services/MarketService';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

export function useOrderMonitor() {
    const { user, selectedAccount } = useAuth();
    const [pendingOrders, setPendingOrders] = useState([]);
    const [openPositions, setOpenPositions] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);

    // 1. Subscribe to Pending Orders
    useEffect(() => {
        if (!user || !selectedAccount) return;

        const q = query(
            collection(db, "orders"),
            where("accountId", "==", selectedAccount.id),
            where("status", "==", "PENDING")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPendingOrders(orders);
        });

        return () => unsubscribe();
    }, [user, selectedAccount]);

    // 2. Subscribe to Open Positions (for SL/TP)
    useEffect(() => {
        if (!user || !selectedAccount) return;

        const q = query(
            collection(db, "positions"),
            where("accountId", "==", selectedAccount.id),
            where("status", "==", "OPEN")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const positions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setOpenPositions(positions);
        });

        return () => unsubscribe();
    }, [user, selectedAccount]);

    // 3. Polling Logic
    useEffect(() => {
        if (!user || !selectedAccount) return;
        if (pendingOrders.length === 0 && openPositions.length === 0) return;

        const checkMarket = async () => {
            if (isProcessing) return;
            setIsProcessing(true);

            try {
                // Gather Unique Keys
                const keys = new Set();
                pendingOrders.forEach(o => keys.add(o.instrumentKey));
                openPositions.forEach(p => keys.add(p.instrumentKey));

                if (keys.size === 0) return;

                const quotes = await MarketService.getQuotes(Array.from(keys));

                // A. Check Pending Orders (Limit)
                for (const order of pendingOrders) {
                    const quote = quotes[order.instrumentKey];
                    if (!quote) continue;

                    const lastPrice = quote.last_price;
                    // Limit Order Logic
                    let shouldExecute = false;

                    if (order.type === 'BUY') {
                        // Buy Limit: Price drops to or below Limit
                        if (lastPrice <= order.price) shouldExecute = true;
                    } else if (order.type === 'SELL') {
                        // Sell Limit: Price rises to or above Limit
                        if (lastPrice >= order.price) shouldExecute = true;
                    }

                    if (shouldExecute) {
                        console.log(`[Monitor] Executing Limit Order ${order.id} @ ${lastPrice}`);
                        await OrderService.executeLimitOrder(order.id, lastPrice, selectedAccount);
                    }
                }

                // B. Check Open Positions (SL/TP)
                for (const pos of openPositions) {
                    const quote = quotes[pos.instrumentKey];
                    if (!quote) continue;

                    const lastPrice = quote.last_price;
                    let triggerExit = false;
                    let exitReason = "";

                    if (pos.qty > 0) { // LONG POSITION
                        // Stop Loss (Sell if Price <= SL)
                        if (pos.sl && lastPrice <= pos.sl) {
                            triggerExit = true;
                            exitReason = "SL Hit";
                        }
                        // Take Profit (Sell if Price >= TP)
                        if (pos.tp && lastPrice >= pos.tp) {
                            triggerExit = true;
                            exitReason = "TP Hit";
                        }
                    } else {
                        // SHORT POSITION (If implemented in future)
                        // SL: Buy if Price >= SL
                        // TP: Buy if Price <= TP
                    }

                    if (triggerExit) {
                        console.log(`[Monitor] Closing Position ${pos.symbol} (${exitReason}) @ ${lastPrice}`);
                        await OrderService.closePosition(pos, lastPrice, selectedAccount, user.uid);
                    }
                }

            } catch (err) {
                console.error("[Monitor] Error checking market:", err);
            } finally {
                setIsProcessing(false);
            }
        };

        const intervalId = setInterval(checkMarket, 3000); // Check every 3 seconds
        return () => clearInterval(intervalId);

    }, [pendingOrders, openPositions, user, selectedAccount]);

    // 4. Auto Square-off Logic (Intraday at 3:30 PM)
    useEffect(() => {
        if (!user || !selectedAccount) return;

        const checkAutoSquareOff = async () => {
            const now = new Date();
            const hours = now.getHours();
            const minutes = now.getMinutes();

            // 3:30 PM is 15:30
            // We check if time is >= 15:30. 
            // Ideally this runs only once or periodically checks. 
            // To prevent repeated attempts on already closed positions, we filter by OPEN positions.

            if (hours > 15 || (hours === 15 && minutes >= 30)) {
                // Time is past 3:30 PM
                const intradayPositions = openPositions.filter(p => p.product === 'INTRADAY' && p.qty > 0);

                if (intradayPositions.length === 0) return;

                console.log(`[AutoSquareOff] Time is ${hours}:${minutes}. Closing ${intradayPositions.length} Intraday positions.`);

                // We need current market prices to close accurately
                // Reuse existing quote fetching logic if possible, or just force market close
                // For simplicity, we trigger close which usually fetches price inside OrderService or we pass 0 for Market

                try {
                    const keys = intradayPositions.map(p => p.instrumentKey);
                    const quotes = await MarketService.getQuotes(keys);

                    for (const pos of intradayPositions) {
                        const quote = quotes[pos.instrumentKey];
                        const price = quote ? quote.last_price : pos.avgPrice; // Fallback to entry if no quote (risky but better than crash)

                        console.log(`[AutoSquareOff] Squared off ${pos.symbol} @ ${price}`);
                        await OrderService.closePosition(pos, price, selectedAccount, user.uid);
                    }
                } catch (err) {
                    console.error("Auto Square-off Error:", err);
                }
            }
        };

        const timer = setInterval(checkAutoSquareOff, 15000); // Check every 15 seconds
        return () => clearInterval(timer);

    }, [openPositions, user, selectedAccount]);
}
