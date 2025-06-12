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
END $$;

-- Add missing columns to idempotency_keys
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'idempotency_keys' AND column_name = 'expires_at') THEN
        ALTER TABLE idempotency_keys ADD COLUMN expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'idempotency_keys' AND column_name = 'updated_at') THEN
        ALTER TABLE idempotency_keys ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- Add missing columns to app_transaction_log
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'app_transaction_log' AND column_name = 'correlation_id') THEN
        ALTER TABLE app_transaction_log ADD COLUMN correlation_id UUID;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'app_transaction_log' AND column_name = 'edge_function_request_id') THEN
        ALTER TABLE app_transaction_log ADD COLUMN edge_function_request_id TEXT;
    END IF;
END $$;

-- Add missing columns to nfc_scan_log
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'nfc_scan_log' AND column_name = 'scan_location_context') THEN
        ALTER TABLE nfc_scan_log ADD COLUMN scan_location_context TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'nfc_scan_log' AND column_name = 'device_identifier') THEN
        ALTER TABLE nfc_scan_log ADD COLUMN device_identifier TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'nfc_scan_log' AND column_name = 'user_agent') THEN
        ALTER TABLE nfc_scan_log ADD COLUMN user_agent TEXT;
    END IF;
END $$;

-- =====================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_table_cards_amount ON table_cards(amount);
CREATE INDEX IF NOT EXISTS idx_bar_orders_client_request_id ON bar_orders(client_request_id);
CREATE INDEX IF NOT EXISTS idx_recharges_client_request_id ON recharges(client_request_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires_at ON idempotency_keys(expires_at);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_source_function ON idempotency_keys(source_function);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_status ON idempotency_keys(status);
CREATE INDEX IF NOT EXISTS idx_transaction_log_card_id ON app_transaction_log(card_id);
CREATE INDEX IF NOT EXISTS idx_transaction_log_timestamp ON app_transaction_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_transaction_log_transaction_type ON app_transaction_log(transaction_type);
CREATE INDEX IF NOT EXISTS idx_transaction_log_status ON app_transaction_log(status);
CREATE INDEX IF NOT EXISTS idx_transaction_log_client_request_id ON app_transaction_log(client_request_id);
CREATE INDEX IF NOT EXISTS idx_nfc_scan_log_timestamp ON nfc_scan_log(scan_timestamp);
CREATE INDEX IF NOT EXISTS idx_nfc_scan_log_card_id ON nfc_scan_log(card_id_scanned);
CREATE INDEX IF NOT EXISTS idx_nfc_scan_log_status ON nfc_scan_log(scan_status);

-- =====================================================
-- 3. PHASE 1 STORED PROCEDURES
-- =====================================================

-- Drop existing functions if they exist to avoid conflicts
DROP FUNCTION IF EXISTS sp_process_bar_order(TEXT, JSONB, DECIMAL, TEXT, INT);
DROP FUNCTION IF EXISTS sp_process_stripe_recharge(TEXT, DECIMAL, TEXT, JSONB);
DROP FUNCTION IF EXISTS sp_process_checkpoint_recharge(TEXT, DECIMAL, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS cleanup_expired_idempotency_keys();

-- Bar Order Processing (Atomic)
CREATE FUNCTION sp_process_bar_order(
    card_id_in TEXT,
    items_in JSONB,
    total_amount_in DECIMAL,
    client_request_id_in TEXT,
    point_of_sale_in INT DEFAULT 1
) RETURNS JSONB AS $$
DECLARE
    current_balance DECIMAL;
    new_balance DECIMAL;
    order_id_out UUID;
    transaction_id_out UUID;
    result JSONB;
BEGIN
    -- Check idempotency
    IF EXISTS (SELECT 1 FROM idempotency_keys WHERE request_id = client_request_id_in) THEN
        SELECT response_payload INTO result 
        FROM idempotency_keys 
        WHERE request_id = client_request_id_in AND status = 'completed';
        
        IF result IS NOT NULL THEN
            RETURN result;
        END IF;
    END IF;

    -- Insert idempotency key
    INSERT INTO idempotency_keys (request_id, source_function, status)
    VALUES (client_request_id_in, 'sp_process_bar_order', 'processing')
    ON CONFLICT (request_id) DO NOTHING;

    -- Start transaction
    BEGIN
        -- Get and lock card
        SELECT amount INTO current_balance 
        FROM table_cards 
        WHERE id = card_id_in 
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Card not found: %', card_id_in;
        END IF;

        -- Check sufficient balance
        IF current_balance < total_amount_in THEN
            RAISE EXCEPTION 'Insufficient funds: % < %', current_balance, total_amount_in;
        END IF;

        -- Calculate new balance
        new_balance := current_balance - total_amount_in;

        -- Create order
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

        -- Update card balance
        UPDATE table_cards 
        SET amount = new_balance
        WHERE id = card_id_in;

        -- Log transaction
        INSERT INTO app_transaction_log (
            card_id, transaction_type, status, amount_involved,
            previous_balance, new_balance, details,
            edge_function_name, client_request_id
        ) VALUES (
            card_id_in, 'bar_order', 'completed', total_amount_in,
            current_balance, new_balance, items_in,
            'process-bar-order', client_request_id_in
        ) RETURNING transaction_id INTO transaction_id_out;

        -- Prepare result
        result := jsonb_build_object(
            'success', true,
            'order_id', order_id_out,
            'transaction_id', transaction_id_out,
            'previous_balance', current_balance,
            'new_balance', new_balance
        );

        -- Update idempotency key
        UPDATE idempotency_keys 
        SET status = 'completed', response_payload = result, updated_at = NOW()
        WHERE request_id = client_request_id_in;

        RETURN result;

    EXCEPTION WHEN OTHERS THEN
        -- Update idempotency key with error
        UPDATE idempotency_keys 
        SET status = 'failed', 
            response_payload = jsonb_build_object('error', SQLERRM),
            updated_at = NOW()
        WHERE request_id = client_request_id_in;
        
        RAISE;
    END;
END;
$$ LANGUAGE plpgsql;

-- Stripe Recharge Processing (Atomic)
CREATE FUNCTION sp_process_stripe_recharge(
    card_id_in TEXT,
    amount_in DECIMAL,
    stripe_session_id_in TEXT,
    stripe_metadata_in JSONB DEFAULT '{}'::JSONB
) RETURNS JSONB AS $$
DECLARE
    current_balance DECIMAL;
    new_balance DECIMAL;
    transaction_id_out UUID;
    result JSONB;
BEGIN
    -- Check for duplicate Stripe session
    IF EXISTS (SELECT 1 FROM recharges WHERE stripe_session_id = stripe_session_id_in) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Duplicate Stripe session',
            'stripe_session_id', stripe_session_id_in
        );
    END IF;

    -- Start transaction
    BEGIN
        -- Get and lock card
        SELECT amount INTO current_balance 
        FROM table_cards 
        WHERE id = card_id_in 
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Card not found: %', card_id_in;
        END IF;

        -- Calculate new balance
        new_balance := current_balance + amount_in;

        -- Create recharge record
        INSERT INTO recharges (
            card_id, amount, paid_by_card, stripe_session_id,
            stripe_metadata, created_at
        ) VALUES (
            card_id_in, amount_in, true, stripe_session_id_in,
            stripe_metadata_in, NOW()
        );

        -- Update card balance
        UPDATE table_cards 
        SET amount = new_balance
        WHERE id = card_id_in;

        -- Log transaction
        INSERT INTO app_transaction_log (
            card_id, transaction_type, status, amount_involved,
            previous_balance, new_balance, details,
            edge_function_name
        ) VALUES (
            card_id_in, 'stripe_recharge', 'completed', amount_in,
            current_balance, new_balance, stripe_metadata_in,
            'stripe-webhook'
        ) RETURNING transaction_id INTO transaction_id_out;

        -- Prepare result
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

-- Checkpoint Recharge Processing (Atomic)
CREATE FUNCTION sp_process_checkpoint_recharge(
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
    -- Check idempotency
    IF EXISTS (SELECT 1 FROM idempotency_keys WHERE request_id = client_request_id_in) THEN
        SELECT response_payload INTO result 
        FROM idempotency_keys 
        WHERE request_id = client_request_id_in AND status = 'completed';
        
        IF result IS NOT NULL THEN
            RETURN result;
        END IF;
    END IF;

    -- Insert idempotency key
    INSERT INTO idempotency_keys (request_id, source_function, status)
    VALUES (client_request_id_in, 'sp_process_checkpoint_recharge', 'processing')
    ON CONFLICT (request_id) DO NOTHING;

    -- Start transaction
    BEGIN
        -- Get and lock card
        SELECT amount INTO current_balance 
        FROM table_cards 
        WHERE id = card_id_in 
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Card not found: %', card_id_in;
        END IF;

        -- Calculate new balance
        new_balance := current_balance + amount_in;

        -- Create recharge record
        INSERT INTO recharges (
            card_id, amount, paid_by_card, staff_id, checkpoint_id,
            client_request_id, created_at
        ) VALUES (
            card_id_in, amount_in, (payment_method_in = 'card'), 
            staff_id_in, checkpoint_id_in, client_request_id_in, NOW()
        );

        -- Update card balance
        UPDATE table_cards 
        SET amount = new_balance
        WHERE id = card_id_in;

        -- Log transaction
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

        -- Prepare result
        result := jsonb_build_object(
            'success', true,
            'transaction_id', transaction_id_out,
            'previous_balance', current_balance,
            'new_balance', new_balance
        );

        -- Update idempotency key
        UPDATE idempotency_keys 
        SET status = 'completed', response_payload = result, updated_at = NOW()
        WHERE request_id = client_request_id_in;

        RETURN result;

    EXCEPTION WHEN OTHERS THEN
        -- Update idempotency key with error
        UPDATE idempotency_keys 
        SET status = 'failed', 
            response_payload = jsonb_build_object('error', SQLERRM),
            updated_at = NOW()
        WHERE request_id = client_request_id_in;
        
        RAISE;
    END;
END;
$$ LANGUAGE plpgsql;

-- Cleanup function for expired idempotency keys
CREATE FUNCTION cleanup_expired_idempotency_keys() RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM idempotency_keys 
    WHERE expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;