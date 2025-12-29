import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { OrderService } from '../services/OrderService';
import { MarketService } from '../services/MarketService';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../../firebaseConfig';

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

        let unsub = null;
        const timer = setTimeout(() => {
            if (!auth.currentUser) {
                console.log("[useOrderMonitor] Postponing Orders Listener: auth.currentUser is null");
                return;
            }
            console.log(`[useOrderMonitor] Starting Orders Listener. UID: ${auth.currentUser.uid}, Selected: ${selectedAccount.id}`);
            unsub = onSnapshot(q, (snapshot) => {
                const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setPendingOrders(orders);
            }, (err) => {
                console.error("[useOrderMonitor] Orders Snapshot Error:", err);
            });
        }, 1000); // Increased delay for stability

        return () => {
            clearTimeout(timer);
            if (unsub) unsub();
        };
    }, [user, selectedAccount]);

    // 2. Subscribe to Open Positions (for SL/TP)
    useEffect(() => {
        if (!user || !selectedAccount) return;

        const q = query(
            collection(db, "positions"),
            where("accountId", "==", selectedAccount.id),
            where("status", "==", "OPEN")
        );

        let unsub = null;
        const timer = setTimeout(() => {
            if (!auth.currentUser) {
                console.log("[useOrderMonitor] Postponing Positions Listener: auth.currentUser is null");
                return;
            }
            console.log(`[useOrderMonitor] Starting Positions Listener. UID: ${auth.currentUser.uid}`);
            unsub = onSnapshot(q, (snapshot) => {
                const positions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setOpenPositions(positions);
            }, (err) => {
                console.error("[useOrderMonitor] Positions Snapshot Error:", err);
            });
        }, 1000);

        return () => {
            clearTimeout(timer);
            if (unsub) unsub();
        };
    }, [user, selectedAccount]);

    // --- REFACTORED TO USE HOOK ---
    const { useMarketData } = require('./useMarketData');

    // Dynamically calculate keys to monitor
    const [monitorKeys, setMonitorKeys] = useState([]);

    useEffect(() => {
        const keys = new Set();
        pendingOrders.forEach(o => keys.add(o.instrumentKey));
        openPositions.forEach(p => keys.add(p.instrumentKey));
        setMonitorKeys(Array.from(keys));
    }, [pendingOrders, openPositions]);

    // Subscribe to real-time data
    const liveData = useMarketData(monitorKeys);

    // Trigger Logic whenever liveData updates
    useEffect(() => {
        if (monitorKeys.length === 0) return;
        if (isProcessing) return; // Prevent re-entry

        const checkTriggers = async () => {
            setIsProcessing(true);
            try {
                // A. Check Pending Orders
                for (const order of pendingOrders) {
                    const quote = liveData[order.instrumentKey];
                    if (!quote) continue;

                    const lastPrice = quote.last_price;
                    let shouldExecute = false;

                    if (order.type === 'BUY') {
                        if (lastPrice <= order.price) shouldExecute = true;
                    } else if (order.type === 'SELL') {
                        if (lastPrice >= order.price) shouldExecute = true;
                    }

                    if (shouldExecute) {
                        console.log(`[Monitor] Executing Limit Order ${order.id} @ ${lastPrice}`);
                        await OrderService.executeLimitOrder(order.id, lastPrice, selectedAccount);
                    }
                }

                // B. Check Open Positions (SL/TP)
                for (const pos of openPositions) {
                    const quote = liveData[pos.instrumentKey];
                    if (!quote) continue;

                    const lastPrice = quote.last_price;
                    let triggerExit = false;
                    let exitReason = "";

                    if (pos.qty > 0) { // LONG
                        if (pos.sl && lastPrice <= pos.sl) { triggerExit = true; exitReason = "SL Hit"; }
                        if (pos.tp && lastPrice >= pos.tp) { triggerExit = true; exitReason = "TP Hit"; }
                    }

                    if (triggerExit) {
                        console.log(`[Monitor] Closing Position ${pos.symbol} (${exitReason}) @ ${lastPrice}`);
                        await OrderService.closePosition(pos, lastPrice, selectedAccount, user.uid);
                    }
                }

            } catch (e) { console.error(e); }
            finally { setIsProcessing(false); }
        };

        checkTriggers();

    }, [liveData]); // Trigger on data update

    /* REMOVED POLLING LOGIC 
    // 3. Polling Logic
    useEffect(() => { ... }, [...]); 
    */

    // 4. Auto Square-off Logic (Intraday at 3:30 PM)
    useEffect(() => {
        if (!user || !auth.currentUser || !selectedAccount) return;

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

    // 5. MAX LOSS AUTO-CLOSE (Emergency Risk Management)
    useEffect(() => {
        if (!user || !selectedAccount) return;

        if (selectedAccount.status === 'failed' && openPositions.length > 0) {

            const closeAllPositions = async () => {
                console.warn("[Emergency Close] Account FAILED (Max Loss Hit). Closing ALL positions.");

                try {
                    // Fetch latest prices for accurate close
                    const keys = openPositions.map(p => p.instrumentKey);
                    const quotes = await MarketService.getQuotes(keys);

                    for (const pos of openPositions) {
                        const quote = quotes[pos.instrumentKey];
                        const price = quote ? quote.last_price : pos.avgPrice;

                        console.log(`[Emergency Close] Closing ${pos.symbol} @ ${price}`);
                        await OrderService.closePosition(pos, price, selectedAccount, user.uid);
                    }
                } catch (err) {
                    console.error("[Emergency Close] Failed:", err);
                }
            };

            // Trigger immediately
            closeAllPositions();
        }

    }, [selectedAccount, openPositions, user]);
}
