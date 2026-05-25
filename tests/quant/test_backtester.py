import unittest
import pandas as pd
import numpy as np
from scripts.quant.backtester import StrangleBacktester

class TestStrangleBacktester(unittest.TestCase):
    def setUp(self):
        # Create synthetic historical data for 5 days
        dates = pd.date_range(start="2026-05-01", periods=5, freq="D")
        
        # Spot price starts at 100, wanders slightly
        self.ohlcv_df = pd.DataFrame({
            "open": [100.0, 101.0, 99.0, 100.5, 98.0],
            "high": [102.0, 101.5, 100.0, 102.5, 99.0],
            "low": [99.0, 98.5, 97.5, 99.5, 97.0],
            "close": [101.0, 99.0, 100.5, 98.0, 97.5],
            "volume": [1000, 1500, 1200, 1800, 2000]
        }, index=dates)
        
        # Expected ranges: SD width is 2.0. So +1.5 SD = Spot + 3.0, -1.5 SD = Spot - 3.0
        # Let's add them as columns or pass them
        self.sd_width = 2.0
        
    def test_backtester_initialization(self):
        backtester = StrangleBacktester(self.ohlcv_df, sd_multiplier=1.5, default_sd_width=2.0)
        self.assertEqual(len(backtester.df), 5)
        
    def test_backtester_run(self):
        # Default options premium received is, say, 0.50 points per leg (1.00 total)
        # We will sell ±1.5 SD strangles
        backtester = StrangleBacktester(self.ohlcv_df, sd_multiplier=1.5, default_sd_width=2.0)
        results = backtester.run(premium_pct=0.01) # 1% of spot price as premium
        
        self.assertIn("win_rate", results)
        self.assertIn("total_return", results)
        self.assertIn("sharpe_ratio", results)
        self.assertIn("max_drawdown", results)
        
        # Verify stats types
        self.assertIsInstance(results["win_rate"], float)
        self.assertIsInstance(results["total_return"], float)
        self.assertIsInstance(results["sharpe_ratio"], float)
        self.assertIsInstance(results["max_drawdown"], float)

if __name__ == "__main__":
    unittest.main()
