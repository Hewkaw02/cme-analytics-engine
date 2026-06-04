import { BrowserPool } from './src/browser/BrowserPool.js';
import { db } from './src/db/client.js';
import { black76Greeks, impliedVolatility } from './src/analytics/Black76.js';
import { calculateDealerExposures } from './src/analytics/ExposureEngine.ts';
import { interpolateATMIV, calculateSDBands, solveImpliedFuturesPrice } from './src/analytics/VolatilitySurface.js';
import { filterOptions } from './src/analytics/DataQualityFilter.ts';

async function testPillar1() {
  let tradeDate: string;
  const symbol = 'ES';

  try {
    // Find date with the maximum option records in DB for the specified symbol
    const latestRow = await db
      .selectFrom('options_chain')
      .select('trade_date')
      .select(eb => eb.fn.count('id').as('cnt'))
      .where('symbol', '=', symbol)
      .groupBy('trade_date')
      .orderBy('cnt', 'desc')
      .limit(1)
      .executeTakeFirst();

    if (!latestRow) {
      console.log('No option records found in DB. Please run a scrape first.');
      return;
    }

    // Convert Date object to string formatted as YYYY-MM-DD
    const dateObj = new Date(latestRow.trade_date);
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    tradeDate = `${yyyy}-${mm}-${dd}`;

    console.log(`--- Fetching options from DB for ${symbol} on ${tradeDate} (using raw date: ${latestRow.trade_date}) ---`);
    const options = await db
      .selectFrom('options_chain')
      .selectAll()
      .where('symbol', '=', symbol)
      .where('trade_date', '=', latestRow.trade_date)
      .execute();

    console.log(`Retrieved ${options.length} options from DB.`);
    if (options.length === 0) {
      console.log('No options found in database. Run options scraper or load data first.');
      return;
    }

    // Solve for missing underlying prices and IVs
    console.log('Solving for implied underlying futures prices using Put-Call Parity...');
    const impliedUnderlyings = solveImpliedFuturesPrice(options, 0.05);
    console.log('Implied futures prices solved:', Array.from(impliedUnderlyings.entries()));

    console.log('Solving for implied volatilities...');
    const optionsWithIv = options.map(opt => {
      const rawUnderlying = opt.underlying_price || impliedUnderlyings.get(opt.expiry_code) || null;
      const underlying = rawUnderlying !== null ? Number(rawUnderlying) : null;
      const settlePrice = opt.settle_price !== null ? Number(opt.settle_price) : null;
      const strike = Number(opt.strike);
      const iv = opt.implied_vol !== null ? Number(opt.implied_vol) : null;

      if (settlePrice !== null && underlying !== null && opt.days_to_expiry > 0) {
        const solvedIv = iv || impliedVolatility(
          settlePrice,
          underlying,
          strike,
          opt.days_to_expiry / 365,
          0.05,
          opt.option_type
        );
        // Use a synthetic open interest (e.g. 500 + strike-based distribution) for testing math
        const syntheticOI = Math.round(5000 * Math.exp(-Math.pow(strike - underlying, 2) / (2 * Math.pow(underlying * 0.05, 2)))) + 100;
        
        return {
          ...opt,
          strike,
          underlying_price: underlying,
          settle_price: settlePrice,
          implied_vol: solvedIv,
          open_interest: syntheticOI,
          delta: opt.delta !== null ? Number(opt.delta) : null,
          gamma: opt.gamma !== null ? Number(opt.gamma) : null,
        };
      }
      return {
        ...opt,
        strike,
        underlying_price: underlying,
        settle_price: settlePrice,
        implied_vol: iv,
        open_interest: 0,
        delta: opt.delta !== null ? Number(opt.delta) : null,
        gamma: opt.gamma !== null ? Number(opt.gamma) : null,
      };
    });

    // 2. Data Quality Filtering
    console.log(`\n--- Running Data Quality Filtering ---`);
    const filtered = filterOptions(optionsWithIv);
    console.log(`Total options: ${options.length}`);
    console.log(`Clean options: ${filtered.clean.length}`);
    console.log(`Rejected options: ${filtered.rejected.length}`);
    console.log(`Quality Score: ${filtered.qualityScore}%`);
    console.log(`Warnings count: ${filtered.warnings.length}`);
    if (filtered.warnings.length > 0) {
      console.log('Sample warnings:', filtered.warnings.slice(0, 3));
    }
    if (filtered.rejected.length > 0) {
      console.log('Sample rejected option:', {
        expiry_code: filtered.rejected[0].expiry_code,
        strike: filtered.rejected[0].strike,
        option_type: filtered.rejected[0].option_type,
        implied_vol: filtered.rejected[0].implied_vol,
        gamma: filtered.rejected[0].gamma,
        validation_notes: filtered.rejected[0].validation_notes,
      });
    }

    // 3. Compare Greeks (scraped vs computed)
    console.log(`\n--- Comparing Black-76 Computed vs CME Scraped Greeks ---`);
    const sampleSize = 5;
    const testCases = filtered.clean.slice(0, sampleSize);
    
    for (const opt of testCases) {
      const F = opt.underlying_price || 0;
      const K = opt.strike;
      const T = opt.days_to_expiry / 365;
      const iv = opt.implied_vol || 0;
      const r = 0.05; // 5% risk-free rate

      const computed = black76Greeks(F, K, T, iv, r, opt.option_type);
      console.log(`\nOption: ${opt.expiry_code} ${opt.option_type}${K}`);
      console.log(`  Underlying: ${F}, IV: ${(iv * 100).toFixed(1)}%, DTE: ${opt.days_to_expiry}`);
      console.log(`  Delta -> Scraped: ${opt.delta}, Computed: ${computed.delta.toFixed(4)} (diff: ${Math.abs((opt.delta || 0) - computed.delta).toFixed(4)})`);
      console.log(`  Gamma -> Scraped: ${opt.gamma}, Computed: ${computed.gamma.toFixed(6)} (diff: ${Math.abs((opt.gamma || 0) - computed.gamma).toFixed(6)})`);
    }

    // 4. Volatility Surface ATM Interpolation & SD Bands
    console.log(`\n--- ATM IV & Standard Deviation Bands ---`);
    const firstExpiry = filtered.clean[0]?.expiry_code;
    const expiryOpts = filtered.clean.filter(o => o.expiry_code === firstExpiry);
    const spot = expiryOpts[0]?.underlying_price || 0;
    const dte = expiryOpts[0]?.days_to_expiry || 0;

    const strikeIVs = expiryOpts.map(o => ({ strike: o.strike, iv: o.implied_vol || 0 }));
    const atmIV = interpolateATMIV(spot, strikeIVs);
    console.log(`Expiry: ${firstExpiry}, Spot: ${spot}, DTE: ${dte}`);
    console.log(`Interpolated ATM IV: ${atmIV ? (atmIV * 100).toFixed(2) + '%' : 'N/A'}`);

    if (atmIV) {
      const bands = calculateSDBands(spot, atmIV, dte);
      console.log(`Standard Deviation Bands:`);
      console.log(`  SD2 Lower: ${bands.sd2Lower.toFixed(2)}`);
      console.log(`  SD1 Lower: ${bands.sd1Lower.toFixed(2)}`);
      console.log(`  Spot Price: ${bands.spotPrice}`);
      console.log(`  SD1 Upper: ${bands.sd1Upper.toFixed(2)}`);
      console.log(`  SD2 Upper: ${bands.sd2Upper.toFixed(2)}`);
    }

    // 5. Exposure Calculations
    console.log(`\n--- Portfolio Exposure Calculations ---`);
    const exposures = calculateDealerExposures(filtered.clean, spot, 0.05, true);
    console.log(`Net Portfolio GEX: ${exposures.netGex.toFixed(2)}`);
    console.log(`Net Portfolio DEX: ${exposures.netDex.toFixed(2)}`);
    console.log(`Net Portfolio Vanna: ${exposures.netVanna.toFixed(2)}`);
    console.log(`Net Portfolio Charm: ${exposures.netCharm.toFixed(2)}`);
    console.log(`Exact GEX Flip Price: ${exposures.gexFlipPrice ? exposures.gexFlipPrice.toFixed(2) : 'N/A'}`);

  } catch (err) {
    console.error('Error during Pillar 1 testing:', err);
  } finally {
    await db.destroy();
  }
}

testPillar1();
