-- =====================================================
-- Phase 2 Foundation Migration for Cashless Festival Payment System
-- Implements atomic operations, idempotency controls, and comprehensive logging
-- =====================================================

-- =====================================================
-- 1. NEW TABLES
-- =====================================================

-- Idempotency protection table
CREATE TABLE IF NOT EXISTS idempotency_keys (
    request_id TEXT PRIMARY KEY,
    source_function TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
    response_payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);

-- Comprehensive transaction logging table
CREATE TABLE IF NOT EXISTS app_transaction_log (
    log_id BIGSERIAL PRIMARY KEY,
    transaction_id UUID UNIQUE DEFAULT gen_random_uuid(),
    correlation_id UUID,
    card_id TEXT NOT NULL,
    transaction_type TEXT NOT NULL,
    status TEXT NOT NULL,
    amount_involved DECIMAL(10, 2),
    previous_balance DECIMAL(10, 2),
    new_balance DECIMAL(10, 2),
    details JSONB,
    edge_function_name TEXT,
    edge_function_request_id TEXT,
    client_request_id TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- NFC scan logging for debugging and monitoring
CREATE TABLE IF NOT EXISTS nfc_scan_log (
    scan_log_id BIGSERIAL PRIMARY KEY,
    card_id_scanned TEXT,
    raw_data TEXT,
    scan_timestamp TIMESTAMPTZ DEFAULT NOW(),
    scan_status TEXT NOT NULL,
    scan_location_context TEXT,
    device_identifier TEXT,
    user_agent TEXT
);

-- =====================================================
-- 2. SCHEMA MODIFICATIONS TO EXISTING TABLES
-- =====================================================

-- Add idempotency support to recharges table
DO $$
BEGIN
    -- Add client_request_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'recharges' AND column_name = 'client_request_id') THEN
        ALTER TABLE recharges ADD COLUMN client_request_id TEXT;
    END IF;
    
    -- Add staff_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'recharges' AND column_name = 'staff_id') THEN
        ALTER TABLE recharges ADD COLUMN staff_id TEXT;
    END IF;
    
    -- Add checkpoint_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'recharges' AND column_name = 'checkpoint_id') THEN
        ALTER TABLE recharges ADD COLUMN checkpoint_id TEXT;
    END IF;
    
    -- Add stripe_metadata column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'recharges' AND column_name = 'stripe_metadata') THEN
        ALTER TABLE recharges ADD COLUMN stripe_metadata JSONB;
    END IF;
END $$;

-- Add idempotency support to bar_orders table
DO $$
BEGIN
    -- Add client_request_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'bar_orders' AND column_name = 'client_request_id') THEN
        ALTER TABLE bar_orders ADD COLUMN client_request_id TEXT;
    END IF;
END $$;

-- =====================================================
-- 3. CONSTRAINTS AND INDEXES
-- =====================================================

-- Add unique constraints (only if they don't exist)
DO $$
BEGIN
    -- Unique constraint for client_request_id in recharges
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE table_name = 'recharges' AND constraint_name = 'recharges_client_request_id_key') THEN
        ALTER TABLE recharges ADD CONSTRAINT recharges_client_request_id_key UNIQUE (client_request_id);
    END IF;
    
    -- Unique constraint for stripe_session_id in recharges
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE table_name = 'recharges' AND constraint_name = 'unique_stripe_session') THEN
        ALTER TABLE recharges ADD CONSTRAINT unique_stripe_session UNIQUE (stripe_session_id);
    END IF;
    
    -- Unique constraint for client_request_id in bar_orders
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE table_name = 'bar_orders' AND constraint_name = 'bar_orders_client_request_id_key') THEN
        ALTER TABLE bar_orders ADD CONSTRAINT bar_orders_client_request_id_key UNIQUE (client_request_id);
    END IF;
END $$;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires_at ON idempotency_keys(expires_at);
CREATE INDEX IF NOT EXISTS idx_transaction_log_card_id ON app_transaction_log(card_id);
CREATE INDEX IF NOT EXISTS idx_transaction_log_timestamp ON app_transaction_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_nfc_scan_log_timestamp ON nfc_scan_log(scan_timestamp);
CREATE INDEX IF NOT EXISTS idx_nfc_scan_log_card_id ON nfc_scan_log(card_id_scanned);

-- =====================================================
-- 4. ATOMIC STORED PROCEDURES
-- =====================================================

-- =====================================================
-- 4.1 Bar Order Processing Stored Procedure
-- =====================================================
CREATE OR REPLACE FUNCTION sp_process_bar_order(
    card_id_in TEXT,
    items_in JSONB,
    total_amount_in DECIMAL,
    client_request_id_in TEXT,
    point_of_sale_in INT DEFAULT 1
) RETURNS JSONB AS $$
DECLARE
    current_balance DECIMAL;
    new_balance DECIMAL;
    order_id_out INT;
    transaction_id_out UUID;
    result JSONB;
BEGIN
    -- Check idempotency - return existing result if already processed
    IF EXISTS (SELECT 1 FROM idempotency_keys WHERE request_id = client_request_id_in) THEN
        SELECT response_payload INTO result 
        FROM idempotency_keys 
        WHERE request_id = client_request_id_in AND status = 'completed';
        
        IF result IS NOT NULL THEN
            RETURN result;
        END IF;
    END IF;

    -- Insert idempotency key to mark processing start
    INSERT INTO idempotency_keys (request_id, source_function, status)
    VALUES (client_request_id_in, 'sp_process_bar_order', 'processing')
    ON CONFLICT (request_id) DO NOTHING;

    -- Start atomic transaction
    BEGIN
        -- Get and lock card for update (prevents race conditions)
        SELECT amount INTO current_balance 
        FROM table_cards 
        WHERE id = card_id_in 
        FOR UPDATE;

        -- Validate card exists
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Card not found: %', card_id_in;
        END IF;

        -- Validate sufficient balance
        IF current_balance < total_amount_in THEN
            RAISE EXCEPTION 'Insufficient funds: % < %', current_balance, total_amount_in;
        END IF;

        -- Calculate new balance
        new_balance := current_balance - total_amount_in;

        -- Create bar order record
        INSERT INTO bar_orders (card_id, total_amount, status, point_of_sale, client_request_id)
        VALUES (card_id_in, total_amount_in, 'completed', point_of_sale_in, client_request_id_in)
        RETURNING id INTO order_id_out;

        -- Create order items
        INSERT INTO bar_order_items (order_id, product_name, price, quantity, is_deposit, is_return)
        SELECT 
            order_id_out,
            item->>'name',
            (item->>'unit_price')::DECIMAL,
            (item->>'quantity')::INT,
            COALESCE((item->>'is_deposit')::BOOLEAN, false),
            COALESCE((item->>'is_return')::BOOLEAN, false)
        FROM jsonb_array_elements(items_in) AS item;

        -- Update card balance atomically
        UPDATE table_cards 
        SET amount = new_balance 
        WHERE id = card_id_in;

        -- Log transaction for audit trail
        INSERT INTO app_transaction_log (
            card_id, transaction_type, status, amount_involved,
            previous_balance, new_balance, details,
            edge_function_name, client_request_id
        ) VALUES (
            card_id_in, 'bar_order', 'completed', total_amount_in,
            current_balance, new_balance, items_in,
            'process-bar-order', client_request_id_in
        ) RETURNING transaction_id INTO transaction_id_out;

        -- Prepare success response
        result := jsonb_build_object(
            'success', true,
            'order_id', order_id_out,
            'transaction_id', transaction_id_out,
            'previous_balance', current_balance,
            'new_balance', new_balance
        );

        -- Mark idempotency key as completed
        UPDATE idempotency_keys 
        SET status = 'completed', response_payload = result, updated_at = NOW()
        WHERE request_id = client_request_id_in;

        RETURN result;

    EXCEPTION WHEN OTHERS THEN
        -- Mark idempotency key as failed and re-raise exception
        UPDATE idempotency_keys 
        SET status = 'failed', 
            response_payload = jsonb_build_object('error', SQLERRM),
            updated_at = NOW()
        WHERE request_id = client_request_id_in;
        
        RAISE;
    END;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 4.2 Stripe Recharge Processing Stored Procedure
-- =====================================================
CREATE OR REPLACE FUNCTION sp_process_stripe_recharge(
    card_id_in TEXT,
    amount_in DECIMAL,
    stripe_session_id_in TEXT,
    stripe_metadata_in JSONB
) RETURNS JSONB AS $$
DECLARE
    current_balance DECIMAL;
    new_balance DECIMAL;
    transaction_id_out UUID;
    result JSONB;
BEGIN
    -- Check for duplicate Stripe session (idempotency at Stripe level)
    IF EXISTS (SELECT 1 FROM recharges WHERE stripe_session_id = stripe_session_id_in) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Duplicate Stripe session',
            'stripe_session_id', stripe_session_id_in
        );
    END IF;

    -- Start atomic transaction
    BEGIN
        -- Get and lock card for update (prevents race conditions)
        SELECT amount INTO current_balance 
        FROM table_cards 
        WHERE id = card_id_in 
        FOR UPDATE;

        -- Validate card exists
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Card not found: %', card_id_in;
        END IF;

        -- Calculate new balance
        new_balance := current_balance + amount_in;

        -- Create recharge record
        INSERT INTO recharges (
            id_card, amount, paid_by_card, stripe_session_id,
            stripe_metadata, created_at
        ) VALUES (
            card_id_in, amount_in, true, stripe_session_id_in,
            stripe_metadata_in, NOW()
        );

        -- Update card balance atomically
        UPDATE table_cards 
        SET amount = new_balance 
        WHERE id = card_id_in;

        -- Log transaction for audit trail
        INSERT INTO app_transaction_log (
            card_id, transaction_type, status, amount_involved,
            previous_balance, new_balance, details,
            edge_function_name
        ) VALUES (
            card_id_in, 'stripe_recharge', 'completed', amount_in,
            current_balance, new_balance, stripe_metadata_in,
            'stripe-webhook'
        ) RETURNING transaction_id INTO transaction_id_out;

        -- Prepare success response
        result := jsonb_build_object(
            'success', true,
            'transaction_id', transaction_id_out,
            'previous_balance', current_balance,
            'new_balance', new_balance,
            'stripe_session_id', stripe_session_id_in
        );

        RETURN result;

    EXCEPTION WHEN OTHERS THEN
        RAISE;
    END;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 4.3 Checkpoint Recharge Processing Stored Procedure
-- =====================================================
CREATE OR REPLACE FUNCTION sp_process_checkpoint_recharge(
    card_id_in TEXT,
    amount_in DECIMAL,
    payment_method_in TEXT,
    staff_id_in TEXT,
    client_request_id_in TEXT,
    checkpoint_id_in TEXT
) RETURNS JSONB AS $$
DECLARE
    current_balance DECIMAL;
    new_balance DECIMAL;
    transaction_id_out UUID;
    result JSONB;
BEGIN
    -- Check idempotency - return existing result if already processed
    IF EXISTS (SELECT 1 FROM idempotency_keys WHERE request_id = client_request_id_in) THEN
        SELECT response_payload INTO result 
        FROM idempotency_keys 
        WHERE request_id = client_request_id_in AND status = 'completed';
        
        IF result IS NOT NULL THEN
            RETURN result;
        END IF;
    END IF;

    -- Insert idempotency key to mark processing start
    INSERT INTO idempotency_keys (request_id, source_function, status)
    VALUES (client_request_id_in, 'sp_process_checkpoint_recharge', 'processing')
    ON CONFLICT (request_id) DO NOTHING;

    -- Start atomic transaction
    BEGIN
        -- Get and lock card for update (prevents race conditions)
        SELECT amount INTO current_balance 
        FROM table_cards 
        WHERE id = card_id_in 
        FOR UPDATE;

        -- Validate card exists
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Card not found: %', card_id_in;
        END IF;

        -- Calculate new balance
        new_balance := current_balance + amount_in;

        -- Create recharge record
        INSERT INTO recharges (
            id_card, amount, paid_by_card, staff_id, checkpoint_id,
            client_request_id, created_at
        ) VALUES (
            card_id_in, amount_in, (payment_method_in = 'card'), 
            staff_id_in, checkpoint_id_in, client_request_id_in, NOW()
        );

        -- Update card balance atomically
        UPDATE table_cards 
        SET amount = new_balance 
        WHERE id = card_id_in;

        -- Log transaction for audit trail
        INSERT INTO app_transaction_log (
            card_id, transaction_type, status, amount_involved,
            previous_balance, new_balance, details,
            edge_function_name, client_request_id
        ) VALUES (
            card_id_in, 'checkpoint_recharge', 'completed', amount_in,
            current_balance, new_balance, 
            jsonb_build_object('payment_method', payment_method_in, 'staff_id', staff_id_in),
            'process-checkpoint-recharge', client_request_id_in
        ) RETURNING transaction_id INTO transaction_id_out;

        -- Prepare success response
        result := jsonb_build_object(
            'success', true,
            'transaction_id', transaction_id_out,
            'previous_balance', current_balance,
            'new_balance', new_balance
        );

        -- Mark idempotency key as completed
        UPDATE idempotency_keys 
        SET status = 'completed', response_payload = result, updated_at = NOW()
        WHERE request_id = client_request_id_in;

        RETURN result;

    EXCEPTION WHEN OTHERS THEN
        -- Mark idempotency key as failed and re-raise exception
        UPDATE idempotency_keys 
        SET status = 'failed', 
            response_payload = jsonb_build_object('error', SQLERRM),
            updated_at = NOW()
        WHERE request_id = client_request_id_in;
        
        RAISE;
    END;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 5. CLEANUP FUNCTION FOR EXPIRED IDEMPOTENCY KEYS
-- =====================================================
CREATE OR REPLACE FUNCTION cleanup_expired_idempotency_keys() RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM idempotency_keys WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 6. COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE idempotency_keys IS 'Stores idempotency keys to prevent duplicate processing of requests';
COMMENT ON TABLE app_transaction_log IS 'Comprehensive audit log for all financial transactions';
COMMENT ON TABLE nfc_scan_log IS 'Debug and monitoring log for NFC scan events';

COMMENT ON FUNCTION sp_process_bar_order IS 'Atomically processes bar orders with idempotency protection and race condition prevention';
COMMENT ON FUNCTION sp_process_stripe_recharge IS 'Atomically processes Stripe recharges with duplicate session protection';
COMMENT ON FUNCTION sp_process_checkpoint_recharge IS 'Atomically processes checkpoint recharges with idempotency protection';
COMMENT ON FUNCTION cleanup_expired_idempotency_keys IS 'Maintenance function to clean up expired idempotency keys';

-- =====================================================
-- Migration completed successfully
-- =====================================================