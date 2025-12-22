export const generateMockData = (symbol, days = 50) => {
    const data = [];
    let price = symbol === "NIFTY" ? 21500 : 47800;
    const volatility = symbol === "NIFTY" ? 100 : 250;

    for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() - (days - i));

        const open = price + (Math.random() - 0.5) * volatility;
        const close = open + (Math.random() - 0.5) * volatility;
        const high = Math.max(open, close) + Math.random() * (volatility / 2);
        const low = Math.min(open, close) - Math.random() * (volatility / 2);

        // Update price for next day's drift
        price = close;

        // Validating data logic
        if (low > high) {
            const temp = low; low = high; high = temp;
        }

        data.push({
            value: close, // Required by gifted-charts for Line chart fallback
            open,
            close,
            high,
            low,
            label: `${date.getDate()}/${date.getMonth() + 1}`,
            // Add styling for red/green candles
            frontColor: close >= open ? '#22c55e' : '#ef4444',
            gradientColor: close >= open ? '#15803d' : '#b91c1c',
        });
    }
    return data;
};
