"use client";

import React, { useState, useEffect, useMemo } from "react";
import { TrendingUp, AlertCircle, Percent, Settings2, Sparkles, BarChart2, RefreshCw } from "lucide-react";

interface BacktestStats {
  annualReturn: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  winRate: number;
  tradesCount: number;
  harvestRate: number; // profit factor * 30 as a percentage for show
  equityCurvePath: string;
}

interface BacktestRun {
  id: string;
  strategy_name: string;
  symbol: string;
  start_date: string;
  end_date: string;
  initial_capital: string;
  final_capital: string;
  total_trades: number;
  win_rate: string;
  sharpe_ratio: string | null;
  sortino_ratio: string | null;
  max_drawdown: string;
  profit_factor: string | null;
  created_at: string;
}

interface Trade {
  pnl: string;
  entry_time: string;
  exit_time: string;
}

export default function BacktestConsole() {
  // Backtest parameters
  const [symbol, setSymbol] = useState("ES");
  const [startDate, setStartDate] = useState("2026-05-12");
  const [endDate, setEndDate] = useState("2026-05-25");
  const [atrMultiplierStop, setAtrMultiplierStop] = useState(2.0);
  const [useMaxPainForTarget, setUseMaxPainForTarget] = useState(true);
  const [minNetGex, setMinNetGex] = useState(0);

  // States
  const [loading, setLoading] = useState(false);
  const [runs, setRuns] = useState<BacktestRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<BacktestRun | null>(null);
  const [selectedTrades, setSelectedTrades] = useState<Trade[]>([]);
  const [currentStats, setCurrentStats] = useState<BacktestStats | null>(null);

  // Fetch runs on mount
  const fetchRuns = async () => {
    try {
      const res = await fetch("/api/backtests?limit=10");
      if (res.ok) {
        const data = await res.json();
        setRuns(data);
        if (data.length > 0) {
          loadRun(data[0]);
        }
      }
    } catch (err) {
      console.error("Failed to fetch backtests:", err);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  const loadRun = async (run: BacktestRun) => {
    setSelectedRun(run);
    try {
      const res = await fetch(`/api/backtests/${run.id}/trades`);
      if (res.ok) {
        const trades = await res.json();
        setSelectedTrades(trades);
        
        // Reconstruct stats & equity curve
        const initial = Number(run.initial_capital);
        const final = Number(run.final_capital);
        const pnl = final - initial;
        const annualReturn = (pnl / initial) * 100;

        const equityPoints = [initial];
        let current = initial;
        trades.forEach((t: Trade) => {
          current += Number(t.pnl);
          equityPoints.push(current);
        });

        // Generate SVG Path
        const minEq = Math.min(...equityPoints);
        const maxEq = Math.max(...equityPoints);
        const range = maxEq - minEq || 1;
        const width = 500;
        const height = 100;
        const path = equityPoints.map((eq, idx) => {
          const x = (idx / (equityPoints.length - 1 || 1)) * width;
          const y = height - ((eq - minEq) / range) * (height - 20) - 10;
          return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
        }).join(' ');

        setCurrentStats({
          annualReturn: Number(annualReturn.toFixed(2)),
          sharpeRatio: run.sharpe_ratio ? Number(Number(run.sharpe_ratio).toFixed(2)) : 0,
          sortinoRatio: run.sortino_ratio ? Number(Number(run.sortino_ratio).toFixed(2)) : 0,
          maxDrawdown: Number((Number(run.max_drawdown) * 100).toFixed(2)),
          winRate: Number((Number(run.win_rate) * 100).toFixed(1)),
          tradesCount: run.total_trades,
          harvestRate: run.profit_factor ? Number((Number(run.profit_factor) * 30).toFixed(1)) : 0,
          equityCurvePath: path
        });
      }
    } catch (err) {
      console.error("Failed to load trades:", err);
    }
  };

  const handleRunBacktest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/backtests/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          startDate,
          endDate,
          atrMultiplierStop,
          useMaxPainForTarget,
          minNetGex,
          initialCapital: 10000
        })
      });

      if (!res.ok) {
        throw new Error("Backtest execution failed.");
      }

      const data = await res.json();
      await fetchRuns();
      if (data.runId) {
        // Find and load the new run
        const newRes = await fetch("/api/backtests?limit=10");
        const newRuns = await newRes.json();
        const createdRun = newRuns.find((r: BacktestRun) => String(r.id) === String(data.runId));
        if (createdRun) {
          loadRun(createdRun);
        }
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full flex flex-col gap-6 text-slate-200">
      
      {/* 1. Control & Setup Panel */}
      <form onSubmit={handleRunBacktest} className="glass-panel rounded-2xl p-5 border-slate-800/60 flex flex-col lg:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20 glow-emerald">
            <Settings2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-slate-100 tracking-wide uppercase">GEX Reversal Strategy Backtester</h3>
            <p className="text-[10px] text-slate-500 font-medium">Vectorized simulation backfilled from real database intraday bars and option summary rows</p>
          </div>
        </div>

        {/* Dynamic Parameter Settings */}
        <div className="flex flex-wrap items-center gap-4 text-xs">
          
          {/* Symbol */}
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold text-slate-500 uppercase">Symbol</label>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none"
            >
              <option value="ES">ES (S&P 500)</option>
              <option value="NQ">NQ (NASDAQ 100)</option>
              <option value="GC">GC (Gold)</option>
              <option value="ZS">ZS (Soybeans)</option>
            </select>
          </div>

          {/* Date range */}
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold text-slate-500 uppercase">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold text-slate-500 uppercase">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none"
            />
          </div>

          {/* ATR Multiplier */}
          <div className="flex flex-col gap-1 w-20">
            <label className="text-[9px] font-bold text-slate-500 uppercase">ATR Mult</label>
            <input
              type="number"
              step="0.1"
              value={atrMultiplierStop}
              onChange={(e) => setAtrMultiplierStop(Number(e.target.value))}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none"
            />
          </div>

          {/* Min Net GEX */}
          <div className="flex flex-col gap-1 w-20">
            <label className="text-[9px] font-bold text-slate-500 uppercase">Min GEX</label>
            <input
              type="number"
              value={minNetGex}
              onChange={(e) => setMinNetGex(Number(e.target.value))}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none"
            />
          </div>

          {/* Max Pain Toggle */}
          <div className="flex items-center gap-2 mt-4">
            <input
              type="checkbox"
              id="maxPainToggle"
              checked={useMaxPainForTarget}
              onChange={(e) => setUseMaxPainForTarget(e.target.checked)}
              className="rounded bg-slate-950 border-slate-800 text-emerald-500 focus:ring-0"
            />
            <label htmlFor="maxPainToggle" className="text-[10px] font-semibold text-slate-400">MaxPain Target</label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition-colors cursor-pointer mt-4"
          >
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <BarChart2 className="w-3.5 h-3.5" />}
            {loading ? "Running..." : "Run Simulation"}
          </button>

        </div>
      </form>

      {/* 2. Metrics Deck */}
      {currentStats ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 animate-fade-in">
          {/* Metric 1 */}
          <div className="glass-panel rounded-2xl p-4 flex flex-col gap-1 border-slate-800/40">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Annualized Return</span>
            <span className={`text-xl font-black mt-1 ${currentStats.annualReturn >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {currentStats.annualReturn}%
            </span>
            <span className="text-[9px] text-slate-500 font-semibold mt-1">Premium harvest yield</span>
          </div>

          {/* Metric 2 */}
          <div className="glass-panel rounded-2xl p-4 flex flex-col gap-1 border-slate-800/40">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Sharpe Ratio</span>
            <span className="text-xl font-black text-yellow-400 mt-1">{currentStats.sharpeRatio}</span>
            <span className="text-[9px] text-slate-500 font-semibold mt-1">Risk-adjusted returns</span>
          </div>

          {/* Metric 3 */}
          <div className="glass-panel rounded-2xl p-4 flex flex-col gap-1 border-slate-800/40">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Max Drawdown</span>
            <span className="text-xl font-black text-rose-500 mt-1">{currentStats.maxDrawdown}%</span>
            <span className="text-[9px] text-slate-500 font-semibold mt-1">Peak-to-trough risk</span>
          </div>

          {/* Metric 4 */}
          <div className="glass-panel rounded-2xl p-4 flex flex-col gap-1 border-slate-800/40">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Win Rate</span>
            <span className="text-xl font-black text-cyan-400 mt-1">{currentStats.winRate}%</span>
            <span className="text-[9px] text-slate-500 font-semibold mt-1">{currentStats.tradesCount} total trade cycles</span>
          </div>

          {/* Metric 5 */}
          <div className="glass-panel rounded-2xl p-4 flex flex-col gap-1 border-slate-800/40">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Profit Factor</span>
            <span className="text-xl font-black text-purple-400 mt-1">
              {selectedRun?.profit_factor ? Number(selectedRun.profit_factor).toFixed(2) : "0.00"}
            </span>
            <span className="text-[9px] text-slate-500 font-semibold mt-1">Gross wins / gross losses</span>
          </div>
        </div>
      ) : (
        <div className="glass-panel rounded-2xl p-8 text-center text-slate-500">
          No simulation loaded. Select parameters above and click "Run Simulation".
        </div>
      )}

      {/* 3. Equity Curve & Run History */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Equity Curve Visualizer (2 Columns) */}
        <div className="lg:col-span-2 glass-panel rounded-2xl p-5 border-slate-800/50 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-300 uppercase tracking-wide">
              Equity Curve {selectedRun ? `(Run #${selectedRun.id})` : ""}
            </span>
            <span className="text-[10px] text-slate-500 font-medium">Growth of $10,000 Initial Principal</span>
          </div>

          {currentStats ? (
            <div className="w-full h-48 bg-slate-950/40 rounded-xl border border-slate-900 overflow-hidden relative p-4">
              <svg viewBox="0 0 500 100" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.00" />
                  </linearGradient>
                </defs>
                <line x1="0" y1="25" x2="500" y2="25" stroke="#1e293b" strokeWidth="0.5" strokeDasharray="3" />
                <line x1="0" y1="50" x2="500" y2="50" stroke="#1e293b" strokeWidth="0.5" strokeDasharray="3" />
                <line x1="0" y1="75" x2="500" y2="75" stroke="#1e293b" strokeWidth="0.5" strokeDasharray="3" />
                
                <path
                  d={`${currentStats.equityCurvePath} L 500 100 L 0 100 Z`}
                  fill="url(#equityGrad)"
                  className="transition-all duration-500"
                />
                <path
                  d={currentStats.equityCurvePath}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2.5"
                  className="transition-all duration-500"
                />
              </svg>
              <div className="absolute bottom-2 left-4 text-[9px] text-slate-600 font-medium">Start: {selectedRun?.start_date}</div>
              <div className="absolute bottom-2 right-4 text-[9px] text-slate-600 font-medium">End: {selectedRun?.end_date}</div>
            </div>
          ) : (
            <div className="h-48 bg-slate-950/40 rounded-xl border border-slate-900 flex items-center justify-center text-slate-600 text-xs">
              No chart data
            </div>
          )}
        </div>

        {/* Recent Runs History (1 Column) */}
        <div className="lg:col-span-1 glass-panel rounded-2xl p-5 border-slate-800/50 flex flex-col gap-3 max-h-[260px] overflow-y-auto">
          <span className="text-xs font-extrabold text-slate-300 uppercase tracking-wide block border-b border-slate-800 pb-2">
            Recent Backtest Runs
          </span>
          {runs.length === 0 ? (
            <div className="text-slate-500 text-xs text-center py-8">No historical runs in DB</div>
          ) : (
            <div className="flex flex-col gap-2">
              {runs.map((r) => {
                const active = selectedRun?.id === r.id;
                const pnl = Number(r.final_capital) - Number(r.initial_capital);
                return (
                  <button
                    key={r.id}
                    onClick={() => loadRun(r)}
                    className={`text-left p-2.5 rounded-lg border text-xs transition-all flex items-center justify-between cursor-pointer ${
                      active
                        ? "bg-slate-800/80 border-slate-700 text-white"
                        : "bg-slate-950/40 border-slate-900 text-slate-400 hover:bg-slate-900/60"
                    }`}
                  >
                    <div>
                      <span className="font-bold text-slate-200 block">{r.strategy_name}</span>
                      <span className="text-[9px] text-slate-500 mt-0.5 block">{r.symbol} • {r.start_date} to {r.end_date}</span>
                    </div>
                    <span className={`font-black ${pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {pnl >= 0 ? "+" : ""}{Math.round(pnl)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
