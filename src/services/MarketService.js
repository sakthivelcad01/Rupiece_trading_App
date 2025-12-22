import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

const getAccessToken = async () => {
    try {
        const docRef = doc(db, "config", "upstox");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return docSnap.data().accessToken;
        }
        return null;
    } catch (error) {
        console.error("Error fetching access token:", error);
        return null;
    }
};

export const MarketService = {
    /**
     * Fetches market quotes for a list of symbols.
     * @param {string[]} symbols - Array of keys
     */
    getQuotes: async (symbols) => {
        try {
            const validSymbols = symbols.filter(s => !s.includes('Placeholder'));
            if (validSymbols.length === 0) return {};

            const accessToken = await getAccessToken();
            if (!accessToken) return {};

            const queryParams = validSymbols.map(s => encodeURIComponent(s)).join(',');
            // Fix: Use 'instrument_key' parameter instead of 'symbol'
            const url = `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${queryParams}`;

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                console.error(`[MarketService] API Error: ${response.status} ${response.statusText}`);
                try {
                    const errText = await response.text();
                    console.error(`[MarketService] Error Body: ${errText}`);
                } catch (e) { }
                return {};
            }

            const json = await response.json();

            // Debug logs
            console.log(`[MarketDebug] Quote Response Keys: ${json.data ? Object.keys(json.data).length : 'No Data'}`);
            if (json.data && Object.keys(json.data).length > 0) {
                // console.log(`[MarketDebug] Sample Quote Keys available`);
            }

            const normalizedData = {};
            if (json.data) {
                // Strategy: Index by the internal 'instrument_key' field if available to match request
                Object.values(json.data).forEach(quote => {
                    let keyToUse = quote.instrument_key || quote.instrument_token;
                    if (keyToUse) {
                        // Normalize
                        keyToUse = keyToUse.replace(/:/g, '|');
                        normalizedData[keyToUse] = quote;
                    }
                });

                // Fallback: If map is empty, try using response keys
                if (Object.keys(normalizedData).length === 0) {
                    console.log("[MarketDebug] Fallback to using response keys");
                    Object.keys(json.data).forEach(key => {
                        const standardizedKey = decodeURIComponent(key).replace(/:/g, '|');
                        normalizedData[standardizedKey] = json.data[key];
                    });
                }
            }
            return normalizedData;
        } catch (error) {
            console.error("MarketService getQuotes Error:", error);
            return {};
        }
    },

    /**
     * Fetches the full list of option contracts for an instrument and expiry.
     * Use this to find all available strikes.
     */
    getOptionContracts: async (instrumentKey, expiryDate) => {
        try {
            const accessToken = await getAccessToken();
            if (!accessToken) return [];

            const encodedKey = encodeURIComponent(instrumentKey);
            let url = `https://api.upstox.com/v2/option/contract?instrument_key=${encodedKey}`;
            if (expiryDate) {
                url += `&expiry_date=${expiryDate}`;
            }

            console.log(`[MarketDebug] Fetching Option Contracts: ${url}`);

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                const txt = await response.text();
                // console.error(`Contracts Error: ${response.status} - ${txt}`);
                return [];
            }

            const json = await response.json();

            if (json.status === 'success' && json.data) {
                return json.data;
            }
            return [];

        } catch (error) {
            console.log(`MarketService getOptionContracts Failed. URL: https://api.upstox.com/v2/option/contract?instrument_key=${encodeURIComponent(instrumentKey)}`);
            console.log("Error Details:", error);
            return [];
        }
    },

    /**
     * Legacy: Fetches limited option chain data.
     */
    getOptionChain: async (instrumentKey, expiryDate) => {
        try {
            const accessToken = await getAccessToken();
            if (!accessToken) return [];

            const encodedKey = encodeURIComponent(instrumentKey);
            const url = `https://api.upstox.com/v2/option/chain?instrument_key=${encodedKey}&expiry_date=${expiryDate}`;

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) return [];

            const json = await response.json();
            return json.data || [];
        } catch (error) {
            console.error("MarketService getOptionChain Error:", error);
            return [];
        }
    },

    /**
     * Fetches intraday candles for the current day.
     * @param {string} instrumentKey 
     * @param {string} interval - e.g. 1minute, 30minute
     */
    getIntradayCandles: async (instrumentKey, interval) => {
        try {
            const accessToken = await getAccessToken();
            const encodedKey = encodeURIComponent(instrumentKey);
            // Intraday endpoint: /v2/historical-candle/intraday/{instrumentKey}/{interval}
            const url = `https://api.upstox.com/v2/historical-candle/intraday/${encodedKey}/${interval}`;

            console.log(`[MarketDebug] Fetching Intraday: ${url}`);

            const headers = { 'Accept': 'application/json' };
            if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

            const response = await fetch(url, { method: 'GET', headers });

            if (!response.ok) {
                const txt = await response.text();
                return { error: `Intraday Error ${response.status}: ${txt}`, url };
            }

            const json = await response.json();
            if (json.status === 'success' && json.data) {
                return { data: json.data };
            }
            return { error: "No Intraday Data", details: json, url };
        } catch (e) {
            return { error: e.toString() };
        }
    },

    /**
     * Searches for instruments (e.g. to find correct Future Key).
     * @param {string} query - e.g. "NIFTY", "NIFTY 25DEC"
     * @param {string} segment - e.g. "NSE_FO"
     */
    searchInstruments: async (query, segment) => {
        try {
            const accessToken = await getAccessToken();
            if (!accessToken) return [];

            const url = `https://api.upstox.com/v2/market/search/suggest?segment=${segment}&text=${encodeURIComponent(query)}&limit=100`;

            console.log(`[MarketDebug] Searching: ${url}`);

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) return [];

            const json = await response.json();

            if (json.status === 'success' && json.data) {
                return json.data;
            }
            return [];
        } catch (error) {
            console.error("MarketService Search Error:", error);
            return [];
        }
    },

    /**
     * Fetches historical candlestick data.
     * @param {string} instrumentKey - e.g. NSE_INDEX|Nifty 50
     * @param {string} interval - 1minute, 30minute, day, etc.
     * @param {string} toDate - YYYY-MM-DD
     * @param {string} fromDate - YYYY-MM-DD (Optional)
     */
    getHistoricalCandles: async (instrumentKey, interval, toDate, fromDate) => {
        try {
            const accessToken = await getAccessToken();

            if (!accessToken) {
                return { error: "No Access Token" };
            }

            const encodedKey = encodeURIComponent(instrumentKey);
            // URL format: .../{interval}/{to_date}/{from_date} (Optional from_date)
            let url = `https://api.upstox.com/v2/historical-candle/${encodedKey}/${interval}/${toDate}`;
            if (fromDate) {
                url += `/${fromDate}`;
            }

            console.log(`[MarketDebug] Fetching History: ${url}`);

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            if (!response.ok) {
                const txt = await response.text();
                return { error: `API Error ${response.status}: ${txt}`, url };
            }

            const json = await response.json();
            if (json.status === 'success' && json.data) {
                return { data: json.data };
            } else {
                return { error: "Invalid API Response", details: json, url };
            }

        } catch (error) {
            console.error("MarketService getHistoricalCandles Error:", error);
            return { error: error.toString() };
        }
    },
    /**
     * Fetches candlestick data from Yahoo Finance.
     * @param {string} symbol - Yahoo Symbol (e.g. ^NSEI)
     * @param {string} range - 1d, 5d, 1mo, 6mo, 1y, 2y
     * @param {string} interval - 1m, 2m, 5m, 15m, 30m, 1h, 1d, 1wk, 1mo
     */
    getYahooCandles: async (symbol, range = '1d', interval = '5m') => {
        try {
            // Security Check
            const { getAuth } = require('firebase/auth');
            const auth = getAuth();
            if (!auth.currentUser) {
                return { error: "Unauthorized: User not logged in" };
            }

            // CORS might be an issue in Web, but works in Native
            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${range}`;
            console.log(`[YahooMarket] Fetching: ${url}`);

            const response = await fetch(url);
            const json = await response.json();

            if (json.chart && json.chart.result && json.chart.result[0]) {
                const res = json.chart.result[0];
                const quotes = res.indicators.quote[0];
                const timestamps = res.timestamp;

                if (!timestamps || !quotes.close) return { error: "No Data Found" };

                // Format: [[timestamp, open, high, low, close, volume]]
                const data = timestamps.map((t, i) => {
                    return [
                        new Date(t * 1000).toISOString(),
                        quotes.open[i] || 0,
                        quotes.high[i] || 0,
                        quotes.low[i] || 0,
                        quotes.close[i] || 0,
                        quotes.volume[i] || 0
                    ];
                }).filter(d => d[4] !== null && d[4] !== 0); // Filter empty candles

                return { data: data };
            }
            return { error: "Invalid Yahoo Response" };

        } catch (error) {
            console.error("Yahoo Fetch Error:", error);
            return { error: error.toString() };
        }
    }
};
