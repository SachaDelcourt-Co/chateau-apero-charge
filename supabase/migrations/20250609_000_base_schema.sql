-- =====================================================
-- Base Schema Migration - Create Fundamental Tables
-- This creates the basic table structure that the system depends on
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. CORE TABLES
-- =====================================================

-- Cards table - stores NFC card information and balances
CREATE TABLE IF NOT EXISTS table_cards (
    id TEXT PRIMARY KEY,
    amount DECIMAL(10, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bar orders table - stores point-of-sale transactions
CREATE TABLE IF NOT EXISTS bar_orders (
    id SERIAL PRIMARY KEY,
    card_id TEXT NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    status TEXT DEFAULT 'pending',
    point_of_sale INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bar order items table - stores individual items in an order
CREATE TABLE IF NOT EXISTS bar_order_items (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL,
    product_name TEXT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    is_deposit BOOLEAN DEFAULT FALSE,
    is_return BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recharges table - stores card recharge transactions
CREATE TABLE IF NOT EXISTS recharges (
    id SERIAL PRIMARY KEY,
    id_card TEXT,  -- Keep original column name for compatibility
    card_id TEXT,  -- Alternative column name used in some queries
    amount DECIMAL(10, 2) NOT NULL,
    paid_by_card BOOLEAN DEFAULT FALSE,
    stripe_session_id TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 2. BASIC FOREIGN KEY CONSTRAINTS
-- =====================================================

-- Add foreign key constraints
ALTER TABLE bar_orders 
ADD CONSTRAINT fk_bar_orders_card_id 
FOREIGN KEY (card_id) REFERENCES table_cards(id);

ALTER TABLE bar_order_items 
ADD CONSTRAINT fk_bar_order_items_order_id 
FOREIGN KEY (order_id) REFERENCES bar_orders(id) ON DELETE CASCADE;

-- Make recharges.id_card reference table_cards
ALTER TABLE recharges 
ADD CONSTRAINT fk_recharges_card_id 
FOREIGN KEY (id_card) REFERENCES table_cards(id);

-- =====================================================
-- 3. BASIC INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_table_cards_id ON table_cards(id);
CREATE INDEX IF NOT EXISTS idx_bar_orders_card_id ON bar_orders(card_id);
CREATE INDEX IF NOT EXISTS idx_bar_orders_created_at ON bar_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_recharges_card_id ON recharges(id_card);
CREATE INDEX IF NOT EXISTS idx_recharges_created_at ON recharges(created_at);

-- =====================================================
-- 4. SAMPLE DATA FOR TESTING
-- =====================================================

-- Insert a test card if it doesn't exist
INSERT INTO table_cards (id, amount) 
VALUES ('test-card-001', 50.00)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- Base schema completed successfully
-- =====================================================

COMMENT ON TABLE table_cards IS 'Core table storing NFC card information and balances';
COMMENT ON TABLE bar_orders IS 'Point-of-sale transaction records';
COMMENT ON TABLE bar_order_items IS 'Individual items within bar orders';
COMMENT ON TABLE recharges IS 'Card recharge transaction records'; 