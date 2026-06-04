
import { db } from './src/db/client.js';

async function drawChart(symbol: string = 'ES', limit: number = 40) {
  try {
    const bars = await db
      .selectFrom('intraday_bars')
      .select(['bar_time', 'open', 'high', 'low', 'close'])
      .where('symbol', '=', symbol)
      .where('timeframe', '=', '1m')
      .orderBy('bar_time', 'desc')
      .limit(limit)
      .execute();

    if (bars.length === 0) {
      console.log(`No data found for ${symbol}`);
      return;
    }

    // Reverse to show chronological order (left to right)
    const data = bars.reverse();

    const minPrice = Math.min(...data.map(b => Number(b.low)));
    const maxPrice = Math.max(...data.map(b => Number(b.high)));
    const range = maxPrice - minPrice;
    const height = 20; // rows

    console.log(`\n📈 ${symbol} 1m Candlestick Chart (Last ${data.length} mins)`);
    console.log(`Range: ${minPrice.toFixed(2)} - ${maxPrice.toFixed(2)}\n`);

    for (let y = height; y >= 0; y--) {
      const priceAtLevel = minPrice + (range * y) / height;
      let line = priceAtLevel.toFixed(2).padStart(10) + ' | ';

      for (const bar of data) {
        const o = Number(bar.open);
        const h = Number(bar.high);
        const l = Number(bar.low);
        const c = Number(bar.close);

        const bull = c >= o;
        const color = bull ? '\x1b[32m' : '\x1b[31m';
        const reset = '\x1b[0m';

        const highIdx = Math.round(((h - minPrice) / range) * height);
        const lowIdx = Math.round(((l - minPrice) / range) * height);
        const openIdx = Math.round(((o - minPrice) / range) * height);
        const closeIdx = Math.round(((c - minPrice) / range) * height);

        const bodyMin = Math.min(openIdx, closeIdx);
        const bodyMax = Math.max(openIdx, closeIdx);

        if (y === highIdx && y > bodyMax) {
          line += color + '╷' + reset; // Wick top
        } else if (y === lowIdx && y < bodyMin) {
          line += color + '╵' + reset; // Wick bottom
        } else if (y >= bodyMin && y <= bodyMax) {
          line += color + '█' + reset; // Candle body
        } else if (y > bodyMin && y < bodyMax) {
          line += color + '█' + reset;
        } else if (y < highIdx && y > bodyMax) {
          line += color + '│' + reset; // Wick middle top
        } else if (y > lowIdx && y < bodyMin) {
          line += color + '│' + reset; // Wick middle bottom
        } else {
          line += ' ';
        }
      }
      console.log(line);
    }
    
    console.log(' '.repeat(11) + '└' + '─'.repeat(data.length));
    console.log(' '.repeat(11) + '  (Time -> Last ' + data.length + ' mins)');
    console.log('\n\x1b[32m█ Bullish\x1b[0m  \x1b[31m█ Bearish\x1b[0m\n');

  } catch (err) {
    console.error('Failed to draw chart:', err);
  } finally {
    process.exit(0);
  }
}

// Draw ES chart by default
drawChart('ES');
