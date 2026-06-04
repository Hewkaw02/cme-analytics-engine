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

-- Seed some holidays
INSERT INTO cme_holidays (holiday_date, holiday_name) VALUES
('2025-01-01', 'New Year''s Day'),
('2025-01-20', 'Martin Luther King, Jr. Day'),
('2025-02-17', 'Presidents'' Day'),
('2025-04-18', 'Good Friday'),
('2025-05-26', 'Memorial Day'),
('2025-06-19', 'Juneteenth'),
('2025-07-04', 'Independence Day'),
('2025-09-01', 'Labor Day'),
('2025-11-27', 'Thanksgiving Day'),
('2025-12-25', 'Christmas Day');
