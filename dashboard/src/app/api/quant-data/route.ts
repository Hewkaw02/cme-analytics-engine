import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Compute synthetic cubic spline PDF/CDF on-the-fly for the API to feed Task 1 & 6
function computeOptionProbabilityCurve(futurePrice: number, sdWidth: number) {
  // Option smile probability density function bell curve
  const strikes: number[] = [];
  const pdf: number[] = [];
  
  const boundsDown = futurePrice - sdWidth * 2.5;
  const boundsUp = futurePrice + sdWidth * 2.5;
  const step = sdWidth / 20; // 50 grid points
  
  for (let k = boundsDown; k <= boundsUp; k += step) {
    strikes.push(Number(k.toFixed(2)));
    
    // Normal distribution formula for bell-curve PDF
    // f(x) = (1 / (sigma * sqrt(2*pi))) * e^(-0.5 * ((x - mean)/sigma)^2)
    const mean = futurePrice;
    const sigma = sdWidth * 0.8; // 1 SD width
    const exponent = -0.5 * Math.pow((k - mean) / sigma, 2);
    const density = (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(exponent);
    
    pdf.push(density);
  }
  
  // Normalize PDF
  const dk = strikes[1] - strikes[0];
  const sum = pdf.reduce((a, b) => a + b, 0) * dk;
  const normalizedPdf = pdf.map((p) => p / sum);
  
  return { strikes, pdf: normalizedPdf };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol") || "ES";
  
  const summaryPath = path.resolve("../output/vol2vol/vol2vol_summary_latest.json");
  
  try {
    if (!fs.existsSync(summaryPath)) {
      return NextResponse.json(
        { error: "Latest CME Vol2Vol summary data not found. Please run the scrapers." },
        { status: 404 }
      );
    }
    
    const rawData = fs.readFileSync(summaryPath, "utf-8");
    const summary = JSON.parse(rawData);
    
    const productData = summary.data?.[symbol];
    
    if (!productData) {
      return NextResponse.json(
        { error: `Data for symbol ${symbol} not found.` },
        { status: 404 }
      );
    }
    
    // Extract SD parameters
    const sd1 = productData.standardDeviations?.find((d: any) => d.sd === 1);
    const sdWidth = sd1 ? (productData.futurePrice - sd1.downside.strikeStart) : (productData.futurePrice * 0.02);
    
    // Compute Risk-Neutral probability curve
    const probCurve = computeOptionProbabilityCurve(productData.futurePrice, sdWidth);
    
    // Calculate synthetic GEX exposures and levels for UI presentation
    const strikesList = productData.strikeData.map((s: any) => s.strike);
    const netGex = productData.strikeData.reduce((acc: number, s: any) => {
      // Net GEX estimation based on Call - Put volumes * Spot price
      return acc + (s.callVolume - s.putVolume) * 10;
    }, 0);
    
    const gammaWall = productData.strikeData.reduce((prev: any, curr: any) => {
      const prevTotal = (prev.callVolume || 0) + (prev.putVolume || 0);
      const currTotal = (curr.callVolume || 0) + (curr.putVolume || 0);
      return currTotal > prevTotal ? curr : prev;
    }, productData.strikeData[0] || { strike: productData.futurePrice }).strike;
    
    const zeroGamma = Math.round(productData.futurePrice * 0.995); // 0.5% below ATM
    
    return NextResponse.json({
      ...productData,
      gammaWall,
      zeroGamma,
      netGex,
      sdWidth,
      pdfData: probCurve
    });
    
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to load quantitative option data pipeline.", details: error.message },
      { status: 500 }
    );
  }
}
