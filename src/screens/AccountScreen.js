import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, Image, Alert, Modal, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useAlert } from '../context/AlertContext';
import { useTheme } from '../context/ThemeContext';
import { doc, getDoc, collection, query, where, getDocs, onSnapshot, or } from 'firebase/firestore';

import { db, auth } from '../../firebaseConfig';
import { Settings, User, LogOut, ChevronDown, Check, AlertTriangle, RefreshCcw } from 'lucide-react-native';
import { MarketService } from '../services/MarketService';
import { OrderService } from '../services/OrderService';
import PnLCalendar from '../components/PnLCalendar';
import { FeatureFlagService } from '../services/FeatureFlagService';

export default function AccountScreen({ navigation }) {
    const { user, selectedAccount, setSelectedAccount, accounts } = useAuth();
    const { showAlert } = useAlert();
    const { colors } = useTheme();

    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const [stats, setStats] = useState({ equity: 0, marginUsed: 0 });

    useEffect(() => {
        const fetchUserData = async () => {
            if (user && auth.currentUser) {
                try {
                    // 1. Fetch User Profile
                    const docRef = doc(db, "rupiecemain", auth.currentUser.uid);
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        setUserData(data);
                    }
                } catch (err) {
                    console.error("Error fetching account data:", err);
                } finally {
                    setLoading(false);
                }
            }
        };
        fetchUserData();
    }, [user]);

    // Account Real-time logic is now in AuthContext, but we still calculate stats here locally
    // Actually, AuthContext updates `selectedAccount` in real-time, so we just use that.

    // Fetch Live Stats (Market Data) based on selectedAccount
    useEffect(() => {
        let isMounted = true;
        const fetchStats = async () => {
            if (!selectedAccount || !auth.currentUser) return;

            try {
                const cash = selectedAccount.currentBalance || 0;
                const invested = selectedAccount.investedAmount || 0;

                // Calculate Equity
                const positions = await OrderService.getPositions(selectedAccount.id);
                let marketValue = 0;

                if (positions.length > 0) {
                    const keys = positions.map(p => p.instrumentKey);
                    const marketData = await MarketService.getQuotes(keys);

                    positions.forEach(p => {
                        const q = marketData[p.instrumentKey];
                        const price = q ? q.last_price : p.avgPrice;
                        marketValue += (price * p.qty);
                    });
                }

                const finalInvested = invested > 0 ? invested : positions.reduce((sum, p) => sum + (p.avgPrice * p.qty), 0);

                if (isMounted) {
                    setStats({
                        equity: cash + marketValue,
                        marginUsed: finalInvested
                    });
                }

            } catch (err) {
                console.error("Stats Fetch Error:", err);
            }
        };

        fetchStats();
        const interval = setInterval(fetchStats, 5000);
        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [selectedAccount]);

    const [perfStats, setPerfStats] = useState({
        winRate: 0,
        lossRate: 0,
        bestDay: 0,
        worstDay: 0,
        tradingDays: 0
    });
    const [allTrades, setAllTrades] = useState([]);

    // Day Detail Modal State
    const [dayModalVisible, setDayModalVisible] = useState(false);
    const [selectedDayData, setSelectedDayData] = useState(null);

    useEffect(() => {
        const calculatePerformance = async () => {
            if (!selectedAccount) return;
            const trades = await OrderService.getTrades(selectedAccount.id);
            setAllTrades(trades);

            if (trades.length === 0) {
                setPerfStats({ winRate: 0, lossRate: 0, bestDay: 0, worstDay: 0, tradingDays: 0 });
                return;
            }

            let wins = 0;
            let losses = 0;
            const dailyPnL = {};

            trades.forEach(trade => {
                const pnl = trade.pnl || 0;
                if (pnl > 0) wins++;
                else if (pnl < 0) losses++;

                // Group by Date for Best/Worst Day
                const date = trade.closedAt?.toDate ? trade.closedAt.toDate().toISOString().split('T')[0] : 'Unknown';
                if (!dailyPnL[date]) dailyPnL[date] = 0;
                dailyPnL[date] += pnl;
            });

            const totalTrades = wins + losses; // Ignoring break-even for Win/Loss split unless desired
            const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
            const lossRate = totalTrades > 0 ? (losses / totalTrades) * 100 : 0;

            const days = Object.values(dailyPnL);
            const bestDay = Math.max(0, ...days);
            const worstDay = Math.min(0, ...days); // Should be negative or 0

            const accountSize = selectedAccount.accountSize || selectedAccount.balance || 0;
            const minDailyProfit = accountSize * 0.005; // 0.5% Threshold

            // Count Valid Trading Days
            let validTradingDaysCount = 0;
            Object.values(dailyPnL).forEach(dayPnl => {
                if (dayPnl >= minDailyProfit) {
                    validTradingDaysCount++;
                }
            });

            setPerfStats({
                winRate,
                lossRate,
                bestDay,
                worstDay,
                tradingDays: validTradingDaysCount
            });
        };

        calculatePerformance();
    }, [selectedAccount]);

    const handleSelectAccount = (account) => {
        const status = (account.status || "ongoing").toLowerCase();

        // Check Feature Flag
        const isPhase1 = !account.isCompetition && account.phase !== 'Competition';
        if (isPhase1 && !FeatureFlagService.isPhase1Enabled()) {
            showAlert("Coming Soon", "Phase 1 trading will be online soon! Please select a Competition account to trade for now.", [], "info");
            return;
        }

        if (status === 'passed' || status === 'failed') {
            showAlert("Account Locked", `This account is ${status} and cannot be selected for trading.`, [], "error");
            return;
        }
        setSelectedAccount(account);
        setIsDropdownOpen(false);
    };

    const handleDayPress = (dateKey, data) => {
        setSelectedDayData({ date: dateKey, ...data });
        setDayModalVisible(true);
    };

    const styles = getStyles(colors);

    return (
        <SafeAreaView style={styles.container}>
            <View style={[styles.header, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                <Text style={styles.screenTitle}>Account</Text>
                <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
                    <Settings size={24} color={colors.text} />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.profileCard}>
                    <View style={styles.avatar}>
                        <User size={40} color={colors.success} />
                    </View>
                    <View style={styles.info}>
                        <Text style={styles.label}>Name</Text>
                        {loading ? (
                            <ActivityIndicator size="small" color="#888" />
                        ) : (
                            <Text style={styles.value}>
                                {userData?.fullName || userData?.fullname || userData?.name || "User"}
                            </Text>
                        )}

                        <Text style={[styles.label, { marginTop: 12 }]}>Email</Text>
                        <Text style={styles.value}>{user?.email}</Text>
                    </View>
                </View>

                {/* Account Status Banner */}
                {selectedAccount && stats.equity > 0 && (
                    <View style={{ marginBottom: 16 }}>
                        {(() => {
                            const size = selectedAccount.accountSize || selectedAccount.balance;
                            const isCompetition = selectedAccount.isCompetition || selectedAccount.phase === 'Competition';
                            // 10% (0.90) for Competition, 8% (0.92) for Standard
                            const maxLossPct = isCompetition ? 0.90 : 0.92;
                            const profitTargetPct = 1.15; // 15%

                            if (stats.equity < (size * maxLossPct)) {
                                return (
                                    <View>
                                        <View style={[styles.statusBanner, { backgroundColor: '#ef444420', borderColor: '#ef4444' }]}>
                                            <Text style={[styles.statusTitle, { color: '#ef4444' }]}>⛔ Trading Blocked</Text>
                                            <Text style={[styles.statusMsg, { color: '#ef4444' }]}>
                                                Max Loss Limit Reached (Below {isCompetition ? '90' : '92'}% Equity).
                                            </Text>
                                        </View>
                                    </View>
                                );
                            } else if (stats.equity < (size * (isCompetition ? 0.915 : 0.935))) {
                                // Dynamic Warning Threshold (1.5% buffer)
                                return (
                                    <View style={{
                                        backgroundColor: '#EA580C', // Dark Orange
                                        borderRadius: 12,
                                        padding: 16,
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        shadowColor: "#EA580C",
                                        shadowOffset: { width: 0, height: 4 },
                                        shadowOpacity: 0.3,
                                        shadowRadius: 8,
                                        elevation: 5,
                                        borderWidth: 1,
                                        borderColor: '#fff'
                                    }}>
                                        <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: 10, borderRadius: 50, marginRight: 16 }}>
                                            <AlertTriangle size={32} color="#fff" fill="white" />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 4 }}>HIGH RISK WARNING</Text>
                                            <Text style={{ color: '#fed7aa', fontSize: 14, fontWeight: '600' }}>
                                                Loss approaching Max Loss Limit.
                                            </Text>
                                            <Text style={{ color: '#fff', fontSize: 12, marginTop: 4, fontStyle: 'italic' }}>
                                                Caution: Reduce risk to avoid failure.
                                            </Text>
                                        </View>
                                    </View>
                                );
                            } else if (!isCompetition && stats.equity >= (size * profitTargetPct)) {
                                // Only show Pass banner if NOT competition (assuming comps don't "Pass" but just Rank)
                                return (
                                    <View>
                                        <View style={[styles.statusBanner, { backgroundColor: '#22c55e20', borderColor: '#22c55e' }]}>
                                            <Text style={[styles.statusTitle, { color: '#22c55e' }]}>🎉 Account Passed!</Text>
                                            <Text style={[styles.statusMsg, { color: '#22c55e' }]}>
                                                Congratulations! You've hit the 15% Profit Target.
                                            </Text>
                                        </View>
                                    </View>
                                );
                            }
                            return null;
                        })()}
                    </View>
                )}

                {/* Account Section */}
                <View style={styles.accountsSection}>
                    <Text style={styles.sectionHeader}>Active Trading Account</Text>

                    {/* Wrapper for Z-Index Context */}
                    <View style={{ zIndex: 1000 }}>
                        <TouchableOpacity
                            styles={[styles.accountCard, styles.selectedCard]}
                            style={[styles.accountCard, styles.selectedCard]}
                            onPress={() => setIsDropdownOpen(!isDropdownOpen)}
                        >
                            <View style={styles.accountInfo}>
                                {selectedAccount ? (
                                    <>
                                        <View style={styles.row}>
                                            <Text style={styles.accountName}>
                                                {selectedAccount.name || selectedAccount.planName || "Challenge Account"}
                                            </Text>
                                            {accounts.length > 1 && (
                                                <ChevronDown size={20} color={colors.subText} style={{ marginLeft: 8 }} />
                                            )}
                                        </View>
                                        <Text style={styles.accountId}>ID: {selectedAccount.id}</Text>
                                        <Text style={styles.accountStatus}>{selectedAccount.status || "Active"}</Text>
                                    </>
                                ) : (
                                    <Text style={styles.noAccountText}>
                                        "No active account selected"
                                    </Text>
                                )}
                            </View>
                        </TouchableOpacity>

                        {/* Dropdown (Absolute Overlay) */}
                        {isDropdownOpen && accounts.length > 0 && (
                            <View style={styles.dropdownList}>
                                {accounts.map((challenge) => {
                                    const isPhase1 = !challenge.isCompetition && challenge.phase !== 'Competition';
                                    // Disable if it IS Phase 1 AND Flag is FALSE
                                    const isRestricted = isPhase1 && !FeatureFlagService.isPhase1Enabled();
                                    const isDisabled = ['passed', 'failed'].includes((challenge.status || '').toLowerCase()) || isRestricted;
                                    return (
                                        <TouchableOpacity
                                            key={challenge.id}
                                            style={[
                                                styles.dropdownItem,
                                                selectedAccount?.id === challenge.id && styles.activeDropdownItem,
                                                isDisabled && { opacity: 0.5 }
                                            ]}
                                            onPress={() => handleSelectAccount(challenge)}
                                        >
                                            <View>
                                                <Text style={styles.dropdownItemName}>
                                                    {challenge.name || challenge.planName || "Account"}
                                                </Text>
                                                <Text style={styles.dropdownItemId}>
                                                    ID: {challenge.id} • {challenge.status || 'Active'}
                                                </Text>
                                            </View>
                                            {selectedAccount?.id === challenge.id && (
                                                <View style={styles.activeDot} />
                                            )}
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        )}
                    </View>

                    {/* Stats */}
                    {selectedAccount && (
                        <View style={styles.statsRow}>
                            <View style={[styles.statItem, styles.statBorder]}>
                                <Text style={styles.statLabel}>BALANCE</Text>
                                <Text style={styles.statValue}>₹{selectedAccount.currentBalance?.toFixed(0)}</Text>
                            </View>
                            <View style={[styles.statItem, styles.statBorder]}>
                                <Text style={styles.statLabel}>EQUITY</Text>
                                <Text style={[styles.statValue, { color: stats.equity > selectedAccount.currentBalance ? colors.success : (stats.equity < selectedAccount.currentBalance ? colors.danger : colors.text) }]}>
                                    ₹{stats && stats.equity ? stats.equity.toFixed(0) : (selectedAccount.currentBalance || 0).toFixed(0)}
                                </Text>
                            </View>
                            <View style={styles.statItem}>
                                <Text style={styles.statLabel}>USED MARGIN</Text>
                                <Text style={styles.statValue}>₹{stats && stats.marginUsed ? stats.marginUsed.toFixed(0) : '0'}</Text>
                            </View>
                        </View>
                    )}
                </View>

                {/* Account Objectives */}
                {
                    selectedAccount && (
                        <View style={{ marginTop: 24 }}>
                            <Text style={styles.sectionHeader}>Account Objectives</Text>
                            <View style={styles.objectivesCard}>

                                {/* Objectives Logic */}
                                {(() => {
                                    const size = selectedAccount.accountSize || selectedAccount.balance;
                                    const equity = stats.equity || size;
                                    const isCompetition = selectedAccount.isCompetition || selectedAccount.phase === 'Competition';

                                    const maxLossPct = isCompetition ? 0.10 : 0.08; // 10% vs 8% Loss
                                    const maxLossAmount = size * maxLossPct;
                                    const maxLossThreshold = size * (1 - maxLossPct);

                                    const currentLoss = size - equity;
                                    // Visual bar: filled as we approach max loss
                                    // If loss = 0, pct = 0. If loss = max, pct = 1.
                                    const lossBarPwd = Math.min(Math.max(currentLoss / maxLossAmount, 0), 1);

                                    // Profit Bar
                                    const targetProfit = size * 0.15;
                                    const currentProfit = Math.max(0, equity - size);
                                    const profitBarPwd = Math.min(currentProfit / targetProfit, 1);

                                    return (
                                        <>
                                            {/* Profit Target Row - HIDDEN FOR COMPETITIONS */}
                                            {!isCompetition && (
                                                <View style={{ marginBottom: 20, flexDirection: 'row', alignItems: 'center' }}>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={styles.perfLabel}>Profit Target</Text>
                                                        <Text style={[styles.perfValue, { color: colors.success }]}>
                                                            ₹{(size * 1.15).toFixed(0)}
                                                        </Text>
                                                    </View>
                                                    <View style={{ flex: 1.5, paddingLeft: 12 }}>
                                                        <View style={{ flexDirection: 'row', height: 10 }}>
                                                            {[0, 1, 2, 3, 4].map(i => (
                                                                <View key={i} style={{ flex: 1, marginRight: 4, borderRadius: 6, backgroundColor: profitBarPwd > (i * 0.2) ? colors.success : colors.card, borderWidth: 1, borderColor: colors.success, opacity: profitBarPwd > (i * 0.2) ? 1 : 0.3 }} />
                                                            ))}
                                                        </View>
                                                    </View>
                                                </View>
                                            )}

                                            {/* Max Loss Row */}
                                            <View style={{ marginBottom: 20, flexDirection: 'row', alignItems: 'center' }}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.perfLabel}>Max Loss ({isCompetition ? '10%' : '8%'})</Text>
                                                    <Text style={[styles.perfValue, { color: colors.danger }]}>
                                                        ₹{maxLossThreshold.toFixed(0)}
                                                    </Text>
                                                </View>
                                                <View style={{ flex: 1.5, paddingLeft: 12 }}>
                                                    <View style={{ flexDirection: 'row', height: 10 }}>
                                                        {[0, 1, 2, 3, 4].map(i => (
                                                            <View key={i} style={{ flex: 1, marginRight: 4, borderRadius: 6, backgroundColor: lossBarPwd > (i * 0.2) ? colors.danger : colors.card, borderWidth: 1, borderColor: colors.danger, opacity: lossBarPwd > (i * 0.2) ? 1 : 0.3 }} />
                                                        ))}
                                                    </View>
                                                </View>
                                            </View>
                                        </>
                                    );
                                })()}

                                {/* Min Trading Days Row */}
                                <View style={{ marginBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.perfLabel}>Min Days (5)</Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                                            <Text style={[styles.perfValue, { color: perfStats.tradingDays >= 5 ? colors.success : colors.text }]}>
                                                {perfStats.tradingDays}
                                            </Text>
                                            <Text style={{ fontSize: 14, color: colors.subText, marginLeft: 4 }}>/ 5</Text>
                                        </View>
                                        <Text style={{ fontSize: 10, color: colors.subText, marginTop: 2 }}>Profit &gt; 0.5%</Text>
                                    </View>
                                    <View style={{ flex: 1.5, paddingLeft: 12 }}>
                                        {(() => {
                                            const currentDays = perfStats.tradingDays;
                                            return (
                                                <View style={{ flexDirection: 'row', height: 10 }}>
                                                    {[0, 1, 2, 3, 4].map(i => (
                                                        <View key={i} style={{ flex: 1, marginRight: 4, borderRadius: 6, backgroundColor: currentDays > i ? colors.success : colors.card, borderWidth: 1, borderColor: colors.success, opacity: currentDays > i ? 1 : 0.3 }} />
                                                    ))}
                                                </View>
                                            );
                                        })()}
                                    </View>
                                </View>
                            </View>

                            {/* Performance Grid */}
                            <View style={styles.perfGrid}>
                                <View style={styles.perfItem}>
                                    <Text style={styles.perfLabel}>Win %</Text>
                                    <Text style={[styles.perfValue, { color: colors.success }]}>{perfStats.winRate.toFixed(1)}%</Text>
                                </View>
                                <View style={styles.perfItem}>
                                    <Text style={styles.perfLabel}>Highest Profit Day</Text>
                                    <Text style={[styles.perfValue, { color: colors.success }]}>₹{perfStats.bestDay.toFixed(0)}</Text>
                                </View>
                                <View style={styles.perfItem}>
                                    <Text style={styles.perfLabel}>Loss %</Text>
                                    <Text style={[styles.perfValue, { color: colors.danger }]}>{perfStats.lossRate.toFixed(1)}%</Text>
                                </View>
                                <View style={styles.perfItem}>
                                    <Text style={styles.perfLabel}>Highest Loss Day</Text>
                                    <Text style={[styles.perfValue, { color: colors.danger }]}>₹{Math.abs(perfStats.worstDay).toFixed(0)}</Text>
                                </View>
                            </View>
                        </View>
                    )
                }

                {/* PnL Calendar */}
                {
                    selectedAccount && allTrades.length > 0 && (
                        <View style={{ marginTop: 24, marginBottom: 40 }}>
                            <Text style={styles.sectionHeader}>PnL Calendar</Text>
                            <PnLCalendar trades={allTrades} colors={colors} onDayPress={handleDayPress} />
                        </View>
                    )
                }

            </ScrollView >

            {/* Day Details Modal */}
            < Modal
                animationType="slide"
                transparent={true}
                visible={dayModalVisible}
                onRequestClose={() => setDayModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <View>
                                <Text style={styles.modalTitle}>Trading Journal</Text>
                                <Text style={styles.modalSubtitle}>{selectedDayData?.date}</Text>
                            </View>
                            <TouchableOpacity onPress={() => setDayModalVisible(false)} style={styles.closeBtn}>
                                <Text style={styles.closeBtnText}>Close</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.modalSummary}>
                            <Text style={styles.summaryLabel}>Net PnL</Text>
                            <Text style={[styles.summaryValue, { color: (selectedDayData?.pnl || 0) >= 0 ? colors.success : colors.danger }]}>
                                {(selectedDayData?.pnl || 0) >= 0 ? '+' : ''}₹{Math.round(selectedDayData?.pnl || 0)}
                            </Text>
                        </View>

                        <ScrollView style={styles.tradesList}>
                            {selectedDayData?.trades?.map((trade, index) => (
                                <View key={index} style={styles.tradeRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.tradeSymbol}>{trade.symbol}</Text>
                                        <Text style={styles.tradeTime}>
                                            {trade.closedAt?.toDate ? trade.closedAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '00:00'}
                                        </Text>
                                    </View>
                                    <View>
                                        <Text style={[styles.tradePnl, { color: trade.pnl >= 0 ? colors.success : colors.danger }]}>
                                            {trade.pnl >= 0 ? '+' : ''}{Math.round(trade.pnl)}
                                        </Text>
                                        <Text style={styles.productTag}>{trade.optionType || 'FUT'}</Text>
                                    </View>
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal >
        </SafeAreaView >
    );
}

const getStyles = (colors) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.header },
    screenTitle: { fontSize: 24, fontWeight: 'bold', color: colors.text },
    content: { padding: 20 },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: colors.card,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 24,
        maxHeight: '80%'
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 20
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: colors.text
    },
    modalSubtitle: {
        fontSize: 14,
        color: colors.subText,
        marginTop: 4
    },
    closeBtn: {
        padding: 8,
        backgroundColor: colors.background,
        borderRadius: 8
    },
    closeBtnText: {
        color: colors.text,
        fontWeight: 'bold'
    },
    modalSummary: {
        alignItems: 'center',
        marginBottom: 24,
        padding: 16,
        backgroundColor: colors.background,
        borderRadius: 12
    },
    summaryLabel: {
        fontSize: 12,
        color: colors.subText,
        textTransform: 'uppercase',
        marginBottom: 4
    },
    summaryValue: {
        fontSize: 32,
        fontWeight: 'bold'
    },
    tradesList: {
        maxHeight: 400
    },
    tradeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border
    },
    tradeSymbol: {
        fontSize: 16,
        fontWeight: 'bold',
        color: colors.text
    },
    tradeTime: {
        fontSize: 12,
        color: colors.subText,
        marginTop: 2
    },
    tradePnl: {
        fontSize: 16,
        fontWeight: 'bold',
        textAlign: 'right'
    },
    productTag: {
        fontSize: 10,
        color: colors.subText,
        textAlign: 'right',
        marginTop: 2
    },
    profileCard: {
        backgroundColor: colors.card,
        padding: 24,
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
        borderWidth: 1,
        borderColor: colors.cardBorder
    },
    avatar: {
        width: 70,
        height: 70,
        borderRadius: 35,
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 20
    },
    info: { flex: 1 },
    label: { color: colors.subText, fontSize: 12, textTransform: 'uppercase', marginBottom: 4 },
    value: { color: colors.text, fontSize: 18, fontWeight: 'bold' },

    accountsSection: { marginTop: 8 },
    sectionHeader: { color: colors.text, fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
    accountCard: {
        backgroundColor: colors.card,
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    accountInfo: { flex: 1 },
    accountName: { color: colors.text, fontSize: 16, fontWeight: 'bold' },
    accountId: { color: colors.subText, fontSize: 12, marginTop: 4 },
    accountStatus: { color: colors.success, fontSize: 12, marginTop: 4, fontWeight: 'bold', textTransform: 'uppercase' },
    accountBalance: { alignItems: 'flex-end' },
    balanceLabel: { color: colors.subText, fontSize: 12 },
    balanceValue: { color: colors.text, fontSize: 16, fontWeight: 'bold', marginTop: 2 },
    noAccounts: { color: colors.subText, textAlign: 'center', marginTop: 12 },
    selectedCard: { borderColor: colors.success, backgroundColor: colors.card },
    noAccountText: { color: colors.subText, fontStyle: 'italic' },
    row: { flexDirection: 'row', alignItems: 'center' },
    dropdownList: {
        position: 'absolute', // FLOAT
        top: '100%', // Appear right below the wrapping View (Card)
        left: 0,
        right: 0,
        zIndex: 2000,
        backgroundColor: colors.header, // Dropdown slightly distinguished
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        marginTop: 4,
        padding: 4,
        // Shadow for "Popup" effect
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 4.65,
        elevation: 8,
    },
    dropdownHeader: {
        color: colors.subText,
        fontSize: 12,
        padding: 8,
        textTransform: 'uppercase'
    },
    dropdownItem: {
        padding: 12,
        borderRadius: 8,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4
    },
    activeDropdownItem: {
        backgroundColor: colors.activeItem
    },
    dropdownItemName: { color: colors.text, fontWeight: 'bold' },
    dropdownItemId: { color: colors.subText, fontSize: 10 },
    activeDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.success
    },
    statsRow: {
        flexDirection: 'row',
        backgroundColor: colors.card,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    statItem: { alignItems: 'center', flex: 1 },
    statLabel: { color: colors.subText, fontSize: 10, textTransform: 'uppercase', marginBottom: 4 },
    statValue: { color: colors.text, fontSize: 16, fontWeight: 'bold' },
    statDivider: { width: 1, height: 24, backgroundColor: colors.border },
    perfGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        backgroundColor: colors.card,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.cardBorder
    },
    perfItem: {
        width: '50%',
        marginBottom: 16
    },
    perfLabel: {
        color: colors.subText,
        fontSize: 12,
        marginBottom: 4
    },
    perfValue: {
        color: colors.text,
        fontSize: 18,
        fontWeight: 'bold'
    },
    statusBanner: {
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center'
    },
    statusTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 4,
        textAlign: 'center'
    },
    statusMsg: {
        fontSize: 14,
        textAlign: 'center',
        fontWeight: '500'
    },
    resetButton: {
        marginTop: 12,
        backgroundColor: '#ef4444',
        paddingVertical: 12,
        borderRadius: 8,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center'
    },
    resetButtonText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14
    }
});
