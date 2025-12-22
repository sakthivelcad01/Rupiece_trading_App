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
    MIDCAP: 'NSE_INDEX|NIFTY MID SELECT',
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
                {data?.change ? (data.change > 0 ? '+' : '') + data.change : '0.00'}
                ({data?.changePwd ? data.changePwd.toFixed(2) : '0.00'}%)
            </Text>
            <Text style={styles(colors).indexPrice}>₹{data?.last_price ? data.last_price.toFixed(2) : '0.00'}</Text>
        </TouchableOpacity>
    );
};

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
            const indexKeys = Object.values(INSTRUMENT_KEYS);
            const quotes = await MarketService.getQuotes(indexKeys);

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
                let step = 50;
                if (selectedIndex === 'BANKNIFTY' || selectedIndex === 'SENSEX' || selectedIndex === 'BANKEX') {
                    step = 100;
                } else if (selectedIndex === 'MIDCAP') {
                    step = 25;
                }

                const validContracts = expiryContracts.filter(c => {
                    const remainder = c.strike_price % step;
                    return remainder < 0.01 || Math.abs(remainder - step) < 0.01;
                });

                validContracts.sort((a, b) => a.strike_price - b.strike_price);

                let atmIndex = 0;
                let minDiff = Number.MAX_VALUE;
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

    useEffect(() => {
        fetchMarketData();
        const interval = setInterval(fetchMarketData, 5000);
        return () => clearInterval(interval);
    }, [selectedIndex]);

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
