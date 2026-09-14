-- ==============================================================================
-- QUEENCOSY MIGRATION: BOM & COST CALCULATOR SHARED DATABASE
-- Isolated Namespace: bom_calc_* (Completely separate from traceability-web)
-- Date: 2026-09-14
-- Project: https://bom-calculator-web.vercel.app/
-- ==============================================================================

-- 1. Table: public.bom_calc_material_prices
-- Stores shared raw material benchmark prices, categories, units, and stock on hand
CREATE TABLE IF NOT EXISTS public.bom_calc_material_prices (
    material_name VARCHAR(150) PRIMARY KEY,
    category VARCHAR(50) NOT NULL DEFAULT 'other',
    unit VARCHAR(50) NOT NULL DEFAULT 'ชิ้น',
    unit_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    current_stock NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    waste_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by VARCHAR(100) DEFAULT 'Admin'
);

-- Pre-populate all 43 default benchmark materials (will not overwrite existing prices)
INSERT INTO public.bom_calc_material_prices 
    (material_name, category, unit, unit_price, current_stock, waste_percent)
VALUES
    -- โครงสร้างไม้ (wood)
    ('ไม้ 1 นิ้ว 1 เมตร (ท่อน)', 'wood', 'ท่อน', 12.00, 0, 0),
    ('ไม้ 2 นิ้ว 1 เมตร (ท่อน)', 'wood', 'ท่อน', 18.00, 0, 0),
    ('ไม้ 2 นิ้ว 1.5 เมตร (ท่อน)', 'wood', 'ท่อน', 26.00, 0, 0),
    ('ไม้อัด (แผ่น)', 'wood', 'แผ่น', 180.00, 0, 0),
    ('ไม้หน้า 4 (ท่อน)', 'wood', 'ท่อน', 45.00, 0, 0),

    -- ฟองน้ำ (foam)
    ('ฟองน้ำ 2 นิ้ว ที่นั่ง (PM7)', 'foam', 'แผ่น', 280.00, 0, 0),
    ('ฟองน้ำ 2 นิ้ว แขน (PM7)', 'foam', 'แผ่น', 240.00, 0, 0),
    ('ฟองน้ำ 1 นิ้ว เนื้อพิง', 'foam', 'แผ่น', 160.00, 0, 0),
    ('ฟองน้ำ 2 นิ้ว ตัวแอล', 'foam', 'แผ่น', 350.00, 0, 0),
    ('ฟองน้ำ 2 นิ้ว หลังพิง (PM103)', 'foam', 'แผ่น', 260.00, 0, 0),

    -- หนัง / ผ้า (fabric)
    ('ดำ-PQ002C-17', 'fabric', 'หลา', 70.00, 0, 0),
    ('ขาว-PQ002C-1', 'fabric', 'หลา', 70.00, 0, 0),
    ('เทา-PQ002C-46', 'fabric', 'หลา', 70.00, 0, 0),
    ('น้ำตาล-PQ002C-12', 'fabric', 'หลา', 70.00, 0, 0),
    ('ชา-PQ002C-19', 'fabric', 'หลา', 70.00, 0, 0),
    ('ครีม-PQ002C-6', 'fabric', 'หลา', 70.00, 0, 0),
    ('มอคค่า-PQ002C-48', 'fabric', 'หลา', 70.00, 0, 0),
    ('สีน้ำตาล-MJ337-7', 'fabric', 'หลา', 85.00, 0, 0),
    ('สีเขียว-MJ337-14', 'fabric', 'หลา', 85.00, 0, 0),
    ('สีแดงมะเหมี่ยว-MJ337-23', 'fabric', 'หลา', 85.00, 0, 0),
    ('สีเทา-MJ337-29', 'fabric', 'หลา', 85.00, 0, 0),
    ('สีน้ำเงิน-MJ337-31', 'fabric', 'หลา', 85.00, 0, 0),
    ('สีโรสโกลด์-MJ337-22', 'fabric', 'หลา', 85.00, 0, 0),
    ('สีน้ำตาล-MJ350-13', 'fabric', 'หลา', 85.00, 0, 0),
    ('สีเขียว-MJ350-6', 'fabric', 'หลา', 85.00, 0, 0),
    ('สีฟ้าเข้มMJ350-9', 'fabric', 'หลา', 85.00, 0, 0),
    ('สีครีมทอง-MJ350-4', 'fabric', 'หลา', 85.00, 0, 0),
    ('สีเทาอ่อน-MJ350-18', 'fabric', 'หลา', 85.00, 0, 0),
    ('สีเทาเข้ม-MJ350-20', 'fabric', 'หลา', 85.00, 0, 0),
    ('สีครีม-MJ350-1', 'fabric', 'หลา', 85.00, 0, 0),
    ('สีน้ำตาลอ่อน-MJ350-11', 'fabric', 'หลา', 85.00, 0, 0),
    ('น้ำตาลเข้ม-MJ350-14', 'fabric', 'หลา', 85.00, 0, 0),
    ('สีครีม-MJ356-1a', 'fabric', 'หลา', 90.00, 0, 0),
    ('สีเขียว-MJ356-2a', 'fabric', 'หลา', 90.00, 0, 0),
    ('สีเทา-MJ356-3a', 'fabric', 'หลา', 90.00, 0, 0),
    ('สีน้ำตาล-MJ356-4a', 'fabric', 'หลา', 90.00, 0, 0),
    ('สีน้ำตาลทอง-736b-01', 'fabric', 'หลา', 90.00, 0, 0),
    ('สีฟ้าเทา-736b-04', 'fabric', 'หลา', 90.00, 0, 0),
    ('สีเทาเข้ม-736b-02', 'fabric', 'หลา', 90.00, 0, 0),

    -- บรรจุภัณฑ์ (packaging)
    ('กระดาษลูกฟูกแผ่น (แผ่น)', 'packaging', 'แผ่น', 15.00, 0, 0),
    ('กระดาษลูกฟูกม้วน (cm.)', 'packaging', 'cm.', 0.08, 0, 0),
    ('บับเบิ้ล (cm.)', 'packaging', 'cm.', 0.04, 0, 0),
    ('ฟิล์มหด/ซีลพลาสติก (cm.)', 'packaging', 'cm.', 0.03, 0, 0)
ON CONFLICT (material_name) DO NOTHING;

-- 2. Table: public.bom_calc_saved_plans
-- Stores shared production calculation plans and PO orders between team members
CREATE TABLE IF NOT EXISTS public.bom_calc_saved_plans (
    plan_id VARCHAR(100) PRIMARY KEY,
    plan_name VARCHAR(255) NOT NULL,
    total_skus INT DEFAULT 0,
    total_units INT DEFAULT 0,
    total_material_cost NUMERIC(12,2) DEFAULT 0.00,
    total_po_cost NUMERIC(12,2) DEFAULT 0.00,
    items_json JSONB NOT NULL,
    summary_json JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(100) DEFAULT 'Admin',
    notes TEXT
);

-- 3. Table: public.bom_calc_custom_recipes
-- Stores shared custom SKU recipes edited or added by staff
CREATE TABLE IF NOT EXISTS public.bom_calc_custom_recipes (
    sku VARCHAR(150) PRIMARY KEY,
    materials_json JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by VARCHAR(100) DEFAULT 'Admin'
);

-- ==============================================================================
-- Row Level Security (RLS) Configuration
-- ==============================================================================
ALTER TABLE public.bom_calc_material_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_calc_saved_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_calc_custom_recipes ENABLE ROW LEVEL SECURITY;

-- Allow read & write for public anon key across all 3 tables
DROP POLICY IF EXISTS Allow public all access on bom_calc_material_prices ON public.bom_calc_material_prices;
CREATE POLICY Allow public all access on bom_calc_material_prices 
    ON public.bom_calc_material_prices FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS Allow public all access on bom_calc_saved_plans ON public.bom_calc_saved_plans;
CREATE POLICY Allow public all access on bom_calc_saved_plans 
    ON public.bom_calc_saved_plans FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS Allow public all access on bom_calc_custom_recipes ON public.bom_calc_custom_recipes;
CREATE POLICY Allow public all access on bom_calc_custom_recipes 
    ON public.bom_calc_custom_recipes FOR ALL USING (true) WITH CHECK (true);

-- ==============================================================================
-- Realtime Publication
-- ==============================================================================
DO 
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bom_calc_material_prices;
EXCEPTION WHEN OTHERS THEN
    NULL;
END ;

DO 
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bom_calc_saved_plans;
EXCEPTION WHEN OTHERS THEN
    NULL;
END ;

DO 
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bom_calc_custom_recipes;
EXCEPTION WHEN OTHERS THEN
    NULL;
END ;
