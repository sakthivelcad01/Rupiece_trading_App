import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useAlert } from '../context/AlertContext';
import { MarketService } from '../services/MarketService';
import { OrderService } from '../services/OrderService';
import { ArrowLeft, TrendingUp, TrendingDown } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useNetwork } from '../context/NetworkContext';

const LOT_SIZES = {
    'NIFTY': 75,
    'BANKNIFTY': 35,
    'FINNIFTY': 65,
    'MIDCPNIFTY': 140,
    'MIDCAP': 140,
    'SENSEX': 20,
    'BANKEX': 30,
    'DEFAULT': 1
};

export default function TradeScreen({ route, navigation }) {
    const { colors } = useTheme();
    const { isConnected } = useNetwork();
    // Expect params from MarketScreen navigation
    const { instrumentKey, symbol, type, expiry, strike, lotSize, exitQty } = route.params || {};

    const { user, selectedAccount, setSelectedAccount } = useAuth();
    const { showAlert } = useAlert();

    const getLotSize = () => {
        if (lotSize) return lotSize;
        if (!symbol) return LOT_SIZES.DEFAULT;
        const upper = symbol.toUpperCase();
        if (upper.includes('BANKNIFTY')) return LOT_SIZES.BANKNIFTY;
        if (upper.includes('FINNIFTY')) return LOT_SIZES.FINNIFTY;
        if (upper.includes('MIDCPNIFTY')) return LOT_SIZES.MIDCPNIFTY;
        if (upper.includes('MIDCAP')) return LOT_SIZES.MIDCAP;
        if (upper.includes('NIFTY')) return LOT_SIZES.NIFTY;
        if (upper.includes('SENSEX')) return LOT_SIZES.SENSEX;
        if (upper.includes('BANKEX')) return LOT_SIZES.BANKEX;
        return LOT_SIZES.DEFAULT;
    };

    const LOT_SIZE = getLotSize();

    const [quote, setQuote] = useState(null);
    const [lots, setLots] = useState(() => {
        if (exitQty) {
            return Math.ceil(exitQty / LOT_SIZE);
        }
        return 1;
    });
    const [loading, setLoading] = useState(false);
    const [placingOrder, setPlacingOrder] = useState(false);

    const [productType, setProductType] = useState('INTRADAY'); // INTRADAY or DELIVERY

    // Order Parameters
    const [orderClass, setOrderClass] = useState('MARKET'); // MARKET or LIMIT
    const [limitPrice, setLimitPrice] = useState('');
    const [sl, setSl] = useState('');
    const [tp, setTp] = useState('');

    useEffect(() => {
        if (exitQty) {
            setLots(Math.ceil(exitQty / LOT_SIZE));
        }
    }, [exitQty, LOT_SIZE]);

    const totalQty = lots * LOT_SIZE;

    // --- REFACTORED TO USE HOOK ---
    const { useMarketData } = require('../hooks/useMarketData');

    // We only need to monitor one key here
    const liveData = useMarketData(instrumentKey ? [instrumentKey] : []);

    useEffect(() => {
        if (instrumentKey && liveData[instrumentKey]) {
            setQuote(liveData[instrumentKey]);
        }
    }, [liveData, instrumentKey]);

    // Initial fetch to ensure we have data instantly before WS connects (optional, but good UX)
    useEffect(() => {
        if (instrumentKey) {
            MarketService.getQuotes([instrumentKey]).then(data => {
                if (data && data[instrumentKey]) setQuote(data[instrumentKey]);
            });
        }
    }, [instrumentKey]);

    // Removed old Interval Logic
    /*
    useEffect(() => {
        if (instrumentKey) {
            fetchQuote();
            const interval = setInterval(fetchQuote, 5000);
            return () => clearInterval(interval);
        }
    }, [instrumentKey]);

    const fetchQuote = async () => {
        const data = await MarketService.getQuotes([instrumentKey]);
        if (data && data[instrumentKey]) {
            setQuote(data[instrumentKey]);
        }
    };
    */

    const handlePlaceOrder = async (orderType) => {
        if (!selectedAccount) {
            showAlert("No Account", "Please select a trading account in the Account tab.", [], "warning");
            return;
        }

        // --- TEMPORARY BLOCK: Phase 1 Accounts ---
        // User Request: "incase the accout phase 1 just show the message of trading is blocked"
        const isPhase1 = selectedAccount.phase === 'Phase 1' || (selectedAccount.name && selectedAccount.name.includes('Phase 1'));
        if (isPhase1) {
            showAlert("Trading Blocked 🚫", "Trading is currently paused for Phase 1 accounts. We will notify you when we are online.", [], "warning");
            return;
        }
        // -----------------------------------------

        if (!quote) return;

        setPlacingOrder(true);

        // RISK GUARD
        if (orderType === 'BUY') {
            try {
                const initialBalance = selectedAccount.balance || 0;
                const breachLevel = initialBalance * 0.90;
                const positions = await OrderService.getPositions(selectedAccount.id);
                let marketValue = 0;

                if (positions.length > 0) {
                    const keys = positions.map(p => p.instrumentKey);
                    const marketData = await MarketService.getQuotes(keys);
                    positions.forEach(p => {
                        const q = marketData[p.instrumentKey];
                        const ltp = q ? q.last_price : p.avgPrice;
                        const pnl = (ltp - p.avgPrice) * p.qty;
                        marketValue += pnl;
                    });
                }
                const totalCash = (selectedAccount.currentBalance || 0) + (selectedAccount.investedAmount || 0);

                let totalUnrealizedPnL = 0;
                if (positions.length > 0) {
                    const keys = positions.map(p => p.instrumentKey);
                    const marketData = await MarketService.getQuotes(keys);
                    positions.forEach(p => {
                        const q = marketData[p.instrumentKey];
                        const ltp = q ? q.last_price : p.avgPrice;
                        totalUnrealizedPnL += (ltp - p.avgPrice) * p.qty;
                    });
                }

                const currentEquity = totalCash + totalUnrealizedPnL;

                if (currentEquity < breachLevel) {
                    showAlert(
                        "Risk Warning ⚠️",
                        `Max Drawdown Limit Reached!\n\nCurrent Equity: ₹${currentEquity.toFixed(2)}\nMin Allowed: ₹${breachLevel.toFixed(2)}\n\nTrading is disabled to prevent further losses.`,
                        [],
                        "error"
                    );
                    setPlacingOrder(false);
                    return;
                }

            } catch (err) {
                console.error("Risk Check Failed:", err);
                showAlert("Error", "Could not verify risk limits. Check internet connection.", [], "error");
                setPlacingOrder(false);
                return;
            }
        }

        const isFuture = type === 'FUT';
        // Use Limit Price if set, otherwise Market Price
        const effectivePrice = (orderClass === 'LIMIT' && parseFloat(limitPrice)) ? parseFloat(limitPrice) : quote.last_price;
        const orderValue = effectivePrice * totalQty;
        const marginRequired = isFuture ? (orderValue / 10) : orderValue;

        const orderDetails = {
            instrumentKey,
            symbol: symbol || (quote?.symbol),
            qty: totalQty,
            price: quote.last_price,
            type: orderType,
            product: productType,
            // New Fields
            orderClass: orderClass,
            limitPrice: orderClass === 'LIMIT' ? parseFloat(limitPrice) : null,
            sl: parseFloat(sl) || null,
            tp: parseFloat(tp) || null,

            marginRequired: marginRequired,
            expiry: expiry || '',
            strike: strike || '',
            optionType: type || '',
            lotSize: LOT_SIZE
        };

        const result = await OrderService.placeOrder(orderDetails, selectedAccount, user.uid);

        if (result.success) {
            const val = orderDetails.marginRequired;
            if (orderType === 'BUY') {
                selectedAccount.currentBalance -= val;
            } else {
                selectedAccount.currentBalance += val;
            }

            showAlert("Success", `${orderType} Order Executed!`, [
                { text: "View Portfolio", onPress: () => navigation.navigate('Main', { screen: 'Portfolio' }) },
                { text: "OK", style: "cancel" }
            ], "success");
        } else {
            const errorMsg = result.error ? result.error.toString() : "Unknown Error";
            const isMarketClosed = errorMsg.includes("Market is Closed") || errorMsg.includes("Trading hours");

            if (isMarketClosed) {
                showAlert("Market Closed 🌙", errorMsg, [], "warning");
            } else {
                showAlert("Order Failed", errorMsg, [], "error");
            }
        }
        setPlacingOrder(false);
    };

    const styles = getStyles(colors);

    if (!instrumentKey) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.center}>
                    <Text style={styles.text}>No Instrument Selected.</Text>
                    <Text style={styles.subText}>Go to Market Watch to select an option.</Text>
                    <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('Market')}>
                        <Text style={styles.buttonText}>Go to Market</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    const price = quote?.last_price || 0;
    const change = quote?.net_change || 0;
    const pChange = quote?.net_change ? ((quote.net_change / (quote.last_price - quote.net_change)) * 100) : 0;
    const isUp = change >= 0;

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Place Order</Text>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {/* Contract Details */}
                <View style={styles.contractCard}>
                    <Text style={styles.symbolLabel}>{symbol || "Unknown Symbol"}</Text>
                    <View style={styles.priceRow}>
                        <Text style={styles.ltp}>₹{price.toFixed(2)}</Text>
                        <View style={[styles.badge, { backgroundColor: isUp ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)' }]}>
                            {isUp ? <TrendingUp size={16} color={colors.success} /> : <TrendingDown size={16} color={colors.danger} />}
                            <Text style={[styles.change, { color: isUp ? colors.success : colors.danger }]}>
                                {change.toFixed(2)} ({pChange.toFixed(2)}%)
                            </Text>
                        </View>
                    </View>
                    <Text style={styles.expiryInfo}>{expiry} - {strike} {type} • Lot Size: {LOT_SIZE}</Text>
                </View>

                {/* Account Info */}
                <View style={styles.accountSection}>
                    <Text style={styles.sectionLabel}>Trading Account</Text>
                    {selectedAccount ? (
                        <View style={styles.accountCard}>
                            <Text style={styles.accName}>{selectedAccount.name || "Challenge Account"}</Text>
                            <Text style={styles.accBalance}>Avail: ₹{selectedAccount.currentBalance?.toFixed(2)}</Text>
                        </View>
                    ) : (
                        <Text style={styles.errorText}>No Account Selected! Please select one in Account tab.</Text>
                    )}
                </View>

                {/* Order Form */}
                <View style={styles.formSection}>
                    <Text style={styles.sectionLabel}>Quantity (Lots)</Text>
                    <View style={styles.qtyContainer}>
                        <TouchableOpacity style={styles.qtyBtn} onPress={() => setLots(Math.max(1, lots - 1))}>
                            <Text style={styles.qtyBtnText}>-</Text>
                        </TouchableOpacity>
                        <View style={styles.qtyDisplay}>
                            <TextInput
                                style={styles.qtyInput}
                                value={lots.toString()}
                                keyboardType="number-pad"
                                onChangeText={(t) => setLots(parseInt(t) || 1)} // Min 1
                            />
                            <Text style={styles.totalQtyText}>= {totalQty} Qty</Text>
                        </View>
                        <TouchableOpacity style={styles.qtyBtn} onPress={() => setLots(lots + 1)}>
                            <Text style={styles.qtyBtnText}>+</Text>
                        </TouchableOpacity>
                    </View>


                    {/* Product Type Selector (Intraday / Delivery) */}
                    <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Product Type</Text>
                    <View style={styles.segmentContainer}>
                        <TouchableOpacity
                            style={[styles.segmentBtn, productType === 'INTRADAY' && { backgroundColor: colors.primary }]}
                            onPress={() => setProductType('INTRADAY')}
                        >
                            <Text style={[styles.segmentText, productType === 'INTRADAY' && { color: '#fff' }]}>INTRADAY</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.segmentBtn, productType === 'DELIVERY' && { backgroundColor: colors.primary }]}
                            onPress={() => setProductType('DELIVERY')}
                        >
                            <Text style={[styles.segmentText, productType === 'DELIVERY' && { color: '#fff' }]}>DELIVERY</Text>
                        </TouchableOpacity>
                    </View>


                    {/* Order Type Selector - HIDDEN/REMOVED (Only MARKET allowed) */}
                    {/* 
                    <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Order Type</Text>
                    <View style={styles.segmentContainer}>
                        <TouchableOpacity
                            style={[styles.segmentBtn, orderClass === 'MARKET' && { backgroundColor: colors.primary }]}
                            onPress={() => setOrderClass('MARKET')}
                        >
                            <Text style={[styles.segmentText, orderClass === 'MARKET' && { color: '#fff' }]}>MARKET</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.segmentBtn, orderClass === 'LIMIT' && { backgroundColor: colors.primary }]}
                            onPress={() => setOrderClass('LIMIT')}
                        >
                            <Text style={[styles.segmentText, orderClass === 'LIMIT' && { color: '#fff' }]}>LIMIT</Text>
                        </TouchableOpacity>
                    </View>
                    */}

                    {/* Limit Price Input - REMOVED */}

                    {/* SL / TP Inputs */}
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.sectionLabel}>Stop Loss</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="0.00"
                                placeholderTextColor={colors.subText}
                                keyboardType="numeric"
                                value={sl}
                                onChangeText={setSl}
                            />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.sectionLabel}>Take Profit</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="0.00"
                                placeholderTextColor={colors.subText}
                                keyboardType="numeric"
                                value={tp}
                                onChangeText={setTp}
                            />
                        </View>
                    </View>

                    <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Estimated Margin {type === 'FUT' ? '(10x Leverage)' : ''}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                        <Text style={styles.marginText}>
                            ₹{type === 'FUT'
                                ? ((price * totalQty) / 10).toFixed(2)
                                : (price * totalQty).toFixed(2)
                            }
                        </Text>
                        {type === 'FUT' && (
                            <Text style={{ color: colors.subText, textDecorationLine: 'line-through' }}>
                                ₹{(totalQty * price).toFixed(2)}
                            </Text>
                        )}
                    </View>
                </View>
            </ScrollView>

            {/* Action Buttons */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: colors.success }]}
                    onPress={() => handlePlaceOrder('BUY')}
                    disabled={placingOrder || isConnected === false}
                >
                    {placingOrder ? <ActivityIndicator color="#000" /> : <Text style={styles.actionBtnText}>{isConnected === false ? "OFFLINE" : "BUY (CALL)"}</Text>}
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: colors.danger }]}
                    onPress={() => handlePlaceOrder('SELL')}
                    disabled={placingOrder || isConnected === false}
                >
                    {placingOrder ? <ActivityIndicator color="#000" /> : <Text style={styles.actionBtnText}>{isConnected === false ? "OFFLINE" : "SELL (PUT)"}</Text>}
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const getStyles = (colors) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderColor: colors.border },
    headerTitle: { color: colors.text, fontSize: 18, fontWeight: 'bold' },
    backButton: { padding: 4 },
    content: { padding: 16 },
    text: { color: colors.text, fontSize: 20, fontWeight: 'bold' },
    subText: { color: colors.subText, marginTop: 8 },
    button: { marginTop: 20, backgroundColor: colors.success, padding: 12, borderRadius: 8 },
    buttonText: { color: '#000', fontWeight: 'bold' },

    contractCard: { backgroundColor: colors.card, padding: 20, borderRadius: 16, marginBottom: 20, borderWidth: 1, borderColor: colors.cardBorder },
    symbolLabel: { color: colors.subText, fontSize: 14, textTransform: 'uppercase', marginBottom: 8 },
    priceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    ltp: { color: colors.text, fontSize: 32, fontWeight: 'bold' },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    change: { fontSize: 14, fontWeight: 'bold' },
    expiryInfo: { color: colors.subText, marginTop: 8 },

    accountSection: { marginBottom: 24 },
    sectionLabel: { color: colors.subText, marginBottom: 8, textTransform: 'uppercase', fontSize: 12 },
    accountCard: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.header, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
    accName: { color: colors.text, fontWeight: 'bold' },
    accBalance: { color: colors.success },
    errorText: { color: colors.danger },

    formSection: { padding: 16, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder },
    qtyContainer: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    qtyBtn: { width: 40, height: 40, backgroundColor: colors.inputBg, borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    qtyBtnText: { color: colors.text, fontSize: 24 },
    qtyDisplay: { flex: 1, alignItems: 'center' },
    qtyInput: { backgroundColor: colors.inputBg, color: colors.text, width: '100%', height: 40, borderRadius: 8, textAlign: 'center', fontSize: 18, fontWeight: 'bold', borderWidth: 1, borderColor: colors.border },
    totalQtyText: { color: colors.subText, fontSize: 12, marginTop: 4 },
    marginText: { color: colors.text, fontSize: 24, fontWeight: 'bold' },

    footer: { flexDirection: 'row', padding: 16, gap: 12, borderTopWidth: 1, borderColor: colors.border },
    actionBtn: { flex: 1, height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    actionBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

    segmentContainer: { flexDirection: 'row', backgroundColor: colors.inputBg, borderRadius: 8, padding: 4 },
    segmentBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
    segmentText: { color: colors.subText, fontWeight: 'bold', fontSize: 12 },
    input: { backgroundColor: colors.inputBg, color: colors.text, height: 44, borderRadius: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, fontSize: 16 }

});
