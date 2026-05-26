"use client";

import React, { useState } from "react";
import { BookOpen, ChevronDown, ChevronUp, Info, HelpCircle } from "lucide-react";

export default function FormulaBook() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="w-full mt-6 transition-all duration-300">
      
      {/* Trigger Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-6 py-4 bg-slate-950/80 border border-slate-800/80 rounded-2xl hover:bg-slate-900 transition-all cursor-pointer shadow-lg"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
            <BookOpen className="w-4 h-4 text-yellow-400" />
          </div>
          <div className="text-left">
            <span className="text-xs font-bold text-slate-200 tracking-wide block uppercase">Quantitative Model Book</span>
            <span className="text-[10px] text-slate-500 font-medium">Mathematical foundations, analytical BSM Greeks, and hedging exposure formulas</span>
          </div>
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {/* Collapsible Content */}
      {isOpen && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-fadeIn">
          
          {/* Card 1: Black-Scholes-Merton */}
          <div className="glass-panel rounded-2xl p-5 border-slate-800/60 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-800/50 pb-2 mb-3">
                <span className="text-xs font-bold text-emerald-400 tracking-wider">BLACK-76 / BSM MODELS</span>
                <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed mb-4">
                Analytical equations for underlying forward pricing anchors used across CME futures options.
              </p>
              
              {/* Formula Render */}
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-900 text-center font-mono my-2 text-xs flex flex-col gap-2">
                <div className="text-yellow-400/90 font-semibold text-[11px]">
                  d₁ = [ln(F/K) + 0.5σ²T] / [σ√T]
                </div>
                <div className="text-yellow-400/90 font-semibold text-[11px]">
                  d₂ = d₁ - σ√T
                </div>
              </div>
            </div>
            
            <div className="text-[9px] text-slate-500 mt-2 italic flex gap-1.5 items-start">
              <Info className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
              <span>Where F = future price, K = strike, σ = ATM volatility, T = years to expiry.</span>
            </div>
          </div>

          {/* Card 2: Option Greeks */}
          <div className="glass-panel rounded-2xl p-5 border-slate-800/60 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-800/50 pb-2 mb-3">
                <span className="text-xs font-bold text-cyan-400 tracking-wider">ANALYTICAL GREEKS</span>
                <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed mb-4">
                First and second derivative sensitivities of the option price with respect to pricing inputs.
              </p>

              {/* Formula List */}
              <div className="flex flex-col gap-2 text-[10px] font-mono">
                <div className="flex justify-between border-b border-slate-900 pb-1">
                  <span className="text-slate-400">Call Delta (Δ)</span>
                  <span className="text-emerald-400">e⁻ʳᵀ N(d₁)</span>
                </div>
                <div className="flex justify-between border-b border-slate-900 pb-1">
                  <span className="text-slate-400">Put Delta (Δ)</span>
                  <span className="text-rose-400">e⁻ʳᵀ [N(d₁) - 1]</span>
                </div>
                <div className="flex justify-between border-b border-slate-900 pb-1">
                  <span className="text-slate-400">Gamma (Γ)</span>
                  <span className="text-yellow-400">[e⁻ʳᵀ n(d₁)] / [F σ √T]</span>
                </div>
                <div className="flex justify-between border-b border-slate-900 pb-1">
                  <span className="text-slate-400">Vanna (dΔ/dσ)</span>
                  <span className="text-purple-400">-e⁻ʳᵀ n(d₁) [d₂/σ]</span>
                </div>
              </div>
            </div>

            <div className="text-[9px] text-slate-500 mt-2 italic flex gap-1.5 items-start">
              <Info className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
              <span>N(•) is cumulative normal; n(•) is standard normal probability density.</span>
            </div>
          </div>

          {/* Card 3: Breeden-Litzenberger PDF */}
          <div className="glass-panel rounded-2xl p-5 border-slate-800/60 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-800/50 pb-2 mb-3">
                <span className="text-xs font-bold text-yellow-400 tracking-wider">BREEDEN-LITZENBERGER</span>
                <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed mb-4">
                Risk-Neutral Probability Density Function (PDF) extracted directly from the option pricing smile curvature.
              </p>

              {/* Formula Render */}
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-900 text-center font-mono my-2 text-xs flex flex-col gap-1.5">
                <div className="text-yellow-400/95 font-semibold text-[11px]">
                  f(K) = eʳᵀ · [∂²C / ∂K²]
                </div>
                <div className="text-[8.5px] text-slate-500">
                  Second partial derivative of call price w.r.t. strike
                </div>
              </div>
            </div>

            <div className="text-[9px] text-slate-500 mt-2 italic flex gap-1.5 items-start">
              <Info className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
              <span>Extrapolates discrete smiles via cubic spline to extract full probability bell curve.</span>
            </div>
          </div>

          {/* Card 4: Net Hedging GEX */}
          <div className="glass-panel rounded-2xl p-5 border-slate-800/60 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-800/50 pb-2 mb-3">
                <span className="text-xs font-bold text-rose-400 tracking-wider">NET MARKET MAKER GEX</span>
                <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed mb-4">
                Aggregate options Gamma exposure mapping market makers' defensive delta-hedging flows.
              </p>

              {/* Formula Render */}
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-900 text-center font-mono my-2 text-xs flex flex-col gap-1.5">
                <div className="text-yellow-400/95 font-semibold text-[10px]">
                  GEX_Net = Σ (C_OI · Γ_C - P_OI · Γ_P) · S²
                </div>
                <div className="text-[8.5px] text-slate-500">
                  Summed across all active options strikes
                </div>
              </div>
            </div>

            <div className="text-[9px] text-slate-500 mt-2 italic flex gap-1.5 items-start">
              <Info className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
              <span>Multiplied by spot squared (S²) to reflect actual underlying contract exposure.</span>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
