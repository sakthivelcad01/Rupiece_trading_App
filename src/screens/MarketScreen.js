import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TrendingUp, RefreshCw } from 'lucide-react-native';
import { MarketService } from '../services/MarketService';
import { useTheme } from '../context/ThemeContext';

const INSTRUMENT_KEYS = {
    NIFTY: 'NSE_INDEX|Nifty 50',
    BANKNIFTY: 'NSE_INDEX|Nifty Bank',
    FINNIFTY: 'NSE_INDEX|Nifty Fin Service',
    MIDCPNIFTY: 'NSE_INDEX|NIFTY MID SELECT',
    SENSEX: 'BSE_INDEX|SENSEX',
    BANKEX: 'BSE_INDEX|BANKEX'
};

const IndexCard = ({ data, symbol, active, onPress, colors }) => {
    // Determine color based on change
    const isPositive = data?.change >= 0;
    const color = isPositive ? colors.success : colors.danger;

    const activeStyle = { borderColor: colors.success };

    return (
        <TouchableOpacity
            style={[styles(colors).indexCard, active && activeStyle]}
            onPress={onPress}
        >
            <View style={styles(colors).indexHeader}>
                <Text style={styles(colors).indexSymbol}>{symbol}</Text>
            </View>
            <Text style={[styles(colors).indexChange, { color, marginBottom: 4 }]}>
                {data?.change ? (data.change > 0 ? '+' : '') + data.change.toFixed(2) : '0.00'}
                ({data?.changePwd ? data.changePwd.toFixed(2) : '0.00'}%)
            </Text>
            <Text style={styles(colors).indexPrice}>₹{data?.last_price ? data.last_price.toFixed(2) : '0.00'}</Text>
        </TouchableOpacity>
    );
};

const { useMarketData } = require('../hooks/useMarketData');

export default function MarketScreen({ navigation }) {
    const { colors } = useTheme();
    const [selectedIndex, setSelectedIndex] = useState("NIFTY");
    const [indicesData, setIndicesData] = useState({});
    const [optionChain, setOptionChain] = useState([]);
    const [loading, setLoading] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);

    const fetchMarketData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Indices

            const quotes = await MarketService.getQuotes(Object.values(INSTRUMENT_KEYS));
            console.log("[MarketScreen] Indices Quotes:", JSON.stringify(quotes));

            const newIndicesData = {};
            Object.keys(INSTRUMENT_KEYS).forEach(key => {
                const instrumentKey = INSTRUMENT_KEYS[key];
                if (quotes[instrumentKey]) {
                    const q = quotes[instrumentKey];
                    newIndicesData[key] = {
                        last_price: q.last_price || 0,
                        change: q.net_change !== undefined ? q.net_change : (q.last_price || 0) - (q.ohlc?.close || 0),
                        changePwd: q.ohlc?.close ? (((q.last_price || 0) - q.ohlc.close) / q.ohlc.close) * 100 : 0
                    };
                } else {
                    newIndicesData[key] = { last_price: 0, change: 0, changePwd: 0 };
                }
            });
            setIndicesData(newIndicesData);

            // 2. Fetch Option Contracts
            const currentKey = INSTRUMENT_KEYS[selectedIndex];
            const allContracts = await MarketService.getOptionContracts(currentKey, null);

            if (allContracts.length > 0) {
                const uniqueExpiries = [...new Set(allContracts.map(c => c.expiry))];
                uniqueExpiries.sort();
                const todayStr = new Date().toISOString().split('T')[0];
                const nearestExpiry = uniqueExpiries.find(e => e >= todayStr) || uniqueExpiries[uniqueExpiries.length - 1];

                const expiryContracts = allContracts
                    .filter(c => c.expiry === nearestExpiry)
                    .map(c => ({
                        ...c,
                        instrument_key: c.instrument_key.replace(/:/g, '|')
                    }));

                const currentPrice = newIndicesData[selectedIndex]?.last_price || 0;

                if (currentPrice === 0) {
                    console.log(`[MarketScreen] Waiting for valid ${selectedIndex} price before processing chain...`);
                    setOptionChain([]);
                    return;
                }

                let step = 50;
                if (selectedIndex === 'BANKNIFTY' || selectedIndex === 'SENSEX' || selectedIndex === 'BANKEX') {
                    step = 100;
                } else if (selectedIndex === 'MIDCPNIFTY') {
                    step = 25;
                }

                const validContracts = expiryContracts.filter(c => {
                    const remainder = c.strike_price % step;
                    return remainder < 0.01 || Math.abs(remainder - step) < 0.01;
                });

                validContracts.sort((a, b) => a.strike_price - b.strike_price);

                let atmIndex = 0;
                let minDiff = Number.MAX_VALUE;
                validContracts.forEach((c, i) => {
                    const diff = Math.abs(c.strike_price - currentPrice);
                    if (diff < minDiff) { minDiff = diff; atmIndex = i; }
                });

                const range = 25;
                const startIndex = Math.max(0, atmIndex - range);
                const endIndex = Math.min(validContracts.length, atmIndex + range + 1);
                const targetContracts = validContracts.slice(startIndex, endIndex);

                const targetKeys = targetContracts.map(c => c.instrument_key);
                const optionQuotes = await MarketService.getQuotes(targetKeys);

                const chainMap = {};

                targetContracts.forEach((c) => {
                    const quote = optionQuotes[c.instrument_key];
                    const ltp = quote ? quote.last_price : 0;

                    if (!chainMap[c.strike_price]) {
                        chainMap[c.strike_price] = { strike_price: c.strike_price };
                    }

                    const optData = {
                        market_data: { ltp: ltp },
                        instrument_key: c.instrument_key,
                        expiry: c.expiry,
                        lot_size: c.lot_size
                    };

                    const type = c.instrument_type ? c.instrument_type.toUpperCase() : '';
                    if (type === 'CE' || type === 'CALL') {
                        chainMap[c.strike_price].call_options = optData;
                    } else if (type === 'PE' || type === 'PUT') {
                        chainMap[c.strike_price].put_options = optData;
                    }
                });

                const chainArray = Object.values(chainMap).sort((a, b) => a.strike_price - b.strike_price);
                setOptionChain(chainArray);

            } else {
                setOptionChain([]);
            }

        } catch (error) {
            console.error("Error fetching market data:", error);
        } finally {
            setLoading(false);
            setLastUpdated(new Date());
        }
    };

    // 1. Get Indices Data Real-time
    const indexKeys = Object.values(INSTRUMENT_KEYS);
    const liveIndices = useMarketData(indexKeys);

    // Merge live data into indicesData for display
    useEffect(() => {
        if (Object.keys(liveIndices).length > 0) {
            setIndicesData(prev => {
                const next = { ...prev };
                Object.keys(INSTRUMENT_KEYS).forEach(k => {
                    const iKey = INSTRUMENT_KEYS[k];
                    if (liveIndices[iKey]) {
                        const q = liveIndices[iKey];
                        next[k] = {
                            last_price: q.last_price || 0,
                            change: q.net_change !== undefined ? q.net_change : (q.last_price || 0) - (q.ohlc?.close || 0),
                            changePwd: q.ohlc?.close ? (((q.last_price || 0) - q.ohlc.close) / q.ohlc.close) * 100 : 0
                        };
                    }
                });
                return next;
            });
        } else {
            // console.log("[MarketDebug] liveIndices match count: 0");
        }
    }, [liveIndices]);

    // 2. Fetch Option Contracts (Static List)
    useEffect(() => {
        let mounted = true;
        setOptionChain([]); // CLEAR STALE DATA IMMEDIATELY
        const loadContracts = async () => {
            setLoading(true);
            try {
                const currentKey = INSTRUMENT_KEYS[selectedIndex];
                const allContracts = await MarketService.getOptionContracts(currentKey, null);

                if (!mounted) return;

                if (allContracts.length > 0) {
                    console.log(`[MarketDebug] loadContracts: ${allContracts.length} received.`);
                    processContracts(allContracts, indicesData[selectedIndex]?.last_price || 0);
                } else {
                    console.log("[MarketDebug] loadContracts: 0 contracts received.");
                    setOptionChain([]);
                }
            } catch (e) { console.error(e); }
            finally { if (mounted) setLoading(false); }
        };
        loadContracts();
        return () => { mounted = false; };
    }, [selectedIndex]); // Only re-run if Index changes


    // 3. Subscribe to Visible Option Chain
    // We need to extract keys from optionChain state
    const [chainKeys, setChainKeys] = useState([]);

    useEffect(() => {
        const keys = [];
        optionChain.forEach(row => {
            if (row.call_options) keys.push(row.call_options.instrument_key);
            if (row.put_options) keys.push(row.put_options.instrument_key);
        });
        setChainKeys(keys);
    }, [optionChain]);

    const liveOptions = useMarketData(chainKeys);

    // Merge live options into optionChain
    useEffect(() => {
        if (Object.keys(liveOptions).length > 0) {
            setOptionChain(prevChain => {
                return prevChain.map(row => {
                    let newRow = { ...row };
                    if (row.call_options && liveOptions[row.call_options.instrument_key]) {
                        newRow.call_options = { ...row.call_options, market_data: liveOptions[row.call_options.instrument_key] };
                    }
                    if (row.put_options && liveOptions[row.put_options.instrument_key]) {
                        newRow.put_options = { ...row.put_options, market_data: liveOptions[row.put_options.instrument_key] };
                    }
                    return newRow;
                });
            });
        }
    }, [liveOptions]);

    const processContracts = async (allContracts, currentPrice) => {
        // ... Logic to filter/sort contracts moved here or reused ...
        // For brevity in diff, assume we extract logic to helper or keep inline
        // RE-IMPLEMENTING LOGIC FROM OLD fetchMarketData:
        console.log(`[MarketDebug] processContracts: Processing ${allContracts.length} starting... Index: ${selectedIndex} Price: ${currentPrice}`);

        const uniqueExpiries = [...new Set(allContracts.map(c => c.expiry))];
        uniqueExpiries.sort();
        const todayStr = new Date().toISOString().split('T')[0];
        const nearestExpiry = uniqueExpiries.find(e => e >= todayStr) || uniqueExpiries[uniqueExpiries.length - 1];
        console.log(`[MarketDebug] Options Expiry Selected: ${nearestExpiry}`);

        const expiryContracts = allContracts
            .filter(c => c.expiry === nearestExpiry)
            .map(c => ({
                ...c,
                instrument_key: c.instrument_key.replace(/:/g, '|')
            }));

        let step = 50;
        if (selectedIndex === 'BANKNIFTY' || selectedIndex === 'SENSEX' || selectedIndex === 'BANKEX') step = 100;
        else if (selectedIndex === 'MIDCPNIFTY') step = 25;

        // Note: We need a valid currentPrice. If we don't have it yet, we might render centered on 0 or wait?
        // Let's assume we use the first fetched price or 0.

        const validContracts = expiryContracts.filter(c => {
            const remainder = c.strike_price % step;
            return remainder < 0.01 || Math.abs(remainder - step) < 0.01;
        });
        validContracts.sort((a, b) => a.strike_price - b.strike_price);

        let atmIndex = 0;
        let minDiff = Number.MAX_VALUE;
        // Optimization: if currentPrice is 0, try to find from indicesData
        // But indicesData might also be 0 initially.

        if (currentPrice > 0) {
            validContracts.forEach((c, i) => {
                const diff = Math.abs(c.strike_price - currentPrice);
                if (diff < minDiff) { minDiff = diff; atmIndex = i; }
            });
        } else {
            atmIndex = Math.floor(validContracts.length / 2);
        }

        const range = 25;
        const startIndex = Math.max(0, atmIndex - range);
        const endIndex = Math.min(validContracts.length, atmIndex + range + 1);
        const targetContracts = validContracts.slice(startIndex, endIndex);

        // Fetch Initial Quotes for these contracts using REST logic if available, or just rely on WebSocket
        // But the previous implementation logic (lines 121-127 in step 502 view) fetched quotes here.
        // We removed it in the previous refactor (implied by step 594 showing missing quote fetch).
        // Let's restore it.
        const targetKeys = targetContracts.map(c => c.instrument_key);
        console.log(`[MarketDebug] Fetching quotes for ${targetKeys.length} option contracts...`);
        // We can reuse MarketService.getQuotes (which now uses V2 safely for snapshots)
        const optionQuotes = await MarketService.getQuotes(targetKeys);
        console.log(`[MarketDebug] Option Quotes Received Keys: ${Object.keys(optionQuotes).length}`);

        const chainMap = {};
        targetContracts.forEach((c) => {
            // Initialize with placeholder or 0
            if (!chainMap[c.strike_price]) {
                chainMap[c.strike_price] = { strike_price: c.strike_price };
            }
            const quote = optionQuotes[c.instrument_key];
            const ltp = quote ? quote.last_price : 0;

            const optData = {
                market_data: { ltp: ltp },
                instrument_key: c.instrument_key,
                expiry: c.expiry,
                lot_size: c.lot_size
            };
            const type = c.instrument_type ? c.instrument_type.toUpperCase() : '';
            if (type === 'CE' || type === 'CALL') chainMap[c.strike_price].call_options = optData;
            else if (type === 'PE' || type === 'PUT') chainMap[c.strike_price].put_options = optData;
        });

        const finalChain = Object.values(chainMap).sort((a, b) => a.strike_price - b.strike_price);
        console.log(`[MarketDebug] Final Option Chain Rows: ${finalChain.length}`);
        setOptionChain(finalChain);
        console.log(`[MarketDebug] processContracts Complete.`);
    };

    // Initial Fetch (REST via Proxy) to get OHLC/Change data immediately + Polling Fallback
    useEffect(() => {
        fetchMarketData();

        // Auto-Refresh every 1 Minute (60s) as fallback for stuck WS
        const interval = setInterval(() => {
            console.log("[MarketScreen] Auto-Refreshing Data (1m)...");
            fetchMarketData();
        }, 60000);

        return () => clearInterval(interval);
    }, []); // Run once on mount

    const dynamicStyles = styles(colors);

    return (
        <SafeAreaView style={dynamicStyles.container}>
            <View style={dynamicStyles.header}>
                <Text style={dynamicStyles.screenTitle}>Indices</Text>
                {loading && <ActivityIndicator size="small" color={colors.success} />}
            </View>

            <View style={dynamicStyles.indicesContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {Object.keys(INSTRUMENT_KEYS).map((key) => (
                        <IndexCard
                            key={key}
                            symbol={key}
                            data={indicesData[key]}
                            active={selectedIndex === key}
                            onPress={() => {
                                setSelectedIndex(key);
                                navigation.navigate('Chart', {
                                    symbol: key,
                                    instrumentKey: INSTRUMENT_KEYS[key]
                                });
                            }}
                            colors={colors}
                        />
                    ))}
                </ScrollView>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 16 }}>
                <Text style={dynamicStyles.sectionTitle}>Option Chain ({selectedIndex})</Text>
            </View>

            <FlatList
                data={optionChain}
                keyExtractor={(item) => `${item.strike_price}`}
                renderItem={({ item }) => {
                    const callData = item.call_options;
                    const putData = item.put_options;
                    const strike = item.strike_price;

                    return (
                        <View style={dynamicStyles.optionRow}>
                            {/* CALLS */}
                            <TouchableOpacity
                                style={[dynamicStyles.optionSide, dynamicStyles.callSide]}
                                onPress={() => {
                                    if (callData) {
                                        navigation.navigate('Trade', {
                                            instrumentKey: callData.instrument_key,
                                            symbol: `${selectedIndex} ${strike} CE`,
                                            type: 'CE',
                                            expiry: callData.expiry,
                                            strike: strike,
                                            lotSize: callData.lot_size
                                        });
                                    }
                                }}
                            >
                                <Text style={[dynamicStyles.optionPrice, { color: callData ? colors.success : colors.subText }]}>
                                    {callData ? callData.market_data.ltp.toFixed(2) : '-'}
                                </Text>
                                <Text style={dynamicStyles.strikeLabel}>CE</Text>
                            </TouchableOpacity>

                            {/* STRIKE */}
                            <View style={dynamicStyles.strikeContainer}>
                                <Text style={dynamicStyles.strikePrice}>{strike}</Text>
                            </View>

                            {/* PUTS */}
                            <TouchableOpacity
                                style={[dynamicStyles.optionSide, dynamicStyles.putSide]}
                                onPress={() => {
                                    if (putData) {
                                        navigation.navigate('Trade', {
                                            instrumentKey: putData.instrument_key,
                                            symbol: `${selectedIndex} ${strike} PE`,
                                            type: 'PE',
                                            expiry: putData.expiry,
                                            strike: strike,
                                            lotSize: putData.lot_size
                                        });
                                    }
                                }}
                            >
                                <Text style={dynamicStyles.strikeLabel}>PE</Text>
                                <Text style={[dynamicStyles.optionPrice, { color: putData ? colors.danger : colors.subText }]}>
                                    {putData ? putData.market_data.ltp.toFixed(2) : '-'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    );
                }}
                contentContainerStyle={dynamicStyles.listContent}
                ListEmptyComponent={<Text style={{ color: colors.subText, textAlign: 'center', marginTop: 20 }}>

                    {loading ? "Loading..." : "No data available"}
                </Text>}

            />
        </SafeAreaView>
    );
}

const styles = (colors) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.header, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    screenTitle: { fontSize: 24, fontWeight: 'bold', color: colors.text },
    indicesContainer: { paddingVertical: 16, paddingHorizontal: 8 },
    indexCard: { backgroundColor: colors.card, padding: 16, borderRadius: 12, marginHorizontal: 8, width: 160, borderWidth: 1, borderColor: colors.cardBorder },
    indexHeader: { marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    indexSymbol: { color: colors.subText, fontSize: 12, fontWeight: 'bold' },
    indexPrice: { color: colors.text, fontSize: 20, fontWeight: 'bold' },
    indexChange: { fontSize: 12, fontWeight: 'bold' },
    sectionTitle: { color: colors.subText, marginLeft: 16, marginBottom: 8, marginTop: 8, fontSize: 14, textTransform: 'uppercase' },
    listContent: { paddingHorizontal: 16 },
    optionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, backgroundColor: colors.card, borderRadius: 8, padding: 12, borderWidth: 1, borderColor: colors.cardBorder },
    strikeContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border, marginHorizontal: 8 },
    strikePrice: { color: colors.text, fontSize: 16, fontWeight: 'bold' },
    optionSide: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    callSide: { paddingRight: 8 },
    putSide: { paddingLeft: 8 },
    optionPrice: { fontSize: 14, fontWeight: 'bold' },
    strikeLabel: { color: colors.subText, fontSize: 10, fontWeight: 'bold' }
});
