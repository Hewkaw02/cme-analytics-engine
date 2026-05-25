"use client";

import React, { useRef, useMemo, useEffect, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

interface VolPoint {
  strike: number;
  dte: number;
  iv: number;
}

interface VolatilitySurface3DProps {
  volData: VolPoint[];
  futurePrice: number;
}

// 3D Mesh Component
function SurfaceMesh({ volData, futurePrice }: VolatilitySurface3DProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Group data by DTE and Strike
  const { geometry, center } = useMemo(() => {
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
      return { geometry, center: new THREE.Vector3(0, 0, 0) };
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

    return { geometry, center: new THREE.Vector3(0, 0, 0) };
  }, [volData]);

  // Slowly rotate the mesh over time
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.getElapsedTime() * 0.05;
    }
  });

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshStandardMaterial
        vertexColors
        roughness={0.1}
        metalness={0.8}
        wireframe={true}
        transparent
        opacity={0.7}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export default function VolatilitySurface3D({ volData, futurePrice }: VolatilitySurface3DProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Generate synthetic DTE smile surface if data is small/flat
  const computedVolData = useMemo(() => {
    if (volData && volData.length > 10) return volData;

    // Fallback/Synthetic Surface Generator (Strike vs DTE vs IV)
    const points: VolPoint[] = [];
    const strikes = [80, 85, 90, 95, 100, 105, 110, 115, 120];
    const dtes = [1 / 365, 5 / 365, 10 / 365, 30 / 365, 60 / 365];

    dtes.forEach((dte) => {
      strikes.forEach((strike) => {
        // Option smile formula: ATM has lowest IV, wings have higher IV.
        // IV decays slightly as DTE increases.
        const distFromAtm = Math.abs(strike - futurePrice) / futurePrice;
        const decay = Math.exp(-dte * 2.0);
        const baseIv = 0.15 + (distFromAtm ** 2) * 2.5 * decay;
        points.push({ strike, dte: dte * 365, iv: baseIv });
      });
    });
    return points;
  }, [volData, futurePrice]);

  if (!mounted) {
    return (
      <div className="w-full h-[400px] flex items-center justify-center bg-slate-950/40 rounded-2xl border border-slate-800/80">
        <span className="text-slate-500 text-sm">Initializing 3D Canvas...</span>
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
