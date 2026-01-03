import { webSocketService } from './WebSocketService';

export const MarketService = {
    /**
     * Fetches market quotes via WebSocket Proxy.
     */
    getQuotes: async (symbols) => {
        try {
            const validSymbols = symbols.filter(s => !s.includes('Placeholder'));
            if (validSymbols.length === 0) return {};

            const data = await webSocketService.request({
                type: 'quotes',
                symbols: validSymbols
            }, 25000); // 25s Timeout

            const normalizedData = {};
            if (data) {
                Object.keys(data).forEach(respKey => {
                    const quote = data[respKey];
                    const normalizedKey = respKey.replace(/:/g, '|');
                    const standardizedKey = decodeURIComponent(respKey).replace(/:/g, '|');

                    const qData = {
                        ...quote,
                        last_price: quote.last_price || quote.lp || 0,
                    };

                    if (quote.cp !== undefined) {
                        qData.ohlc = { close: quote.cp };
                    }

                    normalizedData[normalizedKey] = qData;
                    normalizedData[standardizedKey] = qData;

                    const internalKey = quote.instrument_key || quote.instrument_token;
                    if (internalKey) {
                        normalizedData[internalKey.replace(/:/g, '|')] = qData;
                    }
                });
            }
            return normalizedData;
        } catch (error) {
            console.error("MarketService getQuotes Error:", error);
            return {};
        }
    },

    _contractCache: {},

    /**
     * Fetches option contracts via WebSocket Proxy.
     */
    getOptionContracts: async (instrumentKey, expiryDate) => {
        try {
            const cacheKey = `${instrumentKey}_${expiryDate || 'ALL'}`;
            if (MarketService._contractCache[cacheKey]) return MarketService._contractCache[cacheKey];

            const data = await webSocketService.request({
                type: 'optionContracts',
                instrumentKey,
                expiryDate
            }, 25000); // 25s Timeout for heavy payload

            console.log(`[MarketService] getOptionContracts Raw Resp: ${Array.isArray(data) ? data.length : 'Not Array'}`);

            if (data) {
                MarketService._contractCache[cacheKey] = data;
                return data;
            }
            return [];
        } catch (error) {
            console.error("MarketService getOptionContracts Error:", error);
            return [];
        }
    },

    /**
     * Fetches intraday candles via WebSocket Proxy.
     */
    getIntradayCandles: async (instrumentKey, interval) => {
        try {
            const data = await webSocketService.request({
                type: 'candles',
                instrumentKey,
                interval,
                isIntraday: true
            });
            return { data };
        } catch (e) {
            return { error: e.toString() };
        }
    },

    /**
     * Generic fetch for candles (intraday or historical) via Proxy.
     */
    getCandles: async (instrumentKey, interval, range) => {
        try {
            // Map interval to Upstox format
            let upstoxInterval = '1minute';
            let isIntraday = true;

            switch (interval) {
                case '1m': upstoxInterval = '1minute'; break;
                case '2m': upstoxInterval = '3minute'; break; // Approx
                case '5m': upstoxInterval = '5minute'; break;
                case '15m': upstoxInterval = '15minute'; break;
                case '30m': upstoxInterval = '30minute'; break;
                case '1H': case '60m': upstoxInterval = '60minute'; break;
                case '1D': upstoxInterval = 'day'; isIntraday = false; break;
                case '1W': upstoxInterval = 'week'; isIntraday = false; break;
                case '1M': upstoxInterval = 'month'; isIntraday = false; break;
                default: upstoxInterval = '5minute';
            }

            // Calculate from/to dates based on range
            const toDate = new Date().toISOString().split('T')[0];
            let fromDate = new Date();

            // Subtract range
            // Simple approximation
            if (range === '1d') fromDate.setDate(fromDate.getDate() - 2);
            else if (range === '5d') fromDate.setDate(fromDate.getDate() - 5);
            else if (range === '1mo') fromDate.setMonth(fromDate.getMonth() - 1);
            else if (range === '1y') fromDate.setFullYear(fromDate.getFullYear() - 1);
            else fromDate.setDate(fromDate.getDate() - 30); // Default

            const fromDateStr = fromDate.toISOString().split('T')[0];

            const response = await webSocketService.request({
                type: 'candles',
                instrumentKey,
                interval: upstoxInterval,
                toDate,
                fromDate: fromDateStr,
                isIntraday
            });

            if (response && response.candles) {
                // Map to [[isoDate, o, h, l, c, v]]
                const mapped = response.candles.map(c => [
                    c[0], // Date string
                    c[1], c[2], c[3], c[4], c[5]
                ]);
                return { data: mapped };
            }
            return { data: [] };

        } catch (e) {
            console.error("MarketService getCandles Error:", e);
            return { error: e.toString() };
        }
    },

    /**
     * Searches for instruments via WebSocket Proxy.
     */
    searchInstruments: async (query, segment) => {
        try {
            const data = await webSocketService.request({
                type: 'search',
                query,
                segment
            });
            return data || [];
        } catch (error) {
            console.error("MarketService Search Error:", error);
            return [];
        }
    },

    /**
     * Fetches historical candles via WebSocket Proxy.
     */
    getHistoricalCandles: async (instrumentKey, interval, toDate, fromDate) => {
        try {
            const data = await webSocketService.request({
                type: 'candles',
                instrumentKey,
                interval,
                toDate,
                fromDate,
                isIntraday: false
            });
            return { data };
        } catch (error) {
            console.error("MarketService getHistoricalCandles Error:", error);
            return { error: error.toString() };
        }
    },

    /**
     * Yahoo candles remain direct as they don't require Upstox Token.
     */
    getYahooCandles: async (symbol, range = '1d', interval = '5m') => {
        try {
            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${range}`;
            const response = await fetch(url);
            const json = await response.json();

            if (json.chart && json.chart.result && json.chart.result[0]) {
                const res = json.chart.result[0];
                const quotes = res.indicators.quote[0];
                const timestamps = res.timestamp;

                if (!timestamps || !quotes.close) return { error: "No Data Found" };

                const data = timestamps.map((t, i) => {
                    return [
                        new Date(t * 1000).toISOString(),
                        quotes.open[i] || 0,
                        quotes.high[i] || 0,
                        quotes.low[i] || 0,
                        quotes.close[i] || 0,
                        quotes.volume[i] || 0
                    ];
                }).filter(d => d[4] !== null && d[4] !== 0);

                return { data: data };
            }
            return { error: "Invalid Yahoo Response" };
        } catch (error) {
            return { error: error.toString() };
        }
    }
};
