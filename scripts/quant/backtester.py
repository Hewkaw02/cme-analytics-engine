import numpy as np
import pandas as pd

class StrangleBacktester:
    def __init__(self, ohlcv_df, sd_multiplier=1.5, default_sd_width=2.0):
        """
        Initialize Vectorized Strangle Backtester.
        
        :param ohlcv_df: Pandas DataFrame with columns [open, high, low, close, volume]
        :param sd_multiplier: Number of standard deviations to place the strangle legs (default 1.5)
        :param default_sd_width: Default width of 1 SD as percentage or raw value.
        """
        self.df = ohlcv_df.copy()
        self.sd_multiplier = float(sd_multiplier)
        self.default_sd_width = float(default_sd_width)
        
    def run(self, premium_pct=0.01, stop_loss_multiplier=3.0):
        """
        Run the vectorized strangle backtest.
        
        :param premium_pct: Options premium received as % of spot price (e.g. 0.01 for 1%).
        :param stop_loss_multiplier: Multiplier of premium at which stop loss is triggered (e.g. 3.0 means loss is capped at 3x premium).
        :return: Dict of performance statistics.
        """
        if self.df.empty:
            return {
                "win_rate": 0.0,
                "total_return": 0.0,
                "sharpe_ratio": 0.0,
                "max_drawdown": 0.0
            }
            
        df = self.df
        
        # Calculate daily parameters
        df["spot"] = df["open"]
        df["sd_val"] = self.default_sd_width # Can be expanded to use historical volatility
        
        # Calculate Call & Put strikes
        df["strike_call"] = df["spot"] + (self.sd_multiplier * df["sd_val"])
        df["strike_put"] = df["spot"] - (self.sd_multiplier * df["sd_val"])
        
        # Premium received
        df["premium"] = df["spot"] * premium_pct
        
        # Check if the boundary was breached during the day (using high and low)
        df["breach_call"] = df["high"] >= df["strike_call"]
        df["breach_put"] = df["low"] <= df["strike_put"]
        df["breached"] = df["breach_call"] | df["breach_put"]
        
        # Calculate daily PnL
        # Win: Keep the premium
        # Loss: Trigger stop-loss, net loss = premium - (premium * stop_loss_multiplier)
        win_pnl = df["premium"]
        loss_pnl = df["premium"] - (df["premium"] * stop_loss_multiplier)
        
        df["pnl"] = np.where(df["breached"], loss_pnl, win_pnl)
        df["return"] = df["pnl"] / df["spot"]
        
        # Performance metrics
        total_days = len(df)
        breached_days = int(df["breached"].sum())
        win_days = total_days - breached_days
        win_rate = float(win_days / total_days) if total_days > 0 else 0.0
        
        total_return = float(df["return"].sum())
        
        # Calculate Sharpe Ratio (annualized, assuming daily data)
        mean_ret = df["return"].mean()
        std_ret = df["return"].std()
        if std_ret > 0:
            sharpe_ratio = float((mean_ret / std_ret) * np.sqrt(252))
        else:
            sharpe_ratio = 0.0
            
        # Cumulative returns for drawdown
        df["cum_return"] = (1 + df["return"]).cumprod()
        df["cum_max"] = df["cum_return"].cummax()
        df["drawdown"] = (df["cum_max"] - df["cum_return"]) / df["cum_max"]
        max_drawdown = float(df["drawdown"].max())
        
        return {
            "total_days": total_days,
            "win_days": win_days,
            "breached_days": breached_days,
            "win_rate": win_rate,
            "total_return": total_return,
            "sharpe_ratio": sharpe_ratio,
            "max_drawdown": max_drawdown
        }
