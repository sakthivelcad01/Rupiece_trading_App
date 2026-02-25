import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { OrderService } from '../services/OrderService';
import { MarketService } from '../services/MarketService';
import { supabase } from '../../supabaseConfig';
import { useMarketData } from './useMarketData';

export function useOrderMonitor() {
    const { user, selectedAccount } = useAuth();
    const [pendingOrders, setPendingOrders] = useState([]);
    const [openPositions, setOpenPositions] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);

    // 1. Subscribe to Pending Orders
    useEffect(() => {
        if (!user || !selectedAccount) return;

        let channel = null;

        const fetchPendingOrders = async () => {
            const { data, error } = await supabase
                .from('orders')
                .select('*')
                .eq('accountId', selectedAccount.id)
                .eq('status', 'PENDING');

            if (data) setPendingOrders(data);
            if (error) console.error("Error fetching pending orders:", error);
        };

        fetchPendingOrders();

        channel = supabase.channel(`orders:${selectedAccount.id}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'orders', filter: `accountId=eq.${selectedAccount.id}` },
                (payload) => {
                    if (payload.new && payload.new.status !== 'PENDING') {
                        // Order status changed (e.g. to EXECUTED or CANCELLED), remove from pending
                        setPendingOrders(prev => prev.filter(o => o.id !== payload.new.id));
                    } else if (payload.eventType === 'INSERT' && payload.new.status === 'PENDING') {
                        setPendingOrders(prev => [...prev, payload.new]);
                    } else if (payload.eventType === 'UPDATE') {
                        if (payload.new.status === 'PENDING') {
                            setPendingOrders(prev => prev.map(o => o.id === payload.new.id ? payload.new : o));
                        } else {
                            setPendingOrders(prev => prev.filter(o => o.id !== payload.new.id));
                        }
                    } else if (payload.eventType === 'DELETE') {
                        setPendingOrders(prev => prev.filter(o => o.id !== payload.old.id));
                    }
                }
            )
            .subscribe();

        return () => {
            if (channel) supabase.removeChannel(channel);
        };
    }, [user, selectedAccount]);

    // 2. Subscribe to Open Positions (for SL/TP)
    useEffect(() => {
        if (!user || !selectedAccount) return;

        let channel = null;

        const fetchOpenPositions = async () => {
            const { data, error } = await supabase
                .from('positions')
                .select('*')
                .eq('accountId', selectedAccount.id)
                .eq('status', 'OPEN');

            if (data) setOpenPositions(data);
            if (error) console.error("Error fetching open positions:", error);
        };

        fetchOpenPositions();

        channel = supabase.channel(`positions:${selectedAccount.id}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'positions', filter: `accountId=eq.${selectedAccount.id}` },
                (payload) => {
                    if (payload.new && payload.new.status !== 'OPEN') {
                        // Position closed, remove from list
                        setOpenPositions(prev => prev.filter(p => p.id !== payload.new.id));
                    } else if (payload.eventType === 'INSERT' && payload.new.status === 'OPEN') {
                        setOpenPositions(prev => [...prev, payload.new]);
                    } else if (payload.eventType === 'UPDATE') {
                        if (payload.new.status === 'OPEN') {
                            setOpenPositions(prev => prev.map(p => p.id === payload.new.id ? payload.new : p));
                        } else {
                            setOpenPositions(prev => prev.filter(p => p.id !== payload.new.id));
                        }
                    } else if (payload.eventType === 'DELETE') {
                        setOpenPositions(prev => prev.filter(p => p.id !== payload.old.id));
                    }
                }
            )
            .subscribe();

        return () => {
            if (channel) supabase.removeChannel(channel);
        };
    }, [user, selectedAccount]);

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
        if (!user || !selectedAccount) return; // Prevent crash on logout
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
                    } else if (pos.qty < 0) { // SHORT (if supported)
                        if (pos.sl && lastPrice >= pos.sl) { triggerExit = true; exitReason = "SL Hit"; }
                        if (pos.tp && lastPrice <= pos.tp) { triggerExit = true; exitReason = "TP Hit"; }
                    }

                    if (triggerExit) {
                        console.log(`[Monitor] Closing Position ${pos.symbol} (${exitReason}) @ ${lastPrice}`);
                        await OrderService.closePosition(pos, lastPrice, selectedAccount, user.id);
                    }
                }

            } catch (e) { console.error(e); }
            finally { setIsProcessing(false); }
        };

        checkTriggers();

    }, [liveData]); // Trigger on data update

    // 4. Auto Square-off Logic (Intraday at 3:30 PM)
    useEffect(() => {
        if (!user || !selectedAccount) return;

        const checkAutoSquareOff = async () => {
            const now = new Date();
            const hours = now.getHours();
            const minutes = now.getMinutes();

            if (hours > 15 || (hours === 15 && minutes >= 30)) {
                // Time is past 3:30 PM
                const intradayPositions = openPositions.filter(p => p.product === 'INTRADAY' && p.qty > 0);

                if (intradayPositions.length === 0) return;

                console.log(`[AutoSquareOff] Time is ${hours}:${minutes}. Closing ${intradayPositions.length} Intraday positions.`);

                try {
                    const keys = intradayPositions.map(p => p.instrumentKey);
                    const quotes = await MarketService.getQuotes(keys);

                    for (const pos of intradayPositions) {
                        const quote = quotes[pos.instrumentKey];
                        const price = quote ? quote.last_price : pos.avgPrice;

                        console.log(`[AutoSquareOff] Squared off ${pos.symbol} @ ${price}`);
                        await OrderService.closePosition(pos, price, selectedAccount, user.id);
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
                    const keys = openPositions.map(p => p.instrumentKey);
                    const quotes = await MarketService.getQuotes(keys);

                    for (const pos of openPositions) {
                        const quote = quotes[pos.instrumentKey];
                        const price = quote ? quote.last_price : pos.avgPrice;

                        console.log(`[Emergency Close] Closing ${pos.symbol} @ ${price}`);
                        await OrderService.closePosition(pos, price, selectedAccount, user.id);
                    }
                } catch (err) {
                    console.error("[Emergency Close] Failed:", err);
                }
            };

            closeAllPositions();
        }

    }, [selectedAccount, openPositions, user]);
}


