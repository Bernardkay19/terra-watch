-- Create the reports table (including landmark support)
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('mining', 'pollution', 'flooding')),
    description TEXT NOT NULL,
    landmark TEXT, -- Added for landmark/typed location descriptions
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    status TEXT DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'verified', 'dismissed'))
);

-- Row Level Security (RLS) - For the hackathon, we allow public read and write access
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access" ON reports
    FOR SELECT TO public USING (true);

CREATE POLICY "Allow public write access" ON reports
    FOR INSERT TO public WITH CHECK (true);

-- Insert dummy seed data inside Ghana's borders (including landmarks)
INSERT INTO reports (type, description, landmark, latitude, longitude, status)
VALUES 
    ('pollution', 'Suspicious muddy sediment detected flowing downstream in Pra River.', 'Beposo bridge area', 5.9231, -1.6128, 'verified'),
    ('mining', 'Active excavator spotted in forest reserve near Tarkwa.', 'Tarkwa forest reserve north gate', 5.3012, -2.0014, 'pending'),
    ('flooding', 'Severe river overflow flooding local cocoa farms near Dunkwa-on-Offin.', 'Dunkwa-on-Offin riverside farms', 5.9678, -1.7834, 'verified');

-- Migration statement in case you already ran the previous schema:
-- ALTER TABLE reports ADD COLUMN IF NOT EXISTS landmark TEXT;

-- Create the flood_risk table
CREATE TABLE IF NOT EXISTS flood_risk (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    community TEXT NOT NULL UNIQUE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    risk_score DOUBLE PRECISION NOT NULL, -- 0.0 to 1.0 or percentage
    status TEXT NOT NULL CHECK (status IN ('high', 'medium', 'low'))
);

-- Enable RLS for flood_risk
ALTER TABLE flood_risk ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on flood_risk" ON flood_risk
    FOR SELECT TO public USING (true);

CREATE POLICY "Allow public write access on flood_risk" ON flood_risk
    FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Allow public update access on flood_risk" ON flood_risk
    FOR UPDATE TO public USING (true);

-- Insert seed communities downstream of mining areas
INSERT INTO flood_risk (community, latitude, longitude, risk_score, status)
VALUES
    ('Dunkwa-on-Offin', 5.9678, -1.7834, 0.75, 'high'),
    ('Beposo (Pra River)', 5.1500, -1.6000, 0.45, 'medium'),
    ('Tarkwa Downstream', 5.2500, -2.0200, 0.60, 'medium'),
    ('Obuasi Downstream', 6.1500, -1.6800, 0.30, 'low')
ON CONFLICT (community) DO NOTHING;

-- Multi-Risk AI Dimensions Migration
ALTER TABLE flood_risk ADD COLUMN IF NOT EXISTS mining_risk_score DOUBLE PRECISION DEFAULT 0.0;
ALTER TABLE flood_risk ADD COLUMN IF NOT EXISTS mining_status TEXT DEFAULT 'low';
ALTER TABLE flood_risk ADD COLUMN IF NOT EXISTS pollution_risk_score DOUBLE PRECISION DEFAULT 0.0;
ALTER TABLE flood_risk ADD COLUMN IF NOT EXISTS pollution_status TEXT DEFAULT 'low';

-- Seed initial records with sample values for new risk dimensions
UPDATE flood_risk SET mining_risk_score = 0.80, mining_status = 'high', pollution_risk_score = 0.70, pollution_status = 'high' WHERE community = 'Dunkwa-on-Offin';
UPDATE flood_risk SET mining_risk_score = 0.55, mining_status = 'medium', pollution_risk_score = 0.50, pollution_status = 'medium' WHERE community = 'Beposo (Pra River)';
UPDATE flood_risk SET mining_risk_score = 0.70, mining_status = 'high', pollution_risk_score = 0.55, pollution_status = 'medium' WHERE community = 'Tarkwa Downstream';
UPDATE flood_risk SET mining_risk_score = 0.30, mining_status = 'low', pollution_risk_score = 0.40, pollution_status = 'medium' WHERE community = 'Obuasi Downstream';
