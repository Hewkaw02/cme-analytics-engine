# CME Data Fetcher — Program Specification

**Version:** 2.0  
**วันที่:** 2025-05-12  
**สถานะ:** Draft  
**ผู้เขียน:** —

---

## สารบัญ

1. [ภาพรวมโปรแกรม](#1-ภาพรวมโปรแกรม)
2. [ประเภทข้อมูลทั้งหมดที่ดึง](#2-ประเภทข้อมูลทั้งหมดที่ดึง)
3. [สัญลักษณ์ที่ใช้ (Instruments)](#3-สัญลักษณ์ที่ใช้)
4. [Stack และ Dependencies](#4-stack-และ-dependencies)
5. [CME Target URLs และ API Endpoints](#5-cme-target-urls-และ-api-endpoints)
6. [Data Specification — Options Chain](#6-data-specification--options-chain)
7. [Data Specification — Open Interest (OI)](#7-data-specification--open-interest-oi)
8. [Data Specification — Intraday OHLCV](#8-data-specification--intraday-ohlcv)
9. [Architecture ภาพรวม](#9-architecture-ภาพรวม)
10. [Browser Session ด้วย Camofox](#10-browser-session-ด้วย-camofox)
11. [Scraper Modules รายละเอียด](#11-scraper-modules-รายละเอียด)
12. [Data Parsing & Validation](#12-data-parsing--validation)
13. [Database Schema ทั้งหมด](#13-database-schema-ทั้งหมด)
14. [Scheduler & Timing](#14-scheduler--timing)
15. [Error Handling & Retry Logic](#15-error-handling--retry-logic)
16. [Output Files & Export](#16-output-files--export)
17. [Project Structure](#17-project-structure)
18. [Environment Variables](#18-environment-variables)
19. [การ Deploy](#19-การ-deploy)
20. [Edge Cases](#20-edge-cases)
21. [Derived Metrics (คำนวณเพิ่ม)](#21-derived-metrics-คำนวณเพิ่ม)
22. [Milestones](#22-milestones)
23. [ข้อควรระวัง](#23-ข้อควรระวัง)

---

## 1. ภาพรวมโปรแกรม

โปรแกรมนี้ทำหน้าที่ดึงข้อมูลตลาด Futures และ Options จาก **CME Group** อัตโนมัติทุกวัน โดยครอบคลุมข้อมูล **3 ประเภทหลัก**:

| # | ประเภทข้อมูล | รายละเอียด |
|---|-------------|------------|
| 1 | **Options Chain** | ทุก Strike × Call/Put — Price, Volume, Greeks, IV |
| 2 | **Open Interest (OI)** | OI รายวัน ทั้ง Futures และ Options แยก Strike |
| 3 | **Intraday OHLCV** | OHLCV bar รายนาที / หลายไทม์เฟรม ของ Futures |

สำหรับ **3 Instruments**: ES (E-mini S&P 500), NQ (E-mini NASDAQ-100), GC (Gold)

ใช้ **camofox-browser** (`https://github.com/jo-inc/camofox-browser`) เป็น browser engine หลัก สำหรับ bypass CME anti-bot และดึงข้อมูลจากหน้าเว็บที่ต้องการ JavaScript rendering

---

## 2. ประเภทข้อมูลทั้งหมดที่ดึง

```
CME Data Fetcher
│
├── A. Options Chain (End-of-Day)
│   ├── ทุก Expiry (Front + 2 months)
│   ├── ทุก Strike Price
│   ├── Call: Last, Bid, Ask, Volume, OI, Delta, Gamma, Theta, Vega, IV
│   └── Put:  Last, Bid, Ask, Volume, OI, Delta, Gamma, Theta, Vega, IV
│
├── B. Open Interest (OI)
│   ├── B1. Futures OI รายวัน (Total per Contract)
│   ├── B2. Options OI รายวัน แยก Strike × Call/Put
│   ├── B3. OI Change (วันนี้ vs เมื่อวาน)
│   ├── B4. Put/Call OI Ratio
│   └── B5. OI Report (CME Daily Bulletin)
│
└── C. Intraday OHLCV (Futures)
    ├── Timeframe: 1m, 5m, 15m, 30m, 1H, 4H, Daily
    ├── Fields: Open, High, Low, Close, Volume, VWAP
    ├── Extended Hours: เปิด 17:00 CT วันก่อน ถึง 16:00 CT
    └── ดึงทุกวัน: intraday ของวันนั้น + EOD bar
```

---

## 3. สัญลักษณ์ที่ใช้

| Symbol | ชื่อเต็ม | Exchange | Product Code | Contract Size | Tick Size |
|--------|----------|----------|-------------|--------------|-----------|
| **ES** | E-mini S&P 500 Futures | CME | 441 | $50 × Index | 0.25 pt |
| **NQ** | E-mini NASDAQ-100 Futures | CME | 425 | $20 × Index | 0.25 pt |
| **GC** | Gold Futures | COMEX | 437 | 100 troy oz | $0.10/oz |

### Options ที่ดึง

| Symbol | Options Type | Expiry Cycle | Strikes (approx) |
|--------|-------------|-------------|-----------------|
| ES | American-style weekly + monthly | Weekly (EW1-EW4) + Monthly | ~200–400 strikes ต่อ expiry |
| NQ | American-style weekly + monthly | Weekly (QN) + Monthly | ~150–300 strikes ต่อ expiry |
| GC | American-style | Monthly | ~200–500 strikes ต่อ expiry |

---

## 4. Stack และ Dependencies

| Component | Library / Tool | Version | หน้าที่ |
|-----------|---------------|---------|--------|
| **Browser Engine** | `camofox-browser` | latest | Stealth scraping, anti-bot bypass |
| **Runtime** | Node.js | ≥ 18 LTS | JavaScript runtime |
| **ภาษา** | TypeScript | ≥ 5.0 | Type safety |
| **DB Primary** | PostgreSQL | ≥ 16 | เก็บข้อมูลทั้งหมด |
| **DB Time-series** | TimescaleDB (extension) | ≥ 2.x | Intraday bars, hypertable |
| **ORM / Query** | `pg` + `kysely` | latest | Type-safe SQL |
| **Scheduler** | `node-cron` | ≥ 3.x | Cron jobs |
| **HTTP Client** | `axios` | ≥ 1.x | REST API calls |
| **Logging** | `winston` | ≥ 3.x | Structured logs |
| **CSV Export** | `papaparse` / `fast-csv` | latest | CSV generation |
| **Config** | `dotenv` + `zod` | latest | Env validation |
| **Notification** | `axios` (webhook) | — | Slack / Line |
| **Compression** | `zlib` | built-in | Parquet/gzip export |

---

## 5. CME Target URLs และ API Endpoints

### 5.1 Options Chain Pages (Browser scrape)

```
ES: https://www.cmegroup.com/markets/equities/sp/e-mini-sandp500.quotes.options.html
NQ: https://www.cmegroup.com/markets/equities/nasdaq/e-mini-nasdaq-100.quotes.options.html
GC: https://www.cmegroup.com/markets/metals/precious/gold.quotes.options.html
```

### 5.2 Futures Quote Pages (สำหรับ underlying price + Intraday)

```
ES: https://www.cmegroup.com/markets/equities/sp/e-mini-sandp500.quotes.html
NQ: https://www.cmegroup.com/markets/equities/nasdaq/e-mini-nasdaq-100.quotes.html
GC: https://www.cmegroup.com/markets/metals/precious/gold.quotes.html
```

### 5.3 CME REST API Endpoints (ใช้ผ่าน intercept หรือ direct call)

```
# Futures Quote
GET https://www.cmegroup.com/CmeWS/mvc/Quotes/Future/{productCode}/G
    → ราคา Futures ล่าสุด, Volume, OI รวม

# Options Chain JSON
GET https://www.cmegroup.com/CmeWS/mvc/Quotes/Option/{productCode}/{expiryCode}
    → JSON ทุก Strike × Call/Put

# OI รายวัน (Daily OI Report)
GET https://www.cmegroup.com/CmeWS/mvc/ProductSlate/V2/List
    ?page=1&pageSize=50&sortField=oi&sortAsc=false
    &tradeDate={YYYY-MM-DD}&sector=EQUITY&exchange=CME
    → OI summary ต่อ product

# Intraday Chart Data
GET https://www.cmegroup.com/CmeWS/mvc/md/c/{productCode}/{contractCode}/chart
    ?startTime={UNIX_MS}&endTime={UNIX_MS}&period={PERIOD}
    Period: 1m=60, 5m=300, 15m=900, 30m=1800, 1h=3600, 1D=86400

# CME Daily Settlement (EOD price official)
GET https://www.cmegroup.com/CmeWS/mvc/Settlements/futures/settlements/
    {productCode}/G?tradeDate={YYYY-MM-DD}&type=VOLUME

# CME Daily Bulletin OI (official PDF / JSON)
GET https://www.cmegroup.com/daily-bulletin/preliminary-volume-oi.html
```

### 5.4 Network Intercept Strategy

```typescript
// แทนที่จะ parse HTML อย่างเดียว — intercept XHR/Fetch ที่ CME page ยิงออกมา
// เพื่อได้ JSON โดยตรง ซึ่ง stable กว่า HTML selectors

page.on('response', async (response) => {
  const url = response.url();
  if (url.includes('/CmeWS/mvc/Quotes/Option/')) {
    const json = await response.json();
    await optionsQueue.push({ symbol, expiry, raw: json });
  }
  if (url.includes('/CmeWS/mvc/md/c/') && url.includes('/chart')) {
    const json = await response.json();
    await intradayQueue.push({ symbol, period, raw: json });
  }
});
```

---

## 6. Data Specification — Options Chain

### 6.1 ข้อมูลที่ต้องดึงต่อ Strike

ดึงทุก Expiry ที่ active — **Front Month + 2 Expiries ถัดไป** (สำหรับ weekly options ของ ES/NQ จะได้ประมาณ 6–8 expiries)

| ฟิลด์ | ประเภท | คำอธิบาย | หน่วย |
|-------|--------|----------|-------|
| `trade_date` | DATE | วันที่ record | YYYY-MM-DD |
| `fetched_at` | TIMESTAMPTZ | เวลาที่ดึงข้อมูลจริง (UTC) | — |
| `symbol` | VARCHAR(5) | ES / NQ / GC | — |
| `expiry_code` | VARCHAR(15) | รหัส contract เช่น `ESM25` | — |
| `expiry_date` | DATE | วันหมดอายุ options | YYYY-MM-DD |
| `days_to_expiry` | SMALLINT | จำนวนวันถึง expiry | วัน |
| `strike` | DECIMAL(12,2) | ราคา Strike | pts / USD |
| `option_type` | CHAR(1) | `C` = Call, `P` = Put | — |
| `last_price` | DECIMAL(12,4) | ราคา trade ล่าสุด | pts |
| `settle_price` | DECIMAL(12,4) | ราคา settlement (EOD) | pts |
| `bid` | DECIMAL(12,4) | ราคา Bid ล่าสุด | pts |
| `ask` | DECIMAL(12,4) | ราคา Ask ล่าสุด | pts |
| `bid_size` | INT | จำนวน lot ที่ bid | contracts |
| `ask_size` | INT | จำนวน lot ที่ ask | contracts |
| `volume` | BIGINT | Volume วันนั้น | contracts |
| `open_interest` | BIGINT | Open Interest ณ EOD | contracts |
| `oi_change` | BIGINT | OI เปลี่ยนแปลงจากวันก่อน | contracts |
| `high` | DECIMAL(12,4) | ราคาสูงสุดของวัน | pts |
| `low` | DECIMAL(12,4) | ราคาต่ำสุดของวัน | pts |
| `open` | DECIMAL(12,4) | ราคาเปิดของวัน | pts |
| `delta` | DECIMAL(8,6) | Greek: Delta | 0–1 (Call), -1–0 (Put) |
| `gamma` | DECIMAL(8,6) | Greek: Gamma | — |
| `theta` | DECIMAL(8,6) | Greek: Theta (per day) | pts/day |
| `vega` | DECIMAL(8,6) | Greek: Vega | pts/1% IV |
| `rho` | DECIMAL(8,6) | Greek: Rho | — |
| `implied_vol` | DECIMAL(8,6) | Implied Volatility | 0.0000–3.0000 (decimal) |
| `theoretical_value` | DECIMAL(12,4) | ราคา theoretical ตาม model | pts |
| `underlying_price` | DECIMAL(12,4) | ราคา Futures ณ เวลาดึง | pts |
| `intrinsic_value` | DECIMAL(12,4) | คำนวณ = max(0, underlying - strike) | pts |
| `time_value` | DECIMAL(12,4) | last_price - intrinsic_value | pts |
| `moneyness` | VARCHAR(5) | ITM / ATM / OTM | — |
| `is_valid` | BOOLEAN | ผ่าน validation หรือไม่ | — |

### 6.2 Expiry ที่ดึง (ต่อ Symbol)

```
ES Options Expiries (ดึงทั้งหมด):
  - Weekly: EW1 (สัปดาห์ที่ 1), EW2, EW3, EW4, EW5 (ถ้ามี)
  - Monthly: ESH25, ESM25, ESU25
  - End-of-Month (EOM): ถ้า active

NQ Options Expiries:
  - Weekly: QN1, QN2, QN3, QN4
  - Monthly: NQH25, NQM25, NQU25

GC Options Expiries:
  - Monthly เท่านั้น: GCJ25, GCM25, GCQ25, GCV25
```

---

## 7. Data Specification — Open Interest (OI)

OI เป็นข้อมูลสำคัญมาก แยกเป็น **5 ระดับ**:

### 7.1 Futures OI รายวัน (Aggregate)

ดึงจาก CME Daily Settlement / Product Slate

| ฟิลด์ | ประเภท | คำอธิบาย |
|-------|--------|----------|
| `trade_date` | DATE | วันที่ |
| `symbol` | VARCHAR(5) | ES / NQ / GC |
| `expiry_code` | VARCHAR(15) | contract month |
| `expiry_date` | DATE | วันหมดอายุ |
| `total_oi` | BIGINT | OI รวมทั้ง contract |
| `oi_change` | BIGINT | เปลี่ยนจากวันก่อน |
| `oi_change_pct` | DECIMAL(8,4) | % เปลี่ยนแปลง |
| `total_volume` | BIGINT | Volume ของวัน |
| `settle_price` | DECIMAL(12,4) | ราคา settlement |
| `prior_settle` | DECIMAL(12,4) | settlement วันก่อน |
| `price_change` | DECIMAL(12,4) | settlement change |
| `fetched_at` | TIMESTAMPTZ | เวลาดึง |

### 7.2 Options OI แยก Strike × Call/Put (รายวัน)

นี่คือ OI ที่อยู่ใน Options Chain แล้ว (section 6) — แต่จัดเพิ่มใน view/table แยกเพื่อวิเคราะห์

| ฟิลด์ | ประเภท | คำอธิบาย |
|-------|--------|----------|
| `trade_date` | DATE | วันที่ |
| `symbol` | VARCHAR(5) | ES / NQ / GC |
| `expiry_code` | VARCHAR(15) | contract |
| `strike` | DECIMAL(12,2) | Strike Price |
| `call_oi` | BIGINT | OI ฝั่ง Call |
| `put_oi` | BIGINT | OI ฝั่ง Put |
| `call_oi_change` | BIGINT | Call OI เปลี่ยนจากเมื่อวาน |
| `put_oi_change` | BIGINT | Put OI เปลี่ยนจากเมื่อวาน |
| `call_volume` | BIGINT | Call Volume วันนั้น |
| `put_volume` | BIGINT | Put Volume วันนั้น |
| `call_iv` | DECIMAL(8,6) | Implied Vol ฝั่ง Call |
| `put_iv` | DECIMAL(8,6) | Implied Vol ฝั่ง Put |
| `iv_skew` | DECIMAL(8,6) | put_iv - call_iv (skew) |
| `net_delta_exposure` | DECIMAL(14,4) | call_oi×delta_C + put_oi×delta_P |

### 7.3 OI Summary ต่อ Expiry (Computed)

คำนวณหลังดึงข้อมูลแต่ละ expiry เสร็จ บันทึกใน `oi_expiry_summary`

| ฟิลด์ | ประเภท | คำอธิบาย |
|-------|--------|----------|
| `trade_date` | DATE | — |
| `symbol` | VARCHAR(5) | — |
| `expiry_code` | VARCHAR(15) | — |
| `total_call_oi` | BIGINT | OI Call รวมทุก Strike |
| `total_put_oi` | BIGINT | OI Put รวมทุก Strike |
| `total_call_volume` | BIGINT | Volume Call รวม |
| `total_put_volume` | BIGINT | Volume Put รวม |
| `put_call_oi_ratio` | DECIMAL(8,4) | total_put_oi / total_call_oi |
| `put_call_vol_ratio` | DECIMAL(8,4) | total_put_volume / total_call_volume |
| `max_call_oi_strike` | DECIMAL(12,2) | Strike ที่ Call OI สูงสุด ("Call Wall") |
| `max_put_oi_strike` | DECIMAL(12,2) | Strike ที่ Put OI สูงสุด ("Put Wall") |
| `max_pain_strike` | DECIMAL(12,2) | Max Pain Strike (คำนวณ) |
| `net_gamma_exposure` | DECIMAL(16,4) | GEX รวม (dealers' gamma) |
| `atm_iv_call` | DECIMAL(8,6) | IV ของ ATM Call |
| `atm_iv_put` | DECIMAL(8,6) | IV ของ ATM Put |
| `atm_iv_skew` | DECIMAL(8,6) | ATM skew |
| `underlying_price` | DECIMAL(12,4) | ราคา underlying ณ เวลาดึง |

### 7.4 OI Heatmap Data (สำหรับ visualization)

เก็บ Snapshot ของ OI ณ ทุก Strike เพื่อสร้าง heatmap รายวัน

```sql
-- ดึงจาก options_chain table ตรงๆ ด้วย query
SELECT
    trade_date, symbol, expiry_code, strike,
    call_oi, put_oi,
    call_oi - LAG(call_oi) OVER w AS call_oi_change,
    put_oi  - LAG(put_oi)  OVER w AS put_oi_change
FROM oi_by_strike
WINDOW w AS (PARTITION BY symbol, expiry_code, strike ORDER BY trade_date)
ORDER BY symbol, expiry_code, strike;
```

### 7.5 CME Daily Bulletin OI (Official)

ดึง PDF/JSON รายงาน OI อย่างเป็นทางการจาก CME Daily Bulletin
URL: `https://www.cmegroup.com/daily-bulletin/`

| ฟิลด์ | คำอธิบาย |
|-------|----------|
| `report_date` | วันที่ของรายงาน |
| `product_group` | Equity / Metal |
| `product_name` | E-mini S&P 500 |
| `symbol` | ES / NQ / GC |
| `expiry` | contract month |
| `open` | Open price |
| `high` | High price |
| `low` | Low price |
| `settle` | Settlement price |
| `est_volume` | Estimated Volume |
| `prior_oi` | OI วันก่อน |
| `oi` | OI วันนั้น |

---

## 8. Data Specification — Intraday OHLCV

### 8.1 Timeframes ที่ดึง

| Timeframe | ชื่อย่อ | จำนวน bar ต่อวัน (23hr session) | Retention |
|----------|--------|-------------------------------|----------|
| 1 นาที | `1m` | ~1,380 bars | 90 วัน |
| 5 นาที | `5m` | ~276 bars | 180 วัน |
| 15 นาที | `15m` | ~92 bars | 1 ปี |
| 30 นาที | `30m` | ~46 bars | 2 ปี |
| 1 ชั่วโมง | `1h` | ~23 bars | 5 ปี |
| 4 ชั่วโมง | `4h` | ~6 bars | 5 ปี |
| Daily | `1D` | 1 bar | ไม่จำกัด |

> **Session time ES/NQ:** 17:00 CT (วันก่อน) → 16:00 CT  
> **Session time GC:** 17:00 CT (วันก่อน) → 16:00 CT  
> รวม ~23 ชั่วโมงต่อวัน (Monday–Friday)

### 8.2 Fields ต่อ Bar

| ฟิลด์ | ประเภท | คำอธิบาย | หน่วย |
|-------|--------|----------|-------|
| `bar_time` | TIMESTAMPTZ | เวลาเปิด bar (UTC) | — |
| `bar_close_time` | TIMESTAMPTZ | เวลาปิด bar (UTC) | — |
| `symbol` | VARCHAR(5) | ES / NQ / GC | — |
| `timeframe` | VARCHAR(5) | 1m / 5m / 15m / 30m / 1h / 4h / 1D | — |
| `expiry_code` | VARCHAR(15) | contract ที่ active (front month) | — |
| `open` | DECIMAL(12,4) | ราคาเปิด bar | pts / USD |
| `high` | DECIMAL(12,4) | ราคาสูงสุดใน bar | pts / USD |
| `low` | DECIMAL(12,4) | ราคาต่ำสุดใน bar | pts / USD |
| `close` | DECIMAL(12,4) | ราคาปิด bar | pts / USD |
| `volume` | BIGINT | Volume ใน bar | contracts |
| `vwap` | DECIMAL(12,4) | Volume-Weighted Average Price | pts / USD |
| `buy_volume` | BIGINT | Volume ฝั่ง buy (ถ้า CME ให้) | contracts |
| `sell_volume` | BIGINT | Volume ฝั่ง sell (ถ้า CME ให้) | contracts |
| `delta_volume` | BIGINT | buy_volume - sell_volume | contracts |
| `trade_count` | INT | จำนวน trades ใน bar | — |
| `session` | VARCHAR(10) | GLOBEX / RTH / ETH | — |
| `is_rth` | BOOLEAN | Regular Trading Hours (08:30–15:15 CT) | — |
| `fetched_at` | TIMESTAMPTZ | เวลาที่ดึงข้อมูล | — |

### 8.3 RTH vs ETH แยก

| Session | ES/NQ (CT) | GC (CT) |
|---------|-----------|---------|
| **ETH (Electronic/Globex)** | 17:00–08:30 | 17:00–07:20 |
| **RTH (Regular)** | 08:30–15:15 | 07:20–13:30 |
| **Overnight Gap** | 15:15–17:00 | 13:30–17:00 |

### 8.4 Derived Indicators (คำนวณต่อ bar, บันทึกใน DB)

| Indicator | คำอธิบาย | Formula |
|-----------|----------|---------|
| `vwap_session` | VWAP รีเซ็ตทุก session | Σ(price×vol) / Σvol |
| `ema_9` | EMA 9 periods | — |
| `ema_21` | EMA 21 periods | — |
| `atr_14` | ATR 14 periods | Wilder's ATR |
| `rsi_14` | RSI 14 | Wilder's RSI |
| `bb_upper` | Bollinger Band Upper (20,2) | SMA20 + 2σ |
| `bb_lower` | Bollinger Band Lower | SMA20 - 2σ |

> หมายเหตุ: Indicators คำนวณ post-fetch ด้วย SQL window function ไม่ดึงจาก CME

---

## 9. Architecture ภาพรวม

```
┌──────────────────────────────────────────────────────────────────┐
│                         SCHEDULER                                │
│  Intraday: ทุก 5 นาที (ระหว่าง session)                          │
│  Options + OI: 1 ครั้ง/วัน หลังตลาดปิด                           │
│  CME Bulletin: 1 ครั้ง/วัน ช่วงเย็น                               │
└─────────────────────────┬────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────────┐
│                       ORCHESTRATOR                               │
│  - กำหนด job queue: [OPTIONS, OI, INTRADAY, BULLETIN]            │
│  - จัดลำดับ symbol: [ES, NQ, GC]                                 │
│  - จัดการ concurrency (max 2 browser sessions พร้อมกัน)           │
│  - Failover: browser → direct API → retry                        │
└─────┬─────────────────────┬──────────────────────┬──────────────┘
      │                     │                      │
      ▼                     ▼                      ▼
┌───────────┐      ┌──────────────────┐   ┌─────────────────────┐
│  Options  │      │   OI Scraper     │   │  Intraday Scraper   │
│  Scraper  │      │  (camofox +      │   │  (Network intercept │
│ (camofox) │      │   API intercept) │   │   + chart endpoint) │
└─────┬─────┘      └────────┬─────────┘   └──────────┬──────────┘
      │                     │                        │
      └─────────────────────┼────────────────────────┘
                            ▼
               ┌────────────────────────┐
               │    Parser & Validator   │
               │  - JSON / HTML parse   │
               │  - Type coercion       │
               │  - Field validation    │
               │  - Derived fields calc  │
               └────────────┬───────────┘
                            │
               ┌────────────┴────────────┐
               ▼                         ▼
   ┌───────────────────┐     ┌─────────────────────────┐
   │  PostgreSQL +      │     │  File Export             │
   │  TimescaleDB       │     │  /output/YYYYMMDD/       │
   │                   │     │  - CSV per type          │
   │  Tables:          │     │  - JSON summary          │
   │  - options_chain  │     │  - Parquet (optional)    │
   │  - futures_oi     │     └─────────────────────────┘
   │  - oi_by_strike   │
   │  - oi_summary     │
   │  - intraday_bars  │
   │  - daily_settle   │
   └───────────────────┘
               │
               ▼
   ┌───────────────────┐
   │   Notification    │
   │  Slack / Line     │
   │  (Job summary)    │
   └───────────────────┘
```

---

## 10. Browser Session ด้วย Camofox

### 10.1 เหตุผลที่ต้องใช้ Camofox

CME Group ใช้ระบบ anti-bot หลายชั้น:

| Layer | ระบบ | Bypass Method |
|-------|------|--------------|
| CDN | Cloudflare / Akamai Bot Manager | Stealth browser fingerprint |
| JS Challenge | TLS fingerprint check | camofox custom TLS |
| Behavioral | Mouse/scroll pattern | Simulated human behavior |
| Rate Limit | IP-based throttle | Proxy rotation |
| Session | Cookie validation | Cookie persistence |

### 10.2 Session Configuration

```typescript
import { CamofoxBrowser, CamofoxPage } from 'camofox-browser';

interface SessionConfig {
  headless: boolean;
  proxy?: string;
  userAgent?: 'random' | string;
  stealth: boolean;
  viewport: { width: number; height: number };
  timeout: number;
  cookiePersist: boolean;
  cookieFile?: string;
}

const SESSION_CONFIG: SessionConfig = {
  headless: true,
  proxy: process.env.PROXY_URL,           // Rotating residential proxy
  userAgent: 'random',                     // Auto-rotate per session
  stealth: true,                           // Patch navigator, WebGL, Canvas
  viewport: { width: 1920, height: 1080 },
  timeout: 45_000,
  cookiePersist: true,
  cookieFile: '/tmp/cme_cookies.json',     // Reuse session cookies
};

// Pool: สูงสุด 2 browsers พร้อมกัน
const browserPool = new BrowserPool(SESSION_CONFIG, { maxInstances: 2 });
```

### 10.3 Warm-up Flow (ต้องทำก่อนดึงข้อมูล)

```typescript
async function warmupSession(page: CamofoxPage): Promise<void> {
  // 1. เข้า homepage ก่อน
  await page.goto('https://www.cmegroup.com/', { waitUntil: 'networkidle2' });
  await humanDelay(2000, 4000);

  // 2. Simulate scroll
  await page.evaluate(() => window.scrollBy(0, 300));
  await humanDelay(500, 1500);

  // 3. เข้า markets page
  await page.goto('https://www.cmegroup.com/markets/', { waitUntil: 'domcontentloaded' });
  await humanDelay(1500, 2500);

  // cookies ถูก set เรียบร้อย → พร้อม scrape
}
```

### 10.4 Network Intercept Setup

```typescript
async function setupIntercept(
  page: CamofoxPage,
  queues: DataQueues
): Promise<void> {
  await page.setRequestInterception(true);

  // Block unnecessary resources
  page.on('request', (req) => {
    const blocked = ['image', 'stylesheet', 'font', 'media'];
    if (blocked.includes(req.resourceType())) {
      req.abort();
    } else {
      req.continue();
    }
  });

  // Capture API responses
  page.on('response', async (res) => {
    const url = res.url();

    // Options JSON
    if (url.match(/\/CmeWS\/mvc\/Quotes\/Option\/\d+\//)) {
      const raw = await res.json().catch(() => null);
      if (raw) queues.options.push(raw);
    }

    // Intraday chart data
    if (url.match(/\/CmeWS\/mvc\/md\/c\/\d+\/\w+\/chart/)) {
      const raw = await res.json().catch(() => null);
      if (raw) queues.intraday.push({ url, raw });
    }

    // OI / Settlement data
    if (url.match(/\/CmeWS\/mvc\/Settlements\/futures/)) {
      const raw = await res.json().catch(() => null);
      if (raw) queues.settlement.push(raw);
    }
  });
}
```

---

## 11. Scraper Modules รายละเอียด

### 11.1 OptionsScraper

```typescript
class OptionsScraper extends BaseScraper {
  async scrape(symbol: Symbol): Promise<OptionsResult> {
    const page = await this.pool.acquire();
    await warmupSession(page);
    await setupIntercept(page, this.queues);

    // Navigate → trigger XHR intercepts
    await page.goto(CME_OPTIONS_URLS[symbol], { waitUntil: 'networkidle0' });
    await page.waitForSelector('.quotes-options-table', { timeout: 30_000 });

    // ดึง expiry list จาก dropdown
    const expiries: ExpiryInfo[] = await this.getExpiries(page, symbol);

    for (const expiry of expiries) {
      // click expiry tab → trigger XHR อีกครั้ง
      await this.selectExpiry(page, expiry);
      await page.waitForNetworkIdle({ idleTime: 2000 });
      await humanDelay(1500, 2500);
    }

    // รวมข้อมูลจาก intercepted XHR
    const raw = await this.queues.options.drain();
    return this.parser.parseOptionsChain(raw, symbol);
  }

  private async getExpiries(page: CamofoxPage, symbol: Symbol): Promise<ExpiryInfo[]> {
    return page.$$eval('select.expiry-select option', (options) =>
      options.map(opt => ({
        code: (opt as HTMLOptionElement).value,
        label: opt.textContent?.trim() ?? '',
        date: (opt as HTMLOptionElement).dataset.expiry ?? '',
      }))
    );
  }
}
```

### 11.2 OIScraper

```typescript
class OIScraper extends BaseScraper {
  async scrape(symbol: Symbol, tradeDate: string): Promise<OIResult> {
    // Method 1: ดึงจาก intercepted options chain data (OI ต่อ Strike อยู่แล้ว)
    const strikeOI = await this.extractFromOptionsChain(symbol, tradeDate);

    // Method 2: ดึง Futures OI รวม จาก CME API โดยตรง
    const futuresOI = await this.fetchFuturesOI(symbol, tradeDate);

    // Method 3: ดึง CME Daily Bulletin (official EOD)
    const bulletinOI = await this.fetchDailyBulletin(symbol, tradeDate);

    return { strikeOI, futuresOI, bulletinOI };
  }

  private async fetchFuturesOI(symbol: Symbol, tradeDate: string): Promise<FuturesOIRecord[]> {
    const productCode = CME_PRODUCT_CODES[symbol];
    const url = `https://www.cmegroup.com/CmeWS/mvc/Settlements/futures/settlements/${productCode}/G?tradeDate=${tradeDate}&type=VOLUME`;

    const page = await this.pool.acquire();
    const response = await page.evaluate(async (url) => {
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
      });
      return res.json();
    }, url);

    return this.parser.parseFuturesOI(response, symbol, tradeDate);
  }
}
```

### 11.3 IntradayScraper

```typescript
class IntradayScraper extends BaseScraper {
  private readonly PERIODS = {
    '1m':  60,
    '5m':  300,
    '15m': 900,
    '30m': 1800,
    '1h':  3600,
    '4h':  14400,
    '1D':  86400,
  };

  async scrape(
    symbol: Symbol,
    timeframe: Timeframe,
    startTime: Date,
    endTime: Date
  ): Promise<IntradayResult> {
    const productCode = CME_PRODUCT_CODES[symbol];
    const contractCode = await this.getActiveContract(symbol);
    const period = this.PERIODS[timeframe];

    const url = [
      `https://www.cmegroup.com/CmeWS/mvc/md/c/${productCode}/${contractCode}/chart`,
      `?startTime=${startTime.getTime()}`,
      `&endTime=${endTime.getTime()}`,
      `&period=${period}`,
    ].join('');

    const page = await this.pool.acquire();
    const raw = await page.evaluate(async (url) => {
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });
      return res.json();
    }, url);

    return this.parser.parseIntradayBars(raw, symbol, timeframe);
  }

  // ดึง intraday ของวันนั้นทุก timeframe
  async scrapeAllTimeframes(symbol: Symbol, date: string): Promise<void> {
    const start = new Date(`${date}T21:00:00Z`); // 17:00 CT = 22:00 UTC (ฤดูร้อน)
    const end   = new Date(`${date}T21:00:00Z`);
    end.setDate(end.getDate() + 1);

    for (const tf of Object.keys(this.PERIODS) as Timeframe[]) {
      const result = await this.scrape(symbol, tf, start, end);
      await this.repo.upsertIntradayBars(result.bars);
      await humanDelay(800, 1500);
    }
  }
}
```

---

## 12. Data Parsing & Validation

### 12.1 Options Chain Parser (CME JSON Format)

```typescript
interface CmeOptionsRaw {
  optionContractQuotes: Array<{
    strikePrice: string;
    calls: CmeOptionSide;
    puts: CmeOptionSide;
  }>;
  expirationDate: string;
  underlyingPrice: string;
}

interface CmeOptionSide {
  last: string;
  settle: string;
  bid: string;
  ask: string;
  bidSize: string;
  askSize: string;
  volume: string;
  openInterest: string;
  openInterestChange: string;
  high: string;
  low: string;
  open: string;
  delta: string;
  gamma: string;
  theta: string;
  vega: string;
  rho: string;
  impliedVolatility: string;
  theoreticalValue: string;
}

function parseOptionsChain(raw: CmeOptionsRaw, symbol: string, expiry: ExpiryInfo): OptionRecord[] {
  const records: OptionRecord[] = [];
  const underlying = parseFloat(raw.underlyingPrice) || null;
  const today = new Date().toISOString().slice(0, 10);
  const dte = daysBetween(today, expiry.date);

  for (const row of raw.optionContractQuotes) {
    const strike = parseFloat(row.strikePrice);
    if (isNaN(strike) || strike <= 0) continue;

    for (const [side, optType] of [['calls', 'C'], ['puts', 'P']] as const) {
      const s: CmeOptionSide = row[side];
      const last = parseDecimal(s.last);
      const intrinsic = optType === 'C'
        ? Math.max(0, (underlying ?? 0) - strike)
        : Math.max(0, strike - (underlying ?? 0));

      records.push({
        trade_date: today,
        fetched_at: new Date().toISOString(),
        symbol,
        expiry_code: expiry.code,
        expiry_date: expiry.date,
        days_to_expiry: dte,
        strike,
        option_type: optType,
        last_price: last,
        settle_price: parseDecimal(s.settle),
        bid: parseDecimal(s.bid),
        ask: parseDecimal(s.ask),
        bid_size: parseInt(s.bidSize) || null,
        ask_size: parseInt(s.askSize) || null,
        volume: parseInt(s.volume) || 0,
        open_interest: parseInt(s.openInterest) || 0,
        oi_change: parseInt(s.openInterestChange) || 0,
        high: parseDecimal(s.high),
        low: parseDecimal(s.low),
        open: parseDecimal(s.open),
        delta: parseDecimal(s.delta),
        gamma: parseDecimal(s.gamma),
        theta: parseDecimal(s.theta),
        vega: parseDecimal(s.vega),
        rho: parseDecimal(s.rho),
        implied_vol: parseDecimal(s.impliedVolatility),
        theoretical_value: parseDecimal(s.theoreticalValue),
        underlying_price: underlying,
        intrinsic_value: intrinsic,
        time_value: last != null ? last - intrinsic : null,
        moneyness: classifyMoneyness(optType, strike, underlying),
        is_valid: true,
      });
    }
  }
  return records;
}
```

### 12.2 Intraday Bar Parser

```typescript
interface CmeChartRaw {
  bars: Array<{
    time: number;    // Unix timestamp ms
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
}

function parseIntradayBars(raw: CmeChartRaw, symbol: string, timeframe: string): IntradayBar[] {
  return raw.bars.map(bar => {
    const barTime = new Date(bar.time);
    const isRTH = isRegularHours(symbol, barTime);
    return {
      bar_time: barTime.toISOString(),
      bar_close_time: addSeconds(barTime, PERIOD_SECONDS[timeframe]).toISOString(),
      symbol,
      timeframe,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      vwap: null,          // คำนวณ post-insert
      buy_volume: null,    // ไม่มีจาก CME free
      sell_volume: null,
      delta_volume: null,
      is_rth: isRTH,
      session: isRTH ? 'RTH' : 'ETH',
      fetched_at: new Date().toISOString(),
    };
  });
}
```

### 12.3 Validation Rules ครบทุกฟิลด์

| ฟิลด์ | Rule | Action เมื่อ fail |
|-------|------|-----------------|
| `strike` | > 0, not NaN | Skip row |
| `bid` / `ask` | bid ≤ ask, ≥ 0 | Mark invalid |
| `bid` / `ask` spread | (ask-bid)/mid < 50% | Warning log |
| `implied_vol` | 0.0001 – 3.0 (0.01%–300%) | Mark invalid |
| `delta` (Call) | 0.0 – 1.0 | Mark invalid |
| `delta` (Put) | -1.0 – 0.0 | Mark invalid |
| `gamma` | ≥ 0 | Mark invalid |
| `theta` (Call/Put) | ≤ 0 (time decay) | Warning |
| `vega` | ≥ 0 | Mark invalid |
| `volume` / `open_interest` | ≥ 0, integer | Clamp to 0 |
| `expiry_date` | > trade_date | Skip expiry |
| `days_to_expiry` | 0 – 730 | Warning if > 365 |
| `bar.high` | ≥ bar.low | Skip bar |
| `bar.high` | ≥ bar.open, ≥ bar.close | Skip bar |
| `bar.low` | ≤ bar.open, ≤ bar.close | Skip bar |
| `bar.volume` | ≥ 0 | Clamp to 0 |
| `bar.close` | within ±20% of prior bar | Warning |

---

## 13. Database Schema ทั้งหมด

```sql
-- ===================================================
-- EXTENSIONS
-- ===================================================
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- ===================================================
-- TABLE 1: OPTIONS CHAIN (End-of-Day)
-- ===================================================
CREATE TABLE options_chain (
    id                  BIGSERIAL,
    trade_date          DATE            NOT NULL,
    fetched_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    symbol              VARCHAR(5)      NOT NULL,
    expiry_code         VARCHAR(15)     NOT NULL,
    expiry_date         DATE            NOT NULL,
    days_to_expiry      SMALLINT,
    strike              DECIMAL(12,2)   NOT NULL,
    option_type         CHAR(1)         NOT NULL CHECK (option_type IN ('C','P')),

    -- Prices
    last_price          DECIMAL(12,4),
    settle_price        DECIMAL(12,4),
    bid                 DECIMAL(12,4),
    ask                 DECIMAL(12,4),
    bid_size            INTEGER,
    ask_size            INTEGER,
    high                DECIMAL(12,4),
    low                 DECIMAL(12,4),
    open                DECIMAL(12,4),

    -- Volume & OI
    volume              BIGINT          DEFAULT 0,
    open_interest       BIGINT          DEFAULT 0,
    oi_change           BIGINT          DEFAULT 0,

    -- Greeks
    delta               DECIMAL(8,6),
    gamma               DECIMAL(8,6),
    theta               DECIMAL(8,6),
    vega                DECIMAL(8,6),
    rho                 DECIMAL(8,6),

    -- Vol & Model
    implied_vol         DECIMAL(8,6),
    theoretical_value   DECIMAL(12,4),

    -- Derived
    underlying_price    DECIMAL(12,4),
    intrinsic_value     DECIMAL(12,4),
    time_value          DECIMAL(12,4),
    moneyness           VARCHAR(5),

    -- Quality
    is_valid            BOOLEAN         DEFAULT TRUE,
    validation_notes    TEXT,

    PRIMARY KEY (id),
    UNIQUE (trade_date, symbol, expiry_code, strike, option_type)
);

CREATE INDEX idx_oc_date_sym      ON options_chain (trade_date, symbol);
CREATE INDEX idx_oc_expiry        ON options_chain (symbol, expiry_code, trade_date);
CREATE INDEX idx_oc_strike        ON options_chain (symbol, strike, trade_date);
CREATE INDEX idx_oc_oi            ON options_chain (symbol, trade_date, open_interest DESC);

-- ===================================================
-- TABLE 2: FUTURES OI รายวัน (Aggregate)
-- ===================================================
CREATE TABLE futures_oi (
    id              BIGSERIAL PRIMARY KEY,
    trade_date      DATE            NOT NULL,
    symbol          VARCHAR(5)      NOT NULL,
    expiry_code     VARCHAR(15)     NOT NULL,
    expiry_date     DATE,
    total_oi        BIGINT,
    oi_change       BIGINT,
    oi_change_pct   DECIMAL(8,4),
    total_volume    BIGINT,
    settle_price    DECIMAL(12,4),
    prior_settle    DECIMAL(12,4),
    price_change    DECIMAL(12,4),
    source          VARCHAR(20)     DEFAULT 'CME_WS',    -- CME_WS / BULLETIN
    fetched_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    UNIQUE (trade_date, symbol, expiry_code)
);

CREATE INDEX idx_foi_date_sym ON futures_oi (trade_date, symbol);

-- ===================================================
-- TABLE 3: OI แยก Strike × Call/Put (Computed View)
-- ===================================================
CREATE MATERIALIZED VIEW oi_by_strike AS
SELECT
    trade_date,
    symbol,
    expiry_code,
    expiry_date,
    strike,
    underlying_price,
    SUM(CASE WHEN option_type = 'C' THEN open_interest ELSE 0 END)  AS call_oi,
    SUM(CASE WHEN option_type = 'P' THEN open_interest ELSE 0 END)  AS put_oi,
    SUM(CASE WHEN option_type = 'C' THEN oi_change     ELSE 0 END)  AS call_oi_change,
    SUM(CASE WHEN option_type = 'P' THEN oi_change     ELSE 0 END)  AS put_oi_change,
    SUM(CASE WHEN option_type = 'C' THEN volume        ELSE 0 END)  AS call_volume,
    SUM(CASE WHEN option_type = 'P' THEN volume        ELSE 0 END)  AS put_volume,
    MAX(CASE WHEN option_type = 'C' THEN implied_vol   END)         AS call_iv,
    MAX(CASE WHEN option_type = 'P' THEN implied_vol   END)         AS put_iv,
    MAX(CASE WHEN option_type = 'P' THEN implied_vol   END)
      - MAX(CASE WHEN option_type = 'C' THEN implied_vol END)       AS iv_skew,
    SUM(
      CASE WHEN option_type = 'C'
        THEN open_interest * COALESCE(delta, 0)
        ELSE open_interest * COALESCE(delta, 0)
      END
    ) * 50 AS net_delta_exposure   -- สำหรับ ES (contract multiplier = 50)
FROM options_chain
WHERE is_valid = TRUE
GROUP BY trade_date, symbol, expiry_code, expiry_date, strike, underlying_price;

CREATE UNIQUE INDEX ON oi_by_strike (trade_date, symbol, expiry_code, strike);
CREATE INDEX ON oi_by_strike (symbol, trade_date, call_oi DESC);
CREATE INDEX ON oi_by_strike (symbol, trade_date, put_oi DESC);

-- Refresh daily after insert
-- REFRESH MATERIALIZED VIEW CONCURRENTLY oi_by_strike;

-- ===================================================
-- TABLE 4: OI SUMMARY ต่อ Expiry (Computed)
-- ===================================================
CREATE TABLE oi_expiry_summary (
    id                  BIGSERIAL PRIMARY KEY,
    trade_date          DATE            NOT NULL,
    symbol              VARCHAR(5)      NOT NULL,
    expiry_code         VARCHAR(15)     NOT NULL,
    expiry_date         DATE,
    days_to_expiry      SMALLINT,
    underlying_price    DECIMAL(12,4),

    -- OI Summary
    total_call_oi       BIGINT,
    total_put_oi        BIGINT,
    total_call_volume   BIGINT,
    total_put_volume    BIGINT,
    put_call_oi_ratio   DECIMAL(8,4),
    put_call_vol_ratio  DECIMAL(8,4),

    -- Key Levels
    max_call_oi_strike  DECIMAL(12,2),    -- "Call Wall"
    max_put_oi_strike   DECIMAL(12,2),    -- "Put Wall"
    max_pain_strike     DECIMAL(12,2),    -- Max Pain
    max_call_oi_value   BIGINT,
    max_put_oi_value    BIGINT,

    -- GEX (Gamma Exposure)
    net_gamma_exposure  DECIMAL(16,4),    -- dealers' net gamma
    gex_flip_level      DECIMAL(12,2),    -- ราคาที่ GEX เปลี่ยนจาก + เป็น -

    -- IV
    atm_iv_call         DECIMAL(8,6),
    atm_iv_put          DECIMAL(8,6),
    atm_iv_skew         DECIMAL(8,6),
    iv_rank             DECIMAL(8,4),     -- IV Rank 0–100
    iv_percentile       DECIMAL(8,4),     -- IV Percentile

    computed_at         TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    UNIQUE (trade_date, symbol, expiry_code)
);

-- ===================================================
-- TABLE 5: INTRADAY BARS (TimescaleDB Hypertable)
-- ===================================================
CREATE TABLE intraday_bars (
    bar_time            TIMESTAMPTZ     NOT NULL,
    bar_close_time      TIMESTAMPTZ,
    symbol              VARCHAR(5)      NOT NULL,
    timeframe           VARCHAR(5)      NOT NULL,
    expiry_code         VARCHAR(15),

    -- OHLCV
    open                DECIMAL(12,4)   NOT NULL,
    high                DECIMAL(12,4)   NOT NULL,
    low                 DECIMAL(12,4)   NOT NULL,
    close               DECIMAL(12,4)   NOT NULL,
    volume              BIGINT          NOT NULL DEFAULT 0,

    -- Enhanced
    vwap                DECIMAL(12,4),
    buy_volume          BIGINT,
    sell_volume         BIGINT,
    delta_volume        BIGINT,
    trade_count         INTEGER,

    -- Session
    session             VARCHAR(10),
    is_rth              BOOLEAN,

    -- Indicators (คำนวณ post-insert)
    vwap_session        DECIMAL(12,4),
    ema_9               DECIMAL(12,4),
    ema_21              DECIMAL(12,4),
    atr_14              DECIMAL(12,4),
    rsi_14              DECIMAL(8,4),
    bb_upper            DECIMAL(12,4),
    bb_lower            DECIMAL(12,4),

    fetched_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    PRIMARY KEY (bar_time, symbol, timeframe)
);

-- Convert to TimescaleDB hypertable (partition by time)
SELECT create_hypertable(
    'intraday_bars',
    'bar_time',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);

CREATE INDEX idx_ib_sym_tf ON intraday_bars (symbol, timeframe, bar_time DESC);
CREATE INDEX idx_ib_rth    ON intraday_bars (symbol, timeframe, is_rth, bar_time DESC);

-- Data retention policies
SELECT add_retention_policy('intraday_bars',
  INTERVAL '90 days',
  if_not_exists => TRUE
);
-- ⚠️ Retention เฉพาะ 1m — timeframe อื่นต้องแยก manage ด้วย WHERE clause

-- ===================================================
-- TABLE 6: DAILY SETTLEMENT (Official EOD)
-- ===================================================
CREATE TABLE daily_settlement (
    id              BIGSERIAL PRIMARY KEY,
    trade_date      DATE            NOT NULL,
    symbol          VARCHAR(5)      NOT NULL,
    expiry_code     VARCHAR(15)     NOT NULL,
    open            DECIMAL(12,4),
    high            DECIMAL(12,4),
    low             DECIMAL(12,4),
    settle          DECIMAL(12,4),
    prior_settle    DECIMAL(12,4),
    change          DECIMAL(12,4),
    est_volume      BIGINT,
    prior_oi        BIGINT,
    oi              BIGINT,
    source          VARCHAR(20),    -- CME_BULLETIN / CME_WS
    fetched_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    UNIQUE (trade_date, symbol, expiry_code)
);

-- ===================================================
-- TABLE 7: CME HOLIDAYS
-- ===================================================
CREATE TABLE cme_holidays (
    holiday_date    DATE    PRIMARY KEY,
    holiday_name    VARCHAR(100),
    early_close     BOOLEAN DEFAULT FALSE,
    early_close_time TIME,
    markets         TEXT[]  DEFAULT ARRAY['ALL']
);

-- ===================================================
-- TABLE 8: FETCH JOB LOG
-- ===================================================
CREATE TABLE fetch_jobs (
    id                  BIGSERIAL PRIMARY KEY,
    job_id              UUID            NOT NULL DEFAULT gen_random_uuid(),
    run_date            DATE            NOT NULL,
    job_type            VARCHAR(30)     NOT NULL,  -- OPTIONS / OI / INTRADAY / BULLETIN
    symbol              VARCHAR(5),
    timeframe           VARCHAR(5),
    status              VARCHAR(20)     NOT NULL,  -- RUNNING / SUCCESS / PARTIAL / FAILED
    records_inserted    INTEGER         DEFAULT 0,
    records_skipped     INTEGER         DEFAULT 0,
    records_invalid     INTEGER         DEFAULT 0,
    error_message       TEXT,
    retry_count         SMALLINT        DEFAULT 0,
    started_at          TIMESTAMPTZ,
    finished_at         TIMESTAMPTZ,
    duration_ms         INTEGER GENERATED ALWAYS AS (
                            EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000
                        ) STORED
);

CREATE INDEX idx_fj_date_type ON fetch_jobs (run_date, job_type, symbol);
```

---

## 14. Scheduler & Timing

### 14.1 ตาราง Job Schedule (CT timezone)

| Job | Trigger | เวลา CT | วันที่รัน |
|-----|---------|---------|---------|
| **Intraday 1m — ES/NQ** | Recurring | ทุก 5 นาที ตั้งแต่ 17:05 CT | Mon–Fri |
| **Intraday 1m — GC** | Recurring | ทุก 5 นาที ตั้งแต่ 17:05 CT | Sun–Fri |
| **Intraday Backfill (1m)** | 1 ครั้ง/วัน | 04:00 CT | Mon–Fri |
| **GC Options + OI** | EOD | 14:30 CT | Mon–Fri |
| **ES/NQ Options + OI** | EOD | 16:30 CT | Mon–Fri |
| **Daily Settlement (EOD)** | EOD | 17:30 CT | Mon–Fri |
| **CME Daily Bulletin** | EOD | 18:00 CT | Mon–Fri |
| **OI Summary Compute** | Post-Options | 17:00 CT | Mon–Fri |
| **Intraday TF Resample** | Daily | 17:15 CT | Mon–Fri |
| **Retry failed jobs** | — | 18:30 CT | Mon–Fri |

```typescript
// cron definitions (America/Chicago timezone)
const CRON_JOBS = {
  intraday_1m:         '*/5 17-23,0-15 * * 1-5',   // ทุก 5 นาที ช่วง session
  intraday_backfill:   '0 4 * * 1-5',               // backfill ชั่วข้ามคืน
  gc_options:          '30 14 * * 1-5',
  es_nq_options:       '30 16 * * 1-5',
  daily_settlement:    '30 17 * * 1-5',
  cme_bulletin:        '0 18 * * 1-5',
  oi_summary:          '0 17 * * 1-5',
  resample:            '15 17 * * 1-5',
  retry:               '30 18 * * 1-5',
};
```

### 14.2 Intraday Fetch Window

```typescript
// สำหรับ intraday 1m ที่รันทุก 5 นาที
// ดึงย้อนหลัง 10 นาที เพื่อ handle late bars
async function getIntradayWindow(): Promise<{ start: Date; end: Date }> {
  const now = new Date();
  const end = now;
  const start = new Date(now.getTime() - 10 * 60 * 1000);  // 10 min ago
  return { start, end };
}
```

---

## 15. Error Handling & Retry Logic

### 15.1 Error Classification

| Error Class | Error Types | Strategy |
|------------|------------|----------|
| **TRANSIENT** | Timeout, NetworkError, EmptyResponse | Retry 3× (backoff: 2m→5m→10m) |
| **BOT_DETECT** | 403, 429, Cloudflare challenge | Rotate proxy + UA → Retry |
| **PARSE_ERROR** | JSON parse fail, missing fields | Screenshot + log + skip |
| **VALIDATION** | Invalid values | Mark is_valid=false, save |
| **DB_ERROR** | Connection fail, constraint | Buffer in memory → Retry |
| **FATAL** | CME site down, schema changed | Alert + stop job |

### 15.2 Retry Flow

```
Job Start
  │
  ├─── SUCCESS → Save DB → Refresh Materialized View → Export CSV → Notify ✅
  │
  ├─── TRANSIENT ERROR
  │         └─ Retry 1 (wait 2min)
  │               └─ Retry 2 (wait 5min)
  │                     └─ Retry 3 (wait 10min)
  │                           └─ FAIL → Save partial → Log → Notify ❌
  │
  ├─── BOT_DETECT
  │         └─ Rotate proxy + clear cookies
  │               └─ Warm-up new session
  │                     └─ Retry (max 2×)
  │                           └─ FAIL → Alert urgent ❌
  │
  └─── PARSE_ERROR
            └─ Screenshot saved to /errors/{datetime}_{symbol}.png
                  └─ Try fallback: direct API call (skip browser)
                        └─ Save whatever is valid
```

### 15.3 Circuit Breaker

```typescript
// ถ้า error rate > 50% ใน 1 ชั่วโมง → หยุดทุก job + alert
class CircuitBreaker {
  private failures = 0;
  private readonly threshold = 5;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      throw new CircuitOpenError('Circuit breaker is OPEN');
    }
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }
}
```

---

## 16. Output Files & Export

### 16.1 โครงสร้าง Directory

```
/output/
├── 20250512/
│   ├── options/
│   │   ├── ES_options_20250512.csv         # Options chain ทุก strike
│   │   ├── NQ_options_20250512.csv
│   │   └── GC_options_20250512.csv
│   ├── oi/
│   │   ├── ES_futures_oi_20250512.csv      # Futures OI รายวัน
│   │   ├── ES_options_oi_by_strike_20250512.csv   # OI ต่อ Strike
│   │   ├── ES_oi_summary_20250512.csv      # Summary (max pain, walls, ratio)
│   │   ├── NQ_futures_oi_20250512.csv
│   │   ├── NQ_options_oi_by_strike_20250512.csv
│   │   ├── NQ_oi_summary_20250512.csv
│   │   ├── GC_futures_oi_20250512.csv
│   │   ├── GC_options_oi_by_strike_20250512.csv
│   │   └── GC_oi_summary_20250512.csv
│   ├── intraday/
│   │   ├── ES_1m_20250512.csv
│   │   ├── ES_5m_20250512.csv
│   │   ├── ES_15m_20250512.csv
│   │   ├── ES_1h_20250512.csv
│   │   ├── NQ_1m_20250512.csv
│   │   ├── NQ_5m_20250512.csv
│   │   ├── GC_1m_20250512.csv
│   │   └── GC_5m_20250512.csv
│   ├── settlement/
│   │   ├── ES_settlement_20250512.csv
│   │   ├── NQ_settlement_20250512.csv
│   │   └── GC_settlement_20250512.csv
│   └── fetch_summary_20250512.json
│
└── latest/                                 ← symlink → วันล่าสุด
```

### 16.2 CSV Headers ต่อไฟล์

**Options CSV:**
```
trade_date,symbol,expiry_code,expiry_date,days_to_expiry,strike,option_type,
last_price,settle_price,bid,ask,bid_size,ask_size,high,low,open,
volume,open_interest,oi_change,
delta,gamma,theta,vega,rho,implied_vol,theoretical_value,
underlying_price,intrinsic_value,time_value,moneyness,fetched_at
```

**OI by Strike CSV:**
```
trade_date,symbol,expiry_code,strike,underlying_price,
call_oi,put_oi,call_oi_change,put_oi_change,
call_volume,put_volume,call_iv,put_iv,iv_skew,net_delta_exposure
```

**OI Summary CSV:**
```
trade_date,symbol,expiry_code,expiry_date,days_to_expiry,underlying_price,
total_call_oi,total_put_oi,put_call_oi_ratio,put_call_vol_ratio,
max_call_oi_strike,max_put_oi_strike,max_pain_strike,
net_gamma_exposure,gex_flip_level,
atm_iv_call,atm_iv_put,atm_iv_skew,iv_rank,iv_percentile
```

**Intraday CSV:**
```
bar_time,bar_close_time,symbol,timeframe,expiry_code,
open,high,low,close,volume,vwap,
buy_volume,sell_volume,delta_volume,trade_count,
session,is_rth,
vwap_session,ema_9,ema_21,atr_14,rsi_14,bb_upper,bb_lower,
fetched_at
```

### 16.3 fetch_summary.json

```json
{
  "run_date": "2025-05-12",
  "run_id": "550e8400-e29b-41d4-a716-446655440000",
  "started_at": "2025-05-12T22:30:00Z",
  "finished_at": "2025-05-12T23:15:42Z",
  "duration_seconds": 2742,
  "jobs": {
    "ES": {
      "options": {
        "status": "SUCCESS",
        "expiries_fetched": 8,
        "total_strikes": 312,
        "total_records": 4992,
        "invalid_records": 12
      },
      "oi_futures": { "status": "SUCCESS", "contracts": 4, "records": 4 },
      "oi_summary": { "status": "SUCCESS", "expiries": 8 },
      "intraday_1m": { "status": "SUCCESS", "bars": 1380 },
      "intraday_5m": { "status": "SUCCESS", "bars": 276 },
      "settlement":  { "status": "SUCCESS", "contracts": 4 }
    },
    "NQ": { "..." : "..." },
    "GC": { "..." : "..." }
  },
  "totals": {
    "options_records": 12840,
    "oi_records": 1240,
    "intraday_bars": 9860,
    "settlement_records": 12
  },
  "errors": [
    {
      "job": "NQ_options",
      "expiry": "NQM25",
      "error": "TimeoutError",
      "retry_count": 1,
      "resolved": true
    }
  ]
}
```

---

## 17. Project Structure

```
cme-data-fetcher/
├── src/
│   ├── main.ts                          # Entry point
│   ├── orchestrator.ts                  # Job queue, concurrency
│   ├── scheduler.ts                     # Cron job definitions
│   │
│   ├── browser/
│   │   ├── BrowserPool.ts               # Pool ของ camofox instances
│   │   ├── Session.ts                   # Session lifecycle
│   │   ├── Warmup.ts                    # Homepage → target warm-up
│   │   ├── Intercept.ts                 # Network request/response intercept
│   │   └── AntiBot.ts                   # Proxy rotation, fingerprint
│   │
│   ├── scrapers/
│   │   ├── BaseScraper.ts               # Abstract: scrape(), retry(), validate()
│   │   ├── OptionsScraper.ts            # Options Chain scraper
│   │   ├── OIScraper.ts                 # Futures + Options OI scraper
│   │   ├── IntradayScraper.ts           # OHLCV bar scraper (all timeframes)
│   │   ├── SettlementScraper.ts         # Daily settlement prices
│   │   └── BulletinScraper.ts           # CME Daily Bulletin (official OI)
│   │
│   ├── parsers/
│   │   ├── OptionsParser.ts             # Parse CME options JSON
│   │   ├── OIParser.ts                  # Parse OI data
│   │   ├── IntradayParser.ts            # Parse chart bar data
│   │   └── Validator.ts                 # All validation rules
│   │
│   ├── analytics/
│   │   ├── MaxPain.ts                   # Max Pain calculation
│   │   ├── GEX.ts                       # Gamma Exposure calculation
│   │   ├── IVRank.ts                    # IV Rank / IV Percentile
│   │   ├── OISummary.ts                 # Aggregate OI summary per expiry
│   │   └── Indicators.ts               # TA indicators (VWAP, EMA, ATR, RSI)
│   │
│   ├── db/
│   │   ├── client.ts                    # PostgreSQL connection pool
│   │   ├── repositories/
│   │   │   ├── OptionsRepository.ts
│   │   │   ├── OIRepository.ts
│   │   │   ├── IntradayRepository.ts
│   │   │   └── JobRepository.ts
│   │   └── migrations/
│   │       ├── 001_create_options_chain.sql
│   │       ├── 002_create_futures_oi.sql
│   │       ├── 003_create_intraday_bars.sql
│   │       ├── 004_create_settlement.sql
│   │       └── 005_create_views.sql
│   │
│   ├── exporters/
│   │   ├── CSVExporter.ts               # Export แต่ละ table เป็น CSV
│   │   ├── SummaryExporter.ts           # fetch_summary.json
│   │   └── SymlinkManager.ts            # Manage /output/latest/
│   │
│   ├── notifications/
│   │   ├── SlackNotifier.ts
│   │   └── LineNotifier.ts
│   │
│   └── utils/
│       ├── logger.ts                    # winston structured logging
│       ├── HolidayCalendar.ts           # CME holiday check
│       ├── TimeUtils.ts                 # CT/UTC conversion, session check
│       ├── CircuitBreaker.ts
│       └── Delay.ts                     # Human-like delay
│
├── config/
│   ├── symbols.ts                       # Product codes, URLs, selectors
│   ├── timeframes.ts                    # Timeframe definitions, retention
│   └── defaults.ts                      # Default config values
│
├── scripts/
│   ├── backfill.ts                      # Backfill ข้อมูลย้อนหลัง
│   ├── recompute-analytics.ts           # Re-run analytics บน historical data
│   └── test-session.ts                  # Test camofox session
│
├── .env.example
├── docker-compose.yml
├── Dockerfile
├── tsconfig.json
└── package.json
```

---

## 18. Environment Variables

```env
# ============= Database =============
DATABASE_URL=postgresql://cme_user:password@localhost:5432/cme_data
DB_POOL_MIN=2
DB_POOL_MAX=10

# ============= Proxy =============
PROXY_URL=http://user:pass@proxy.example.com:8080
PROXY_ROTATION=true
PROXY_LIST=http://p1:p@host1:8080,http://p2:p@host2:8080   # comma-separated

# ============= Camofox =============
CAMOFOX_HEADLESS=true
CAMOFOX_TIMEOUT_MS=45000
CAMOFOX_MAX_INSTANCES=2
CAMOFOX_COOKIE_FILE=/tmp/cme_cookies.json

# ============= Schedule (CT) =============
TIMEZONE=America/Chicago
INTRADAY_INTERVAL_MINUTES=5
OPTIONS_RUN_HOUR_ES_NQ=16
OPTIONS_RUN_MINUTE_ES_NQ=30
OPTIONS_RUN_HOUR_GC=14
OPTIONS_RUN_MINUTE_GC=30

# ============= Data Settings =============
EXPIRIES_PER_SYMBOL=3          # Front month + N เพิ่ม
FETCH_WEEKLY_OPTIONS=true      # รวม weekly options (ES/NQ)
INTRADAY_TIMEFRAMES=1m,5m,15m,30m,1h,4h,1D
INTRADAY_LOOKBACK_MINUTES=10   # Overlap window สำหรับ late bars

# ============= Output =============
OUTPUT_DIR=/output
EXPORT_CSV=true
EXPORT_PARQUET=false
KEEP_DAYS=90                   # เก็บ CSV กี่วัน

# ============= Notifications =============
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
LINE_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTIFY_ON_SUCCESS=true
NOTIFY_ON_FAILURE=true

# ============= Circuit Breaker =============
CB_FAILURE_THRESHOLD=5
CB_RESET_TIMEOUT_MS=300000     # 5 นาที
```

---

## 19. การ Deploy

### 19.1 Local Dev

```bash
# 1. Install
npm install
cp .env.example .env
# แก้ .env

# 2. Start PostgreSQL + TimescaleDB
docker-compose up -d db

# 3. Run migrations
npm run db:migrate

# 4. Test browser session
npm run script:test-session

# 5. Manual fetch (ระบุวัน + ประเภท)
npm run fetch -- --date 2025-05-12 --type options --symbol ES
npm run fetch -- --date 2025-05-12 --type oi --symbol ES
npm run fetch -- --date 2025-05-12 --type intraday --symbol ES --timeframe 1m

# 6. Backfill ย้อนหลัง
npm run backfill -- --from 2025-01-01 --to 2025-05-11 --type options

# 7. Start scheduler
npm run start
```

### 19.2 docker-compose.yml

```yaml
version: '3.9'

services:
  db:
    image: timescale/timescaledb:latest-pg16
    environment:
      POSTGRES_DB: cme_data
      POSTGRES_USER: cme_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U cme_user -d cme_data"]
      interval: 10s
      timeout: 5s
      retries: 5

  fetcher:
    build:
      context: .
      dockerfile: Dockerfile
    depends_on:
      db:
        condition: service_healthy
    env_file: .env
    environment:
      DATABASE_URL: postgresql://cme_user:${DB_PASSWORD}@db:5432/cme_data
    volumes:
      - ./output:/output
      - ./logs:/logs
      - /tmp:/tmp           # สำหรับ cookie files
    restart: unless-stopped
    shm_size: '2gb'         # Chrome/Chromium ต้องการ shared memory

volumes:
  pgdata:
```

### 19.3 Dockerfile

```dockerfile
FROM node:20-slim

# Install Chromium dependencies (สำหรับ camofox)
RUN apt-get update && apt-get install -y \
    chromium \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROMIUM_PATH=/usr/bin/chromium

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

CMD ["node", "dist/main.js"]
```

---

## 20. Edge Cases

| สถานการณ์ | การจัดการ |
|----------|----------|
| วันหยุด CME | ตรวจ `cme_holidays` table ก่อนรัน, log "Holiday - Skip" |
| Early Close (ปิดก่อนกำหนด) | Adjust timing ตาม `early_close_time` |
| Rollover week (contract เปลี่ยน) | ตรวจ front month ใหม่, อัป `expiry_code` |
| Strike ใหม่เพิ่ม (strike expansion) | INSERT ปกติ, ไม่ error |
| Strike หายไป (very far OTM) | Mark `volume=0, oi=0` ถ้าไม่มีข้อมูล |
| CME เปลี่ยน HTML selectors | Alert + fallback ไป API intercept |
| CME เปลี่ยน JSON schema | Parse error → Screenshot → Alert |
| Options ตัวใหม่ (weekly EW5) | Auto-detect จาก dropdown, include automatically |
| Extreme IV (>200%) | Mark warning แต่ save ตามปกติ |
| Session expired กลาง scrape | Re-launch browser, retry from last expiry |
| Bot detection กลาง session | Rotate proxy, clear cookie, warm-up ใหม่ |
| Network timeout บน bar เดียว | Retry bar นั้น, ถ้า fail → log missing bar |
| Duplicate insert (re-run) | UPSERT (INSERT ON CONFLICT DO UPDATE) |
| GC holiday (US vs International) | ใช้ CME calendar เป็น reference หลัก |
| TimescaleDB chunk error | Recreate chunk, reinsert |
| Disk full (output dir) | Auto-delete CSV เก่า (>KEEP_DAYS), alert |

---

## 21. Derived Metrics (คำนวณเพิ่ม)

### 21.1 Max Pain Calculation

```typescript
// Max Pain = Strike ที่ทำให้ option seller เสียเงินน้อยที่สุด
// = Strike ที่ total option value ณ expiry ต่ำที่สุด
function calculateMaxPain(
  options: OptionRecord[],
  strikes: number[]
): number {
  let minPain = Infinity;
  let maxPainStrike = 0;

  for (const testStrike of strikes) {
    let totalPain = 0;

    for (const opt of options) {
      if (opt.option_type === 'C') {
        // Call: หมดค่าถ้า underlying < strike
        totalPain += Math.max(0, testStrike - opt.strike) * opt.open_interest;
      } else {
        // Put: หมดค่าถ้า underlying > strike
        totalPain += Math.max(0, opt.strike - testStrike) * opt.open_interest;
      }
    }

    if (totalPain < minPain) {
      minPain = totalPain;
      maxPainStrike = testStrike;
    }
  }

  return maxPainStrike;
}
```

### 21.2 Gamma Exposure (GEX)

```typescript
// GEX = dealers' net gamma position (ส่งผลต่อ volatility of underlying)
// Positive GEX → dealers short gamma → ดูดซับ volatility (market calmer)
// Negative GEX → dealers long gamma → เพิ่ม volatility

function calculateGEX(
  options: OptionRecord[],
  multiplier: number  // ES=50, NQ=20, GC=100
): { netGEX: number; gexByStrike: GEXPoint[]; flipLevel: number } {
  const gexByStrike: GEXPoint[] = [];

  for (const opt of options) {
    if (!opt.gamma || !opt.open_interest) continue;

    // Dealers are typically short calls, long puts (from customers buying protection)
    const sign = opt.option_type === 'C' ? 1 : -1;
    const gex = sign * opt.gamma * opt.open_interest * multiplier * opt.underlying_price!;

    gexByStrike.push({ strike: opt.strike, gex, option_type: opt.option_type });
  }

  const netGEX = gexByStrike.reduce((sum, g) => sum + g.gex, 0);

  // GEX Flip Level = strike ที่ cumulative GEX เปลี่ยนจาก + เป็ -
  const sortedStrikes = [...new Set(gexByStrike.map(g => g.strike))].sort((a, b) => a - b);
  let cumulativeGEX = 0;
  let flipLevel = 0;
  for (const strike of sortedStrikes) {
    const strikeGEX = gexByStrike
      .filter(g => g.strike === strike)
      .reduce((sum, g) => sum + g.gex, 0);
    const prevGEX = cumulativeGEX;
    cumulativeGEX += strikeGEX;
    if (prevGEX >= 0 && cumulativeGEX < 0) flipLevel = strike;
  }

  return { netGEX, gexByStrike, flipLevel };
}
```

### 21.3 IV Rank & IV Percentile

```typescript
// IV Rank = (current IV - 52w low) / (52w high - 52w low) × 100
async function calcIVRank(
  symbol: string,
  expiry: string,
  currentIV: number,
  db: DB
): Promise<{ ivRank: number; ivPercentile: number }> {
  const history = await db.query(`
    SELECT atm_iv_call
    FROM oi_expiry_summary
    WHERE symbol = $1
      AND expiry_code = $2
      AND trade_date >= CURRENT_DATE - INTERVAL '365 days'
    ORDER BY trade_date
  `, [symbol, expiry]);

  const ivList = history.rows.map(r => r.atm_iv_call);
  const low52w  = Math.min(...ivList);
  const high52w = Math.max(...ivList);

  const ivRank = ((currentIV - low52w) / (high52w - low52w)) * 100;
  const ivPercentile = (ivList.filter(iv => iv < currentIV).length / ivList.length) * 100;

  return { ivRank, ivPercentile };
}
```

---

## 22. Milestones

| Phase | งาน | ประมาณเวลา |
|-------|-----|-----------|
| **Phase 1** | Setup repo + DB schema + Docker + camofox session warm-up test | 3 วัน |
| **Phase 2** | OptionsScraper (ES เดียว, 1 expiry) + Parser + Validator | 3 วัน |
| **Phase 3** | OptionsScraper ครบ (ES/NQ/GC, all expiries, weekly + monthly) | 3 วัน |
| **Phase 4** | OIScraper (Futures OI + Options OI by strike) | 2 วัน |
| **Phase 5** | OI Analytics (Max Pain, GEX, IV Rank, Summary) | 3 วัน |
| **Phase 6** | IntradayScraper (1m + all timeframes, ES/NQ/GC) | 3 วัน |
| **Phase 7** | SettlementScraper + BulletinScraper | 2 วัน |
| **Phase 8** | Scheduler + Retry + CircuitBreaker | 2 วัน |
| **Phase 9** | CSV/JSON Export + Output directory management | 1 วัน |
| **Phase 10** | Notifications (Slack + Line) | 1 วัน |
| **Phase 11** | Backfill script + Historical data load | 2 วัน |
| **Phase 12** | QA / Integration test + Production deploy | 4 วัน |
| **รวม** | | **~29 วันทำงาน (~6 สัปดาห์)** |

---

## 23. ข้อควรระวัง

### กฎหมายและ Ethics
- ดึงเฉพาะข้อมูล **สาธารณะ** ที่ CME แสดงบน website ฟรี
- ตั้ง request delay ≥ 1.5 วินาที ระหว่าง request เพื่อไม่ overload server
- **ห้ามขาย** ข้อมูลดิบ CME โดยไม่มี license
- อ่าน [CME Terms of Use](https://www.cmegroup.com/legal/terms-of-use.html) ก่อน production

### ข้อมูล
- ข้อมูล Greeks จาก CME อาจล่าช้าหรือไม่ตรง real-time — ใช้เป็น indicative เท่านั้น
- OI ที่แสดงบนเว็บอาจเป็น T-1 (วันก่อน) — ต้องระบุใน metadata
- Intraday 1m ที่ดึงผ่าน chart endpoint อาจมี gap ในช่วง low liquidity — log missing bars
- TimescaleDB retention policy จะลบ 1m data อายุ >90 วันอัตโนมัติ — backup ก่อนถึงกำหนด

---

*ไฟล์นี้เป็น living document — version ล่าสุดอยู่ใน repository เสมอ*
