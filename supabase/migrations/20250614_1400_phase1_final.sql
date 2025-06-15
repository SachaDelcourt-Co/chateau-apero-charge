-- Phase 1 Final Implementation - Add missing columns and functions
-- This migration adds only what's needed for Phase 1

-- =====================================================
-- 1. ADD MISSING COLUMNS TO EXISTING TABLES
-- =====================================================

-- Add missing columns to table_cards
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'table_cards' AND column_name = 'created_at') THEN
        ALTER TABLE table_cards ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'table_cards' AND column_name = 'updated_at') THEN
        ALTER TABLE table_cards ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- Add missing columns to bar_orders
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'bar_orders' AND column_name = 'client_request_id') THEN
        ALTER TABLE bar_orders ADD COLUMN client_request_id TEXT UNIQUE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'bar_orders' AND column_name = 'updated_at') THEN
        ALTER TABLE bar_orders ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- Add missing columns to recharges
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'recharges' AND column_name = 'client_request_id') THEN
        ALTER TABLE recharges ADD COLUMN client_request_id TEXT UNIQUE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'recharges' AND column_name = 'staff_id') THEN
        ALTER TABLE recharges ADD COLUMN staff_id TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'recharges' AND column_name = 'checkpoint_id') THEN
        ALTER TABLE recharges ADD COLUMN checkpoint_id TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'recharges' AND column_name = 'stripe_metadata') THEN
        ALTER TABLE recharges ADD COLUMN stripe_metadata JSONB;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'recharges' AND column_name = 'updated_at') THEN
        ALTER TABLE recharges ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
    
    -- Add card_id column as alias for id_card for consistency
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'recharges' AND column_name = 'card_id') THEN
        ALTER TABLE recharges ADD COLUMN card_id TEXT;
    END IF;
END $$;

-- Note: idempotency_keys, app_transaction_log, and nfc_scan_log tables
-- will be created in Phase 2, so we skip adding columns to them here

-- =====================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- =====================================================

-- Create indexes for existing tables only
CREATE INDEX IF NOT EXISTS idx_table_cards_amount ON table_cards(amount);
CREATE INDEX IF NOT EXISTS idx_bar_orders_client_request_id ON bar_orders(client_request_id);
CREATE INDEX IF NOT EXISTS idx_recharges_client_request_id ON recharges(client_request_id);

-- Note: Indexes for idempotency_keys, app_transaction_log, and nfc_scan_log
-- will be created in Phase 2 when those tables are created

-- =====================================================
-- 3. PHASE 1 COMPLETION
-- =====================================================

-- Note: Stored procedures will be created in Phase 2 when the required
-- tables (idempotency_keys, app_transaction_log, nfc_scan_log) are available.
-- Phase 1 focuses only on adding missing columns to existing tables.

-- Phase 1 migration completed successfully
COMMENT ON TABLE table_cards IS 'Core table storing NFC card information and balances - Phase 1 columns added';
COMMENT ON TABLE bar_orders IS 'Point-of-sale transaction records - Phase 1 columns added';
COMMENT ON TABLE recharges IS 'Card recharge transaction records - Phase 1 columns added';