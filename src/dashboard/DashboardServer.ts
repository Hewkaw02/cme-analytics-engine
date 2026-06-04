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
import type { OptionRecord, IntradayBar, OISummaryRecord } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.DASHBOARD_PORT || '3000', 10);

// --- Static files ---
app.use(express.static(path.join(__dirname, 'public')));

// --- CORS for development ---
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

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
    res.json(rows.map(r => r.symbol));
  } catch (err) {
    logger.error('GET /api/symbols failed', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch symbols' });
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

    if (!latestDate) {
      return res.json({ error: 'No data', netGex: 0, netDex: 0, byStrike: [] });
    }

    const options = await db
      .selectFrom('options_chain')
      .selectAll()
      .where('symbol', '=', symbol)
      .where('trade_date', '=', latestDate.trade_date)
      .execute();

    if (options.length === 0) {
      return res.json({ error: 'No options', netGex: 0, netDex: 0, byStrike: [] });
    }

    // Get spot price from the first option with underlying_price
    const spotPrice = options.find(o => o.underlying_price)?.underlying_price ?? 0;

    const exposures = calculateDealerExposures(options as OptionRecord[], Number(spotPrice));

    res.json({
      tradeDate: latestDate.trade_date,
      spotPrice: Number(spotPrice),
      ...exposures,
      // Limit byStrike to ±15% of spot to keep payload manageable
      byStrike: exposures.byStrike.filter(s =>
        s.strike >= Number(spotPrice) * 0.85 && s.strike <= Number(spotPrice) * 1.15
      ),
    });
  } catch (err) {
    logger.error('GET /api/exposure failed', { error: (err as Error).message });
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

    if (!latestDate) {
      return res.json([]);
    }

    const rows = await db
      .selectFrom('oi_expiry_summary')
      .selectAll()
      .where('symbol', '=', symbol)
      .where('trade_date', '=', latestDate.trade_date)
      .execute();

    res.json({
      tradeDate: latestDate.trade_date,
      summaries: rows,
    });
  } catch (err) {
    logger.error('GET /api/oi-summary failed', { error: (err as Error).message });
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

    if (!summary) {
      return res.json({ error: 'No OI summary data' });
    }

    // Get latest intraday bar for VWAP/bands
    const latestBar = await db
      .selectFrom('intraday_bars')
      .selectAll()
      .where('symbol', '=', symbol)
      .where('is_rth', '=', true)
      .orderBy('bar_time', 'desc')
      .limit(1)
      .executeTakeFirst();

    const spotPrice = Number(summary.underlying_price) || Number(latestBar?.close) || 0;

    const input: MarketRegimeInput = {
      symbol,
      spotPrice,
      netGex: Number(summary.net_gamma_exposure) || 0,
      gexFlipPrice: summary.gex_flip_level ? Number(summary.gex_flip_level) : null,
      vwap: latestBar?.vwap_session ? Number(latestBar.vwap_session) : null,
      sd1Upper: latestBar?.vwap_sd1_upper ? Number(latestBar.vwap_sd1_upper) : null,
      sd1Lower: latestBar?.vwap_sd1_lower ? Number(latestBar.vwap_sd1_lower) : null,
      sd2Upper: latestBar?.vwap_sd2_upper ? Number(latestBar.vwap_sd2_upper) : null,
      sd2Lower: latestBar?.vwap_sd2_lower ? Number(latestBar.vwap_sd2_lower) : null,
    };

    const regime = classifyMarketRegime(input);

    res.json({
      tradeDate: summary.trade_date,
      spotPrice,
      ...regime,
      oiSummary: {
        putCallOIRatio: Number(summary.put_call_oi_ratio),
        maxCallOIStrike: Number(summary.max_call_oi_strike),
        maxPutOIStrike: Number(summary.max_put_oi_strike),
        maxPainStrike: Number(summary.max_pain_strike),
        ivRank: summary.iv_rank ? Number(summary.iv_rank) : null,
        ivPercentile: summary.iv_percentile ? Number(summary.iv_percentile) : null,
      },
    });
  } catch (err) {
    logger.error('GET /api/regime failed', { error: (err as Error).message });
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

    const bars = await db
      .selectFrom('intraday_bars')
      .selectAll()
      .where('symbol', '=', symbol)
      .where('timeframe', '=', timeframe)
      .orderBy('bar_time', 'desc')
      .limit(limit)
      .execute();

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
    const response = await axios.get(`https://query1.finance.yahoo.com/v7/finance/options/${symbol}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    res.json(response.data);
  } catch (err) {
    logger.error(`GET /api/yahoo/options/${req.params.symbol} failed`, { error: (err as Error).message });
    res.status(500).json({ error: `Failed to fetch options for ${req.params.symbol} from Yahoo Finance` });
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
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  server.close();
  await closePool();
  process.exit(0);
});

export { app, server };
