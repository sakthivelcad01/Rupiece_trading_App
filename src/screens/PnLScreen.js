import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { MarketService } from '../services/MarketService';
import { OrderService } from '../services/OrderService';
import { useTheme } from '../context/ThemeContext';

import { useAlert } from '../context/AlertContext';

const PositionCard = ({ item, onExit, colors }) => {
    const isOpen = item.status === 'OPEN';
    const pnl = (item.ltp - item.avgPrice) * item.qty;

    return (
        <View style={styles(colors).card}>
            <View style={styles(colors).cardHeader}>
                <Text style={styles(colors).symbolText}>{item.symbol} {item.strike} {item.type}</Text>
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

            <View style={[styles(colors).cardFooter]}>
                <View>
                    <Text style={styles(colors).detailLabel}>P&L</Text>
                    <Text style={[styles(colors).pnlValue, { color: pnl >= 0 ? colors.success : colors.danger }]}>
                        {pnl < 0 ? '-' : (pnl > 0 ? '+' : '')}₹{Math.abs(pnl).toFixed(2)}
                    </Text>
                </View>

                {isOpen && (
                    <TouchableOpacity
                        style={{ backgroundColor: colors.danger, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}
                        onPress={() => onExit(item)}
                    >
                        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>EXIT</Text>
                    </TouchableOpacity>
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
                    <TouchableOpacity
                        style={{ backgroundColor: colors.subText, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}
                        onPress={() => onCancel(item)}
                    >
                        <Text style={{ color: colors.background, fontWeight: 'bold', fontSize: 10 }}>CANCEL</Text>
                    </TouchableOpacity>
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
    const { selectedAccount } = useAuth();
    const { showAlert } = useAlert();
    const [activeTab, setActiveTab] = useState('POSITIONS');

    const [positions, setPositions] = useState([]);
    const [trades, setTrades] = useState([]);
    const [orders, setOrders] = useState([]);

    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);

    const fetchData = async (silent = false) => {
        if (!selectedAccount) {
            setPositions([]);
            setTrades([]);
            setOrders([]);
            return;
        }

        if (!silent) setLoading(true);
        try {
            const user = require('firebase/auth').getAuth().currentUser; // Direct Access or pass via props if unstable

            if (activeTab === 'POSITIONS') {
                // Auto-Exipry Check Hook
                if (!silent && user) {
                    OrderService.checkAndSquareOffExpiredPositions(selectedAccount, user.uid).catch(console.error);
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
                if (user) {
                    OrderService.checkPendingOrders(selectedAccount, user.uid).catch(console.error);
                }
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
            lotSize: item.lotSize
        });
    };

    const handleCancelOrder = (item) => {
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
                    renderItem={({ item }) => <PositionCard item={item} onExit={handleExitPosition} colors={colors} />}
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
    }
});
