import numpy as np
from scipy.stats import norm

class OptionGreeksEngine:
    def __init__(self, future_price, dte, r=0.05):
        """
        Initialize Option Greeks Engine under Black-76 (standard for futures options).
        
        :param future_price: Underling futures contract price (F).
        :param dte: Days to expiry as fraction of a year (T).
        :param r: Risk-free rate (r).
        """
        self.future_price = float(future_price)
        self.dte = float(dte)
        self.r = float(r)
        
    def _d1_d2(self, K, sigma):
        """Helper to calculate d1 and d2 under Black-76."""
        if self.dte <= 0 or sigma <= 0:
            return 0.0, 0.0
        d1 = (np.log(self.future_price / K) + 0.5 * (sigma ** 2) * self.dte) / (sigma * np.sqrt(self.dte))
        d2 = d1 - sigma * np.sqrt(self.dte)
        return d1, d2

    def calculate_delta(self, K, sigma, is_call=True):
        """
        Calculate Black-76 Delta.
        Delta Call = e^{-rT} * N(d1)
        Delta Put = -e^{-rT} * N(-d1)
        """
        d1, _ = self._d1_d2(K, sigma)
        discount = np.exp(-self.r * self.dte)
        if is_call:
            return discount * norm.cdf(d1)
        else:
            return -discount * norm.cdf(-d1)

    def calculate_gamma(self, K, sigma):
        """
        Calculate Black-76 Gamma.
        Gamma = (e^{-rT} * N'(d1)) / (F * sigma * sqrt(T))
        """
        if self.dte <= 0 or sigma <= 0:
            return 0.0
        d1, _ = self._d1_d2(K, sigma)
        discount = np.exp(-self.r * self.dte)
        pdf_d1 = norm.pdf(d1)
        return (discount * pdf_d1) / (self.future_price * sigma * np.sqrt(self.dte))

    def calculate_vega(self, K, sigma):
        """
        Calculate Black-76 Vega.
        Vega = e^{-rT} * F * sqrt(T) * N'(d1)
        """
        if self.dte <= 0 or sigma <= 0:
            return 0.0
        d1, _ = self._d1_d2(K, sigma)
        discount = np.exp(-self.r * self.dte)
        return discount * self.future_price * np.sqrt(self.dte) * norm.pdf(d1)

    def calculate_vanna(self, K, sigma):
        """
        Calculate Black-76 Vanna (dDelta / dSigma).
        Vanna = -e^{-rT} * N'(d1) * (d2 / sigma)
        """
        if self.dte <= 0 or sigma <= 0:
            return 0.0
        d1, d2 = self._d1_d2(K, sigma)
        discount = np.exp(-self.r * self.dte)
        return -discount * norm.pdf(d1) * (d2 / sigma)

    def calculate_charm(self, K, sigma, is_call=True):
        """
        Calculate Black-76 Charm (dDelta / dT) using high-precision central difference.
        """
        h = 1e-5 # tiny DTE step
        if self.dte <= h:
            return 0.0
            
        # Central difference approximation
        self.dte += h
        delta_plus = self.calculate_delta(K, sigma, is_call)
        self.dte -= 2 * h
        delta_minus = self.calculate_delta(K, sigma, is_call)
        self.dte += h # restore
        
        return (delta_plus - delta_minus) / (2 * h)

    def compute_net_gex(self, strikes, ivs, call_oi, put_oi, multiplier=1.0):
        """
        Compute net Gamma Exposure (GEX) by strike price.
        Formula: (Call_OI * Gamma - Put_OI * Gamma) * Spot^2 * multiplier
        """
        gex_list = []
        for K, iv, c_oi, p_oi in zip(strikes, ivs, call_oi, put_oi):
            if iv is None or iv <= 0:
                gex_list.append(0.0)
                continue
            gamma = self.calculate_gamma(K, iv)
            # Standard assumption: MM is long calls, short puts
            net_gamma = (c_oi - p_oi) * gamma
            # Net GEX in dollar value: Gamma * Spot^2 * Multiplier
            gex = net_gamma * (self.future_price ** 2) * multiplier
            gex_list.append(float(gex))
        return gex_list

    def compute_net_vanna(self, strikes, ivs, call_oi, put_oi, multiplier=1.0):
        """
        Compute net Vanna Exposure by strike price.
        Formula: (Call_OI * Vanna - Put_OI * Vanna) * Spot * multiplier
        """
        vanna_list = []
        for K, iv, c_oi, p_oi in zip(strikes, ivs, call_oi, put_oi):
            if iv is None or iv <= 0:
                vanna_list.append(0.0)
                continue
            vanna = self.calculate_vanna(K, iv)
            net_vanna = (c_oi - p_oi) * vanna
            gex_vanna = net_vanna * self.future_price * multiplier
            vanna_list.append(float(gex_vanna))
        return vanna_list

    def compute_net_charm(self, strikes, ivs, call_oi, put_oi, multiplier=1.0):
        """
        Compute net Charm Exposure by strike price.
        Formula: (Call_OI * Charm_Call - Put_OI * Charm_Put) * Spot * multiplier
        """
        charm_list = []
        for K, iv, c_oi, p_oi in zip(strikes, ivs, call_oi, put_oi):
            if iv is None or iv <= 0:
                charm_list.append(0.0)
                continue
            c_charm = self.calculate_charm(K, iv, is_call=True)
            p_charm = self.calculate_charm(K, iv, is_call=False)
            net_charm = (c_oi * c_charm) - (p_oi * p_charm)
            gex_charm = net_charm * self.future_price * multiplier
            charm_list.append(float(gex_charm))
        return charm_list
