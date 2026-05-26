"use client";

import React from "react";
import { Shield, AlertTriangle, Activity, BarChart2 } from "lucide-react";

interface RiskSidebarProps {
  futurePrice: number;
  gammaWall: number;
  zeroGamma: number;
  netGex: number; // positive = long gamma, negative = short gamma
  sd1Down: number;
  sd1Up: number;
  spotPrice: number;
}

export default function RiskSidebar({
  futurePrice,
  gammaWall,
  zeroGamma,
  netGex,
  sd1Down,
  sd1Up,
  spotPrice
}: RiskSidebarProps) {
  
  // Calculate proximity to ±1 SD bounds
  const rangeWidth = sd1Up - sd1Down;
  const pctFromDown = rangeWidth > 0 ? ((spotPrice - sd1Down) / rangeWidth) * 100 : 50;
  const boundedPct = Math.min(Math.max(pctFromDown, 0), 100);

  const isNearBreach = boundedPct <= 15 || boundedPct >= 85;
  const isBreached = spotPrice < sd1Down || spotPrice > sd1Up;

  return (
    <div className="flex flex-col gap-6 w-full h-full text-slate-200">
      
      {/* 1. Market Maker Hedging Regime Card */}
      <div className={`glass-panel rounded-2xl p-5 flex flex-col gap-3 transition-all ${
        netGex >= 0 
          ? "glow-emerald border-emerald-500/20" 
          : "glow-rose border-rose-500/20"
      }`}>
        <div className="flex justify-between items-center border-b border-slate-800/40 pb-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">MM Hedging Regime</span>
          <Shield className={`w-4 h-4 ${netGex >= 0 ? "text-emerald-400" : "text-rose-400"}`} />
        </div>
        
        <div className="flex flex-col gap-1.5">
          <span className={`text-xl font-black tracking-tight ${
            netGex >= 0 ? "text-emerald-400" : "text-rose-400"
          }`}>
            {netGex >= 0 ? "Long Gamma Regime" : "Short Gamma Regime"}
          </span>
          
          <div className="text-[10px] text-slate-300 leading-relaxed font-medium mt-1">
            {netGex >= 0 ? (
              <div className="flex flex-col gap-2">
                <p>
                  Market makers are net **LONG** options. To maintain a delta-neutral book:
                </p>
                <div className="bg-emerald-500/5 border border-emerald-500/10 p-2 rounded-lg font-semibold text-emerald-400/90 text-[9.5px]">
                  * Buy Dips (when prices fall)
                  <br />* Sell Rallies (when prices rise)
                </div>
                <p className="text-[9px] text-slate-500 font-medium">
                  Result: Mean-reverting buffer that dampens underlying price volatility and keeps spot inside range.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p>
                  Market makers are net **SHORT** options. To maintain a delta-neutral book:
                </p>
                <div className="bg-rose-500/5 border border-rose-500/10 p-2 rounded-lg font-semibold text-rose-400/90 text-[9.5px]">
                  * Sell Breakdowns (when prices fall)
                  <br />* Buy Breakouts (when prices rise)
                </div>
                <p className="text-[9px] text-slate-500 font-medium">
                  Result: Momentum feedback loop that accelerates underlying price trends, opening door to explosive runs.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="w-full bg-slate-950/60 rounded-full h-1.5 mt-1.5">
          <div 
            className={`h-1.5 rounded-full ${netGex >= 0 ? "bg-emerald-500" : "bg-rose-500"}`}
            style={{ width: `${Math.min(Math.max(Math.abs(netGex) / 100000 * 100, 15), 100)}%` }}
          />
        </div>
      </div>

      {/* 2. Key Volatility Levels Panel */}
      <div className="glass-panel rounded-2xl p-5 flex flex-col gap-4">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Institutional Levels</span>
        
        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-center bg-slate-950/20 p-3 rounded-xl border border-slate-800/40">
            <div className="flex flex-col">
              <span className="text-xs font-medium text-slate-500">Gamma Wall (POC)</span>
              <span className="text-sm text-slate-400">Max Strike Vol Concentration</span>
            </div>
            <span className="text-base font-bold text-yellow-400 glow-text-gold">{gammaWall}</span>
          </div>

          <div className="flex justify-between items-center bg-slate-950/20 p-3 rounded-xl border border-slate-800/40">
            <div className="flex flex-col">
              <span className="text-xs font-medium text-slate-500">Zero Gamma Level</span>
              <span className="text-sm text-slate-400">Volatility Flip Threshold</span>
            </div>
            <span className="text-base font-bold text-cyan-400">{zeroGamma}</span>
          </div>

          <div className="flex justify-between items-center bg-slate-950/20 p-3 rounded-xl border border-slate-800/40">
            <div className="flex flex-col">
              <span className="text-xs font-medium text-slate-500">ATM Future Anchor</span>
              <span className="text-sm text-slate-400">CME Underlying Index</span>
            </div>
            <span className="text-base font-bold text-slate-300">{futurePrice}</span>
          </div>
        </div>
      </div>

      {/* 3. Expected Range Breach Alert Gauge */}
      <div className="glass-panel rounded-2xl p-5 flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Expected Range Alert</span>
          {isBreached ? (
            <AlertTriangle className="w-5 h-5 text-rose-500 animate-pulse" />
          ) : isNearBreach ? (
            <AlertTriangle className="w-5 h-5 text-yellow-500 animate-pulse" />
          ) : (
            <Activity className="w-5 h-5 text-emerald-500" />
          )}
        </div>

        <div className="flex flex-col items-center py-2">
          {/* Proximity Slider Visual */}
          <div className="w-full bg-slate-950/80 rounded-full h-3 relative mt-2 overflow-hidden border border-slate-800">
            {/* Center ATM Region */}
            <div className="absolute left-[35%] right-[35%] top-0 bottom-0 bg-emerald-500/10 border-l border-r border-emerald-500/20" />
            
            {/* Spot Price Pointer */}
            <div 
              className={`absolute top-0 bottom-0 w-1.5 -ml-0.75 transition-all duration-300 ${
                isBreached ? "bg-rose-500" : isNearBreach ? "bg-yellow-500" : "bg-emerald-400"
              }`}
              style={{ left: `${boundedPct}%` }}
            />
          </div>
          <div className="flex justify-between w-full text-[10px] text-slate-500 mt-2 font-medium">
            <span>-1 SD ({sd1Down.toFixed(1)})</span>
            <span>ATM Anchor</span>
            <span>+1 SD ({sd1Up.toFixed(1)})</span>
          </div>
        </div>

        <div className="flex flex-col bg-slate-950/30 p-3 rounded-xl border border-slate-900 gap-1 text-center">
          <span className="text-xs text-slate-500 font-medium">Spot Proximity to Boundary</span>
          <span className={`text-base font-bold ${
            isBreached ? "text-rose-500" : isNearBreach ? "text-yellow-500" : "text-emerald-400"
          }`}>
            {isBreached 
              ? "BREACHED" 
              : isNearBreach 
                ? "BOUNDS TESTED (Near Breach)" 
                : "STABLE (Inside Range)"
            }
          </span>
        </div>
      </div>

    </div>
  );
}
