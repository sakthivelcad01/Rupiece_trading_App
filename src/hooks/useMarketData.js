import { useState, useEffect } from 'react';
import { webSocketService } from '../services/WebSocketService';

/**
 * Hook to subscribe to market data updates for a list of instrument keys.
 * @param {string[]} instrumentKeys - List of keys to subscribe to
 * @returns {object} - Map of { [instrumentKey]: quoteData }
 */
export function useMarketData(instrumentKeys) {
    const [data, setData] = useState({});

    useEffect(() => {
        if (!instrumentKeys || instrumentKeys.length === 0) return;

        // 1. Subscribe
        webSocketService.subscribe(instrumentKeys);

        // 2. Listen for updates
        const unsubscribe = webSocketService.onUpdate((newData) => {
            // newData is expected to be a map of { string_key: quote_object }
            // Merge with existing data to keep updates for all monitored keys
            setData(prev => {
                const next = { ...prev };
                let hasChanges = false;

                Object.keys(newData).forEach(key => {
                    if (instrumentKeys.includes(key)) {
                        next[key] = newData[key];
                        hasChanges = true;
                    }
                });
                console.log('[DEBUG] Market data update:', next)

                return hasChanges ? next : prev;
            });
        });

        // Cleanup: Unsubscribing is optional/complex if shared, 
        // but generally good practice if we want to reduce load. 
        // For now, we leave subscriptions active as they are lightweight on server if no data flows.
        // Or we can explicit unsubscribe.
        // webSocketService.unsubscribe(instrumentKeys);

        return () => {
            unsubscribe();
        };

    }, [JSON.stringify(instrumentKeys)]); // Deep comparison trigger

    return data;
}
