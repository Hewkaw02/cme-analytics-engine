import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import fs from 'fs';
import { db, closePool } from '../db/client.js';
import { logger } from '../utils/logger.js';
import { calculateDealerExposures } from '../analytics/ExposureEngine.js';
import { calculateVolumeProfile } from '../analytics/VolumeProfile.js';
import { classifyMarketRegime, type MarketRegimeInput } from '../analytics/MarketRegime.js';
import type { OptionRecord, IntradayBar, OISummaryRecord, SessionConfig } from '../types.js';
import { BrowserPool } from '../browser/BrowserPool.js';
import { Orchestrator } from '../orchestrator.js';
import { env } from '../config/env.js';
import { BacktestEngine } from '../backtest/BacktestEngine.js';
import { GEXReversalStrategy } from '../backtest/strategies/GEXReversalStrategy.js';
import YahooFinance from 'yahoo-finance2';

// @ts-ignore
const yf = new (YahooFinance.default || YahooFinance)({ suppressNotices: ['yahooSurvey'] });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize BrowserPool and Orchestrator for the API Pipeline
const sessionConfig: SessionConfig = {
  headless: env.HEADLESS,
  proxy: env.PROXY_URL,
  userAgent: env.USER_AGENT || 'random',
  stealth: true,
  viewport: { width: 1920, height: 1080 },
  timeout: 30_000,
  cookiePersist: false,
};

const pool = new BrowserPool(sessionConfig, {
  maxInstances: env.MAX_BROWSER_INSTANCES,
});

const orchestrator = new Orchestrator(pool);

const app = express();
const PORT = parseInt(process.env.DASHBOARD_PORT || '3002', 10);

// --- JSON Body Parser ---
app.use(express.json());

// --- Static files ---
app.use(express.static(path.join(__dirname, 'public')));

// --- CORS for development ---
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// =====================================================================
// Vol2Vol Fallback Helpers
// =====================================================================

/**
 * Loads latest Vol2Vol data from output JSON.
 */
function loadVol2VolFallback(symbol: string): any {
  try {
    const vol2volPath = path.resolve(process.cwd(), 'output/vol2vol/vol2vol_summary_latest.json');
    if (!fs.existsSync(vol2volPath)) {
      logger.warn(`Vol2Vol fallback file not found at ${vol2volPath}`);
      return null;
    }
    const rawData = fs.readFileSync(vol2volPath, 'utf8');
    const parsed = JSON.parse(rawData);
    
    const symbolData = parsed.data?.[symbol.toUpperCase()];
    if (!symbolData) {
      logger.warn(`No Vol2Vol fallback data found for symbol ${symbol}`);
      return null;
    }
    
    return {
      fetchDate: parsed.fetchDate,
      ...symbolData,
    };
  } catch (err) {
    logger.error(`Error loading Vol2Vol fallback for ${symbol}`, { error: (err as Error).message });
    return null;
  }
}

/**
 * Calculates Max Pain from strikeData using call/put volumes as proxy for OI.
 */
function calculateMaxPainFallback(strikeData: any[]): number {
  let minPain = Infinity;
  let maxPainStrike = 0;
  
  for (const test of strikeData) {
    let pain = 0;
    for (const s of strikeData) {
      const callsVal = (s.callVolume || 0) * Math.max(0, test.strike - s.strike);
      const putsVal = (s.putVolume || 0) * Math.max(0, s.strike - test.strike);
      pain += (callsVal + putsVal);
    }
    if (pain < minPain) {
      minPain = pain;
      maxPainStrike = test.strike;
    }
  }
  return maxPainStrike;
}

/**
 * Synthesizes OptionRecords and calculates exposures from Vol2Vol data.
 */
function getFallbackExposures(symbol: string, vol2volData: any) {
  const spotPrice = vol2volData.futurePrice || 0;
  const dte = vol2volData.dte || 0;
  const tradeDate = vol2volData.fetchDate ? vol2volData.fetchDate.split('T')[0] : new Date().toISOString().split('T')[0];
  
  const options: OptionRecord[] = [];
  
  for (const s of vol2volData.strikeData || []) {
    // Call record
    options.push({
      trade_date: tradeDate,
      fetched_at: vol2volData.fetchDate || new Date().toISOString(),
      symbol: symbol.toUpperCase(),
      expiry_code: 'V2V_FALLBACK',
      expiry_date: tradeDate,
      days_to_expiry: Math.max(1, Math.round(dte)),
      strike: s.strike,
      option_type: 'C',
      last_price: null,
      settle_price: null,
      bid: null,
      ask: null,
      bid_size: null,
      ask_size: null,
      volume: s.callVolume || 0,
      open_interest: s.callVolume || 0, // proxy OI with volume
      oi_change: 0,
      high: null,
      low: null,
      open: null,
      delta: null,
      gamma: null,
      theta: null,
      vega: null,
      rho: null,
      implied_vol: s.impliedVol || vol2volData.atmVolatility || 0.1,
      theoretical_value: null,
      underlying_price: spotPrice,
      intrinsic_value: null,
      time_value: null,
      moneyness: null,
    });
    
    // Put record
    options.push({
      trade_date: tradeDate,
      fetched_at: vol2volData.fetchDate || new Date().toISOString(),
      symbol: symbol.toUpperCase(),
      expiry_code: 'V2V_FALLBACK',
      expiry_date: tradeDate,
      days_to_expiry: Math.max(1, Math.round(dte)),
      strike: s.strike,
      option_type: 'P',
      last_price: null,
      settle_price: null,
      bid: null,
      ask: null,
      bid_size: null,
      ask_size: null,
      volume: s.putVolume || 0,
      open_interest: s.putVolume || 0, // proxy OI with volume
      oi_change: 0,
      high: null,
      low: null,
      open: null,
      delta: null,
      gamma: null,
      theta: null,
      vega: null,
      rho: null,
      implied_vol: s.impliedVol || vol2volData.atmVolatility || 0.1,
      theoretical_value: null,
      underlying_price: spotPrice,
      intrinsic_value: null,
      time_value: null,
      moneyness: null,
    });
  }
  
  const exposures = calculateDealerExposures(options, spotPrice, 0.05, true);
  
  return {
    tradeDate,
    spotPrice,
    ...exposures,
    byStrike: exposures.byStrike.filter(s =>
      s.strike >= spotPrice * 0.85 && s.strike <= spotPrice * 1.15
    ),
  };
}

/**
 * Synthesizes OISummaryRecord from Vol2Vol data.
 */
function getFallbackOiSummary(symbol: string, vol2volData: any, computedExposures: any) {
  const spotPrice = vol2volData.futurePrice || 0;
  const dte = vol2volData.dte || 0;
  const tradeDate = vol2volData.fetchDate ? vol2volData.fetchDate.split('T')[0] : new Date().toISOString().split('T')[0];
  
  let totalCallVolume = 0;
  let totalPutVolume = 0;
  let maxCallVol = -1;
  let maxCallStrike = spotPrice;
  let maxPutVol = -1;
  let maxPutStrike = spotPrice;
  
  for (const s of vol2volData.strikeData || []) {
    totalCallVolume += (s.callVolume || 0);
    totalPutVolume += (s.putVolume || 0);
    
    if ((s.callVolume || 0) > maxCallVol) {
      maxCallVol = s.callVolume;
      maxCallStrike = s.strike;
    }
    if ((s.putVolume || 0) > maxPutVol) {
      maxPutVol = s.putVolume;
      maxPutStrike = s.strike;
    }
  }
  
  const maxPainStrike = calculateMaxPainFallback(vol2volData.strikeData || []);
  const putCallRatio = totalCallVolume > 0 ? totalPutVolume / totalCallVolume : 1;
  
  const summary: OISummaryRecord = {
    trade_date: tradeDate,
    symbol: symbol.toUpperCase(),
    expiry_code: 'V2V_FALLBACK',
    expiry_date: tradeDate,
    days_to_expiry: Math.max(1, Math.round(dte)),
    underlying_price: spotPrice,
    total_call_oi: totalCallVolume,
    total_put_oi: totalPutVolume,
    total_call_volume: totalCallVolume,
    total_put_volume: totalPutVolume,
    put_call_oi_ratio: putCallRatio,
    put_call_vol_ratio: putCallRatio,
    max_call_oi_strike: maxCallStrike,
    max_put_oi_strike: maxPutStrike,
    max_pain_strike: maxPainStrike,
    max_call_oi_value: maxCallVol,
    max_put_oi_value: maxPutVol,
    net_gamma_exposure: computedExposures.netGex || 0,
    gex_flip_level: computedExposures.gexFlipPrice || null,
    atm_iv_call: vol2volData.atmVolatility || null,
    atm_iv_put: vol2volData.atmVolatility || null,
    atm_iv_skew: 0,
    iv_rank: 50,
    iv_percentile: 50,
  };
  
  return {
    tradeDate,
    summaries: [summary],
  };
}

/**
 * Synthesizes MarketRegimeResult from Vol2Vol data.
 */
function getFallbackRegime(symbol: string, vol2volData: any) {
  const fallbackExposures = getFallbackExposures(symbol, vol2volData);
  const fallbackOiSummary = getFallbackOiSummary(symbol, vol2volData, fallbackExposures);
  const fSummary = fallbackOiSummary.summaries[0];
  
  const spotPrice = fallbackExposures.spotPrice;
  const netGex = fallbackExposures.netGex;
  const gexFlipPrice = fallbackExposures.gexFlipPrice;
  const putCallOIRatio = Number(fSummary.put_call_oi_ratio) || 0;
  const maxCallOIStrike = Number(fSummary.max_call_oi_strike) || 0;
  const maxPutOIStrike = Number(fSummary.max_put_oi_strike) || 0;
  const maxPainStrike = Number(fSummary.max_pain_strike) || 0;
  const ivRank = fSummary.iv_rank !== null ? Number(fSummary.iv_rank) : 50;
  const ivPercentile = fSummary.iv_percentile !== null ? Number(fSummary.iv_percentile) : 50;
  const tradeDateStr = fallbackOiSummary.tradeDate;

  // Map SD bands from vol2volData standardDeviations
  let sd1Upper: number | null = null;
  let sd1Lower: number | null = null;
  let sd2Upper: number | null = null;
  let sd2Lower: number | null = null;

  const sd1 = vol2volData.standardDeviations?.find((d: any) => d.sd === 1);
  if (sd1) {
    sd1Upper = sd1.upside.strikeEnd;
    sd1Lower = sd1.downside.strikeStart;
  }
  const sd2 = vol2volData.standardDeviations?.find((d: any) => d.sd === 2);
  if (sd2) {
    sd2Upper = sd2.upside.strikeEnd;
    sd2Lower = sd2.downside.strikeStart;
  }
  const vwap = spotPrice; // Fallback VWAP to spot price if not in DB

  const input: MarketRegimeInput = {
    symbol,
    spotPrice,
    netGex,
    gexFlipPrice,
    vwap,
    sd1Upper,
    sd1Lower,
    sd2Upper,
    sd2Lower,
  };

  const regime = classifyMarketRegime(input);

  return {
    tradeDate: tradeDateStr,
    spotPrice,
    ...regime,
    oiSummary: {
      putCallOIRatio,
      maxCallOIStrike,
      maxPutOIStrike,
      maxPainStrike,
      ivRank,
      ivPercentile,
    },
  };
}

// =====================================================================
// API Routes
// =====================================================================

/**
 * GET /api/symbols
 * Returns available symbols from the database.
 */
app.get('/api/symbols', async (_req, res) => {
  try {
    const rows = await db
      .selectFrom('oi_expiry_summary')
      .select('symbol')
      .distinct()
      .execute();
    
    // Always include the core Vol2Vol symbols ES, NQ, GC, ZS as baseline
    const symbols = Array.from(new Set([...rows.map(r => r.symbol), 'ES', 'NQ', 'GC', 'ZS']));
    res.json(symbols);
  } catch (err) {
    logger.error('GET /api/symbols failed', { error: (err as Error).message });
    // In case of complete DB failure, fall back to default symbols
    res.json(['ES', 'NQ', 'GC', 'ZS']);
  }
});

/**
 * GET /api/exposure/:symbol
 * Returns GEX/DEX/Vanna/Charm exposure by strike for the latest trade date.
 */
app.get('/api/exposure/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;

    // Find latest trade date for the symbol
    const latestDate = await db
      .selectFrom('options_chain')
      .select('trade_date')
      .where('symbol', '=', symbol)
      .orderBy('trade_date', 'desc')
      .limit(1)
      .executeTakeFirst();

    let options: any[] = [];
    if (latestDate) {
      options = await db
        .selectFrom('options_chain')
        .selectAll()
        .where('symbol', '=', symbol)
        .where('trade_date', '=', latestDate.trade_date)
        .execute();
    }

    // Check if options are empty or have completely null/zero Greeks/OI
    const isEmptyOrInvalid = 
      options.length === 0 || 
      options.every(o => !o.open_interest || Number(o.open_interest) === 0) ||
      options.every(o => o.implied_vol === null || Number(o.implied_vol) === 0);

    if (isEmptyOrInvalid) {
      logger.info(`Database options data for ${symbol} is empty, zeroed, or missing Greeks. Triggering Vol2Vol fallback.`);
      const vol2volData = loadVol2VolFallback(symbol);
      if (vol2volData) {
        const fallback = getFallbackExposures(symbol, vol2volData);
        return res.json(fallback);
      }
      if (options.length === 0) {
        return res.json({ error: 'No options', netGex: 0, netDex: 0, byStrike: [] });
      }
    }

    // Get spot price from the first option with underlying_price, fallback to latest close or vol2vol summary
    let spotPrice = Number(options.find(o => o.underlying_price && Number(o.underlying_price) > 0)?.underlying_price || 0);
    
    if (spotPrice === 0) {
      const latestBar = await db
        .selectFrom('intraday_bars')
        .select('close')
        .where('symbol', '=', symbol)
        .orderBy('bar_time', 'desc')
        .limit(1)
        .executeTakeFirst();
      if (latestBar && latestBar.close) {
        spotPrice = Number(latestBar.close);
      }
    }

    if (spotPrice === 0) {
      const vol2volData = loadVol2VolFallback(symbol);
      if (vol2volData && vol2volData.futurePrice) {
        spotPrice = Number(vol2volData.futurePrice);
      }
    }

    const exposures = calculateDealerExposures(options as OptionRecord[], spotPrice);

    res.json({
      tradeDate: latestDate!.trade_date,
      spotPrice: Number(spotPrice),
      ...exposures,
      // Limit byStrike to ±15% of spot to keep payload manageable
      byStrike: exposures.byStrike.filter(s =>
        s.strike >= Number(spotPrice) * 0.85 && s.strike <= Number(spotPrice) * 1.15
      ),
    });
  } catch (err) {
    logger.error('GET /api/exposure failed', { error: (err as Error).message });
    // Attempt fallback in case of DB error
    try {
      const { symbol } = req.params;
      const vol2volData = loadVol2VolFallback(symbol);
      if (vol2volData) {
        const fallback = getFallbackExposures(symbol, vol2volData);
        return res.json(fallback);
      }
    } catch (_) {}
    res.status(500).json({ error: 'Failed to calculate exposures' });
  }
});

/**
 * GET /api/oi-summary/:symbol
 * Returns latest OI expiry summary rows for a symbol.
 */
app.get('/api/oi-summary/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;

    const latestDate = await db
      .selectFrom('oi_expiry_summary')
      .select('trade_date')
      .where('symbol', '=', symbol)
      .orderBy('trade_date', 'desc')
      .limit(1)
      .executeTakeFirst();

    let rows: any[] = [];
    if (latestDate) {
      rows = await db
        .selectFrom('oi_expiry_summary')
        .selectAll()
        .where('symbol', '=', symbol)
        .where('trade_date', '=', latestDate.trade_date)
        .execute();
    }

    const isEmptyOrInvalid = 
      rows.length === 0 || 
      rows.every(r => Number(r.total_call_oi) === 0 && Number(r.total_put_oi) === 0) ||
      rows.every(r => r.underlying_price === null);

    if (isEmptyOrInvalid) {
      logger.info(`Database OI summary data for ${symbol} is empty, zeroed, or has null underlying. Triggering Vol2Vol fallback.`);
      const vol2volData = loadVol2VolFallback(symbol);
      if (vol2volData) {
        const fallbackExposures = getFallbackExposures(symbol, vol2volData);
        const fallbackOiSummary = getFallbackOiSummary(symbol, vol2volData, fallbackExposures);
        return res.json(fallbackOiSummary);
      }
    }

    res.json({
      tradeDate: latestDate!.trade_date,
      summaries: rows,
    });
  } catch (err) {
    logger.error('GET /api/oi-summary failed', { error: (err as Error).message });
    // Attempt fallback in case of DB error
    try {
      const { symbol } = req.params;
      const vol2volData = loadVol2VolFallback(symbol);
      if (vol2volData) {
        const fallbackExposures = getFallbackExposures(symbol, vol2volData);
        const fallbackOiSummary = getFallbackOiSummary(symbol, vol2volData, fallbackExposures);
        return res.json(fallbackOiSummary);
      }
    } catch (_) {}
    res.status(500).json({ error: 'Failed to fetch OI summary' });
  }
});

/**
 * GET /api/profile/:symbol
 * Volume Profile analysis from today's intraday bars.
 * Query params: ?timeframe=1m&date=2026-05-20
 */
app.get('/api/profile/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const timeframe = (req.query.timeframe as string) || '1m';

    // Get latest bars (last 500)
    const bars = await db
      .selectFrom('intraday_bars')
      .selectAll()
      .where('symbol', '=', symbol)
      .where('timeframe', '=', timeframe)
      .where('is_rth', '=', true)
      .orderBy('bar_time', 'desc')
      .limit(500)
      .execute();

    if (bars.length === 0) {
      return res.json({ error: 'No intraday bars found' });
    }

    const profile = calculateVolumeProfile(bars.reverse() as IntradayBar[]);
    if (!profile) {
      return res.json({ error: 'Could not calculate volume profile' });
    }

    // Only send top 80 bins by volume to keep response size down
    const topBins = [...profile.profile]
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 80)
      .sort((a, b) => a.price - b.price);

    res.json({
      ...profile,
      profile: topBins,
    });
  } catch (err) {
    logger.error('GET /api/profile failed', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to calculate volume profile' });
  }
});

/**
 * GET /api/regime/:symbol
 * Market regime classification.
 */
app.get('/api/regime/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;

    // Get latest OI summary
    const summary = await db
      .selectFrom('oi_expiry_summary')
      .selectAll()
      .where('symbol', '=', symbol)
      .orderBy('trade_date', 'desc')
      .limit(1)
      .executeTakeFirst();

    // Get latest intraday bar for VWAP/bands
    const latestBar = await db
      .selectFrom('intraday_bars')
      .selectAll()
      .where('symbol', '=', symbol)
      .where('is_rth', '=', true)
      .orderBy('bar_time', 'desc')
      .limit(1)
      .executeTakeFirst();

    // Check if summary is missing, zeroed, or has null underlying_price
    const isSummaryEmptyOrInvalid =
      !summary ||
      Number(summary.total_call_oi) === 0 ||
      summary.underlying_price === null;

    let spotPrice = 0;
    let netGex = 0;
    let gexFlipPrice: number | null = null;
    let putCallOIRatio = 0;
    let maxCallOIStrike = 0;
    let maxPutOIStrike = 0;
    let maxPainStrike = 0;
    let ivRank = 50;
    let ivPercentile = 50;
    let sd1Upper: number | null = null;
    let sd1Lower: number | null = null;
    let sd2Upper: number | null = null;
    let sd2Lower: number | null = null;
    let vwap: number | null = null;
    let tradeDateStr = summary?.trade_date || new Date().toISOString();

    if (isSummaryEmptyOrInvalid) {
      logger.info(`Database summary data for regime classification of ${symbol} is missing or invalid. Triggering Vol2Vol fallback.`);
      const vol2volData = loadVol2VolFallback(symbol);
      if (vol2volData) {
        const fallbackRegime = getFallbackRegime(symbol, vol2volData);
        return res.json(fallbackRegime);
      } else {
        // Absolute fallback if no JSON either
        spotPrice = Number(summary?.underlying_price) || Number(latestBar?.close) || 0;
        netGex = Number(summary?.net_gamma_exposure) || 0;
        gexFlipPrice = summary?.gex_flip_level ? Number(summary.gex_flip_level) : null;
        putCallOIRatio = Number(summary?.put_call_oi_ratio) || 0;
        maxCallOIStrike = Number(summary?.max_call_oi_strike) || 0;
        maxPutOIStrike = Number(summary?.max_put_oi_strike) || 0;
        maxPainStrike = Number(summary?.max_pain_strike) || 0;
        ivRank = summary?.iv_rank ? Number(summary.iv_rank) : 50;
        ivPercentile = summary?.iv_percentile ? Number(summary.iv_percentile) : 50;
      }
    } else {
      // Use DB data
      spotPrice = Number(summary.underlying_price);
      netGex = Number(summary.net_gamma_exposure) || 0;
      gexFlipPrice = summary.gex_flip_level ? Number(summary.gex_flip_level) : null;
      putCallOIRatio = Number(summary.put_call_oi_ratio) || 0;
      maxCallOIStrike = Number(summary.max_call_oi_strike) || 0;
      maxPutOIStrike = Number(summary.max_put_oi_strike) || 0;
      maxPainStrike = Number(summary.max_pain_strike) || 0;
      ivRank = summary.iv_rank ? Number(summary.iv_rank) : 50;
      ivPercentile = summary.iv_percentile ? Number(summary.iv_percentile) : 50;
    }

    // Still try to overlay DB intraday bar values for VWAP/bands if they are missing from fallback/DB summary
    if (vwap === null) vwap = latestBar?.vwap_session ? Number(latestBar.vwap_session) : null;
    if (sd1Upper === null) sd1Upper = latestBar?.vwap_sd1_upper ? Number(latestBar.vwap_sd1_upper) : null;
    if (sd1Lower === null) sd1Lower = latestBar?.vwap_sd1_lower ? Number(latestBar.vwap_sd1_lower) : null;
    if (sd2Upper === null) sd2Upper = latestBar?.vwap_sd2_upper ? Number(latestBar.vwap_sd2_upper) : null;
    if (sd2Lower === null) sd2Lower = latestBar?.vwap_sd2_lower ? Number(latestBar.vwap_sd2_lower) : null;

    const input: MarketRegimeInput = {
      symbol,
      spotPrice,
      netGex,
      gexFlipPrice,
      vwap,
      sd1Upper,
      sd1Lower,
      sd2Upper,
      sd2Lower,
    };

    const regime = classifyMarketRegime(input);

    res.json({
      tradeDate: tradeDateStr,
      spotPrice,
      ...regime,
      oiSummary: {
        putCallOIRatio,
        maxCallOIStrike,
        maxPutOIStrike,
        maxPainStrike,
        ivRank,
        ivPercentile,
      },
    });
  } catch (err) {
    logger.error('GET /api/regime failed, attempting fallback', { error: (err as Error).message });
    try {
      const { symbol } = req.params;
      const vol2volData = loadVol2VolFallback(symbol);
      if (vol2volData) {
        const fallbackRegime = getFallbackRegime(symbol, vol2volData);
        return res.json(fallbackRegime);
      }
    } catch (fallbackErr) {
      logger.error('Fallback regime failed', { error: (fallbackErr as Error).message, stack: (fallbackErr as Error).stack });
    }
    res.status(500).json({ error: 'Failed to classify regime' });
  }
});

/**
 * GET /api/bars/:symbol
 * Latest intraday bars for charting.
 * Query params: ?timeframe=1m&limit=200
 */
app.get('/api/bars/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const timeframe = (req.query.timeframe as string) || '1m';
    const limit = Math.min(parseInt((req.query.limit as string) || '200', 10), 1000);

    let bars = await db
      .selectFrom('intraday_bars')
      .selectAll()
      .where('symbol', '=', symbol)
      .where('timeframe', '=', timeframe)
      .orderBy('bar_time', 'desc')
      .limit(limit)
      .execute();

    // Timeframe fallback mechanism if requested is empty
    if (bars.length === 0 && timeframe === '1m') {
      const fallbacks = ['5m', '15m', '30m', '1h'];
      for (const tf of fallbacks) {
        bars = await db
          .selectFrom('intraday_bars')
          .selectAll()
          .where('symbol', '=', symbol)
          .where('timeframe', '=', tf)
          .orderBy('bar_time', 'desc')
          .limit(limit)
          .execute();
        if (bars.length > 0) {
          logger.info(`No 1m bars found for ${symbol}. Falling back to ${tf} bars.`);
          break;
        }
      }
    }

    res.json(bars.reverse());
  } catch (err) {
    logger.error('GET /api/bars failed', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch bars' });
  }
});

/**
 * GET /api/backtests
 * Lists recent backtest runs.
 * Query params: ?symbol=ES&limit=20
 */
app.get('/api/backtests', async (req, res) => {
  try {
    const symbol = req.query.symbol as string;
    const limit = Math.min(parseInt((req.query.limit as string) || '20', 10), 100);

    let query = db
      .selectFrom('backtest_runs')
      .selectAll()
      .orderBy('created_at', 'desc')
      .limit(limit);

    if (symbol) {
      query = query.where('symbol', '=', symbol);
    }

    const runs = await query.execute();
    res.json(runs);
  } catch (err) {
    logger.error('GET /api/backtests failed', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch backtests' });
  }
});

/**
 * POST /api/backtests/run
 * Runs a GEX Reversal strategy backtest simulation on-demand.
 */
app.post('/api/backtests/run', async (req, res) => {
  try {
    const { symbol, startDate, endDate, timeframe, atrMultiplierStop, useMaxPainForTarget, minNetGex, initialCapital } = req.body;
    
    const activeSymbol = symbol || 'ES';
    logger.info(`POST /api/backtests/run - Triggered backtest for ${activeSymbol} (${startDate || '2026-05-12'} to ${endDate || '2026-05-25'})`);
    
    let activeTimeframe = timeframe;
    if (!activeTimeframe) {
      activeTimeframe = activeSymbol === 'ES' ? '5m' : '1m';
    }

    const strategy = new GEXReversalStrategy();
    const result = await BacktestEngine.run(db, {
      strategy,
      strategyParams: {
        atrMultiplierStop: atrMultiplierStop !== undefined ? Number(atrMultiplierStop) : 2.0,
        useMaxPainForTarget: useMaxPainForTarget !== undefined ? Boolean(useMaxPainForTarget) : true,
        minNetGex: minNetGex !== undefined ? Number(minNetGex) : 0,
      },
      symbol: activeSymbol,
      startDate: startDate || '2026-05-12',
      endDate: endDate || '2026-05-25',
      timeframe: activeTimeframe,
      initialCapital: initialCapital !== undefined ? Number(initialCapital) : 10000,
    });
    
    res.json({ success: true, ...result });
  } catch (err) {
    logger.error('POST /api/backtests/run failed', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to run backtest', details: (err as Error).message });
  }
});

/**
 * GET /api/backtests/:runId/trades
 * Returns trades for a specific backtest run.
 */
app.get('/api/backtests/:runId/trades', async (req, res) => {
  try {
    const runId = req.params.runId;

    const trades = await db
      .selectFrom('backtest_trades')
      .selectAll()
      .where('run_id', '=', runId as any)
      .orderBy('entry_time', 'asc')
      .execute();

    res.json(trades);
  } catch (err) {
    logger.error('GET /api/backtests/:runId/trades failed', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch backtest trades' });
  }
});

/**
 * GET /api/settlements/:symbol
 * Historical settlements for a symbol.
 * Query params: ?days=30
 */
app.get('/api/settlements/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const days = Math.min(parseInt((req.query.days as string) || '30', 10), 365);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const settlements = await db
      .selectFrom('daily_settlement')
      .selectAll()
      .where('symbol', '=', symbol)
      .where('trade_date', '>=', cutoffStr)
      .orderBy('trade_date', 'asc')
      .execute();

    res.json(settlements);
  } catch (err) {
    logger.error('GET /api/settlements failed', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch settlements' });
  }
});

/**
 * GET /api/yahoo/options/:symbol
 * Proxies Yahoo Finance options data.
 */
app.get('/api/yahoo/options/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const result = await yf.options(symbol);
    res.json({
      optionChain: {
        result: [result],
        error: null
      }
    });
  } catch (err) {
    logger.error(`GET /api/yahoo/options/${req.params.symbol} failed`, { error: (err as Error).message });
    res.status(500).json({ error: `Failed to fetch options for ${req.params.symbol} from Yahoo Finance: ${(err as Error).message}` });
  }
});

/**
 * GET /api/yahoo/intraday/:symbol
 * Proxies Yahoo Finance chart/intraday data supporting customizable range and interval.
 * Query params: ?range=1d&interval=1m (intraday) or ?range=1mo&interval=1d (historical)
 */
app.get('/api/yahoo/intraday/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const range = (req.query.range as string) || '1d';
    const interval = (req.query.interval as string) || '1m';
    const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${range}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    res.json(response.data);
  } catch (err) {
    logger.error(`GET /api/yahoo/intraday/${req.params.symbol} failed`, { error: (err as Error).message });
    res.status(500).json({ error: `Failed to fetch chart data for ${req.params.symbol} from Yahoo Finance` });
  }
});

/**
 * GET /api/vol2vol/:symbol
 * Returns CME Vol2Vol latest strike data from local output files.
 */
app.get('/api/vol2vol/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const vol2volPath = path.resolve(process.cwd(), 'output/vol2vol/vol2vol_summary_latest.json');
    if (!fs.existsSync(vol2volPath)) {
      return res.status(404).json({ error: 'Vol2Vol latest summary not found' });
    }
    const rawData = fs.readFileSync(vol2volPath, 'utf8');
    const data = JSON.parse(rawData);
    
    // Map symbol to key in JSON (ES, NQ, GC)
    const symbolData = data.data[symbol];
    if (!symbolData) {
      return res.status(404).json({ error: `No Vol2Vol data found for symbol ${symbol}` });
    }
    res.json(symbolData);
  } catch (err) {
    logger.error(`GET /api/vol2vol/${req.params.symbol} failed`, { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch Vol2Vol data' });
  }
});

/**
 * GET /api/vol2vol/:symbol/mt
 * Returns CME Vol2Vol latest data in a flat plain text pipe-delimited format optimized for MT4/MT5.
 */
app.get('/api/vol2vol/:symbol/mt', async (req, res) => {
  try {
    const { symbol } = req.params;
    
    // 1. Try to fetch from database first
    try {
      const latestSnapshot = await db
        .selectFrom('vol2vol_snapshots')
        .selectAll()
        .where('symbol', '=', symbol)
        .orderBy('fetched_at', 'desc')
        .limit(1)
        .executeTakeFirst();

      if (latestSnapshot) {
        const dteVal = Number(latestSnapshot.dte).toFixed(2);
        const ivVal = Number(latestSnapshot.atm_volatility).toFixed(4);
        const expDate = latestSnapshot.expiry_date ? new Date(latestSnapshot.expiry_date).toISOString().split('T')[0] : '';
        
        // Format: Symbol|FuturePrice|DTE|ATM_IV|1SD_Low|1SD_High|2SD_Low|2SD_High|3SD_Low|3SD_High|ExpiryDate
        const payload = `${latestSnapshot.symbol}|${Number(latestSnapshot.future_price).toFixed(2)}|${dteVal}|${ivVal}|${Number(latestSnapshot.sd1_down).toFixed(2)}|${Number(latestSnapshot.sd1_up).toFixed(2)}|${Number(latestSnapshot.sd2_down).toFixed(2)}|${Number(latestSnapshot.sd2_up).toFixed(2)}|${Number(latestSnapshot.sd3_down).toFixed(2)}|${Number(latestSnapshot.sd3_up).toFixed(2)}|${expDate}`;
        
        res.setHeader('Content-Type', 'text/plain');
        return res.send(payload);
      }
    } catch (dbErr) {
      logger.warn('Failed to fetch Vol2Vol MT data from DB, falling back to disk', { error: (dbErr as Error).message });
    }

    // 2. Fallback to reading JSON file
    const vol2volPath = path.resolve(process.cwd(), 'output/vol2vol/vol2vol_summary_latest.json');
    if (fs.existsSync(vol2volPath)) {
      const rawData = fs.readFileSync(vol2volPath, 'utf8');
      const data = JSON.parse(rawData);
      const symbolData = data.data[symbol];
      if (symbolData) {
        const sd1 = symbolData.standardDeviations?.find((d: any) => d.sd === 1);
        const sd2 = symbolData.standardDeviations?.find((d: any) => d.sd === 2);
        const sd3 = symbolData.standardDeviations?.find((d: any) => d.sd === 3);

        const sd1Down = sd1?.downside?.strikeStart || (symbolData.futurePrice * 0.99);
        const sd1Up = sd1?.upside?.strikeEnd || (symbolData.futurePrice * 1.01);
        const sd2Down = sd2?.downside?.strikeStart || (symbolData.futurePrice * 0.98);
        const sd2Up = sd2?.upside?.strikeEnd || (symbolData.futurePrice * 1.02);
        const sd3Down = sd3?.downside?.strikeStart || (symbolData.futurePrice * 0.97);
        const sd3Up = sd3?.upside?.strikeEnd || (symbolData.futurePrice * 1.03);

        // Estimate expiry date
        const expDate = new Date();
        expDate.setDate(expDate.getDate() + Math.ceil(symbolData.dte));
        const expDateStr = expDate.toISOString().split('T')[0];

        const payload = `${symbol}|${Number(symbolData.futurePrice).toFixed(2)}|${Number(symbolData.dte).toFixed(2)}|${Number(symbolData.atmVolatility).toFixed(4)}|${Number(sd1Down).toFixed(2)}|${Number(sd1Up).toFixed(2)}|${Number(sd2Down).toFixed(2)}|${Number(sd2Up).toFixed(2)}|${Number(sd3Down).toFixed(2)}|${Number(sd3Up).toFixed(2)}|${expDateStr}`;
        
        res.setHeader('Content-Type', 'text/plain');
        return res.send(payload);
      }
    }

    res.status(404).send('Error: CME Vol2Vol data not found.');
  } catch (err) {
    logger.error(`GET /api/vol2vol/${req.params.symbol}/mt failed`, { error: (err as Error).message });
    res.status(500).send('Error: Failed to format Vol2Vol data.');
  }
});


// --- Pipeline Runner API ---

/**
 * POST /api/pipeline/run
 * Trigger a specific pipeline scraper & analyzer job.
 * Body: { jobType: string, symbol?: string, date?: string, timeframe?: string }
 */
app.post('/api/pipeline/run', async (req, res) => {
  try {
    const { jobType, symbol, date, timeframe } = req.body;
    if (!jobType) {
      return res.status(400).json({ error: 'jobType is required (OPTIONS, OI, INTRADAY, SETTLEMENT, BULLETIN, ANALYSIS)' });
    }

    const tradeDate = date || new Date().toISOString().split('T')[0];
    logger.info(`POST /api/pipeline/run - Triggered: ${jobType} for ${symbol || 'ALL'} on ${tradeDate}`);

    const result = await orchestrator.runJob(jobType as any, tradeDate, symbol, timeframe);
    res.json({ message: 'Pipeline job executed successfully', result });
  } catch (err) {
    logger.error('POST /api/pipeline/run failed', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to run pipeline job', details: (err as Error).message });
  }
});

/**
 * GET /api/pipeline/run
 * Conveniency GET endpoint to trigger a scraper & analyzer job.
 * Query params: ?jobType=OPTIONS&symbol=ES&date=2026-06-05&timeframe=1m
 */
app.get('/api/pipeline/run', async (req, res) => {
  try {
    const jobType = req.query.jobType as string;
    const symbol = req.query.symbol as string;
    const date = req.query.date as string;
    const timeframe = req.query.timeframe as string;

    if (!jobType) {
      return res.status(400).json({ error: 'jobType query param is required (OPTIONS, OI, INTRADAY, SETTLEMENT, BULLETIN, ANALYSIS)' });
    }

    const tradeDate = date || new Date().toISOString().split('T')[0];
    logger.info(`GET /api/pipeline/run - Triggered: ${jobType} for ${symbol || 'ALL'} on ${tradeDate}`);

    const result = await orchestrator.runJob(jobType as any, tradeDate, symbol, timeframe);
    res.json({ message: 'Pipeline job executed successfully', result });
  } catch (err) {
    logger.error('GET /api/pipeline/run failed', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to run pipeline job', details: (err as Error).message });
  }
});

// --- Health check ---
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// --- SPA fallback ---
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Start server ---
const server = app.listen(PORT, () => {
  logger.info(`Dashboard server started on http://localhost:${PORT}`);
  console.log(`\n🚀 Dashboard running at http://localhost:${PORT}\n`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  server.close();
  await orchestrator.shutdown();
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  server.close();
  await orchestrator.shutdown();
  await closePool();
  process.exit(0);
});

export { app, server };
