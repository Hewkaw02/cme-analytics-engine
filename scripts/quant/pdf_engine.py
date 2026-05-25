import numpy as np
from scipy.interpolate import CubicSpline
from scipy.stats import norm

class OptionPdfEngine:
    def __init__(self, strikes, ivs, future_price, dte, r=0.05):
        """
        Initialize the Option Probability Density Function Engine.
        
        :param strikes: Array-like of option strike prices.
        :param ivs: Array-like of implied volatility values (as decimals, e.g. 0.15 for 15%).
        :param future_price: Current underlying future price.
        :param dte: Days to expiry (expressed as a fraction of a year, e.g. 10/365).
        :param r: Risk-free interest rate (as decimal).
        """
        # Clean and sort inputs
        sorted_indices = np.argsort(strikes)
        self.strikes = np.array(strikes)[sorted_indices]
        self.ivs = np.array(ivs)[sorted_indices]
        self.future_price = float(future_price)
        self.dte = float(dte)
        self.r = float(r)
        
        # Build cubic spline to interpolate IV across strikes
        self.iv_spline = CubicSpline(self.strikes, self.ivs, extrapolate=True)
        
    def get_iv(self, strike):
        """Get implied volatility for a strike price using cubic spline."""
        return float(np.clip(self.iv_spline(strike), 0.01, 10.0))

    def black76_call(self, F, K, T, sigma, r):
        """
        Calculate Black-76 Call Option Price.
        """
        if T <= 0 or sigma <= 0:
            return max(0.0, F - K)
        
        d1 = (np.log(F / K) + 0.5 * (sigma ** 2) * T) / (sigma * np.sqrt(T))
        d2 = d1 - sigma * np.sqrt(T)
        
        discount = np.exp(-r * T)
        return discount * (F * norm.cdf(d1) - K * norm.cdf(d2))

    def compute_pdf(self, num_points=500):
        """
        Computes the Risk-Neutral Probability Density Function (PDF) using the Breeden-Litzenberger theorem.
        Returns:
            grid_strikes: Array of strikes.
            pdf: Array of probability densities.
        """
        # Create a dense grid of strikes covering the range of traded strikes
        min_strike = float(self.strikes[0])
        max_strike = float(self.strikes[-1])
        
        # Grid range should be slightly padded
        grid_strikes = np.linspace(min_strike, max_strike, num_points)
        dk = grid_strikes[1] - grid_strikes[0]
        
        calls = []
        for K in grid_strikes:
            sigma = self.get_iv(K)
            price = self.black76_call(self.future_price, K, self.dte, sigma, self.r)
            calls.append(price)
            
        calls = np.array(calls)
        
        # Finite difference second derivative: d2C / dK2
        # C(K + dK) - 2C(K) + C(K - dK) / dK^2
        pdf = np.zeros_like(grid_strikes)
        
        # Internal points (1 to N-1)
        pdf[1:-1] = (calls[2:] - 2 * calls[1:-1] + calls[:-2]) / (dk ** 2)
        
        # Multiply by discount factor inverse: e^{rT} * d2C/dK2
        pdf = np.exp(self.r * self.dte) * pdf
        
        # Clip negative probabilities due to numerical noise in spline wings
        pdf = np.clip(pdf, 0.0, None)
        
        # Normalize to ensure the PDF integrates to exactly 1.0
        integral = np.sum(pdf) * dk
        if integral > 0:
            pdf = pdf / integral
            
        return grid_strikes, pdf

    def compute_cdf(self, num_points=500):
        """
        Computes the Cumulative Distribution Function (CDF).
        Returns:
            grid_strikes: Array of strikes.
            cdf: Array of cumulative probability values.
        """
        grid_strikes, pdf = self.compute_pdf(num_points)
        dk = grid_strikes[1] - grid_strikes[0]
        
        # Cumulative sum of probabilities
        cdf = np.cumsum(pdf) * dk
        cdf = np.clip(cdf, 0.0, 1.0)
        
        return grid_strikes, cdf
