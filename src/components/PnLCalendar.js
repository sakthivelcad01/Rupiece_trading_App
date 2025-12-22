import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';

const PnLCalendar = ({ trades, colors, onDayPress }) => {
    const [currentDate, setCurrentDate] = useState(new Date());

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    // 1. Process Trades into Daily PnL Map
    const dailyData = useMemo(() => {
        const map = {};
        trades.forEach(trade => {
            if (!trade.closedAt) return;

            // Handle Firestore Timestamp or Date object
            const dateObj = trade.closedAt.toDate ? trade.closedAt.toDate() : new Date(trade.closedAt);
            const dateKey = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD

            if (!map[dateKey]) {
                map[dateKey] = { pnl: 0, count: 0, trades: [] };
            }
            map[dateKey].pnl += (trade.pnl || 0);
            map[dateKey].count += 1;
            map[dateKey].trades.push(trade);
        });
        return map;
    }, [trades]);

    // 2. Generate Calendar Grid
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 = Sunday

    const grid = [];
    let dayCounter = 1;

    // 6 rows max to cover all months
    for (let i = 0; i < 6; i++) {
        const row = [];
        for (let j = 0; j < 7; j++) {
            if (i === 0 && j < firstDayOfMonth) {
                row.push(null); // Empty slot before start of month
            } else if (dayCounter > daysInMonth) {
                row.push(null); // Empty slot after end of month
            } else {
                row.push(dayCounter);
                dayCounter++;
            }
        }
        grid.push(row);
        if (dayCounter > daysInMonth) break;
    }

    const handlePrevMonth = () => {
        setCurrentDate(new Date(year, month - 1, 1));
    };

    const handleNextMonth = () => {
        setCurrentDate(new Date(year, month + 1, 1));
    };

    const styles = getStyles(colors);

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={handlePrevMonth} style={styles.navBtn}>
                    <ChevronLeft size={20} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.monthTitle}>{monthNames[month]} {year}</Text>
                <TouchableOpacity onPress={handleNextMonth} style={styles.navBtn}>
                    <ChevronRight size={20} color={colors.text} />
                </TouchableOpacity>
            </View>

            {/* Weekday Headers */}
            <View style={styles.gridRow}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
                    <Text key={i} style={styles.dayHeader}>{d}</Text>
                ))}
            </View>

            {/* Days Grid */}
            {grid.map((row, rowIndex) => (
                <View key={rowIndex} style={styles.gridRow}>
                    {row.map((day, colIndex) => {
                        if (!day) return <View key={colIndex} style={styles.dayCell} />;

                        // Construct Date Key: YYYY-MM-DD
                        // Ensure padding for month/day
                        const m = (month + 1).toString().padStart(2, '0');
                        const d = day.toString().padStart(2, '0');
                        const dateKey = `${year}-${m}-${d}`;

                        const data = dailyData[dateKey];
                        const pnl = data ? data.pnl : 0;
                        const hasTraaded = !!data;
                        const isProfit = pnl >= 0;

                        // Style logic
                        let cellBg = 'transparent';
                        if (hasTraaded) {
                            cellBg = isProfit ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)';
                        }

                        // Today Highlight
                        const todayStr = new Date().toISOString().split('T')[0];
                        const isToday = dateKey === todayStr;

                        return (
                            <TouchableOpacity
                                key={colIndex}
                                style={[
                                    styles.dayCell,
                                    { backgroundColor: cellBg },
                                    isToday && { borderWidth: 1, borderColor: colors.primary }
                                ]}
                                onPress={() => hasTraaded ? onDayPress(dateKey, data) : null}
                                disabled={!hasTraaded}
                            >
                                <Text style={[styles.dayNum, { opacity: hasTraaded ? 1 : 0.5 }]}>{day}</Text>
                                {hasTraaded && (
                                    <View style={{ alignItems: 'center' }}>
                                        <Text style={[styles.pnlText, { color: isProfit ? colors.success : colors.danger }]}>
                                            {pnl >= 0 ? '+' : ''}{Math.round(pnl)}
                                        </Text>
                                        <Text style={[styles.countText, { color: colors.subText }]}>{data.count} Trds</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>
            ))}
        </View>
    );
};

const getStyles = (colors) => StyleSheet.create({
    container: {
        backgroundColor: colors.card,
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        marginVertical: 16
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12
    },
    monthTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: colors.text
    },
    navBtn: {
        padding: 8,
        borderRadius: 8,
        backgroundColor: colors.background
    },
    gridRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4
    },
    dayHeader: {
        width: '13.5%',
        textAlign: 'center',
        color: colors.subText,
        fontSize: 10,
        fontWeight: 'bold',
        marginBottom: 8
    },
    dayCell: {
        width: '13.5%',
        aspectRatio: 0.8, // Rectangular
        borderRadius: 6,
        justifyContent: 'flex-start',
        alignItems: 'center',
        paddingVertical: 4
    },
    dayNum: {
        fontSize: 10,
        color: colors.text,
        marginBottom: 2
    },
    pnlText: {
        fontSize: 9,
        fontWeight: 'bold'
    },
    countText: {
        fontSize: 7,
        marginTop: 0
    }
});

export default PnLCalendar;
