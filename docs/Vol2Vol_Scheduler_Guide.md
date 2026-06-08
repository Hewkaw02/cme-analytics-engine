# คู่มือการใช้งานระบบและการทำงานของ Vol2Vol CME Scheduler

คู่มือฉบับนี้อธิบายถึงขั้นตอนการทำงานของสเกดดูลเลอร์ดึงข้อมูล **Vol2Vol CME (Expected Range)** โครงสร้างของข้อมูลในฐานข้อมูล (Database Schema) และวิธีการบริหารจัดการระบบบน Linux

---

## 1. ผังการทำงานระบบ (Data Collection Flow)

กระบวนการเก็บข้อมูล Vol2Vol ทำงานแบบวนซ้ำทุก ๆ 15 นาทีตามที่กำหนดไว้ในเงื่อนไขการทำงาน:

```mermaid
graph TD
    A[เริ่มงาน: ครบ 15 นาที] --> B{Holiday / Weekend Guard}
    B -- เป็นวันหยุด (Weekend/Holiday) --> C[บันทึก Log และข้ามการทำงาน]
    B -- วันปกติ/ชั่วโมงเทรดเปิด --> D[ดึงหน้าเว็บจำลองผ่าน BrowserPool]
    D --> E[ดึงข้อมูลคุกกี้เซสชัน & Warmup เซสชันหน้าเว็บ]
    E --> F[แกะค่า insid / qsid จาก iframe ของ Quikstrike]
    F --> G[ส่งคำขอดึงข้อมูล JSONSettings โดยตรง]
    G --> H[แปลงผลและทำความสะอาดข้อมูล (Parse & Clean)]
    H --> I[เริ่ม Transaction ในฐานข้อมูล]
    I --> J[เขียนข้อมูลสรุปและ SD ลงตาราง vol2vol_snapshots]
    J --> K[เขียนข้อมูล Strike แต่ละราคาลงตาราง vol2vol_strike_records]
    K --> L[ยืนยันการบันทึกข้อมูล (Commit Transaction)]
    L --> M[บันทึกไฟล์แคช JSON ในเครื่อง /output/vol2vol/]
    M --> N[คืนพื้นที่ Chromium Instance ให้กับ BrowserPool]
    N --> O[ส่งแจ้งเตือนสำเร็จ/ล้มเหลวทาง Slack / LINE]
```

### รายละเอียดแต่ละขั้นตอน:
1. **เวลาทำงาน (Time Trigger)**: ทุก ๆ 15 นาทีในช่วงเวลาการซื้อขายของตลาด CME
2. **ระบบคัดกรองวันหยุด (Holiday Guard)**: ระบบจะป้องกันการดึงข้อมูลในช่วงสุดสัปดาห์ (Weekend) ตั้งแต่ **วันศุกร์ 17:00 CT** ถึง **วันอาทิตย์ 17:00 CT** และคัดกรองตามวันหยุดสำคัญของ CME ที่กำหนดไว้ล่วงหน้า
3. **การเข้าเซสชันดึงข้อมูล (Session Extraction)**: จำเป็นต้องเข้าหน้าเว็บ CME หลักเพื่อเรียกใช้เซสชันจาก iframe ของ QuikStrike ซึ่งจะให้ `insid` และ `qsid` สำหรับการทำ Direct API Request
4. **การประมวลผลข้อมูล (Parsing)**: ดึงข้อมูลขอบเขตระดับราคาเบี่ยงเบนมาตรฐาน (1SD, 2SD, 3SD) และระดับราคาของ Strike เพื่อเตรียมจัดกลุ่มสำหรับการเขียนลงฐานข้อมูล

---

## 2. โครงสร้างฐานข้อมูล (Database Schema)

ตารางฐานข้อมูลที่ใช้เก็บข้อมูล Vol2Vol ใน PostgreSQL มี 2 ตารางหลักดังนี้:

### 2.1 ตาราง `vol2vol_snapshots`
ทำหน้าที่เก็บค่าทางสถิติและขอบเขตเบี่ยงเบนมาตรฐานในแต่ละภาพถ่ายเวลาที่ดึงข้อมูล (Snapshot)

| ชื่อฟิลด์ | ประเภทข้อมูล | รายละเอียด |
| :--- | :--- | :--- |
| `id` | `BIGSERIAL` (Primary Key) | ไอดีบันทึกข้อมูล |
| `trade_date` | `DATE` | วันที่มีการซื้อขาย |
| `fetched_at` | `TIMESTAMPTZ` | วันและเวลาที่ดึงข้อมูลเข้าระบบ |
| `symbol` | `VARCHAR(5)` | สัญลักษณ์ (ES, NQ, GC) |
| `future_price` | `DECIMAL(12,4)` | ราคาสัญญาฟิวเจอร์สอ้างอิง ณ ขณะนั้น |
| `atm_volatility` | `DECIMAL(8,6)` | ATM Volatility |
| `dte` | `DECIMAL(12,6)` | จำนวนวันก่อนสัญญาสิ้นอายุ (Days to Expiry) |
| `sd1_down` / `sd1_up` | `DECIMAL(12,4)` | ขอบเขตราคา 1 Standard Deviation (ล่าง / บน) |
| `sd2_down` / `sd2_up` | `DECIMAL(12,4)` | ขอบเขตราคา 2 Standard Deviation (ล่าง / บน) |
| `sd3_down` / `sd3_up` | `DECIMAL(12,4)` | ขอบเขตราคา 3 Standard Deviation (ล่าง / บน) |
| `expiry_date` | `DATE` | วันสิ้นสุดสัญญา |
| `contract_title` | `VARCHAR(100)` | ชื่อนามสัญญา (Contract Title) |

### 2.2 ตาราง `vol2vol_strike_records`
เก็บรายละเอียดปริมาณการซื้อขายและค่าความผันผวนของสัญญาออปชันแยกตามระดับราคา (Strike Detail) สำหรับ Snapshot นั้น ๆ

| ชื่อฟิลด์ | ประเภทข้อมูล | รายละเอียด |
| :--- | :--- | :--- |
| `id` | `BIGSERIAL` (Primary Key) | ไอดีบันทึกข้อมูลราคา |
| `snapshot_id` | `BIGINT` (Foreign Key) | ไอดีเชื่อมโยงกลับไปที่ `vol2vol_snapshots(id)` |
| `strike` | `DECIMAL(12,2)` | ระดับราคาใช้สิทธิ์ (Strike Price) |
| `call_volume` | `BIGINT` | ปริมาณการซื้อฝั่ง Call |
| `put_volume` | `BIGINT` | ปริมาณการซื้อฝั่ง Put |
| `implied_vol` | `DECIMAL(8,6)` | Implied Volatility |
| `settle_vol` | `DECIMAL(8,6)` | Settle Volatility |

---

## 3. การใช้งานบน Linux (Linux Deployment & Operations)

สำหรับการรันระบบดึงข้อมูลในสเกลการใช้งานจริง (Production) แนะนำให้ออโตเมทโดยรันทำงานเบื้องหลังบน Linux 2 ช่องทาง:

### 3.1 การรันผ่าน Docker Compose (แนะนำเป็นหลัก)
ระบบถูกสร้าง Docker Container ไว้พร้อมใช้งานโดยระบุเงื่อนไขเริ่มทำงานใหม่อัตโนมัติ (`restart: unless-stopped`):

```bash
# สั่งสตาร์ตคอนเทนเนอร์สำหรับตัวดึงข้อมูลทั้งหมดเบื้องหลัง (Background/Daemon)
docker compose up -d fetcher

# ตรวจสอบสถานะการทำงาน
docker compose ps fetcher

# ดูประวัติ Log การดึงข้อมูล
docker compose logs -f fetcher
```

### 3.2 การรันผ่าน PM2 (Process Manager)
หากต้องการรันแอปพลิเคชัน Node.js โดยตรงบนเครื่องเซิร์ฟเวอร์โดยไม่ใช้ Docker:

```bash
# ติดตั้ง PM2 (หากยังไม่มี)
npm install -g pm2

# สตาร์ตระบบดึงข้อมูลตามสเกดดูล
pm2 start ecosystem.config.cjs

# ดูสถานะการรัน
pm2 status

# ดู Logs การทำงานแบบเรียลไทม์
pm2 logs cme-scheduler
```

### 3.3 การรันผ่าน Systemd Service
หากต้องการลงทะเบียนระบบดึงข้อมูลเป็น Linux System Service ของระบบปฏิบัติการโดยตรง:

```bash
# คัดลอกเทมเพลต cme-scheduler.service ไปยังโฟลเดอร์ระบบของ Linux
sudo cp cme-scheduler.service /etc/systemd/system/

# โหลดการตั้งค่าระบบใหม่
sudo systemctl daemon-reload

# ตั้งค่าให้ทำงานอัตโนมัติเมื่อเปิดเครื่อง
sudo systemctl enable cme-scheduler

# สั่งให้ทำงานทันที
sudo systemctl start cme-scheduler

# ตรวจสอบสถานะการทำงาน
sudo systemctl status cme-scheduler
```

---

## 4. การรันดึงข้อมูลด้วยตนเอง (Manual Fetch CLI)

คุณสามารถสั่งรันดึงข้อมูล Vol2Vol สำหรับสัญลักษณ์ที่เจาะจงทางหน้าจอ Terminal ได้ทุกเมื่อ โดยไม่ต้องรอรอบเวลา 15 นาที:

```bash
# สั่งดึงข้อมูล Vol2Vol ของ S&P 500 (ES) สำหรับวันนี้
npm start -- --mode fetch --type VOL2VOL --symbol ES

# สั่งดึงข้อมูล Vol2Vol ของ Nasdaq (NQ)
npm start -- --mode fetch --type VOL2VOL --symbol NQ

# สั่งดึงข้อมูล Vol2Vol ของทองคำ (GC)
npm start -- --mode fetch --type VOL2VOL --symbol GC
```
