import unittest
import numpy as np
from scripts.quant.greeks_engine import OptionGreeksEngine

class TestOptionGreeksEngine(unittest.TestCase):
    def setUp(self):
        self.future_price = 100.0
        self.dte = 10.0 / 365.0
        self.r = 0.05
        
        self.strikes = np.array([90, 95, 100, 105, 110], dtype=float)
        self.ivs = np.array([0.22, 0.18, 0.15, 0.18, 0.22])
        self.call_oi = np.array([100, 500, 1000, 400, 100], dtype=float)
        self.put_oi = np.array([200, 800, 1000, 300, 50], dtype=float)
        
    def test_greeks_engine_initialization(self):
        engine = OptionGreeksEngine(self.future_price, self.dte, self.r)
        self.assertEqual(engine.future_price, 100.0)
        self.assertEqual(engine.dte, 10.0 / 365.0)

    def test_greeks_call_put_delta(self):
        engine = OptionGreeksEngine(self.future_price, self.dte, self.r)
        
        # At ATM (K=100, IV=15%), Delta Call should be ~0.50, Delta Put should be ~-0.50
        c_delta = engine.calculate_delta(100.0, 0.15, is_call=True)
        p_delta = engine.calculate_delta(100.0, 0.15, is_call=False)
        
        self.assertAlmostEqual(c_delta, 0.50, delta=0.05)
        self.assertAlmostEqual(p_delta, -0.50, delta=0.05)
        
        # Verify put-call parity relationship for delta: delta_call - delta_put = e^{-rT}
        self.assertAlmostEqual(c_delta - p_delta, np.exp(-self.r * self.dte), places=4)

    def test_greeks_gamma_positive(self):
        engine = OptionGreeksEngine(self.future_price, self.dte, self.r)
        gamma = engine.calculate_gamma(100.0, 0.15)
        self.assertGreater(gamma, 0.0)

    def test_greeks_vanna_charm(self):
        engine = OptionGreeksEngine(self.future_price, self.dte, self.r)
        vanna = engine.calculate_vanna(100.0, 0.15)
        charm = engine.calculate_charm(100.0, 0.15, is_call=True)
        
        # Just check that they return float values
        self.assertIsInstance(vanna, float)
        self.assertIsInstance(charm, float)

    def test_net_exposures_calculation(self):
        engine = OptionGreeksEngine(self.future_price, self.dte, self.r)
        gex_by_strike = engine.compute_net_gex(self.strikes, self.ivs, self.call_oi, self.put_oi)
        
        # Net GEX should have same length as strikes
        self.assertEqual(len(gex_by_strike), len(self.strikes))
        # Net GEX at ATM should be positive (long gamma from net positions, assuming market makers are long or short depending on sign)
        # Typically Net GEX = (Call OI - Put OI) * Gamma * Spot^2 * contract_multiplier
        # We will check if the structure is correct
        self.assertIsInstance(gex_by_strike[0], float)

if __name__ == "__main__":
    unittest.main()
