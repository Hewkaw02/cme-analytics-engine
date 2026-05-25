import unittest
import numpy as np
from scripts.quant.pdf_engine import OptionPdfEngine

class TestOptionPdfEngine(unittest.TestCase):
    def setUp(self):
        # Create a synthetic options chain around future_price = 100
        self.future_price = 100.0
        self.dte = 10.0 / 365.0 # 10 days
        self.r = 0.05 # 5% risk-free rate
        
        # Strikes from 80 to 120
        self.strikes = np.array([80, 85, 90, 95, 100, 105, 110, 115, 120], dtype=float)
        
        # Smile shaped IV (higher at wings, lower at ATM)
        # e.g., IV of 30% at 80, 15% at 100, 25% at 120
        self.ivs = np.array([0.30, 0.25, 0.20, 0.17, 0.15, 0.17, 0.20, 0.25, 0.30])
        
    def test_pdf_engine_initialization(self):
        engine = OptionPdfEngine(self.strikes, self.ivs, self.future_price, self.dte, self.r)
        self.assertEqual(engine.future_price, 100.0)
        self.assertEqual(engine.dte, 10.0 / 365.0)
        
    def test_pdf_integrates_to_one(self):
        engine = OptionPdfEngine(self.strikes, self.ivs, self.future_price, self.dte, self.r)
        pdf_x, pdf_y = engine.compute_pdf()
        
        # Integration using trapezoidal rule: sum(pdf * dx)
        dx = pdf_x[1] - pdf_x[0]
        integral = np.sum(pdf_y) * dx
        
        # Verify it integrates to ~1.0
        self.assertAlmostEqual(integral, 1.0, places=2)
        
    def test_cdf_monotonically_increasing(self):
        engine = OptionPdfEngine(self.strikes, self.ivs, self.future_price, self.dte, self.r)
        cdf_x, cdf_y = engine.compute_cdf()
        
        # Verify CDF starts near 0 and ends near 1
        self.assertLess(cdf_y[0], 0.05)
        self.assertGreater(cdf_y[-1], 0.95)
        
        # Verify it is monotonically increasing
        diffs = np.diff(cdf_y)
        self.assertTrue(np.all(diffs >= 0.0))

if __name__ == "__main__":
    unittest.main()
