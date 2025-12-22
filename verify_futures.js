const instruments = require('./src/data/complete.json');

const FUT_BASE = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX'];

// Static Filtering Logic copied from FuturesScreen.js
const futures = instruments.filter(inst =>
    (inst.segment === 'NSE_FO' || inst.segment === 'BSE_FO') &&            // FO segment (NSE or BSE)
    inst.instrument_type === 'FUT' &&       // Only Futures
    FUT_BASE.some(base => inst.trading_symbol.startsWith(base)) // Match base
);

const getNearestFuture = (base) => {
    let list = futures.filter(f => f.trading_symbol.startsWith(base));

    // Explicitly exclude NIFTYNXT50 when searching for NIFTY
    if (base === 'NIFTY') {
        list = list.filter(f => !f.trading_symbol.startsWith('NIFTYNXT50'));
    }

    if (list.length === 0) return null;
    // Sort by expiry date ascending
    list.sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
    // Pick the first future with expiry >= today (start of day)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return list.find(f => new Date(f.expiry) >= today) || list[list.length - 1];
};

const nearestFutures = FUT_BASE.map(base => {
    const found = getNearestFuture(base);
    return {
        base,
        found: !!found,
        symbol: found ? found.trading_symbol : 'Not Found',
        segment: found ? found.segment : 'N/A'
    };
});

console.log(JSON.stringify(nearestFutures, null, 2));
