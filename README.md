# CME Analytics Engine

A robust, production-grade automated pipeline for fetching, parsing, and analyzing CME market data (Options, Futures Open Interest, Intraday OHLCV, and Daily Settlement).

## 🚀 Key Features

- **Multi-Source Scraping**: High-resilience scraping using `camofox-browser` with stealth capabilities and fallback REST API calls.
- **Advanced Analytics**: Real-time calculation of **Max Pain**, **GEX (Gamma Exposure)**, **IV Rank**, and **IV Percentile**.
- **TimescaleDB Integration**: Efficient storage of high-frequency intraday bars and large option chains with automated retention policies.
- **Resilient Scheduler**: Multi-stage scheduling logic (Intraday → Options → OI → Settlement) with built-in retries and circuit breakers.
- **Production Ready**: Fully dockerized environment with health checks and structured logging.

## 🏗 Architecture

```mermaid
graph TD
    S[Scheduler] --> O[Orchestrator]
    O --> B[Browser Pool]
    B --> Sc[Scrapers]
    Sc --> P[Parsers]
    P --> V[Validator]
    V --> DB[(TimescaleDB)]
    DB --> A[Analytics Engine]
    A --> E[Exporters]
    E --> CSV[/Output CSV/]
    Sc -.-> N[Notifications]
```

## 📂 Project Structure

```text
cme-analytics-engine/
├── config/                  # Server configuration templates
├── dashboard/               # Dashboard frontend and web server
├── src/                     # Main TypeScript source code
│   ├── __tests__/           # Unit and integration test suites
│   ├── analytics/           # Financial analytics (Black76, GEX, MaxPain, IVRank, Indicators, VolatilitySurface)
│   ├── backtest/            # Backtesting engine and trading strategies
│   ├── browser/             # Stealth browser pooling and proxy interceptors
│   ├── config/              # Environment configurations and trading symbols
│   ├── db/                  # Database clients, repositories, and TimescaleDB migrations
│   ├── exporters/           # CSV and summary data exporters
│   ├── notifications/       # Slack and Line notification handlers
│   ├── parsers/             # Data validation and parsing logic
│   ├── scrapers/            # Web scraping modules (Option chains, Settlement, Open Interest)
│   ├── utils/               # Common helper utilities (Logger, CircuitBreakers, HolidayCalendars)
│   ├── main.ts              # Entrypoint script
│   ├── orchestrator.ts      # Main pipeline execution orchestrator
│   ├── scheduler.ts         # Intraday and daily job scheduler
│   └── types.ts             # Shared TypeScript type declarations
├── scripts/                 # Utility scripts for data backfill and analysis recomputation
├── Dockerfile               # Containerization configuration
└── docker-compose.yml       # Docker environment configuration with TimescaleDB
```

## 🛠 Setup

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- Residential Proxy (recommended for production scraping)

### Installation
1. Clone the repository
2. Copy `.env.example` to `.env` and configure variables.
3. Install dependencies:
   ```bash
   npm install
   ```

### Running with Docker (Recommended)
```bash
docker-compose up -d
```

### Running Locally
```bash
# Run migrations
npm run db:migrate

# Start the fetcher
npm start
```

## 📖 CLI Usage

| Command | Description |
|---------|-------------|
| `npm start` | Run the main scheduler |
| `npm run backfill -- --symbol ES --days 30` | Backfill historical data |
| `npm run recompute` | Recalculate analytical metrics |
| `npm run test` | Execute full test suite |

## 📊 Data Dictionary

### Options Chain (`options_chain`)
- `trade_date`: The official market date for the data.
- `strike`: Option strike price.
- `option_type`: 'C' (Call) or 'P' (Put).
- `last_price`, `settle_price`: Pricing data.
- `open_interest`, `oi_change`: Market participation metrics.
- `delta`, `gamma`, `theta`, `vega`: Calculated Greeks.
- `moneyness`: ITM, ATM, or OTM classification.

### OI Summary (`oi_expiry_summary`)
- `max_pain`: The strike where option sellers incur minimum payout.
- `net_gex`: Total dealer gamma exposure.
- `gex_flip`: The price level where volatility profile changes.
- `iv_rank`: Current IV relative to 52-week range.

## ⚠️ Troubleshooting

See [RUNBOOK.md](./RUNBOOK.md) for detailed troubleshooting steps regarding bot detection, database connectivity, and browser issues.

---
Developed as part of the CME Data Fetcher Project.
