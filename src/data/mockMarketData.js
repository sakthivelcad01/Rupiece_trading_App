export const INDICES = {
    NIFTY: {
        symbol: "NIFTY",
        price: 21456.75,
        change: 124.50,
        changePwd: 0.58,
        lotSize: 50,
    },
    BANKNIFTY: {
        symbol: "BANKNIFTY",
        price: 47825.20,
        change: -150.30,
        changePwd: -0.31,
        lotSize: 15,
    }
};

export const OPTION_CHAIN = [
    {
        strike: 21400,
        expiry: "28 DEC",
        ce: { price: 156.40, change: 12.5 },
        pe: { price: 89.30, change: -45.2 },
        type: "NIFTY"
    },
    {
        strike: 21450,
        expiry: "28 DEC",
        ce: { price: 120.10, change: 8.4 },
        pe: { price: 110.50, change: -32.1 },
        type: "NIFTY"
    },
    {
        strike: 21500,
        expiry: "28 DEC",
        ce: { price: 95.60, change: -5.2 },
        pe: { price: 145.20, change: 22.8 },
        type: "NIFTY"
    },
    {
        strike: 47800,
        expiry: "27 DEC",
        ce: { price: 340.20, change: -120.5 },
        pe: { price: 280.40, change: 95.2 },
        type: "BANKNIFTY"
    },
    {
        strike: 47900,
        expiry: "27 DEC",
        ce: { price: 280.50, change: -140.2 },
        pe: { price: 350.10, change: 110.5 },
        type: "BANKNIFTY"
    }
];

export const POSITIONS = [
    {
        id: '1',
        symbol: 'NIFTY',
        strike: 21400,
        type: 'CE',
        qty: 50,
        avgPrice: 145.50,
        ltp: 156.40,
        instrumentKey: 'NSE_EQ|INE002A01018', // Reliance (valid key for testing)
        status: 'OPEN'
    },
    {
        id: '2',
        symbol: 'BANKNIFTY',
        strike: 47800,
        type: 'PE',
        qty: 15,
        avgPrice: 320.00,
        ltp: 280.40,
        instrumentKey: 'NSE_EQ|INE009A01021', // Infosys (valid key for testing)
        status: 'OPEN'
    },
    {
        id: '3',
        symbol: 'NIFTY',
        strike: 21300,
        type: 'PE',
        qty: 100,
        avgPrice: 85.00,
        sellPrice: 110.00,
        status: 'CLOSED'
    }
];
