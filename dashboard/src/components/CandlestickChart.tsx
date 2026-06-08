"use client";

import React, { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { RefreshCw, TrendingUp } from "lucide-react";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

interface CandlestickChartProps {
  symbol: string;
}

interface BarData {
  bar_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timeframe?: string;
}

export default function CandlestickChart({ symbol }: CandlestickChartProps) {
  const [bars, setBars] = useState<BarData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBars = async (sym: string) => {
    setLoading(true);
    setError(null);
    try {
      // Fetch latest 300 bars from the backend
      const res = await fetch(`/api/bars/${sym}?timeframe=1m&limit=300`);
      if (!res.ok) {
        throw new Error("Failed to load historical price bars.");
      }
      const data = await res.json();
      setBars(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBars(symbol);
  }, [symbol]);

  const seriesData = useMemo(() => {
    return bars.map((b) => ({
      x: new Date(b.bar_time).getTime(),
      y: [Number(b.open), Number(b.high), Number(b.low), Number(b.close)]
    }));
  }, [bars]);

  const volumeData = useMemo(() => {
    return bars.map((b) => ({
      x: new Date(b.bar_time).getTime(),
      y: Number(b.volume)
    }));
  }, [bars]);

  const actualTimeframe = useMemo(() => {
    return bars[0]?.timeframe || "1m";
  }, [bars]);

  const chartOptions = useMemo<any>(() => {
    return {
      chart: {
        type: "candlestick",
        background: "transparent",
        toolbar: { show: false },
        animations: { enabled: false }
      },
      title: {
        text: `${symbol} Intraday Price Action (${actualTimeframe})`,
        align: "left",
        style: { color: "#cbd5e1", fontSize: "14px", fontWeight: "bold" }
      },
      xaxis: {
        type: "datetime",
        labels: {
          style: { colors: "#64748b", fontSize: "10px" }
        },
        axisBorder: { show: false },
        axisTicks: { show: false }
      },
      yaxis: {
        tooltip: { enabled: true },
        labels: {
          style: { colors: "#64748b", fontSize: "10px" },
          formatter: (val: number) => val?.toFixed(2) ?? ""
        }
      },
      grid: {
        borderColor: "#1e293b",
        strokeDashArray: 4
      },
      plotOptions: {
        candlestick: {
          colors: {
            upward: "#10b981",
            downward: "#f43f5e"
          },
          wick: {
            useFillColor: true
          }
        }
      }
    };
  }, [symbol, actualTimeframe]);

  const volumeOptions = useMemo<any>(() => {
    return {
      chart: {
        type: "bar",
        background: "transparent",
        toolbar: { show: false },
        animations: { enabled: false }
      },
      xaxis: {
        type: "datetime",
        labels: { show: false },
        axisBorder: { show: false },
        axisTicks: { show: false }
      },
      yaxis: {
        labels: {
          style: { colors: "#64748b", fontSize: "10px" },
          formatter: (val: number) => Math.round(val).toLocaleString()
        }
      },
      grid: {
        borderColor: "#1e293b",
        strokeDashArray: 4
      },
      colors: ["#3b82f6"],
      fill: {
        opacity: 0.3
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[350px]">
        <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mb-3" />
        <span className="text-slate-400 text-xs font-semibold">Loading Price Action...</span>
      </div>
    );
  }

  if (error || bars.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[350px] border border-dashed border-slate-800 rounded-2xl bg-slate-950/20">
        <TrendingUp className="w-10 h-10 text-slate-600 mb-3" />
        <span className="text-slate-400 text-sm font-semibold">No Price Data Available</span>
        <p className="text-slate-600 text-xs mt-1 text-center max-w-xs">
          Please run the intraday bar scraper or check if cme-timescaledb container has data.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Candlestick Chart */}
      <div className="h-72">
        <Chart
          options={chartOptions}
          series={[{ name: "Price", data: seriesData }]}
          type="candlestick"
          height="100%"
        />
      </div>
      {/* Volume Chart */}
      <div className="h-32 border-t border-slate-900/60 pt-2">
        <span className="text-[10px] text-slate-500 font-bold block mb-1 uppercase tracking-wider">Session Volume</span>
        <Chart
          options={volumeOptions}
          series={[{ name: "Volume", data: volumeData }]}
          type="bar"
          height="100%"
        />
      </div>
    </div>
  );
}
