import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Dimensions, ActivityIndicator, ScrollView, Alert, Modal, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Plus, TrendingUp, TrendingDown, ChevronDown, Check } from 'lucide-react-native';
import { WebView } from 'react-native-webview';
import { MarketService } from '../services/MarketService';
import { useTheme } from '../context/ThemeContext';

const { width } = Dimensions.get('window');
const CHART_HEIGHT = 350;
const ALL_TIMEFRAMES = ['1m', '2m', '5m', '15m', '30m', '1H', '2H', '3H', '4H', '1D', '1W', '1M', '1Y', '5Y'];

const CHART_HTML = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; padding: 0; background-color: transparent; overflow: hidden; }
    #chart { position: absolute; top: 0; left: 0; right: 0; bottom: 0; }
  </style>
  <script src="https://unpkg.com/lightweight-charts@3.8.0/dist/lightweight-charts.standalone.production.js"></script>
</head>
<body>
  <div id="chart"></div>
  <script>
    window.onerror = function(message) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: message }));
    };

    let chart;
    let candleSeries;
    let pendingData = null;
    let currentTheme = { background: '#0a0a0a', text: '#d1d5db', grid: 'transparent' };

    function createChartInstance(theme) {
        if (chart) {
            chart.remove();
            chart = null;
        }
        
        const chartDiv = document.getElementById('chart');
        
        chart = LightweightCharts.createChart(chartDiv, {
            layout: { 
                backgroundColor: theme.background,
                textColor: theme.text,
                fontSize: 13,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            },
            grid: {
                vertLines: { color: theme.grid || '#333333', style: LightweightCharts.LineStyle.Dotted },
                horzLines: { color: theme.grid || '#333333', style: LightweightCharts.LineStyle.Dotted },
            },
            crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
            rightPriceScale: {
                visible: true,
                borderColor: theme.borderColor || 'rgba(197, 203, 206, 0.4)',
                scaleMargins: { top: 0.2, bottom: 0.2 },
                alignLabels: true,
            },
            timeScale: {
                visible: true,
                borderColor: theme.borderColor || 'rgba(197, 203, 206, 0.4)',
                timeVisible: true,
                secondsVisible: false,
            },
            handleScale: {
                axisPressedMouseMove: { time: true, price: true },
            },
        });

        candleSeries = chart.addCandlestickSeries({
            upColor: '#22c55e',
            downColor: '#ef4444',
            borderVisible: false,
            wickUpColor: '#22c55e',
            wickDownColor: '#ef4444',
        });

        const resizeObserver = new ResizeObserver(entries => {
            if (entries.length === 0 || entries[0].target !== document.body) { return; }
            const { width, height } = entries[0].contentRect;
            if (chart) chart.resize(width, height);
        });
        resizeObserver.observe(document.body);

        return chart;
    }

    function initChart() {
       try {
           if (!chart) createChartInstance(currentTheme);
           
           if (pendingData) {
               candleSeries.setData(pendingData);
               pendingData = null;
           }
           window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'READY' }));
       } catch (e) {
           window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: e.toString() }));
       }
    }

    window.updateTheme = (themeJson) => {
        try {
            const theme = JSON.parse(themeJson);
            currentTheme = theme;
            
            if (chart) {
                chart.applyOptions({
                    layout: { 
                        backgroundColor: theme.background,
                        textColor: theme.text,
                    },
                    grid: {
                        vertLines: { color: theme.grid || '#333333' },
                        horzLines: { color: theme.grid || '#333333' },
                    },
                    rightPriceScale: { borderColor: theme.borderColor },
                    timeScale: { borderColor: theme.borderColor }
                });
            } else {
                initChart();
            }
        } catch(e) {
             window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: "Theme Update Failed: " + e.toString() }));
        }
    }

    window.updateChart = (data) => {
        try {
            if (!chart) {
                pendingData = data;
                initChart();
            } else {
                if (data && data.length > 0) {
                    candleSeries.setData(data);
                    
                    // Force Layout Calculation
                    const container = document.getElementById('chart');
                    chart.resize(container.clientWidth, container.clientHeight);
                    chart.timeScale().fitContent();
                    
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SUCCESS', message: 'Chart Updated' }));
                }
            }
        } catch (e) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: e.toString() }));
        }
    }

    // Ensure DOM is ready before init
    window.onload = function() {
        setTimeout(initChart, 300);
    };
  </script>
</body>
</html>
`;

export default function ChartScreen({ route, navigation }) {
  const { symbol = "NIFTY", instrumentKey } = route.params || {};
  const { colors, isDark } = useTheme();

  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('1D');
  const [dailyData, setDailyData] = useState([]);
  const [currentQuote, setCurrentQuote] = useState({ open: 0, high: 0, low: 0, close: 0, prevClose: 0, change: 0, price: 0 });
  const [errorMsg, setErrorMsg] = useState(null);
  const [isTFModalVisible, setTFModalVisible] = useState(false); // Modal State

  const webViewRef = useRef(null);

  useEffect(() => {
    fetchHistory();
  }, [symbol, timeframe]);

  useEffect(() => {
    fetchDailyStats();
    fetchLiveQuote(); // Fetch live price immediately
    const interval = setInterval(fetchLiveQuote, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, [symbol, instrumentKey]);

  useEffect(() => {
    if (webViewRef.current) {
      const themeData = {
        background: colors.background,
        text: colors.text,
        grid: isDark ? '#222222' : '#e5e7eb',
        borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'
      };
      setTimeout(() => {
        webViewRef.current?.injectJavaScript(`window.updateTheme('${JSON.stringify(themeData)}'); true;`);
      }, 500);
    }
  }, [colors, isDark]);

  const getYahooSymbol = (sym) => {
    const YAHOO_MAP = {
      NIFTY: '^NSEI',
      BANKNIFTY: '^NSEBANK',
      FINNIFTY: 'NIFTY_FIN_SERVICE.NS',
      MIDCAP: '^NSEMDCP50',
      SENSEX: '^BSESN',
      BANKEX: '^BSEBANK'
    };
    return YAHOO_MAP[sym] || '^NSEI';
  };

  const fetchDailyStats = async () => {
    const yahooSymbol = getYahooSymbol(symbol);
    // Fetch 1 Year to calculate 52 Week High/Low
    let result;
    if (instrumentKey) {
      result = await MarketService.getCandles(instrumentKey, '1D', '1y');
    } else {
      result = await MarketService.getYahooCandles(yahooSymbol, '1y', '1d');
    }
    if (result.data) {
      const raw = result.data.map(item => ({
        date: new Date(item[0]),
        open: Number(item[1]),
        high: Number(item[2]),
        low: Number(item[3]),
        close: Number(item[4])
      })).reverse(); // Newest first

      setDailyData(raw.slice(0, 5));

      if (raw.length > 0) {
        const latest = raw[0];
        const prev = raw.length > 1 ? raw[1] : latest;
        const change = ((latest.close - prev.close) / prev.close) * 100;

        // Calculate 52 Week High/Low
        const yearHigh = Math.max(...raw.map(d => d.high));
        const yearLow = Math.min(...raw.map(d => d.low));

        setCurrentQuote({
          open: latest.open,
          high: latest.high,
          low: latest.low,
          close: latest.close,
          price: latest.close,
          prevClose: prev.close,
          change: change,
          yearHigh: yearHigh,
          yearLow: yearLow
        });
      }
    }
  };

  const fetchLiveQuote = async () => {
    if (!instrumentKey) return;
    try {
      const quotes = await MarketService.getQuotes([instrumentKey]);
      const quote = quotes[instrumentKey];
      if (quote) {
        setCurrentQuote(prev => ({
          ...prev,
          price: quote.last_price,
          change: quote.net_change || (quote.last_price - (quote.ohlc?.close || quote.last_price)),
          open: quote.ohlc?.open || prev.open,
          high: quote.ohlc?.high || prev.high,
          low: quote.ohlc?.low || prev.low,
          prevClose: quote.ohlc?.close || prev.prevClose
        }));
      }
    } catch (e) {
      console.error("fetchLiveQuote Error:", e);
    }
  };

  const fetchHistory = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      let range = '1d';
      let interval = '5m';

      switch (timeframe) {
        case '1m': range = '1d'; interval = '1m'; break;
        case '2m': range = '1d'; interval = '2m'; break;
        case '5m': range = '1d'; interval = '5m'; break;
        case '1D': range = '1y'; interval = '1d'; break;
        // ... (Keep existing mappings roughly the same for consistency)
        case '15m': range = '5d'; interval = '15m'; break;
        case '30m': range = '5d'; interval = '30m'; break;
        case '1H': range = '1mo'; interval = '60m'; break;
        case '2H': range = '1mo'; interval = '60m'; break;
        case '3H': range = '1mo'; interval = '60m'; break;
        case '4H': range = '3mo'; interval = '60m'; break;
        case '1W': range = '2y'; interval = '1wk'; break;
        case '1M': range = '5y'; interval = '1mo'; break;
        case '1Y': range = '10y'; interval = '3mo'; break;
        case '5Y': range = 'max'; interval = '3mo'; break;
        default: range = '1d'; interval = '5m';
      }

      let result;

      // Prefer Upstox if instrumentKey available
      if (instrumentKey) {
        result = await MarketService.getCandles(instrumentKey, timeframe, range);
      } else {
        // Fallback to Yahoo
        result = await MarketService.getYahooCandles(getYahooSymbol(symbol), range, interval);
      }

      if (result.error) {
        setErrorMsg(result.error);
      } else if (result.data && result.data.length > 0) {
        const uniqueData = result.data.map(item => ({
          time: Math.floor(new Date(item[0]).getTime() / 1000),
          open: Number(item[1]),
          high: Number(item[2]),
          low: Number(item[3]),
          close: Number(item[4])
        })).filter(d => !isNaN(d.open) && !isNaN(d.close)).sort((a, b) => a.time - b.time);

        const cleanData = [];
        const seen = new Set();
        uniqueData.forEach(d => {
          if (!seen.has(d.time)) { seen.add(d.time); cleanData.push(d); }
        });

        if (webViewRef.current) {
          webViewRef.current.injectJavaScript(`window.updateChart(${JSON.stringify(cleanData)}); true;`);
        }
      } else {
        setErrorMsg("No Chart Data Found");
      }
    } catch (err) {
      console.error("Chart Fetch Error:", err);
      setErrorMsg(err.toString());
    } finally {
      setLoading(false);
    }
  };

  const isPositive = currentQuote.change >= 0;
  const dynamicStyles = styles(colors);

  return (
    <SafeAreaView style={dynamicStyles.container} edges={['top']}>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* App Bar */}
      <View style={dynamicStyles.appBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={dynamicStyles.backButton}>
          <ArrowLeft color={colors.text} size={24} />
        </TouchableOpacity>

        {/* Header Title with Dropdown */}
        <TouchableOpacity style={dynamicStyles.headerTitleContainer} onPress={() => setTFModalVisible(true)}>
          <Text style={dynamicStyles.headerTitle}>{symbol}</Text>
          <Text style={dynamicStyles.headerSubtitle}>{timeframe}</Text>
          <ChevronDown size={14} color={colors.subText} style={{ marginLeft: 4 }} />
        </TouchableOpacity>

        {/* <TouchableOpacity onPress={() => Alert.alert("Watchlist", "Added to watchlist!")}>
          <Plus color={colors.text} size={24} />
        </TouchableOpacity> */}
      </View>

      <ScrollView style={{ flex: 1 }}>
        {/* Info */}
        <View style={dynamicStyles.infoSection}>
          <View style={dynamicStyles.priceRow}>
            <Text style={dynamicStyles.priceText}>
              {currentQuote.price.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })}
            </Text>
            <View style={[dynamicStyles.badge, { backgroundColor: isPositive ? '#22c55e33' : '#ef444433' }]}>
              {isPositive ? <TrendingUp size={14} color="#22c55e" /> : <TrendingDown size={14} color="#ef4444" />}
              <Text style={[dynamicStyles.changeText, { color: isPositive ? '#22c55e' : '#ef4444' }]}>
                {Math.abs(currentQuote.change).toFixed(2)}%
              </Text>
            </View>
          </View>
          <Text style={dynamicStyles.statusText}>• Market Open</Text>
        </View>

        <View style={dynamicStyles.separator} />

        {/* Range Bars Section */}
        <View style={dynamicStyles.rangeSection}>
          {/* Today's Range */}
          <View style={dynamicStyles.rangeRow}>
            <View style={dynamicStyles.rangeLabelCol}>
              <Text style={dynamicStyles.rangeLabel}>Today's Low</Text>
              <Text style={dynamicStyles.rangeValue}>{currentQuote.low.toLocaleString('en-IN')}</Text>
            </View>

            <View style={dynamicStyles.rangeBarContainer}>
              <View style={dynamicStyles.rangeBarBackground} />
              {/* Calculate position percentage */}
              <View style={[dynamicStyles.rangeIndicator, {
                left: `${Math.max(0, Math.min(100, ((currentQuote.price - currentQuote.low) / (currentQuote.high - currentQuote.low || 1)) * 100))}%`
              }]}>
                <View style={dynamicStyles.triangle} />
              </View>
            </View>

            <View style={dynamicStyles.rangeLabelCol}>
              <Text style={dynamicStyles.rangeLabel}>Today's High</Text>
              <Text style={dynamicStyles.rangeValue}>{currentQuote.high.toLocaleString('en-IN')}</Text>
            </View>

            <View style={dynamicStyles.rangeRightCol}>
              <Text style={dynamicStyles.rangeLabel}>Open</Text>
              <Text style={dynamicStyles.rangeValue}>{currentQuote.open.toLocaleString('en-IN')}</Text>
            </View>
          </View>

          {/* 52 Week Range */}
          <View style={[dynamicStyles.rangeRow, { marginTop: 16 }]}>
            <View style={dynamicStyles.rangeLabelCol}>
              <Text style={dynamicStyles.rangeLabel}>52W Low</Text>
              <Text style={dynamicStyles.rangeValue}>{currentQuote.yearLow ? currentQuote.yearLow.toLocaleString('en-IN') : '-'}</Text>
            </View>

            <View style={dynamicStyles.rangeBarContainer}>
              <View style={dynamicStyles.rangeBarBackground} />
              <View style={[dynamicStyles.rangeIndicator, {
                left: `${Math.max(0, Math.min(100, ((currentQuote.price - (currentQuote.yearLow || 0)) / ((currentQuote.yearHigh || 1) - (currentQuote.yearLow || 0) || 1)) * 100))}%`
              }]}>
                <View style={dynamicStyles.triangle} />
              </View>
            </View>

            <View style={dynamicStyles.rangeLabelCol}>
              <Text style={dynamicStyles.rangeLabel}>52W High</Text>
              <Text style={dynamicStyles.rangeValue}>{currentQuote.yearHigh ? currentQuote.yearHigh.toLocaleString('en-IN') : '-'}</Text>
            </View>

            <View style={dynamicStyles.rangeRightCol}>
              <Text style={dynamicStyles.rangeLabel}>Prev. Close</Text>
              <Text style={dynamicStyles.rangeValue}>{currentQuote.prevClose.toLocaleString('en-IN')}</Text>
            </View>
          </View>
        </View>

        <View style={dynamicStyles.separator} />

        {/* Chart */}
        <View style={{ height: CHART_HEIGHT, backgroundColor: colors.background }}>
          <WebView
            ref={webViewRef}
            originWhitelist={['*']}
            source={{ html: CHART_HTML }}
            style={{ flex: 1, backgroundColor: colors.background, opacity: 0.99 }}
            scrollEnabled={false}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            onLoadEnd={fetchHistory}
          />
          {loading && (
            <View style={dynamicStyles.loader}>
              <ActivityIndicator size="large" color="#22c55e" />
            </View>
          )}
        </View>

        <View style={dynamicStyles.separator} />

        {/* OHLC Table */}
        <View style={dynamicStyles.tableSection}>
          <Text style={dynamicStyles.tableHeader}>Last 5 Days OHLC</Text>
          <View style={dynamicStyles.tableRowHeader}>
            <Text style={[dynamicStyles.col, { flex: 2, textAlign: 'left' }]}>Date</Text>
            <Text style={dynamicStyles.col}>Open</Text>
            <Text style={dynamicStyles.col}>High</Text>
            <Text style={dynamicStyles.col}>Low</Text>
            <Text style={dynamicStyles.col}>Close</Text>
          </View>
          {dailyData.map((row, idx) => (
            <View key={idx} style={dynamicStyles.tableRow}>
              <Text style={[dynamicStyles.cell, { flex: 2, textAlign: 'left', color: colors.subText }]}>
                {row.date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
              </Text>
              <Text style={dynamicStyles.cell}>{row.open.toFixed(0)}</Text>
              <Text style={dynamicStyles.cell}>{row.high.toFixed(0)}</Text>
              <Text style={dynamicStyles.cell}>{row.low.toFixed(0)}</Text>
              <Text style={dynamicStyles.cell}>{row.close.toFixed(0)}</Text>
            </View>
          ))}
        </View>

        {/* Disclaimer */}
        <View style={{ padding: 16, alignItems: 'center', marginBottom: 20 }}>
          <Text style={{ color: colors.subText, fontSize: 11, textAlign: 'center', fontStyle: 'italic' }}>
            Chart data may be delayed. For real-time official charts, check NSE/BSE.
          </Text>
        </View>
      </ScrollView>

      {/* Timeframe Modal */}
      <Modal
        visible={isTFModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setTFModalVisible(false)}
      >
        <TouchableOpacity style={dynamicStyles.modalOverlay} onPress={() => setTFModalVisible(false)}>
          <View style={dynamicStyles.modalContent}>
            <Text style={dynamicStyles.modalHeader}>Select Timeframe</Text>
            <View style={dynamicStyles.modalGrid}>
              {ALL_TIMEFRAMES.map((tf) => (
                <TouchableOpacity
                  key={tf}
                  style={[dynamicStyles.modalItem, timeframe === tf && dynamicStyles.modalItemActive]}
                  onPress={() => {
                    setTimeframe(tf);
                    setTFModalVisible(false);
                  }}
                >
                  <Text style={[dynamicStyles.modalItemText, timeframe === tf && dynamicStyles.modalItemTextActive]}>
                    {tf}
                  </Text>
                  {timeframe === tf && <Check size={14} color="#fff" style={{ marginLeft: 4 }} />}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  );
}

const styles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  appBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.background },
  headerTitleContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  headerTitle: { color: colors.text, fontSize: 16, fontWeight: 'bold', marginRight: 8 },
  headerSubtitle: { color: colors.primary, fontSize: 14, fontWeight: '600' },

  backButton: { padding: 4 },

  infoSection: { padding: 16, backgroundColor: colors.background },
  priceRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  priceText: { color: colors.text, fontSize: 32, fontWeight: 'bold', marginRight: 12 },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  changeText: { fontSize: 14, fontWeight: '600', marginLeft: 4 },
  statusText: { color: colors.subText, fontSize: 12, marginTop: 4 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 16, backgroundColor: colors.background },
  statItem: { width: '50%', marginBottom: 16 },
  statLabel: { color: colors.subText, fontSize: 12, marginBottom: 4 },
  statValue: { color: colors.text, fontSize: 16, fontWeight: '600' },

  separator: { height: 8, backgroundColor: colors.card },

  rangeSection: { padding: 16, backgroundColor: colors.background },
  rangeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rangeLabelCol: { width: '20%' },
  rangeRightCol: { width: '20%', alignItems: 'flex-end', borderLeftWidth: 1, borderLeftColor: colors.border, paddingLeft: 8 },
  rangeLabel: { color: colors.subText, fontSize: 10, marginBottom: 4 },
  rangeValue: { color: colors.text, fontSize: 12, fontWeight: 'bold' },
  rangeBarContainer: { flex: 1, marginHorizontal: 12, height: 4, justifyContent: 'center' },
  rangeBarBackground: { height: 4, borderRadius: 2, backgroundColor: colors.card },
  rangeIndicator: { position: 'absolute', top: -6, width: 0, height: 0, alignItems: 'center' },
  triangle: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.text
  },

  loader: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },

  // REMOVED TIMEFRAME SECTION STYLES

  tableSection: { padding: 16, backgroundColor: colors.background },
  tableHeader: { color: colors.text, fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  tableRowHeader: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  tableRow: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  col: { flex: 1, color: colors.subText, fontSize: 11, textAlign: 'right', fontWeight: '600' },
  cell: { flex: 1, color: colors.text, fontSize: 13, textAlign: 'right', fontFamily: 'monospace' },

  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', padding: 16, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border },
  actionBtn: { flex: 1, paddingVertical: 16, borderRadius: 8, alignItems: 'center' },
  actionText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', backgroundColor: colors.card, borderRadius: 16, padding: 20 },
  modalHeader: { color: colors.text, fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  modalGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  modalItem: { width: '30%', paddingVertical: 12, alignItems: 'center', marginBottom: 12, borderRadius: 8, backgroundColor: colors.background, flexDirection: 'row', justifyContent: 'center' },
  modalItemActive: { backgroundColor: colors.primary },
  modalItemText: { color: colors.subText, fontWeight: '600' },
  modalItemTextActive: { color: '#fff' }
});
