"use client";

import React, { useRef, useMemo, useEffect, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { AlertTriangle, RefreshCw } from "lucide-react";
import dynamic from "next/dynamic";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

interface VolPoint {
  strike: number;
  dte: number;
  iv: number;
}

interface VolatilitySurface3DProps {
  volData: VolPoint[];
  futurePrice: number;
}

function hasWebGL() {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch (e) {
    return false;
  }
}

// 3D Mesh Component
function SurfaceMesh({ volData, futurePrice }: VolatilitySurface3DProps) {
  const meshRef = useRef<THREE.Group>(null);

  // Group data by DTE and Strike
  const { geometry, isValid } = useMemo(() => {
    // Unique sorted DTEs and Strikes
    const dtes = Array.from(new Set(volData.map((d) => d.dte))).sort((a, b) => a - b);
    const strikes = Array.from(new Set(volData.map((d) => d.strike))).sort((a, b) => a - b);

    const nx = strikes.length;
    const ny = dtes.length;

    const geometry = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const indices: number[] = [];
    const colors: number[] = [];

    if (nx < 2 || ny < 2) {
      // Fallback simple mesh if not enough data
      return { geometry, isValid: false };
    }

    // Grid dimensions
    const width = 12.0;
    const depth = 8.0;
    const heightScale = 5.0;

    // Create lookup map for IV
    const ivMap = new Map<string, number>();
    volData.forEach((d) => {
      ivMap.set(`${d.strike}-${d.dte}`, d.iv);
    });

    // Create vertices
    for (let j = 0; j < ny; j++) {
      const dte = dtes[j];
      const z = (j / (ny - 1)) * depth - depth / 2; // DTE maps to Z axis

      for (let i = 0; i < nx; i++) {
        const strike = strikes[i];
        const x = (i / (nx - 1)) * width - width / 2; // Strike maps to X axis

        // Fetch or interpolate IV
        const iv = ivMap.get(`${strike}-${dte}`) ?? 0.15;
        const y = iv * heightScale - 1.0; // IV maps to Y (height)

        vertices.push(x, y, z);

        // Color based on height (Implied Volatility)
        // High IV = Rose Red, Low IV = Emerald Green / Cyan
        const t = Math.min(Math.max(iv * 2, 0.0), 1.0); // normalize
        const r = t;
        const g = 1.0 - t;
        const b = 0.5 + 0.5 * (1.0 - t);
        colors.push(r, g, b);
      }
    }

    // Create indices for faces (quads made of two triangles)
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const row1 = j * nx;
        const row2 = (j + 1) * nx;

        // Tri 1
        indices.push(row1 + i);
        indices.push(row2 + i);
        indices.push(row1 + i + 1);

        // Tri 2
        indices.push(row1 + i + 1);
        indices.push(row2 + i);
        indices.push(row2 + i + 1);
      }
    }

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return { geometry, isValid: true };
  }, [volData]);

  // Slowly rotate the mesh over time
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.getElapsedTime() * 0.05;
    }
  });

  if (!isValid) return null;

  return (
    <group ref={meshRef}>
      {/* Solid glass surface */}
      <mesh geometry={geometry}>
        <meshBasicMaterial
          vertexColors
          transparent
          opacity={0.25}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* Glowing wireframe grid */}
      <mesh geometry={geometry}>
        <meshBasicMaterial
          vertexColors
          wireframe={true}
          transparent
          opacity={0.8}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

export default function VolatilitySurface3D({ volData, futurePrice }: VolatilitySurface3DProps) {
  const [mounted, setMounted] = useState(false);
  const [hasWebgl, setHasWebgl] = useState<boolean | null>(null);

  useEffect(() => {
    setMounted(true);
    setHasWebgl(hasWebGL());
  }, []);

  // Generate synthetic DTE smile surface if data is small/flat
  const computedVolData = useMemo(() => {
    const validFuturePrice = Number(futurePrice) && !isNaN(futurePrice) && futurePrice > 0 ? futurePrice : 100;

    let baseData = volData || [];
    baseData = baseData.filter(d => 
      d && 
      typeof d.strike === 'number' && !isNaN(d.strike) && d.strike > 0 &&
      typeof d.dte === 'number' && !isNaN(d.dte) && d.dte >= 0 &&
      typeof d.iv === 'number' && !isNaN(d.iv) && d.iv >= 0
    );

    if (baseData.length > 10) return baseData;

    // Fallback/Synthetic Surface Generator (Strike vs DTE vs IV)
    const points: VolPoint[] = [];
    const strikes = Array.from({ length: 9 }, (_, i) => {
      const pct = 0.96 + i * 0.01; // from 96% to 104% of ATM
      return Math.round(validFuturePrice * pct);
    });
    const dtes = [1 / 365, 5 / 365, 10 / 365, 30 / 365, 60 / 365];

    dtes.forEach((dte) => {
      strikes.forEach((strike) => {
        const distFromAtm = Math.abs(strike - validFuturePrice) / validFuturePrice;
        const decay = Math.exp(-dte * 2.0);
        const baseIv = 0.15 + (distFromAtm ** 2) * 2.5 * decay;
        points.push({ strike, dte: dte * 365, iv: baseIv });
      });
    });
    return points;
  }, [volData, futurePrice]);

  const fallbackChartData = useMemo(() => {
    const dteMap = new Map<number, { strike: number; iv: number }[]>();
    computedVolData.forEach((p) => {
      const dteRounded = Math.round(p.dte * 10) / 10;
      if (!dteMap.has(dteRounded)) {
        dteMap.set(dteRounded, []);
      }
      dteMap.get(dteRounded)!.push({ strike: p.strike, iv: p.iv });
    });

    const series: any[] = [];
    const allStrikes = Array.from(new Set(computedVolData.map((p) => p.strike))).sort((a, b) => a - b);

    dteMap.forEach((points, dte) => {
      points.sort((a, b) => a.strike - b.strike);
      const dataPoints = allStrikes.map((s) => {
        const match = points.find((p) => p.strike === s);
        return match ? Number((match.iv * 100).toFixed(2)) : null;
      });

      series.push({
        name: `${dte} DTE`,
        data: dataPoints,
      });
    });

    return { series, categories: allStrikes };
  }, [computedVolData]);

  const chartOptions: any = {
    chart: {
      type: "line",
      background: "transparent",
      toolbar: { show: false },
      animations: { enabled: true },
    },
    theme: { mode: "dark" },
    stroke: { curve: "smooth", width: 2 },
    colors: ["#34d399", "#38bdf8", "#fbbf24", "#f43f5e", "#a78bfa"],
    xaxis: {
      categories: fallbackChartData.categories,
      title: { text: "Strike Price", style: { color: "#94a3b8" } },
      labels: { style: { colors: "#94a3b8" } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      title: { text: "Implied Volatility (%)", style: { color: "#94a3b8" } },
      labels: { style: { colors: "#94a3b8" } },
    },
    grid: { borderColor: "#1e293b", strokeDashArray: 4 },
    tooltip: { theme: "dark" },
    legend: { labels: { colors: "#94a3b8" } },
  };

  if (!mounted) {
    return (
      <div className="w-full h-[400px] flex items-center justify-center bg-slate-950/40 rounded-2xl border border-slate-800/80">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
          <span className="text-slate-500 text-sm">Initializing 3D Canvas...</span>
        </div>
      </div>
    );
  }

  if (hasWebgl === false) {
    return (
      <div className="w-full h-[400px] bg-slate-950/20 rounded-2xl border border-slate-800/50 overflow-hidden relative flex flex-col p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider block">Implied Volatility Smile (2D Fallback)</span>
            <span className="text-[10px] text-slate-500">Strike vs Implied Volatility (%) • WebGL is not supported in this browser</span>
          </div>
          <span className="text-[10px] bg-slate-800/80 text-yellow-500 border border-yellow-500/20 px-2 py-0.5 rounded font-medium">
            2D Mode
          </span>
        </div>
        <div className="flex-1 w-full min-h-[300px]">
          <Chart options={chartOptions} series={fallbackChartData.series} type="line" height="100%" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-[400px] bg-slate-950/20 rounded-2xl border border-slate-800/50 overflow-hidden relative">
      <div className="absolute top-4 left-4 z-10">
        <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider block">Implied Volatility Surface</span>
        <span className="text-[10px] text-slate-500">Strike (X) vs Expiry Days (Z) vs Volatility (Y) • Drag to Rotate</span>
      </div>
      <Canvas camera={{ position: [5, 5, 8], fov: 45 }}>
        <ambientLight intensity={0.4} />
        <pointLight position={[10, 10, 10]} intensity={1.5} />
        <directionalLight position={[-5, 5, -5]} intensity={0.6} />
        <SurfaceMesh volData={computedVolData} futurePrice={futurePrice} />
        <OrbitControls enableZoom={true} maxPolarAngle={Math.PI / 2 - 0.05} />
      </Canvas>
    </div>
  );
}
