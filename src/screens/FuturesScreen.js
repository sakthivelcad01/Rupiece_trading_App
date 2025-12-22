import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MarketService } from '../services/MarketService';
import instruments from '../data/complete.json'; // Importing local JSON
import { useTheme } from '../context/ThemeContext';

const FUT_BASE = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX'];

// Static Filtering Logic
const futures = instruments.filter(inst =>
    (inst.segment === 'NSE_FO' || inst.segment === 'BSE_FO') &&            // FO segment (NSE or BSE)
    inst.instrument_type === 'FUT' &&       // Only Futures
    FUT_BASE.some(base => inst.trading_symbol.startsWith(base)) // Match base
);

const activeFutures = futures.filter(f => {
    // Exclude NIFTYNXT50 when searching for NIFTY
    if (f.trading_symbol.startsWith('NIFTYNXT50')) return false;

    // Safety check for date
    if (!f.expiry) return false;

    const expiryDate = new Date(f.expiry);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Keep only current and future expiries
    return expiryDate >= today;
});

// Sort: 1. By Index Importance (NIFTY > BANKNIFTY > ...) 2. By Expiry
activeFutures.sort((a, b) => {
    const baseA = FUT_BASE.find(base => a.trading_symbol.startsWith(base));
    const baseB = FUT_BASE.find(base => b.trading_symbol.startsWith(base));

    const idxA = FUT_BASE.indexOf(baseA);
    const idxB = FUT_BASE.indexOf(baseB);

    if (idxA !== idxB) return idxA - idxB;

    // Same Index, sort by Expiry
    return new Date(a.expiry) - new Date(b.expiry);
});

const FutureCard = ({ symbol, data, navigation, colors }) => {
    const isPositive = data?.change >= 0;
    const color = isPositive ? colors.success : colors.danger;

    // Dynamic styles
    const styles = getStyles(colors);

    const handleTrade = (type) => {
        navigation.navigate('Trade', {
            symbol: data.tradingSymbol || `${symbol} FUT`,
            instrumentKey: data.instrumentKey,
            type: 'FUT',
            expiry: data.expiry,
            lotSize: 0,
            action: type
        });
    };

    return (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <View>
                    <Text style={styles.symbolText}>{symbol}</Text>
                    <Text style={styles.expiryText}>{data.expiry}</Text>
                </View>
            </View>

            <View style={styles.priceRow}>
                <Text style={styles.priceText}>₹{data?.last_price ? data.last_price.toFixed(2) : '0.00'}</Text>
                <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.changeText, { color }]}>
                        {data?.change > 0 ? '+' : ''}{data?.change ? data.change.toFixed(2) : '0.00'}
                    </Text>
                    <Text style={[styles.pctText, { color }]}>
                        ({data?.changePwd ? data.changePwd.toFixed(2) : '0.00'}%)
                    </Text>
                </View>
            </View>

            {/* Buy/Sell Buttons */}
            <View style={styles.actionRow}>
                <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: colors.success }]}
                    onPress={() => handleTrade('BUY')}
                >
                    <Text style={styles.btnText}>BUY</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: colors.danger }]}
                    onPress={() => handleTrade('SELL')}
                >
                    <Text style={styles.btnText}>SELL</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

export default function FuturesScreen({ navigation }) {
    const { colors } = useTheme();
    const [futureData, setFutureData] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchQuotes = async () => {
        if (futureData.length === 0) setLoading(true);

        try {
            const keys = activeFutures.map(f => f.instrument_key);
            const quotes = await MarketService.getQuotes(keys);

            // Map data for UI
            const newQuoteData = activeFutures.map(f => ({
                displaySymbol: f.trading_symbol,
                last_price: quotes[f.instrument_key]?.last_price || 0,
                change: quotes[f.instrument_key]?.net_change !== undefined ? quotes[f.instrument_key].net_change : (quotes[f.instrument_key]?.last_price || 0) - (quotes[f.instrument_key]?.ohlc?.close || 0),
                changePwd: quotes[f.instrument_key]?.ohlc?.close
                    ? ((quotes[f.instrument_key].last_price - quotes[f.instrument_key].ohlc.close) / quotes[f.instrument_key].ohlc.close) * 100
                    : 0,
                instrumentKey: f.instrument_key,
                instrumentToken: f.instrument_token,
                expiry: f.expiry
            }));

            setFutureData(newQuoteData);
        } catch (err) {
            console.error("Error fetching future quotes:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchQuotes();
        const interval = setInterval(fetchQuotes, 5000);
        return () => clearInterval(interval);
    }, []);

    const styles = getStyles(colors);

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Derivatives</Text>
                {loading && <ActivityIndicator size="small" color={colors.success} />}
            </View>

            <FlatList
                data={futureData}
                keyExtractor={item => item.instrumentKey}
                renderItem={({ item }) => (
                    <FutureCard
                        symbol={item.displaySymbol}
                        data={item}
                        navigation={navigation}
                        colors={colors}
                    />
                )}
                contentContainerStyle={{ padding: 16 }}
                ListEmptyComponent={!loading && <Text style={{ color: colors.subText, textAlign: 'center', marginTop: 20 }}>No Futures Found</Text>}
            />
        </SafeAreaView>
    );
}

const getStyles = (colors) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.header },
    title: { fontSize: 24, fontWeight: 'bold', color: colors.text },
    card: { backgroundColor: colors.card, padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.cardBorder },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
    symbolText: { color: colors.text, fontSize: 18, fontWeight: 'bold' },
    expiryText: { color: colors.subText, fontSize: 12 },
    priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 },
    priceText: { color: colors.text, fontSize: 28, fontWeight: 'bold' },
    changeText: { fontSize: 16, fontWeight: 'bold' },
    pctText: { fontSize: 12, fontWeight: '600' },
    actionRow: { flexDirection: 'row', gap: 12 },
    actionBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    btnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 }
});
