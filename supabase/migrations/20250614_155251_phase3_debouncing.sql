-- =====================================================
-- Phase 3 Migration: Backend Debouncing and Enhanced NFC Logging
-- Implements database-level duplicate prevention and comprehensive NFC scan logging
-- =====================================================

-- =====================================================
-- 1. ENHANCED NFC SCAN LOGGING TABLE
-- =====================================================

-- Drop existing nfc_scan_log table to recreate with enhanced structure
DROP TABLE IF EXISTS nfc_scan_log CASCADE;

-- Create enhanced NFC scan log table with comprehensive tracking
CREATE TABLE nfc_scan_log (
    scan_log_id BIGSERIAL PRIMARY KEY,
    
    -- Core scan data
    card_id_scanned TEXT,
    raw_data TEXT,
    scan_timestamp TIMESTAMPTZ DEFAULT NOW(),
    
    -- Enhanced scan status tracking
    scan_status TEXT NOT NULL CHECK (scan_status IN (
        'success', 'failure', 'duplicate', 'invalid_format', 
        'backend_rejected', 'processing_error', 'timeout'
    )),
    
    -- Processing information
    processing_duration_ms INTEGER,
    operation_id TEXT,
    client_request_id TEXT,
    
    -- Context information
    scan_location_context TEXT,
    device_identifier TEXT,
    user_agent TEXT,
    
    -- Error tracking
    error_message TEXT,
    error_code TEXT,
    
    -- Backend coordination
    backend_lock_acquired BOOLEAN DEFAULT FALSE,
    backend_lock_duration_ms INTEGER,
    
    -- Request tracing
    edge_function_name TEXT,
    edge_function_request_id TEXT,
    
    -- Additional metadata
    metadata JSONB DEFAULT '{}'::jsonb
);

-- =====================================================
-- 2. NFC OPERATION LOCKS TABLE
-- =====================================================

-- Table for short-lived locks to prevent concurrent NFC operations
CREATE TABLE nfc_operation_locks (
    lock_id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL,
    operation_type TEXT NOT NULL CHECK (operation_type IN (
        'bar_order', 'stripe_recharge', 'checkpoint_recharge', 'balance_check'
    )),
    locked_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 seconds',
    client_request_id TEXT,
    edge_function_name TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- =====================================================
-- 3. ENHANCED IDEMPOTENCY KEYS TABLE
-- =====================================================

-- Add NFC-specific columns to existing idempotency_keys table
DO $$
BEGIN
    -- Add card_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'idempotency_keys' AND column_name = 'card_id') THEN
        ALTER TABLE idempotency_keys ADD COLUMN card_id TEXT;
    END IF;
    
    -- Add operation_type column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'idempotency_keys' AND column_name = 'operation_type') THEN
        ALTER TABLE idempotency_keys ADD COLUMN operation_type TEXT;
    END IF;
    
    -- Add nfc_scan_log_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'idempotency_keys' AND column_name = 'nfc_scan_log_id') THEN
        ALTER TABLE idempotency_keys ADD COLUMN nfc_scan_log_id BIGINT;
    END IF;
END $$;

-- =====================================================
-- 4. PERFORMANCE INDEXES
-- =====================================================

-- NFC scan log indexes
CREATE INDEX IF NOT EXISTS idx_nfc_scan_log_timestamp ON nfc_scan_log(scan_timestamp);
CREATE INDEX IF NOT EXISTS idx_nfc_scan_log_card_id ON nfc_scan_log(card_id_scanned);
CREATE INDEX IF NOT EXISTS idx_nfc_scan_log_status ON nfc_scan_log(scan_status);
CREATE INDEX IF NOT EXISTS idx_nfc_scan_log_operation_id ON nfc_scan_log(operation_id);
CREATE INDEX IF NOT EXISTS idx_nfc_scan_log_client_request_id ON nfc_scan_log(client_request_id);

-- NFC operation locks indexes
CREATE INDEX IF NOT EXISTS idx_nfc_operation_locks_card_id ON nfc_operation_locks(card_id);
CREATE INDEX IF NOT EXISTS idx_nfc_operation_locks_expires_at ON nfc_operation_locks(expires_at);
CREATE INDEX IF NOT EXISTS idx_nfc_operation_locks_operation_type ON nfc_operation_locks(operation_type);

-- Enhanced idempotency keys indexes
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_card_id ON idempotency_keys(card_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_operation_type ON idempotency_keys(operation_type);

-- =====================================================
-- 5. NFC OPERATION LOCK MANAGEMENT FUNCTIONS
-- =====================================================

-- Function to acquire an NFC operation lock
CREATE OR REPLACE FUNCTION acquire_nfc_operation_lock(
    card_id_in TEXT,
    operation_type_in TEXT,
    client_request_id_in TEXT,
    edge_function_name_in TEXT DEFAULT NULL,
    lock_duration_seconds INTEGER DEFAULT 30
) RETURNS JSONB AS $$
DECLARE
    lock_id_generated TEXT;
    lock_acquired BOOLEAN := FALSE;
    existing_lock RECORD;
BEGIN
    -- Generate unique lock ID
    lock_id_generated := 'nfc_lock_' || card_id_in || '_' || operation_type_in || '_' || EXTRACT(EPOCH FROM NOW())::BIGINT || '_' || (RANDOM() * 1000)::INT;
    
    -- Clean up expired locks first
    DELETE FROM nfc_operation_locks WHERE expires_at < NOW();
    
    -- Check for existing active locks for this card and operation type
    SELECT * INTO existing_lock 
    FROM nfc_operation_locks 
    WHERE card_id = card_id_in 
      AND operation_type = operation_type_in 
      AND expires_at > NOW()
    LIMIT 1;
    
    IF existing_lock IS NOT NULL THEN
        -- Lock already exists and is active
        RETURN jsonb_build_object(
            'success', false,
            'lock_acquired', false,
            'error', 'Operation already in progress',
            'existing_lock_id', existing_lock.lock_id,
            'existing_lock_expires_at', existing_lock.expires_at
        );
    END IF;
    
    -- Try to acquire the lock
    BEGIN
        INSERT INTO nfc_operation_locks (
            lock_id, card_id, operation_type, client_request_id,
            edge_function_name, expires_at
        ) VALUES (
            lock_id_generated, card_id_in, operation_type_in, client_request_id_in,
            edge_function_name_in, NOW() + (lock_duration_seconds || ' seconds')::INTERVAL
        );
        
        lock_acquired := TRUE;
        
    EXCEPTION WHEN unique_violation THEN
        -- Lock ID collision (very unlikely but handle it)
        lock_acquired := FALSE;
    END;
    
    RETURN jsonb_build_object(
        'success', lock_acquired,
        'lock_acquired', lock_acquired,
        'lock_id', CASE WHEN lock_acquired THEN lock_id_generated ELSE NULL END,
        'expires_at', CASE WHEN lock_acquired THEN NOW() + (lock_duration_seconds || ' seconds')::INTERVAL ELSE NULL END
    );
END;
$$ LANGUAGE plpgsql;

-- Function to release an NFC operation lock
CREATE OR REPLACE FUNCTION release_nfc_operation_lock(
    lock_id_in TEXT
) RETURNS JSONB AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM nfc_operation_locks WHERE lock_id = lock_id_in;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN jsonb_build_object(
        'success', deleted_count > 0,
        'lock_released', deleted_count > 0,
        'lock_id', lock_id_in
    );
END;
$$ LANGUAGE plpgsql;

-- Function to check if an NFC operation lock exists
CREATE OR REPLACE FUNCTION check_nfc_operation_lock(
    card_id_in TEXT,
    operation_type_in TEXT
) RETURNS JSONB AS $$
DECLARE
    existing_lock RECORD;
BEGIN
    -- Clean up expired locks first
    DELETE FROM nfc_operation_locks WHERE expires_at < NOW();
    
    -- Check for existing active locks
    SELECT * INTO existing_lock 
    FROM nfc_operation_locks 
    WHERE card_id = card_id_in 
      AND operation_type = operation_type_in 
      AND expires_at > NOW()
    LIMIT 1;
    
    IF existing_lock IS NOT NULL THEN
        RETURN jsonb_build_object(
            'lock_exists', true,
            'lock_id', existing_lock.lock_id,
            'locked_at', existing_lock.locked_at,
            'expires_at', existing_lock.expires_at,
            'client_request_id', existing_lock.client_request_id
        );
    ELSE
        RETURN jsonb_build_object(
            'lock_exists', false
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 6. ENHANCED STORED PROCEDURES WITH DEBOUNCING
-- =====================================================

-- Enhanced bar order processing with NFC debouncing
CREATE OR REPLACE FUNCTION sp_process_bar_order_with_debouncing(
    card_id_in TEXT,
    items_in JSONB,
    total_amount_in DECIMAL,
    client_request_id_in TEXT,
    point_of_sale_in INT DEFAULT 1,
    nfc_scan_log_id_in BIGINT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    current_balance DECIMAL;
    new_balance DECIMAL;
    order_id_out INT;
    transaction_id_out UUID;
    result JSONB;
    lock_result JSONB;
    lock_id_acquired TEXT;
    processing_start_time TIMESTAMPTZ;
    processing_duration_ms INTEGER;
BEGIN
    processing_start_time := NOW();
    
    -- Step 1: Try to acquire NFC operation lock
    SELECT acquire_nfc_operation_lock(
        card_id_in, 
        'bar_order', 
        client_request_id_in, 
        'process-bar-order',
        30 -- 30 second lock
    ) INTO lock_result;
    
    IF NOT (lock_result->>'success')::BOOLEAN THEN
        -- Lock acquisition failed - operation already in progress
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Operation already in progress for this card',
            'error_code', 'OPERATION_IN_PROGRESS',
            'details', lock_result
        );
    END IF;
    
    lock_id_acquired := lock_result->>'lock_id';
    
    -- Step 2: Check idempotency - return existing result if already processed
    IF EXISTS (SELECT 1 FROM idempotency_keys WHERE request_id = client_request_id_in) THEN
        SELECT response_payload INTO result 
        FROM idempotency_keys 
        WHERE request_id = client_request_id_in AND status = 'completed';
        
        IF result IS NOT NULL THEN
            -- Release the lock before returning
            PERFORM release_nfc_operation_lock(lock_id_acquired);
            RETURN result;
        END IF;
    END IF;

    -- Step 3: Insert idempotency key to mark processing start
    INSERT INTO idempotency_keys (
        request_id, source_function, status, card_id, 
        operation_type, nfc_scan_log_id
    )
    VALUES (
        client_request_id_in, 'sp_process_bar_order_with_debouncing', 'processing',
        card_id_in, 'bar_order', nfc_scan_log_id_in
    )
    ON CONFLICT (request_id) DO NOTHING;

    -- Step 4: Start atomic transaction
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

        -- Calculate processing duration
        processing_duration_ms := EXTRACT(EPOCH FROM (NOW() - processing_start_time)) * 1000;

        -- Update NFC scan log if provided
        IF nfc_scan_log_id_in IS NOT NULL THEN
            UPDATE nfc_scan_log 
            SET 
                scan_status = 'success',
                processing_duration_ms = processing_duration_ms,
                client_request_id = client_request_id_in,
                backend_lock_acquired = TRUE,
                backend_lock_duration_ms = EXTRACT(EPOCH FROM (NOW() - processing_start_time)) * 1000
            WHERE scan_log_id = nfc_scan_log_id_in;
        END IF;

        -- Prepare success response
        result := jsonb_build_object(
            'success', true,
            'order_id', order_id_out,
            'transaction_id', transaction_id_out,
            'previous_balance', current_balance,
            'new_balance', new_balance,
            'processing_duration_ms', processing_duration_ms
        );

        -- Mark idempotency key as completed
        UPDATE idempotency_keys 
        SET status = 'completed', response_payload = result, updated_at = NOW()
        WHERE request_id = client_request_id_in;

        -- Release the NFC operation lock
        PERFORM release_nfc_operation_lock(lock_id_acquired);

        RETURN result;

    EXCEPTION WHEN OTHERS THEN
        -- Calculate processing duration for error case
        processing_duration_ms := EXTRACT(EPOCH FROM (NOW() - processing_start_time)) * 1000;
        
        -- Update NFC scan log with error if provided
        IF nfc_scan_log_id_in IS NOT NULL THEN
            UPDATE nfc_scan_log 
            SET 
                scan_status = 'processing_error',
                processing_duration_ms = processing_duration_ms,
                error_message = SQLERRM,
                error_code = SQLSTATE,
                backend_lock_acquired = TRUE,
                backend_lock_duration_ms = processing_duration_ms
            WHERE scan_log_id = nfc_scan_log_id_in;
        END IF;
        
        -- Mark idempotency key as failed and re-raise exception
        UPDATE idempotency_keys 
        SET status = 'failed', 
            response_payload = jsonb_build_object('error', SQLERRM),
            updated_at = NOW()
        WHERE request_id = client_request_id_in;
        
        -- Release the NFC operation lock
        PERFORM release_nfc_operation_lock(lock_id_acquired);
        
        RAISE;
    END;
END;
$$ LANGUAGE plpgsql;

-- Enhanced checkpoint recharge processing with NFC debouncing
CREATE OR REPLACE FUNCTION sp_process_checkpoint_recharge_with_debouncing(
    card_id_in TEXT,
    amount_in DECIMAL,
    payment_method_in TEXT,
    staff_id_in TEXT,
    client_request_id_in TEXT,
    checkpoint_id_in TEXT,
    nfc_scan_log_id_in BIGINT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    current_balance DECIMAL;
    new_balance DECIMAL;
    transaction_id_out UUID;
    result JSONB;
    lock_result JSONB;
    lock_id_acquired TEXT;
    processing_start_time TIMESTAMPTZ;
    processing_duration_ms INTEGER;
BEGIN
    processing_start_time := NOW();
    
    -- Step 1: Try to acquire NFC operation lock
    SELECT acquire_nfc_operation_lock(
        card_id_in,
        'checkpoint_recharge',
        client_request_id_in,
        'process-checkpoint-recharge',
        30 -- 30 second lock
    ) INTO lock_result;
    
    IF NOT (lock_result->>'success')::BOOLEAN THEN
        -- Lock acquisition failed - operation already in progress
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Operation already in progress for this card',
            'error_code', 'OPERATION_IN_PROGRESS',
            'details', lock_result
        );
    END IF;
    
    lock_id_acquired := lock_result->>'lock_id';
    
    -- Step 2: Check idempotency - return existing result if already processed
    IF EXISTS (SELECT 1 FROM idempotency_keys WHERE request_id = client_request_id_in) THEN
        SELECT response_payload INTO result
        FROM idempotency_keys
        WHERE request_id = client_request_id_in AND status = 'completed';
        
        IF result IS NOT NULL THEN
            -- Release the lock before returning
            PERFORM release_nfc_operation_lock(lock_id_acquired);
            RETURN result;
        END IF;
    END IF;

    -- Step 3: Insert idempotency key to mark processing start
    INSERT INTO idempotency_keys (
        request_id, source_function, status, card_id,
        operation_type, nfc_scan_log_id
    )
    VALUES (
        client_request_id_in, 'sp_process_checkpoint_recharge_with_debouncing', 'processing',
        card_id_in, 'checkpoint_recharge', nfc_scan_log_id_in
    )
    ON CONFLICT (request_id) DO NOTHING;

    -- Step 4: Start atomic transaction
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

        -- Calculate processing duration
        processing_duration_ms := EXTRACT(EPOCH FROM (NOW() - processing_start_time)) * 1000;

        -- Update NFC scan log if provided
        IF nfc_scan_log_id_in IS NOT NULL THEN
            UPDATE nfc_scan_log
            SET
                scan_status = 'success',
                processing_duration_ms = processing_duration_ms,
                client_request_id = client_request_id_in,
                backend_lock_acquired = TRUE,
                backend_lock_duration_ms = EXTRACT(EPOCH FROM (NOW() - processing_start_time)) * 1000
            WHERE scan_log_id = nfc_scan_log_id_in;
        END IF;

        -- Prepare success response
        result := jsonb_build_object(
            'success', true,
            'transaction_id', transaction_id_out,
            'previous_balance', current_balance,
            'new_balance', new_balance,
            'processing_duration_ms', processing_duration_ms
        );

        -- Mark idempotency key as completed
        UPDATE idempotency_keys
        SET status = 'completed', response_payload = result, updated_at = NOW()
        WHERE request_id = client_request_id_in;

        -- Release the NFC operation lock
        PERFORM release_nfc_operation_lock(lock_id_acquired);

        RETURN result;

    EXCEPTION WHEN OTHERS THEN
        -- Calculate processing duration for error case
        processing_duration_ms := EXTRACT(EPOCH FROM (NOW() - processing_start_time)) * 1000;
        
        -- Update NFC scan log with error if provided
        IF nfc_scan_log_id_in IS NOT NULL THEN
            UPDATE nfc_scan_log
            SET
                scan_status = 'processing_error',
                processing_duration_ms = processing_duration_ms,
                error_message = SQLERRM,
                error_code = SQLSTATE,
                backend_lock_acquired = TRUE,
                backend_lock_duration_ms = processing_duration_ms
            WHERE scan_log_id = nfc_scan_log_id_in;
        END IF;
        
        -- Mark idempotency key as failed and re-raise exception
        UPDATE idempotency_keys
        SET status = 'failed',
            response_payload = jsonb_build_object('error', SQLERRM),
            updated_at = NOW()
        WHERE request_id = client_request_id_in;
        
        -- Release the NFC operation lock
        PERFORM release_nfc_operation_lock(lock_id_acquired);
        
        RAISE;
    END;
END;
$$ LANGUAGE plpgsql;

-- Enhanced stripe recharge processing with NFC debouncing
CREATE OR REPLACE FUNCTION sp_process_stripe_recharge_with_debouncing(
    card_id_in TEXT,
    amount_in DECIMAL,
    stripe_session_id_in TEXT,
    stripe_metadata_in JSONB,
    nfc_scan_log_id_in BIGINT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    current_balance DECIMAL;
    new_balance DECIMAL;
    transaction_id_out UUID;
    result JSONB;
    lock_result JSONB;
    lock_id_acquired TEXT;
    processing_start_time TIMESTAMPTZ;
    processing_duration_ms INTEGER;
BEGIN
    processing_start_time := NOW();
    
    -- Step 1: Try to acquire NFC operation lock
    SELECT acquire_nfc_operation_lock(
        card_id_in,
        'stripe_recharge',
        stripe_session_id_in,
        'stripe-webhook',
        30 -- 30 second lock
    ) INTO lock_result;
    
    IF NOT (lock_result->>'success')::BOOLEAN THEN
        -- Lock acquisition failed - operation already in progress
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Operation already in progress for this card',
            'error_code', 'OPERATION_IN_PROGRESS',
            'details', lock_result
        );
    END IF;
    
    lock_id_acquired := lock_result->>'lock_id';
    
    -- Step 2: Check for duplicate Stripe session (idempotency at Stripe level)
    IF EXISTS (SELECT 1 FROM recharges WHERE stripe_session_id = stripe_session_id_in) THEN
        -- Release the lock before returning
        PERFORM release_nfc_operation_lock(lock_id_acquired);
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Duplicate Stripe session',
            'stripe_session_id', stripe_session_id_in
        );
    END IF;

    -- Step 3: Start atomic transaction
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

        -- Calculate processing duration
        processing_duration_ms := EXTRACT(EPOCH FROM (NOW() - processing_start_time)) * 1000;

        -- Update NFC scan log if provided
        IF nfc_scan_log_id_in IS NOT NULL THEN
            UPDATE nfc_scan_log
            SET
                scan_status = 'success',
                processing_duration_ms = processing_duration_ms,
                client_request_id = stripe_session_id_in,
                backend_lock_acquired = TRUE,
                backend_lock_duration_ms = EXTRACT(EPOCH FROM (NOW() - processing_start_time)) * 1000
            WHERE scan_log_id = nfc_scan_log_id_in;
        END IF;

        -- Prepare success response
        result := jsonb_build_object(
            'success', true,
            'transaction_id', transaction_id_out,
            'previous_balance', current_balance,
            'new_balance', new_balance,
            'stripe_session_id', stripe_session_id_in,
            'processing_duration_ms', processing_duration_ms
        );

        -- Release the NFC operation lock
        PERFORM release_nfc_operation_lock(lock_id_acquired);

        RETURN result;

    EXCEPTION WHEN OTHERS THEN
        -- Calculate processing duration for error case
        processing_duration_ms := EXTRACT(EPOCH FROM (NOW() - processing_start_time)) * 1000;
        
        -- Update NFC scan log with error if provided
        IF nfc_scan_log_id_in IS NOT NULL THEN
            UPDATE nfc_scan_log
            SET
                scan_status = 'processing_error',
                processing_duration_ms = processing_duration_ms,
                error_message = SQLERRM,
                error_code = SQLSTATE,
                backend_lock_acquired = TRUE,
                backend_lock_duration_ms = processing_duration_ms
            WHERE scan_log_id = nfc_scan_log_id_in;
        END IF;
        
        -- Release the NFC operation lock
        PERFORM release_nfc_operation_lock(lock_id_acquired);
        
        RAISE;
    END;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 7. CLEANUP FUNCTIONS
-- =====================================================

-- Enhanced cleanup function for expired locks and idempotency keys
CREATE OR REPLACE FUNCTION cleanup_expired_nfc_resources() RETURNS JSONB AS $$
DECLARE
    deleted_locks INTEGER;
    deleted_idempotency_keys INTEGER;
    deleted_scan_logs INTEGER;
BEGIN
    -- Clean up expired NFC operation locks
    DELETE FROM nfc_operation_locks WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_locks = ROW_COUNT;
    
    -- Clean up expired idempotency keys
    DELETE FROM idempotency_keys WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_idempotency_keys = ROW_COUNT;
    
    -- Clean up old NFC scan logs (older than 30 days)
    DELETE FROM nfc_scan_log WHERE scan_timestamp < NOW() - INTERVAL '30 days';
    GET DIAGNOSTICS deleted_scan_logs = ROW_COUNT;
    
    RETURN jsonb_build_object(
        'deleted_locks', deleted_locks,
        'deleted_idempotency_keys', deleted_idempotency_keys,
        'deleted_scan_logs', deleted_scan_logs,
        'cleanup_timestamp', NOW()
    );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 8. COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE nfc_scan_log IS 'Enhanced NFC scan logging with comprehensive tracking and error handling';
COMMENT ON TABLE nfc_operation_locks IS 'Short-lived locks to prevent concurrent NFC operations on the same card';

COMMENT ON FUNCTION acquire_nfc_operation_lock IS 'Acquires a short-lived lock for NFC operations to prevent race conditions';
COMMENT ON FUNCTION release_nfc_operation_lock IS 'Releases an NFC operation lock';
COMMENT ON FUNCTION check_nfc_operation_lock IS 'Checks if an NFC operation lock exists for a card and operation type';
COMMENT ON FUNCTION sp_process_bar_order_with_debouncing IS 'Enhanced bar order processing with NFC debouncing and comprehensive logging';
COMMENT ON FUNCTION cleanup_expired_nfc_resources IS 'Maintenance function to clean up expired NFC locks, idempotency keys, and old scan logs';

-- =====================================================
-- Migration completed successfully
-- =====================================================
COMMENT ON FUNCTION sp_process_checkpoint_recharge_with_debouncing IS 'Enhanced checkpoint recharge processing with NFC debouncing and comprehensive logging';
COMMENT ON FUNCTION sp_process_stripe_recharge_with_debouncing IS 'Enhanced Stripe recharge processing with NFC debouncing and comprehensive logging';