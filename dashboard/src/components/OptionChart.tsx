"use client";

import React, { useMemo } from "react";
import dynamic from "next/dynamic";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

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

interface OptionChartProps {
  strikeData: StrikeData[];
  futurePrice: number;
  sdWidth: number;
  standardDeviations: StandardDeviation[];
  mode: "volume" | "oi" | "probability";
  pdfData?: { strikes: number[]; pdf: number[] };
}

export default function OptionChart({
  strikeData,
  futurePrice,
  sdWidth,
  standardDeviations,
  mode,
  pdfData
}: OptionChartProps) {

  // Bounded ±1.5 SD strikes to keep visual density high (Option 2)
  const boundsDown = futurePrice - sdWidth * 1.5;
  const boundsUp = futurePrice + sdWidth * 1.5;

  const filteredData = useMemo(() => {
    return strikeData.filter(
      (s) => s.strike >= boundsDown && s.strike <= boundsUp
    );
  }, [strikeData, boundsDown, boundsUp]);

  const strikes = useMemo(() => filteredData.map((s) => s.strike), [filteredData]);

  // Series data configuration based on selected mode
  const chartSeries = useMemo(() => {
    if (mode === "probability" && pdfData) {
      // Find probability PDF values in range
      const pdfStrikes = [];
      const pdfValues = [];
      for (let i = 0; i < pdfData.strikes.length; i++) {
        const k = pdfData.strikes[i];
        if (k >= boundsDown && k <= boundsUp) {
          pdfStrikes.push(k);
          pdfValues.push(Number((pdfData.pdf[i] * 100).toFixed(4))); // Represent as % density
        }
      }
      return {
        series: [
          {
            name: "Probability Density (PDF %)",
            type: "area",
            data: pdfValues
          }
        ],
        labels: pdfStrikes
      };
    }

    const calls = filteredData.map((s) => (mode === "volume" ? s.callVolume : (s.callOI || 0)));
    const puts = filteredData.map((s) => (mode === "volume" ? s.putVolume : (s.putOI || 0)));
    const ivs = filteredData.map((s) =>
      s.impliedVol !== null ? Number((s.impliedVol * 100).toFixed(2)) : null
    );

    return {
      series: [
        {
          name: mode === "volume" ? "Call Volume" : "Call Open Interest",
          type: "column",
          data: calls
        },
        {
          name: mode === "volume" ? "Put Volume" : "Put Open Interest",
          type: mode === "volume" ? "column" : "column",
          data: puts
        },
        {
          name: "Implied Volatility (IV %)",
          type: "line",
          data: ivs
        }
      ],
      labels: strikes
    };
  }, [filteredData, mode, pdfData, strikes, boundsDown, boundsUp]);

  // Closest strike snapper for annotations
  const getClosestStrike = (val: number, labelList: number[]) => {
    if (labelList.length === 0) return val;
    return labelList.reduce((prev, curr) =>
      Math.abs(curr - val) < Math.abs(prev - val) ? curr : prev
    );
  };

  const labels = chartSeries.labels;
  const atmClosest = getClosestStrike(futurePrice, labels);

  // Parse SD bounds
  const sd1 = standardDeviations.find((d) => d.sd === 1);
  const sd2 = standardDeviations.find((d) => d.sd === 2);

  const sd1Down = sd1?.downside.strikeStart ?? (futurePrice - sdWidth);
  const sd1Up = sd1?.upside.strikeEnd ?? (futurePrice + sdWidth);
  const sd2Down = sd2?.downside.strikeStart ?? (futurePrice - sdWidth * 2);
  const sd2Up = sd2?.upside.strikeEnd ?? (futurePrice + sdWidth * 2);

  const sd1DownClosest = getClosestStrike(sd1Down, labels);
  const sd1UpClosest = getClosestStrike(sd1Up, labels);
  const sd2DownClosest = getClosestStrike(sd2Down, labels);
  const sd2UpClosest = getClosestStrike(sd2Up, labels);

  const chartOptions = useMemo<any>(() => {
    const isProb = mode === "probability";

    return {
      chart: {
        type: "line",
        background: "transparent",
        toolbar: { show: false },
        animations: { enabled: false }
      },
      stroke: {
        width: isProb ? [2] : [0, 0, 3],
        curve: "smooth"
      },
      colors: isProb ? ["#eab308"] : ["#10b981", "#f43f5e", "#eab308"], // emerald, rose, gold
      fill: {
        type: isProb ? "gradient" : "solid",
        opacity: isProb ? [0.4] : [0.85, 0.85, 1],
        gradient: isProb
          ? {
              shadeIntensity: 1,
              opacityFrom: 0.7,
              opacityTo: 0.1,
              colorStops: [
                { offset: 0, color: "#eab308", opacity: 0.6 },
                { offset: 100, color: "#eab308", opacity: 0.05 }
              ]
            }
          : undefined
      },
      plotOptions: {
        bar: {
          columnWidth: "65%",
          borderRadius: 2
        }
      },
      labels: chartSeries.labels,
      xaxis: {
        type: "category",
        title: {
          text: "Strike Price",
          style: { color: "#94a3b8", fontSize: "11px", fontWeight: 600 }
        },
        labels: {
          style: { colors: "#64748b", fontSize: "10px" }
        },
        axisBorder: { show: false },
        axisTicks: { show: false }
      },
      yaxis: isProb
        ? [
            {
              title: {
                text: "Probability Density (%)",
                style: { color: "#94a3b8", fontSize: "11px", fontWeight: 600 }
              },
              labels: {
                style: { colors: "#64748b", fontSize: "10px" }
              }
            }
          ]
        : [
            {
              title: {
                text: mode === "volume" ? "Volume (Contracts)" : "Open Interest (Contracts)",
                style: { color: "#94a3b8", fontSize: "11px", fontWeight: 600 }
              },
              labels: {
                style: { colors: '#64748b', fontSize: '10px' },
                formatter: (val: number) => val?.toLocaleString() ?? ""
              }
            },
            {
              opposite: true,
              title: {
                text: "Implied Volatility (IV %)",
                style: { color: "#eab308", fontSize: "11px", fontWeight: 600 }
              },
              labels: {
                style: { colors: "#eab308", fontSize: "10px" },
                formatter: (val: number) => (val !== null ? val + "%" : "")
              }
            }
          ],
      grid: {
        borderColor: "#1e293b",
        strokeDashArray: 4,
        xaxis: { lines: { show: true } }
      },
      legend: {
        position: "top",
        horizontalAlign: "center",
        fontSize: "12px",
        labels: { colors: "#94a3b8" }
      },
      annotations: {
        xaxis: [
          // ATM Future Line
          {
            x: atmClosest,
            borderColor: "#f59e0b",
            borderWidth: 2,
            strokeDashArray: 3,
            label: {
              borderColor: "#f59e0b",
              style: { color: "#0b0f19", background: "#f59e0b", fontSize: "10px", fontWeight: 700 },
              text: `ATM: ${futurePrice}`
            }
          },
          // -1 SD
          {
            x: sd1DownClosest,
            borderColor: "#06b6d4",
            borderWidth: 1.5,
            strokeDashArray: 4,
            label: {
              borderColor: "#06b6d4",
              style: { color: "#fff", background: "#06b6d4", fontSize: "9px", fontWeight: 600 },
              text: `-1 SD: ${sd1Down.toFixed(1)}`
            }
          },
          // +1 SD
          {
            x: sd1UpClosest,
            borderColor: "#06b6d4",
            borderWidth: 1.5,
            strokeDashArray: 4,
            label: {
              borderColor: "#06b6d4",
              style: { color: "#fff", background: "#06b6d4", fontSize: "9px", fontWeight: 600 },
              text: `+1 SD: ${sd1Up.toFixed(1)}`
            }
          },
          // -2 SD
          {
            x: sd2DownClosest,
            borderColor: "#8b5cf6",
            borderWidth: 1.5,
            strokeDashArray: 5,
            label: {
              borderColor: "#8b5cf6",
              style: { color: "#fff", background: "#8b5cf6", fontSize: "9px", fontWeight: 600 },
              text: `-2 SD: ${sd2Down.toFixed(1)}`
            }
          },
          // +2 SD
          {
            x: sd2UpClosest,
            borderColor: "#8b5cf6",
            borderWidth: 1.5,
            strokeDashArray: 5,
            label: {
              borderColor: '#8b5cf6',
              style: { color: "#fff", background: "#8b5cf6", fontSize: "9px", fontWeight: 600 },
              text: `+2 SD: ${sd2Up.toFixed(1)}`
            }
          }
        ]
      }
    };
  }, [mode, chartSeries.labels, atmClosest, futurePrice, sd1DownClosest, sd1UpClosest, sd2DownClosest, sd2UpClosest, sd1Down, sd1Up, sd2Down, sd2Up, sdWidth]);

  return (
    <div className="w-full h-full min-h-[400px]">
      <Chart
        options={chartOptions}
        series={chartSeries.series}
        type="line"
        height="100%"
      />
    </div>
  );
}
