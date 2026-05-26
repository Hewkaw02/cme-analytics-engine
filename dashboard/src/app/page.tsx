"use client";

import React, { useState, useEffect } from "react";
import { Activity, Shield, TrendingUp, Info, RefreshCw, Cpu, Layers, AlertTriangle, BookOpen } from "lucide-react";
import OptionChart from "../components/OptionChart";
import VolatilitySurface3D from "../components/VolatilitySurface3D";
import RiskSidebar from "../components/RiskSidebar";
import FormulaBook from "../components/FormulaBook";
import BacktestConsole from "../components/BacktestConsole";

interface StrikeData {
  strike: number;
  callVolume: number;
  putVolume: number;
  callOI?: number;
  putOI?: number;
  impliedVol: number | null;
}

interface StandardDeviation {
  sd: number;
  downside: { strikeStart: number };
  upside: { strikeEnd: number };
}

interface VolDataPoint {
  strike: number;
  dte: number;
  iv: number;
}

interface QuantData {
  symbol: string;
  productName: string;
  title: string;
  futurePrice: number;
  atmVolatility: number;
  dte: number;
  sdWidth: number;
  gammaWall: number;
  zeroGamma: number;
  netGex: number;
  standardDeviations: StandardDeviation[];
  strikeData: StrikeData[];
  pdfData: { strikes: number[]; pdf: number[] };
}

export default function Home() {
  const [activeSymbol, setActiveSymbol] = useState("ES");
  const [activeTab, setActiveTab] = useState<"volume" | "oi" | "probability" | "surface" | "backtest">("volume");
  const [data, setData] = useState<QuantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const symbols = ["ES", "NQ", "GC", "ZS"];

  const fetchData = async (sym: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/quant-data?symbol=${sym}`);
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Failed to load cme quant pipeline.");
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(activeSymbol);
  }, [activeSymbol]);

  // Generate 3D surface data on the fly from current active strikes
  const vol3DPoints = React.useMemo<VolDataPoint[]>(() => {
    if (!data) return [];
    
    // Construct 3D mesh points for our Three.js Vol Surface
    const points: VolDataPoint[] = [];
    const strikes = data.strikeData.map(s => s.strike);
    const dtes = [data.dte, data.dte * 1.5, data.dte * 2.0];
    
    dtes.forEach((t) => {
      data.strikeData.forEach((s) => {
        if (s.impliedVol !== null) {
          // Add synthetic decay to other maturities for wireframe look
          const decayMultiplier = 1.0 - (t - data.dte) * 0.05;
          points.push({
            strike: s.strike,
            dte: t,
            iv: s.impliedVol * decayMultiplier
          });
        }
      });
    });
    
    return points;
  }, [data]);

  // Parse SD boundaries
  const sd1 = data?.standardDeviations?.find(d => d.sd === 1);
  const sd1Down = sd1?.downside.strikeStart ?? (data ? data.futurePrice - data.sdWidth : 0);
  const sd1Up = sd1?.upside.strikeEnd ?? (data ? data.futurePrice + data.sdWidth : 0);

  return (
    <div className="flex flex-col flex-1 min-h-screen bg-[#0b0f19] text-slate-100 selection:bg-emerald-500/30">
      
      {/* 1. Header Bar */}
      <header className="glass-panel sticky top-0 z-50 flex items-center justify-between px-8 py-4 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20 glow-emerald animate-pulse">
            <Cpu className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              ANTIGRAVITY OPTION TERMINAL
            </h1>
            <p className="text-[10px] text-slate-500 font-semibold tracking-widest uppercase">
              CME Volatility & Options Microstructure Engine
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-4">
          <button 
            onClick={() => fetchData(activeSymbol)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-slate-900 border border-slate-800/80 rounded-xl hover:bg-slate-800 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-emerald-400" : "text-slate-400"}`} />
            Sync Pipeline
          </button>
        </div>
      </header>

      {/* 2. Secondary Navigation / Symbol Picker */}
      <div className="flex items-center justify-between px-8 py-3 border-b border-slate-900 bg-slate-950/20">
        <div className="flex items-center gap-2 bg-slate-950/80 p-1.5 rounded-2xl border border-slate-900">
          {symbols.map((sym) => (
            <button
              key={sym}
              onClick={() => setActiveSymbol(sym)}
              className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${
                activeSymbol === sym
                  ? "bg-slate-800 text-white shadow-lg border border-slate-700/50"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {sym === "ES" ? "S&P 500 (ES)" : sym === "NQ" ? "NASDAQ 100 (NQ)" : sym === "GC" ? "Gold (GC)" : "Soybeans (ZS)"}
            </button>
          ))}
        </div>

        {/* Quant Terminal Tab Switcher */}
        <div className="flex bg-slate-950/80 p-1.5 rounded-2xl border border-slate-900">
          <button
            onClick={() => setActiveTab("volume")}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "volume"
                ? "bg-emerald-500 text-slate-950 shadow-md"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Option Volume
          </button>
          <button
            onClick={() => setActiveTab("oi")}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "oi"
                ? "bg-emerald-500 text-slate-950 shadow-md"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Open Interest
          </button>
          <button
            onClick={() => setActiveTab("probability")}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "probability"
                ? "bg-emerald-500 text-slate-950 shadow-md"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Risk PDF
          </button>
          <button
            onClick={() => setActiveTab("surface")}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "surface"
                ? "bg-emerald-500 text-slate-950 shadow-md"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            3D Surface
          </button>
          <button
            onClick={() => setActiveTab("backtest")}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "backtest"
                ? "bg-emerald-500 text-slate-950 shadow-md"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Backtester Simulation
          </button>
        </div>
      </div>

      {/* 3. Main Dashboard Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 p-8">
        
        {/* Left 3 Columns: Charts & Visuals */}
        <div className="lg:col-span-3 flex flex-col gap-6 h-full justify-between">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center glass-panel rounded-2xl p-12 min-h-[500px]">
              <RefreshCw className="w-10 h-10 text-emerald-400 animate-spin mb-4" />
              <span className="text-slate-400 text-sm font-semibold">Consolidating CME Data Feeds...</span>
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center glass-panel rounded-2xl p-12 border-rose-500/20 min-h-[500px]">
              <AlertTriangle className="w-12 h-12 text-rose-500 mb-4 animate-bounce" />
              <span className="text-slate-200 text-base font-bold mb-2">Quant Ingestion Error</span>
              <p className="text-slate-500 text-xs max-w-md text-center">{error}</p>
            </div>
          ) : data ? (
            <>
              {/* Product Header Info Ribbon */}
              <div className="glass-panel rounded-2xl p-5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest block">ACTIVE SERIES DESCRIPTION</span>
                  <h2 className="text-xl font-extrabold text-white mt-1">
                    {data.productName} <span className="text-slate-400 font-normal">({data.title})</span>
                  </h2>
                </div>

                <div className="flex gap-8 text-sm bg-slate-950/40 p-4 rounded-xl border border-slate-900">
                  <div>
                    <span className="block text-[10px] text-slate-500 font-bold">ATM VOLATILITY</span>
                    <span className="text-base font-bold text-emerald-400 mt-1 block">{(data.atmVolatility * 100).toFixed(2)}%</span>
                  </div>
                  <div className="w-px h-8 bg-slate-900" />
                  <div>
                    <span className="block text-[10px] text-slate-500 font-bold">DAYS TO EXPIRY</span>
                    <span className="text-base font-bold text-cyan-400 mt-1 block">{data.dte.toFixed(2)} Days</span>
                  </div>
                  <div className="w-px h-8 bg-slate-900" />
                  <div>
                    <span className="block text-[10px] text-slate-500 font-bold">ATM STRIKE PRICE</span>
                    <span className="text-base font-bold text-yellow-400 mt-1 block">{data.futurePrice}</span>
                  </div>
                </div>
              </div>

              {/* Central Graph Canvas */}
              <div className="flex-1 glass-panel rounded-2xl p-6 min-h-[480px] flex flex-col justify-center">
                {activeTab === "surface" ? (
                  <VolatilitySurface3D volData={vol3DPoints} futurePrice={data.futurePrice} />
                ) : activeTab === "backtest" ? (
                  <BacktestConsole />
                ) : (
                  <OptionChart
                    strikeData={data.strikeData}
                    futurePrice={data.futurePrice}
                    sdWidth={data.sdWidth}
                    standardDeviations={data.standardDeviations}
                    mode={activeTab === "volume" ? "volume" : activeTab === "oi" ? "oi" : "probability"}
                    pdfData={data.pdfData}
                  />
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* Right 1 Column: Greeks & Proximity Sidebar */}
        <div className="lg:col-span-1 h-full">
          {loading ? (
            <div className="h-full min-h-[400px] flex items-center justify-center glass-panel rounded-2xl">
              <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
            </div>
          ) : data ? (
            <RiskSidebar
              futurePrice={data.futurePrice}
              gammaWall={data.gammaWall}
              zeroGamma={data.zeroGamma}
              netGex={data.netGex}
              sd1Down={sd1Down}
              sd1Up={sd1Up}
              spotPrice={data.futurePrice} // Estimating spot proximity via futurePrice anchor
            />
          ) : null}
        </div>

      </div>

      {/* Collapsible Quantitative Formulas Cheat Sheet */}
      <div className="px-8 pb-4">
        <FormulaBook />
      </div>
 
      {/* 4. Mini Footer */}
      <footer className="px-8 py-4 border-t border-slate-900 bg-slate-950/40 text-center text-[10px] text-slate-600 font-medium">
        CME Quant Analytics Platform • Designed with Glassmorphic Antigravity Principles • Developed dynamically via Google DeepMind Antigravity AI
      </footer>

    </div>
  );
}
