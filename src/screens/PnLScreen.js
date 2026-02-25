import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { MarketService } from '../services/MarketService';
import { OrderService } from '../services/OrderService';
import { useTheme } from '../context/ThemeContext';
import { useAlert } from '../context/AlertContext';

const LOT_SIZES = {
    'NIFTY': 65,
    'BANKNIFTY': 30,
    'FINNIFTY': 65,
    'MIDCPNIFTY': 120,
    'SENSEX': 20,
    'BANKEX': 30,
    'DEFAULT': 1
};

const getLotSize = (symbol, itemLotSize) => {
    if (itemLotSize) return itemLotSize;
    if (!symbol) return LOT_SIZES.DEFAULT;
    const upper = symbol.toUpperCase();
    if (upper.includes('BANKNIFTY')) return LOT_SIZES.BANKNIFTY;
    if (upper.includes('FINNIFTY')) return LOT_SIZES.FINNIFTY;
    if (upper.includes('MIDCPNIFTY')) return LOT_SIZES.MIDCPNIFTY;
    if (upper.includes('NIFTY')) return LOT_SIZES.NIFTY;
    if (upper.includes('SENSEX')) return LOT_SIZES.SENSEX;
    if (upper.includes('BANKEX')) return LOT_SIZES.BANKEX;
    return LOT_SIZES.DEFAULT;
};

const PositionCard = ({ item, onExit, onAddSLTP, colors }) => {
    const isOpen = item.status === 'OPEN';
    const pnl = (item.ltp - item.avgPrice) * item.qty;

    return (
        <View style={styles(colors).card}>
            <View style={styles(colors).cardHeader}>
                <Text style={styles(colors).symbolText}>{item.symbol}</Text>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                    <Text style={[styles(colors).productTag, { backgroundColor: item.product === 'INTRADAY' ? colors.warning + '40' : colors.primary + '40', color: colors.text }]}>
                        {item.product === 'INTRADAY' ? 'MIS' : 'NRML'}
                    </Text>
                    <Text style={[styles(colors).statusText, { color: isOpen ? colors.success : colors.subText }]}>{item.status}</Text>
                </View>
            </View>

            <View style={styles(colors).cardDetails}>
                <View style={styles(colors).detailRow}>
                    <Text style={styles(colors).detailLabel}>Qty</Text>
                    <Text style={styles(colors).detailValue}>{item.qty}</Text>
                </View>
                <View style={styles(colors).detailRow}>
                    <Text style={styles(colors).detailLabel}>Avg</Text>
                    <Text style={styles(colors).detailValue}>₹{item.avgPrice.toFixed(2)}</Text>
                </View>
                <View style={styles(colors).detailRow}>
                    <Text style={styles(colors).detailLabel}>LTP</Text>
                    <Text style={styles(colors).detailValue}>₹{item.ltp ? item.ltp.toFixed(2) : '-'}</Text>
                </View>
            </View>

            {/* Display SL/TP if set */}
            {(item.sl || item.tp) && (
                <View style={{ flexDirection: 'row', marginTop: 8, gap: 16 }}>
                    {item.sl && <Text style={{ color: colors.danger, fontSize: 10 }}>SL: {item.sl}</Text>}
                    {item.tp && <Text style={{ color: colors.success, fontSize: 10 }}>TP: {item.tp}</Text>}
                </View>
            )}

            <View style={[styles(colors).cardFooter]}>
                <View>
                    <Text style={styles(colors).detailLabel}>P&L</Text>
                    <Text style={[styles(colors).pnlValue, { color: pnl >= 0 ? colors.success : colors.danger }]}>
                        {pnl < 0 ? '-' : (pnl > 0 ? '+' : '')}₹{Math.abs(pnl).toFixed(2)}
                    </Text>
                </View>

                {isOpen && (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                            style={{ backgroundColor: colors.border, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}
                            onPress={() => onAddSLTP(item)}
                        >
                            <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: 12 }}>SL/TP</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={{ backgroundColor: colors.danger, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}
                            onPress={() => onExit(item)}
                        >
                            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>EXIT</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </View>
    );
};

const OrderCard = ({ item, onCancel, colors }) => {
    const isBuy = item.type === 'BUY';
    const isPending = item.status === 'PENDING';
    const isExecuted = item.status === 'EXECUTED';
    const isRejected = item.status === 'REJECTED';
    const dateStr = item.timestamp?.toDate ? item.timestamp.toDate().toLocaleString() : 'Just now';

    let statusColor = colors.subText;
    if (isExecuted) statusColor = colors.success;
    if (isRejected) statusColor = colors.danger;
    if (isPending) statusColor = colors.warning || '#F59E0B';

    return (
        <View style={styles(colors).card}>
            <View style={styles(colors).cardHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[styles(colors).typeTag, { backgroundColor: isBuy ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)', color: isBuy ? colors.success : colors.danger }]}>
                        {item.type}
                    </Text>
                    <Text style={styles(colors).symbolText}>{item.symbol}</Text>
                    <Text style={[styles(colors).productTag, { backgroundColor: item.product === 'INTRADAY' ? colors.warning + '40' : colors.primary + '40', color: colors.text }]}>
                        {item.product === 'INTRADAY' ? 'MIS' : 'NRML'}
                    </Text>
                </View>
                <Text style={[styles(colors).statusText, { color: statusColor, backgroundColor: 'transparent' }]}>{item.status}</Text>
            </View>

            <View style={styles(colors).cardDetails}>
                <View style={styles(colors).detailRow}>
                    <Text style={styles(colors).detailLabel}>Qty</Text>
                    <Text style={styles(colors).detailValue}>{item.qty}</Text>
                </View>
                <View style={styles(colors).detailRow}>
                    <Text style={styles(colors).detailLabel}>Price</Text>
                    <Text style={styles(colors).detailValue}>₹{item.price.toFixed(2)}</Text>
                </View>
                {isRejected && (
                    <View style={[styles(colors).detailRow, { flex: 2, alignItems: 'flex-end' }]}>
                        <Text style={[styles(colors).detailLabel, { color: colors.danger }]}>Reason</Text>
                        <Text style={[styles(colors).detailValue, { color: colors.danger, fontSize: 10 }]}>{item.reason || "Unknown"}</Text>
                    </View>
                )}
            </View>

            <View style={[styles(colors).cardFooter, { justifyContent: 'space-between', marginTop: 12 }]}>
                <Text style={[styles(colors).detailLabel, { fontSize: 10 }]}>{dateStr}</Text>

                {isPending && (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                            style={{ backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}
                            onPress={() => onCancel(item, true)} // True means modify
                        >
                            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 10 }}>MODIFY</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={{ backgroundColor: colors.subText, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}
                            onPress={() => onCancel(item)}
                        >
                            <Text style={{ color: colors.background, fontWeight: 'bold', fontSize: 10 }}>CANCEL</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </View>
    );
}

const HistoryCard = ({ item, colors }) => {
    const isProfit = item.pnl >= 0;
    const dateStr = item.closedAt?.toDate ? item.closedAt.toDate().toLocaleString() : 'Just now';

    return (
        <View style={styles(colors).card}>
            <View style={styles(colors).cardHeader}>
                <Text style={styles(colors).symbolText}>{item.instrument} {item.strike} {item.optionType}</Text>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                    {/* Trade history records usually don't have 'product' field saved directly unless we update OrderService to save it in closedTradeData. 
                         Let's assumpe it's not crucial for history or we add it later. 
                         Actually, we can try to show it if present. */}
                    {item.product && (
                        <Text style={[styles(colors).productTag, { backgroundColor: item.product === 'INTRADAY' ? colors.warning + '40' : colors.primary + '40', color: colors.text }]}>
                            {item.product === 'INTRADAY' ? 'MIS' : 'NRML'}
                        </Text>
                    )}
                    <Text style={[styles(colors).statusText, { backgroundColor: colors.border }]}>CLOSED</Text>
                </View>
            </View>

            <View style={styles(colors).cardDetails}>
                <View style={styles(colors).detailRow}>
                    <Text style={styles(colors).detailLabel}>Qty</Text>
                    <Text style={styles(colors).detailValue}>{item.quantity}</Text>
                </View>
                <View style={styles(colors).detailRow}>
                    <Text style={styles(colors).detailLabel}>Avg</Text>
                    <Text style={styles(colors).detailValue}>₹{item.avgPrice.toFixed(2)}</Text>
                </View>
                <View style={styles(colors).detailRow}>
                    <Text style={styles(colors).detailLabel}>Exit</Text>
                    <Text style={styles(colors).detailValue}>₹{item.price.toFixed(2)}</Text>
                </View>
            </View>

            <View style={[styles(colors).cardFooter]}>
                <View>
                    <Text style={styles(colors).detailLabel}>Realized P&L</Text>
                    <Text style={[styles(colors).pnlValue, { color: isProfit ? colors.success : colors.danger }]}>
                        {item.pnl < 0 ? '-' : (item.pnl > 0 ? '+' : '')}₹{Math.abs(item.pnl).toFixed(2)}
                    </Text>
                </View>
                <Text style={styles(colors).detailLabel}>{dateStr}</Text>
            </View>
        </View>
    );
};

export default function PnLScreen({ navigation }) {
    const { colors } = useTheme();
    const { selectedAccount, user } = useAuth();
    const { showAlert } = useAlert();
    const [activeTab, setActiveTab] = useState('POSITIONS');

    const [positions, setPositions] = useState([]);
    const [trades, setTrades] = useState([]);
    const [orders, setOrders] = useState([]);

    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);

    // Modal State
    const [modalVisible, setModalVisible] = useState(false);
    const [modalMode, setModalMode] = useState('MODIFY_ORDER'); // 'MODIFY_ORDER' or 'ADD_SLTP'
    const [selectedItem, setSelectedItem] = useState(null);

    // Modification Inputs
    const [modPrice, setModPrice] = useState('');

    // Instead of raw qty, we track 'Lots'
    const [modLots, setModLots] = useState('1');
    const [currentLotSize, setCurrentLotSize] = useState(1);

    const [modSL, setModSL] = useState('');
    const [modTP, setModTP] = useState('');

    const fetchData = async (silent = false) => {
        if (!selectedAccount) {
            setPositions([]);
            setTrades([]);
            setOrders([]);
            return;
        }

        // Wait for Auth to be ready
        if (!user) {
            if (!silent) console.log("[PnLScreen] Waiting for user...");
            return;
        }

        if (!silent) setLoading(true);
        try {
            if (activeTab === 'POSITIONS') {
                // Auto-Exipry Check Hook
                if (!silent) {
                    OrderService.checkAndSquareOffExpiredPositions(selectedAccount, user.id).catch(console.error);
                }

                const dbPositions = await OrderService.getPositions(selectedAccount.id);
                if (dbPositions.length === 0) {
                    setPositions([]);
                } else {
                    const keysToFetch = [...new Set(dbPositions.map(p => p.instrumentKey))];
                    const marketData = await MarketService.getQuotes(keysToFetch);
                    const updatedPositions = dbPositions.map(p => {
                        const quote = marketData[p.instrumentKey];
                        const liveLtp = quote ? quote.last_price : p.avgPrice;
                        return { ...p, ltp: liveLtp };
                    });
                    setPositions(updatedPositions);
                }
            } else if (activeTab === 'HISTORY') {
                const dbTrades = await OrderService.getTrades(selectedAccount.id);
                setTrades(dbTrades);
            } else if (activeTab === 'ORDERS') {
                // Limit Order Trigger Hook
                OrderService.checkPendingOrders(selectedAccount, user.id).catch(console.error);
                const dbOrders = await OrderService.getOrderHistory(selectedAccount.id);
                setOrders(dbOrders);
            }
            setLastUpdated(new Date());
        } catch (error) {
            console.error("Failed to fetch data:", error);
        } finally {
            if (!silent) setLoading(false);
            setRefreshing(false);
        }
    };

    React.useEffect(() => {
        fetchData();
        const interval = setInterval(() => fetchData(true), 5000);
        return () => clearInterval(interval);
    }, [selectedAccount, activeTab]);

    const unrealizedPnl = positions.reduce((acc, item) => {
        const currentPrice = item.ltp;
        return acc + (currentPrice - item.avgPrice) * item.qty;
    }, 0);

    const realizedPnl = trades.reduce((acc, item) => acc + (item.pnl || 0), 0);

    const displayPnl = activeTab === 'POSITIONS' ? unrealizedPnl : (activeTab === 'HISTORY' ? realizedPnl : 0);
    const displayLabel = activeTab === 'POSITIONS' ? 'Unrealized P&L' : (activeTab === 'HISTORY' ? 'Realized P&L' : 'Order Book');

    const handleExitPosition = (item) => {
        navigation.navigate('Trade', {
            instrumentKey: item.instrumentKey,
            symbol: item.symbol,
            type: 'SELL',
            strike: item.symbol.split(' ')[1],
            expiry: item.expiry || '',
            exitQty: item.qty,
            lotSize: item.lotSize || item.lot_size
        });
    };

    const handleCancelOrder = (item, isModify = false) => {
        if (isModify) {
            setSelectedItem(item);
            setModPrice(item.price.toString());

            // Determine Lot Size from Item or Symbol
            const lSize = getLotSize(item.symbol, item.lotSize);
            setCurrentLotSize(lSize);

            // Calculate Lots from Qty
            const lots = Math.max(1, Math.round(item.qty / lSize));
            setModLots(lots.toString());

            setModalMode('MODIFY_ORDER');
            setModalVisible(true);
            return;
        }
        showAlert(
            "Cancel Order",
            `Are you sure you want to cancel the order for ${item.symbol}?`,
            [
                { text: "No", style: "cancel" },
                {
                    text: "Yes, Cancel",
                    style: 'destructive',
                    onPress: async () => {
                        setLoading(true);
                        const result = await OrderService.cancelOrder(item.id, selectedAccount);
                        if (result.success) {
                            showAlert("Success", "Order Cancelled Successfully", [], "success");
                            fetchData(); // Refresh list
                        } else {
                            showAlert("Error", result.error, [], "error");
                        }
                        setLoading(false);
                    }
                }
            ],
            "warning"
        );
    };

    const handleAddSLTP = (item) => {
        setSelectedItem(item);
        setModSL(item.sl ? item.sl.toString() : '');
        setModTP(item.tp ? item.tp.toString() : '');
        setModalMode('ADD_SLTP');
        setModalVisible(true);
    };

    const submitModification = async () => {
        if (!selectedItem || !selectedAccount) return;

        setLoading(true);
        try {
            if (modalMode === 'MODIFY_ORDER') {
                const newPrice = parseFloat(modPrice);
                const lots = parseInt(modLots);

                if (isNaN(newPrice) || isNaN(lots) || newPrice <= 0 || lots <= 0) {
                    throw "Invalid Price or Quantity";
                }

                const newQty = lots * currentLotSize;

                const res = await OrderService.modifyPendingOrder(selectedItem.id, newPrice, newQty, selectedAccount);
                if (res.success) {
                    showAlert("Success", "Order Modified Successfully", [], "success");
                    setModalVisible(false);
                    fetchData();
                } else {
                    throw res.error;
                }
            } else if (modalMode === 'ADD_SLTP') {
                const slVal = modSL ? parseFloat(modSL) : null;
                const tpVal = modTP ? parseFloat(modTP) : null;

                const res = await OrderService.updatePositionSLTP(selectedAccount, selectedItem.id, slVal, tpVal);
                if (res.success) {
                    showAlert("Success", "SL/TP Updated", [], "success");
                    setModalVisible(false);
                    fetchData();
                } else {
                    throw res.error;
                }
            }
        } catch (error) {
            showAlert("Error", error.toString(), [], "error");
        } finally {
            setLoading(false);
        }
    };

    const dynamicStyles = styles(colors);

    const renderContent = () => {
        if (loading && !refreshing && positions.length === 0 && trades.length === 0 && orders.length === 0) {
            return (
                <View style={dynamicStyles.center}>
                    <Text style={{ color: colors.subText }}>Loading...</Text>
                </View>
            );
        }

        if (activeTab === 'POSITIONS') {
            if (positions.length === 0) return <View style={dynamicStyles.center}><Text style={{ color: colors.subText }}>No Open Positions</Text></View>;
            return (
                <FlatList
                    data={positions}
                    renderItem={({ item }) => <PositionCard item={item} onExit={handleExitPosition} onAddSLTP={handleAddSLTP} colors={colors} />}
                    keyExtractor={item => item.id}
                    contentContainerStyle={dynamicStyles.listContent}
                />
            );
        }

        if (activeTab === 'HISTORY') {
            if (trades.length === 0) return <View style={dynamicStyles.center}><Text style={{ color: colors.subText }}>No Closed Trades</Text></View>;
            return (
                <FlatList
                    data={trades}
                    renderItem={({ item }) => <HistoryCard item={item} colors={colors} />}
                    keyExtractor={item => item.id}
                    contentContainerStyle={dynamicStyles.listContent}
                />
            );
        }

        if (activeTab === 'ORDERS') {
            if (orders.length === 0) return <View style={dynamicStyles.center}><Text style={{ color: colors.subText }}>No Orders Found</Text></View>;
            return (
                <FlatList
                    data={orders}
                    renderItem={({ item }) => <OrderCard item={item} onCancel={handleCancelOrder} colors={colors} />}
                    keyExtractor={item => item.id}
                    contentContainerStyle={dynamicStyles.listContent}
                />
            );
        }
    };

    return (
        <SafeAreaView style={dynamicStyles.container}>
            <View style={dynamicStyles.header}>
                <Text style={dynamicStyles.screenTitle}>Portfolio</Text>

                {!selectedAccount && (
                    <Text style={{ color: colors.danger, marginBottom: 8 }}>Please select an account in Account Tab</Text>
                )}

                <View style={dynamicStyles.totalPnlContainer}>
                    <Text style={dynamicStyles.totalPnlLabel}>{displayLabel}</Text>
                    {activeTab !== 'ORDERS' && (
                        <Text style={[dynamicStyles.totalPnlValue, { color: displayPnl >= 0 ? colors.success : colors.danger }]}>
                            {displayPnl < 0 ? '-' : (displayPnl > 0 ? '+' : '')}₹{Math.abs(displayPnl).toFixed(2)}
                        </Text>
                    )}
                    {lastUpdated && (
                        <Text style={dynamicStyles.lastUpdatedText}>Updated: {lastUpdated.toLocaleTimeString()}</Text>
                    )}
                </View>
                <TouchableOpacity onPress={fetchData} style={dynamicStyles.refreshButton}>
                    <Text style={dynamicStyles.refreshText}>{loading ? '...' : 'Refresh'}</Text>
                </TouchableOpacity>
            </View>

            {/* Tab Search Control */}
            <View style={dynamicStyles.tabContainer}>
                <TouchableOpacity
                    style={[dynamicStyles.tab, activeTab === 'POSITIONS' && dynamicStyles.activeTab]}
                    onPress={() => setActiveTab('POSITIONS')}
                >
                    <Text style={[dynamicStyles.tabText, activeTab === 'POSITIONS' && dynamicStyles.activeTabText]}>Positions</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[dynamicStyles.tab, activeTab === 'ORDERS' && dynamicStyles.activeTab]}
                    onPress={() => setActiveTab('ORDERS')}
                >
                    <Text style={[dynamicStyles.tabText, activeTab === 'ORDERS' && dynamicStyles.activeTabText]}>Orders</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[dynamicStyles.tab, activeTab === 'HISTORY' && dynamicStyles.activeTab]}
                    onPress={() => setActiveTab('HISTORY')}
                >
                    <Text style={[dynamicStyles.tabText, activeTab === 'HISTORY' && dynamicStyles.activeTabText]}>PnL</Text>
                </TouchableOpacity>
            </View>

            {renderContent()}

            {/* Modification Modal */}
            <Modal
                transparent={true}
                visible={modalVisible}
                animationType="slide"
                onRequestClose={() => setModalVisible(false)}
            >
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                    <View style={styles(colors).modalOverlay}>
                        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles(colors).modalContent}>
                            <Text style={styles(colors).modalTitle}>
                                {modalMode === 'MODIFY_ORDER' ? 'Modify Order' : 'Update SL/TP'}
                            </Text>

                            {/* Info */}
                            <Text style={{ color: colors.subText, marginBottom: 12 }}>
                                {selectedItem?.symbol} {selectedItem?.type}
                            </Text>

                            {modalMode === 'MODIFY_ORDER' ? (
                                <>
                                    <Text style={styles(colors).inputLabel}>Price</Text>
                                    <TextInput
                                        style={styles(colors).input}
                                        value={modPrice}
                                        onChangeText={setModPrice}
                                        keyboardType="numeric"
                                        placeholder="Order Price"
                                        placeholderTextColor={colors.subText}
                                    />

                                    <Text style={styles(colors).inputLabel}>Quantity (Lots)</Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                        <TouchableOpacity
                                            style={[styles(colors).qtyBtn, { width: 40, height: 40 }]}
                                            onPress={() => setModLots(String(Math.max(1, parseInt(modLots) - 1)))}
                                        >
                                            <Text style={styles(colors).qtyBtnText}>-</Text>
                                        </TouchableOpacity>

                                        <View style={{ flex: 1 }}>
                                            <TextInput
                                                style={[styles(colors).input, { textAlign: 'center' }]}
                                                value={modLots}
                                                onChangeText={t => setModLots(parseInt(t) || 1)}
                                                keyboardType="numeric"
                                            />
                                            <Text style={{ textAlign: 'center', color: colors.subText, fontSize: 10, marginTop: 4 }}>
                                                = {parseInt(modLots || 0) * currentLotSize} Qty
                                            </Text>
                                        </View>

                                        <TouchableOpacity
                                            style={[styles(colors).qtyBtn, { width: 40, height: 40 }]}
                                            onPress={() => setModLots(String(parseInt(modLots || 0) + 1))}
                                        >
                                            <Text style={styles(colors).qtyBtnText}>+</Text>
                                        </TouchableOpacity>
                                    </View>
                                </>
                            ) : (
                                <>
                                    <Text style={styles(colors).inputLabel}>Stop Loss (SL) Price</Text>
                                    <TextInput
                                        style={styles(colors).input}
                                        value={modSL}
                                        onChangeText={setModSL}
                                        keyboardType="numeric"
                                        placeholder="Leave empty to remove"
                                        placeholderTextColor={colors.subText}
                                    />

                                    <Text style={styles(colors).inputLabel}>Take Profit (TP) Price</Text>
                                    <TextInput
                                        style={styles(colors).input}
                                        value={modTP}
                                        onChangeText={setModTP}
                                        keyboardType="numeric"
                                        placeholder="Leave empty to remove"
                                        placeholderTextColor={colors.subText}
                                    />
                                </>
                            )}

                            <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
                                <TouchableOpacity
                                    style={[styles(colors).button, { backgroundColor: colors.subText }]}
                                    onPress={() => setModalVisible(false)}
                                >
                                    <Text style={styles(colors).buttonText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles(colors).button, { backgroundColor: colors.primary }]}
                                    onPress={submitModification}
                                >
                                    <Text style={styles(colors).buttonText}>Confirm</Text>
                                </TouchableOpacity>
                            </View>
                        </KeyboardAvoidingView>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
        </SafeAreaView>
    );
}

const styles = (colors) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        padding: 16,
        paddingBottom: 24,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.header,
    },
    screenTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: 16,
    },
    totalPnlContainer: {
        alignItems: 'center',
    },
    totalPnlLabel: {
        color: colors.subText,
        fontSize: 14,
        marginBottom: 4,
    },
    totalPnlValue: {
        fontSize: 32,
        fontWeight: 'bold',
    },
    lastUpdatedText: {
        color: colors.subText,
        fontSize: 10,
        marginTop: 4,
    },
    refreshButton: {
        position: 'absolute',
        right: 16,
        top: 16,
        backgroundColor: colors.cardBorder,
        padding: 8,
        borderRadius: 8,
    },
    refreshText: {
        color: colors.text,
        fontSize: 12,
    },
    listContent: {
        padding: 16,
    },
    card: {
        backgroundColor: colors.card,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.cardBorder,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    cardFooter: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderColor: colors.border,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    symbolText: {
        color: colors.text,
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    statusText: {
        color: colors.subText,
        fontSize: 12,
        fontWeight: '600',
        backgroundColor: colors.border,
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    typeTag: {
        fontSize: 12,
        fontWeight: 'bold',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        marginRight: 8
    },
    productTag: {
        fontSize: 10,
        fontWeight: 'bold',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        overflow: 'hidden',
        alignSelf: 'center'
    },
    pnlContainer: {
        alignItems: 'flex-end',
    },
    pnlValue: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    pnlLabel: {
        color: colors.subText,
        fontSize: 10,
        marginTop: 2,
        marginBottom: 0
    },
    cardDetails: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    detailRow: {
        alignItems: 'center',
    },
    detailLabel: {
        color: colors.subText,
        fontSize: 12,
        marginBottom: 4,
    },
    detailValue: {
        color: colors.text,
        fontSize: 14,
        fontWeight: '600',
    },
    tabContainer: {
        flexDirection: 'row',
        padding: 16,
        gap: 8
    },
    tab: {
        flex: 1,
        paddingVertical: 10,
        backgroundColor: colors.card,
        borderRadius: 8,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.cardBorder
    },
    activeTab: {
        backgroundColor: colors.border,
        borderColor: colors.success
    },
    tabText: {
        color: colors.subText,
        fontWeight: 'bold',
        fontSize: 12
    },
    activeTabText: {
        color: colors.text
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center'
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        padding: 24
    },
    modalContent: {
        backgroundColor: colors.card,
        borderRadius: 16,
        padding: 24,
        borderWidth: 1,
        borderColor: colors.border
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: 8
    },
    inputLabel: {
        color: colors.subText,
        fontSize: 12,
        marginTop: 12,
        marginBottom: 4
    },
    input: {
        backgroundColor: colors.background,
        color: colors.text,
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        fontSize: 16
    },
    button: {
        flex: 1,
        padding: 14,
        borderRadius: 8,
        alignItems: 'center'
    },
    buttonText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16
    },
    qtyBtn: {
        backgroundColor: colors.inputBg,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.border
    },
    qtyBtnText: {
        color: colors.text,
        fontSize: 24
    }
});
