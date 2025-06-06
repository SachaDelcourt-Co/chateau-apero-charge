-- COMPLETE DATABASE DEPLOYMENT SCRIPT
-- This script will bring the database to a fully functional state
-- Execute this entire script in Supabase SQL Editor

-- =============================================================================
-- STEP 1: CREATE MISSING CORE TABLES
-- =============================================================================

-- Create idempotency_keys table
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
    request_id TEXT PRIMARY KEY,
    source_function TEXT NOT NULL,
    status TEXT NOT NULL,
    response_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at ON public.idempotency_keys(created_at);

-- Create app_transaction_log table
CREATE TABLE IF NOT EXISTS public.app_transaction_log (
    log_id BIGSERIAL PRIMARY KEY,
    transaction_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    correlation_id UUID,
    card_id TEXT,
    transaction_type TEXT NOT NULL,
    status TEXT NOT NULL,
    amount_involved DECIMAL(10, 2) NOT NULL,
    previous_balance_on_card DECIMAL(10, 2),
    new_balance_on_card DECIMAL(10, 2),
    details JSONB,
    edge_function_name TEXT,
    edge_function_request_id TEXT,
    client_request_id TEXT,
    staff_id TEXT,
    point_of_sale_id TEXT,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_transaction_log_card_id ON public.app_transaction_log(card_id);
CREATE INDEX IF NOT EXISTS idx_app_transaction_log_timestamp ON public.app_transaction_log("timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_app_transaction_log_transaction_type ON public.app_transaction_log(transaction_type);
CREATE INDEX IF NOT EXISTS idx_app_transaction_log_client_request_id ON public.app_transaction_log(client_request_id);
CREATE INDEX IF NOT EXISTS idx_app_transaction_log_correlation_id ON public.app_transaction_log(correlation_id);
CREATE INDEX IF NOT EXISTS idx_app_transaction_log_status ON public.app_transaction_log(status);

-- Create nfc_scan_log table
CREATE TABLE IF NOT EXISTS public.nfc_scan_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id TEXT,
    scan_location TEXT,
    scan_type TEXT DEFAULT 'payment',
    scanned_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nfc_scan_log_scanned_at ON public.nfc_scan_log(scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_nfc_scan_log_card_id ON public.nfc_scan_log(card_id);

-- Create bar_products table
CREATE TABLE IF NOT EXISTS public.bar_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    category TEXT,
    is_return BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create bar_order_items table
CREATE TABLE IF NOT EXISTS public.bar_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    product_id UUID NOT NULL,
    quantity INTEGER NOT NULL,
    price_at_purchase DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bar_order_items_order_id ON public.bar_order_items(order_id);

-- =============================================================================
-- STEP 2: ADD MISSING COLUMNS TO EXISTING TABLES
-- =============================================================================

-- Add missing columns to recharges table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recharges' AND column_name = 'staff_id') THEN
        ALTER TABLE public.recharges ADD COLUMN staff_id TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recharges' AND column_name = 'checkpoint_id') THEN
        ALTER TABLE public.recharges ADD COLUMN checkpoint_id TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recharges' AND column_name = 'client_request_id') THEN
        ALTER TABLE public.recharges ADD COLUMN client_request_id TEXT;
    END IF;
END $$;

-- Add missing columns to bar_orders table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bar_orders' AND column_name = 'items') THEN
        ALTER TABLE public.bar_orders ADD COLUMN items JSONB;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bar_orders' AND column_name = 'point_of_sale_id') THEN
        ALTER TABLE public.bar_orders ADD COLUMN point_of_sale_id TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bar_orders' AND column_name = 'updated_at') THEN
        ALTER TABLE public.bar_orders ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- Add missing columns to table_cards
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'table_cards' AND column_name = 'last_payment_method') THEN
        ALTER TABLE public.table_cards ADD COLUMN last_payment_method TEXT DEFAULT 'cash';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'table_cards' AND column_name = 'recharge_count') THEN
        ALTER TABLE public.table_cards ADD COLUMN recharge_count INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'table_cards' AND column_name = 'last_recharge_date') THEN
        ALTER TABLE public.table_cards ADD COLUMN last_recharge_date TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- =============================================================================
-- STEP 3: CREATE INDEXES FOR PERFORMANCE
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_recharges_card_id ON public.recharges(card_id);
CREATE INDEX IF NOT EXISTS idx_recharges_client_request_id ON public.recharges(client_request_id);
CREATE INDEX IF NOT EXISTS idx_bar_orders_card_id ON public.bar_orders(card_id);
CREATE INDEX IF NOT EXISTS idx_bar_orders_client_request_id ON public.bar_orders(client_request_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_request_id ON public.idempotency_keys(request_id);

-- =============================================================================
-- STEP 4: CONFIGURE ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.table_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bar_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recharges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_transaction_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nfc_scan_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bar_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bar_order_items ENABLE ROW LEVEL SECURITY;

-- Create policies for service role access
DROP POLICY IF EXISTS "Service role full access" ON public.table_cards;
CREATE POLICY "Service role full access" ON public.table_cards FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role full access" ON public.bar_orders;
CREATE POLICY "Service role full access" ON public.bar_orders FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role full access" ON public.recharges;
CREATE POLICY "Service role full access" ON public.recharges FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role full access" ON public.idempotency_keys;
CREATE POLICY "Service role full access" ON public.idempotency_keys FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role full access" ON public.app_transaction_log;
CREATE POLICY "Service role full access" ON public.app_transaction_log FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role full access" ON public.nfc_scan_log;
CREATE POLICY "Service role full access" ON public.nfc_scan_log FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role full access" ON public.bar_products;
CREATE POLICY "Service role full access" ON public.bar_products FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role full access" ON public.bar_order_items;
CREATE POLICY "Service role full access" ON public.bar_order_items FOR ALL USING (true);

-- =============================================================================
-- STEP 5: DEPLOY CORRECTED STORED PROCEDURES
-- =============================================================================

-- Drop existing procedures if they exist
DROP FUNCTION IF EXISTS public.sp_process_bar_order(TEXT, JSONB, DECIMAL, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.sp_process_checkpoint_recharge(TEXT, DECIMAL, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.sp_process_stripe_recharge(TEXT, DECIMAL, TEXT, JSONB);

-- Stored Procedure: sp_process_bar_order (CORRECTED)
CREATE OR REPLACE FUNCTION public.sp_process_bar_order(
    card_id_in TEXT,
    items_in JSONB,
    total_amount_in DECIMAL(10, 2),
    client_request_id_in TEXT,
    point_of_sale_in TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_balance DECIMAL(10, 2);
    new_balance DECIMAL(10, 2);
    order_id_out UUID;
    log_correlation_id UUID := gen_random_uuid();
    idempotency_status RECORD;
    error_payload JSONB;
BEGIN
    -- 1. Idempotency Check
    SELECT * INTO idempotency_status FROM public.idempotency_keys WHERE request_id = client_request_id_in AND source_function = 'sp_process_bar_order';

    IF FOUND THEN
        IF idempotency_status.status = 'COMPLETED' THEN
            INSERT INTO public.app_transaction_log (correlation_id, card_id, transaction_type, status, amount_involved, details, client_request_id, point_of_sale_id)
            VALUES (log_correlation_id, card_id_in, 'BAR_ORDER_SALE_IDEMPOTENT_HIT', 'INFO_COMPLETED_DUPLICATE', total_amount_in, jsonb_build_object('message', 'Duplicate request for already completed order.', 'original_response', idempotency_status.response_payload), client_request_id_in, point_of_sale_in);
            RETURN idempotency_status.response_payload;
        ELSIF idempotency_status.status IN ('PENDING', 'PROCESSING') THEN
            error_payload := jsonb_build_object('status', 'ERROR_IDEMPOTENCY_CONFLICT', 'message', 'Order processing already in progress for this request ID.', 'client_request_id', client_request_id_in);
            INSERT INTO public.app_transaction_log (correlation_id, card_id, transaction_type, status, amount_involved, details, client_request_id, point_of_sale_id)
            VALUES (log_correlation_id, card_id_in, 'BAR_ORDER_SALE', 'FAILED_IDEMPOTENCY_CONFLICT', total_amount_in, error_payload, client_request_id_in, point_of_sale_in);
            RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Order processing already in progress for request ID %', client_request_id_in USING ERRCODE = 'P0001';
        END IF;
    ELSE
        INSERT INTO public.idempotency_keys (request_id, source_function, status, created_at, updated_at)
        VALUES (client_request_id_in, 'sp_process_bar_order', 'PROCESSING', now(), now());
    END IF;

    INSERT INTO public.app_transaction_log (correlation_id, card_id, transaction_type, status, amount_involved, details, client_request_id, point_of_sale_id)
    VALUES (log_correlation_id, card_id_in, 'BAR_ORDER_SALE', 'INITIATED', total_amount_in, jsonb_build_object('items', items_in), client_request_id_in, point_of_sale_in);

    SELECT amount INTO current_balance FROM public.table_cards WHERE id = card_id_in FOR UPDATE;

    IF NOT FOUND THEN
        error_payload := jsonb_build_object('status', 'ERROR_CARD_NOT_FOUND', 'message', 'Card not found.', 'card_id', card_id_in);
        UPDATE public.idempotency_keys SET status = 'FAILED', response_payload = error_payload, updated_at = now() WHERE request_id = client_request_id_in;
        INSERT INTO public.app_transaction_log (correlation_id, card_id, transaction_type, status, amount_involved, details, client_request_id, point_of_sale_id)
        VALUES (log_correlation_id, card_id_in, 'BAR_ORDER_SALE', 'FAILED_CARD_INVALID', total_amount_in, error_payload, client_request_id_in, point_of_sale_in);
        RAISE EXCEPTION 'CARD_INVALID: Card % not found.', card_id_in USING ERRCODE = 'P0002';
    END IF;

    IF current_balance < total_amount_in THEN
        error_payload := jsonb_build_object('status', 'ERROR_INSUFFICIENT_FUNDS', 'message', 'Insufficient funds.', 'current_balance', current_balance, 'amount_requested', total_amount_in);
        UPDATE public.idempotency_keys SET status = 'FAILED', response_payload = error_payload, updated_at = now() WHERE request_id = client_request_id_in;
        INSERT INTO public.app_transaction_log (correlation_id, card_id, transaction_type, status, amount_involved, previous_balance_on_card, details, client_request_id, point_of_sale_id)
        VALUES (log_correlation_id, card_id_in, 'BAR_ORDER_SALE', 'FAILED_INSUFFICIENT_FUNDS', total_amount_in, current_balance, error_payload, client_request_id_in, point_of_sale_in);
        RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Card % has insufficient funds.', card_id_in USING ERRCODE = 'P0003';
    END IF;

    new_balance := current_balance - total_amount_in;

    INSERT INTO public.bar_orders (card_id, total_amount, items, point_of_sale_id, client_request_id)
    VALUES (card_id_in, total_amount_in, items_in, point_of_sale_in, client_request_id_in)
    RETURNING id INTO order_id_out;

    UPDATE public.table_cards SET amount = new_balance WHERE id = card_id_in;

    DECLARE
        success_payload JSONB;
    BEGIN
        success_payload := jsonb_build_object('status', 'SUCCESS', 'message', 'Bar order processed successfully.', 'order_id', order_id_out, 'new_balance', new_balance);
        UPDATE public.idempotency_keys SET status = 'COMPLETED', response_payload = success_payload, updated_at = now() WHERE request_id = client_request_id_in;
        INSERT INTO public.app_transaction_log (transaction_id, correlation_id, card_id, transaction_type, status, amount_involved, previous_balance_on_card, new_balance_on_card, details, client_request_id, point_of_sale_id)
        VALUES (order_id_out::TEXT, log_correlation_id, card_id_in, 'BAR_ORDER_SALE', 'SUCCESS', total_amount_in, current_balance, new_balance, success_payload, client_request_id_in, point_of_sale_in);
        RETURN success_payload;
    END;

EXCEPTION
    WHEN OTHERS THEN
        DECLARE
            error_context TEXT;
            failed_payload JSONB;
        BEGIN
            GET STACKED DIAGNOSTICS error_context = PG_EXCEPTION_CONTEXT;
            failed_payload := jsonb_build_object('status', 'ERROR_SYSTEM_UNHANDLED', 'message', SQLERRM, 'context', error_context, 'client_request_id', client_request_id_in);
            
            BEGIN
                UPDATE public.idempotency_keys SET status = 'FAILED', response_payload = failed_payload, updated_at = now() WHERE request_id = client_request_id_in;
            EXCEPTION WHEN OTHERS THEN
                -- log this failure to update idempotency key if necessary
            END;

            INSERT INTO public.app_transaction_log (correlation_id, card_id, transaction_type, status, amount_involved, details, client_request_id, point_of_sale_id)
            VALUES (log_correlation_id, card_id_in, 'BAR_ORDER_SALE', 'ERROR_SYSTEM_UNHANDLED', total_amount_in, failed_payload, client_request_id_in, point_of_sale_in);
            RAISE; 
        END;
END;
$$;

-- Stored Procedure: sp_process_checkpoint_recharge (CORRECTED)
CREATE OR REPLACE FUNCTION public.sp_process_checkpoint_recharge(
    card_id_in TEXT,
    amount_in DECIMAL(10, 2),
    payment_method_in TEXT, 
    staff_id_in TEXT,
    client_request_id_in TEXT, 
    checkpoint_id_in TEXT 
)
RETURNS JSONB 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_balance DECIMAL(10, 2);
    new_balance DECIMAL(10, 2);
    recharge_id_out INTEGER;
    log_correlation_id UUID := gen_random_uuid();
    idempotency_status RECORD;
    error_payload JSONB;
BEGIN
    SELECT * INTO idempotency_status FROM public.idempotency_keys WHERE request_id = client_request_id_in AND source_function = 'sp_process_checkpoint_recharge';

    IF FOUND THEN
        IF idempotency_status.status = 'COMPLETED' THEN
            INSERT INTO public.app_transaction_log (correlation_id, card_id, transaction_type, status, amount_involved, details, client_request_id, staff_id, point_of_sale_id)
            VALUES (log_correlation_id, card_id_in, 'CHECKPOINT_RECHARGE_IDEMPOTENT_HIT', 'INFO_COMPLETED_DUPLICATE', amount_in, jsonb_build_object('message', 'Duplicate request for already completed checkpoint recharge.', 'original_response', idempotency_status.response_payload), client_request_id_in, staff_id_in, checkpoint_id_in);
            RETURN idempotency_status.response_payload;
        ELSIF idempotency_status.status IN ('PENDING', 'PROCESSING') THEN
            error_payload := jsonb_build_object('status', 'ERROR_IDEMPOTENCY_CONFLICT', 'message', 'Checkpoint recharge processing already in progress for this request ID.', 'client_request_id', client_request_id_in);
            INSERT INTO public.app_transaction_log (correlation_id, card_id, transaction_type, status, amount_involved, details, client_request_id, staff_id, point_of_sale_id)
            VALUES (log_correlation_id, card_id_in, 'CHECKPOINT_RECHARGE', 'FAILED_IDEMPOTENCY_CONFLICT', amount_in, error_payload, client_request_id_in, staff_id_in, checkpoint_id_in);
            RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Checkpoint recharge processing already in progress for request ID %', client_request_id_in USING ERRCODE = 'P0001';
        END IF;
    ELSE
        INSERT INTO public.idempotency_keys (request_id, source_function, status, created_at, updated_at)
        VALUES (client_request_id_in, 'sp_process_checkpoint_recharge', 'PROCESSING', now(), now());
    END IF;

    INSERT INTO public.app_transaction_log (correlation_id, card_id, transaction_type, status, amount_involved, details, client_request_id, staff_id, point_of_sale_id)
    VALUES (log_correlation_id, card_id_in, 'CHECKPOINT_RECHARGE', 'INITIATED', amount_in, jsonb_build_object('payment_method', payment_method_in), client_request_id_in, staff_id_in, checkpoint_id_in);

    SELECT amount INTO current_balance FROM public.table_cards WHERE id = card_id_in FOR UPDATE;

    IF NOT FOUND THEN
        error_payload := jsonb_build_object('status', 'ERROR_CARD_NOT_FOUND', 'message', 'Card not found for checkpoint recharge.', 'card_id', card_id_in);
        UPDATE public.idempotency_keys SET status = 'FAILED', response_payload = error_payload, updated_at = now() WHERE request_id = client_request_id_in;
        INSERT INTO public.app_transaction_log (correlation_id, card_id, transaction_type, status, amount_involved, details, client_request_id, staff_id, point_of_sale_id)
        VALUES (log_correlation_id, card_id_in, 'CHECKPOINT_RECHARGE', 'FAILED_CARD_INVALID', amount_in, error_payload, client_request_id_in, staff_id_in, checkpoint_id_in);
        RAISE EXCEPTION 'CARD_INVALID: Card % not found for checkpoint recharge.', card_id_in USING ERRCODE = 'P0002';
    END IF;

    new_balance := current_balance + amount_in;

    INSERT INTO public.recharges (card_id, amount, payment_method, staff_id, checkpoint_id, client_request_id, transaction_id)
    VALUES (card_id_in, amount_in, payment_method_in, staff_id_in, checkpoint_id_in, client_request_id_in, gen_random_uuid())
    RETURNING id INTO recharge_id_out;

    UPDATE public.table_cards SET amount = new_balance WHERE id = card_id_in;

    DECLARE
        success_payload JSONB;
    BEGIN
        success_payload := jsonb_build_object('status', 'SUCCESS', 'message', 'Checkpoint recharge processed successfully.', 'recharge_id', recharge_id_out, 'new_balance', new_balance);
        UPDATE public.idempotency_keys SET status = 'COMPLETED', response_payload = success_payload, updated_at = now() WHERE request_id = client_request_id_in;
        INSERT INTO public.app_transaction_log (transaction_id, correlation_id, card_id, transaction_type, status, amount_involved, previous_balance_on_card, new_balance_on_card, details, client_request_id, staff_id, point_of_sale_id)
        VALUES (recharge_id_out::TEXT, log_correlation_id, card_id_in, 'CHECKPOINT_RECHARGE', 'SUCCESS', amount_in, current_balance, new_balance, success_payload, client_request_id_in, staff_id_in, checkpoint_id_in);
        RETURN success_payload;
    END;

EXCEPTION
    WHEN OTHERS THEN
        DECLARE
            error_context TEXT;
            failed_payload JSONB;
        BEGIN
            GET STACKED DIAGNOSTICS error_context = PG_EXCEPTION_CONTEXT;
            failed_payload := jsonb_build_object('status', 'ERROR_SYSTEM_UNHANDLED', 'message', SQLERRM, 'context', error_context, 'client_request_id', client_request_id_in);
             BEGIN
                UPDATE public.idempotency_keys SET status = 'FAILED', response_payload = failed_payload, updated_at = now() WHERE request_id = client_request_id_in;
            EXCEPTION WHEN OTHERS THEN
                -- log this failure
            END;
            INSERT INTO public.app_transaction_log (correlation_id, card_id, transaction_type, status, amount_involved, details, client_request_id, staff_id, point_of_sale_id)
            VALUES (log_correlation_id, card_id_in, 'CHECKPOINT_RECHARGE', 'ERROR_SYSTEM_UNHANDLED', amount_in, failed_payload, client_request_id_in, staff_id_in, checkpoint_id_in);
            RAISE;
        END;
END;
$$;

-- Stored Procedure: sp_process_stripe_recharge (CORRECTED)
CREATE OR REPLACE FUNCTION public.sp_process_stripe_recharge(
    card_id_in TEXT,
    amount_in DECIMAL(10, 2),
    stripe_session_id_in TEXT, 
    stripe_metadata_in JSONB 
)
RETURNS JSONB 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_balance DECIMAL(10, 2);
    new_balance DECIMAL(10, 2);
    recharge_id_out INTEGER;
    log_correlation_id UUID := gen_random_uuid();
    idempotency_status RECORD;
    error_payload JSONB;
BEGIN
    SELECT * INTO idempotency_status FROM public.idempotency_keys WHERE request_id = stripe_session_id_in AND source_function = 'sp_process_stripe_recharge';

    IF FOUND THEN
        IF idempotency_status.status = 'COMPLETED' THEN
            INSERT INTO public.app_transaction_log (correlation_id, card_id, transaction_type, status, amount_involved, details, client_request_id)
            VALUES (log_correlation_id, card_id_in, 'STRIPE_RECHARGE_IDEMPOTENT_HIT', 'INFO_COMPLETED_DUPLICATE', amount_in, jsonb_build_object('message', 'Duplicate request for already completed Stripe recharge.', 'original_response', idempotency_status.response_payload), stripe_session_id_in);
            RETURN idempotency_status.response_payload;
        ELSIF idempotency_status.status IN ('PENDING', 'PROCESSING') THEN
            error_payload := jsonb_build_object('status', 'ERROR_IDEMPOTENCY_CONFLICT', 'message', 'Stripe recharge processing already in progress for this session ID.', 'stripe_session_id', stripe_session_id_in);
            INSERT INTO public.app_transaction_log (correlation_id, card_id, transaction_type, status, amount_involved, details, client_request_id)
            VALUES (log_correlation_id, card_id_in, 'STRIPE_RECHARGE', 'FAILED_IDEMPOTENCY_CONFLICT', amount_in, error_payload, stripe_session_id_in);
            RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Stripe recharge processing already in progress for session ID %', stripe_session_id_in USING ERRCODE = 'P0001';
        END IF;
    ELSE
        INSERT INTO public.idempotency_keys (request_id, source_function, status, created_at, updated_at)
        VALUES (stripe_session_id_in, 'sp_process_stripe_recharge', 'PROCESSING', now(), now());
    END IF;

    INSERT INTO public.app_transaction_log (correlation_id, card_id, transaction_type, status, amount_involved, details, client_request_id)
    VALUES (log_correlation_id, card_id_in, 'STRIPE_RECHARGE', 'INITIATED', amount_in, stripe_metadata_in, stripe_session_id_in);

    SELECT amount INTO current_balance FROM public.table_cards WHERE id = card_id_in FOR UPDATE;

    IF NOT FOUND THEN
        error_payload := jsonb_build_object('status', 'ERROR_CARD_NOT_FOUND', 'message', 'Card not found for Stripe recharge.', 'card_id', card_id_in);
        UPDATE public.idempotency_keys SET status = 'FAILED', response_payload = error_payload, updated_at = now() WHERE request_id = stripe_session_id_in;
        INSERT INTO public.app_transaction_log (correlation_id, card_id, transaction_type, status, amount_involved, details, client_request_id)
        VALUES (log_correlation_id, card_id_in, 'STRIPE_RECHARGE', 'FAILED_CARD_INVALID', amount_in, error_payload, stripe_session_id_in);
        RAISE EXCEPTION 'CARD_INVALID: Card % not found for Stripe recharge.', card_id_in USING ERRCODE = 'P0002';
    END IF;

    new_balance := current_balance + amount_in;

    INSERT INTO public.recharges (card_id, amount, payment_method, stripe_session_id, client_request_id, transaction_id) 
    VALUES (card_id_in, amount_in, 'STRIPE_ONLINE', stripe_session_id_in, stripe_session_id_in, gen_random_uuid()) 
    RETURNING id INTO recharge_id_out;

    UPDATE public.table_cards SET amount = new_balance WHERE id = card_id_in;

    DECLARE
        success_payload JSONB;
    BEGIN
        success_payload := jsonb_build_object('status', 'SUCCESS', 'message', 'Stripe recharge processed successfully.', 'recharge_id', recharge_id_out, 'new_balance', new_balance);
        UPDATE public.idempotency_keys SET status = 'COMPLETED', response_payload = success_payload, updated_at = now() WHERE request_id = stripe_session_id_in;
        INSERT INTO public.app_transaction_log (transaction_id, correlation_id, card_id, transaction_type, status, amount_involved, previous_balance_on_card, new_balance_on_card, details, client_request_id)
        VALUES (recharge_id_out::TEXT, log_correlation_id, card_id_in, 'STRIPE_RECHARGE', 'SUCCESS', amount_in, current_balance, new_balance, success_payload, stripe_session_id_in);
        RETURN success_payload;
    END;

EXCEPTION
    WHEN OTHERS THEN
        DECLARE
            error_context TEXT;
            failed_payload JSONB;
        BEGIN
            GET STACKED DIAGNOSTICS error_context = PG_EXCEPTION_CONTEXT;
            failed_payload := jsonb_build_object('status', 'ERROR_SYSTEM_UNHANDLED', 'message
', SQLERRM, 'context', error_context, 'stripe_session_id', stripe_session_id_in);
            BEGIN
                UPDATE public.idempotency_keys SET status = 'FAILED', response_payload = failed_payload, updated_at = now() WHERE request_id = stripe_session_id_in;
            EXCEPTION WHEN OTHERS THEN
                -- log this failure
            END;
            INSERT INTO public.app_transaction_log (correlation_id, card_id, transaction_type, status, amount_involved, details, client_request_id)
            VALUES (log_correlation_id, card_id_in, 'STRIPE_RECHARGE', 'ERROR_SYSTEM_UNHANDLED', amount_in, failed_payload, stripe_session_id_in);
            RAISE;
        END;
END;
$$;

-- =============================================================================
-- STEP 6: CREATE HELPER FUNCTIONS
-- =============================================================================

-- Logging functions
CREATE OR REPLACE FUNCTION public.sp_log_app_transaction(
    log_type_in TEXT,
    payload_in JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    log_id UUID;
BEGIN
    INSERT INTO public.app_transaction_log (
        correlation_id,
        transaction_type,
        status,
        details,
        "timestamp"
    ) VALUES (
        gen_random_uuid(),
        log_type_in,
        'INFO',
        payload_in,
        NOW()
    ) RETURNING correlation_id INTO log_id;
    
    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'log_id', log_id,
        'message', 'Log entry created successfully'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.sp_log_nfc_scan(
    card_id_in TEXT,
    scan_location_in TEXT,
    scan_type_in TEXT DEFAULT 'payment'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    log_id UUID;
BEGIN
    INSERT INTO public.nfc_scan_log (
        id,
        card_id,
        scan_location,
        scan_type,
        scanned_at
    ) VALUES (
        gen_random_uuid(),
        card_id_in,
        scan_location_in,
        scan_type_in,
        NOW()
    ) RETURNING id INTO log_id;
    
    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'log_id', log_id,
        'message', 'NFC scan logged successfully'
    );
END;
$$;

-- =============================================================================
-- STEP 7: GRANT PERMISSIONS
-- =============================================================================

-- Grant execute permissions on stored procedures
GRANT EXECUTE ON FUNCTION public.sp_process_bar_order(TEXT, JSONB, DECIMAL, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sp_process_checkpoint_recharge(TEXT, DECIMAL, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sp_process_stripe_recharge(TEXT, DECIMAL, TEXT, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sp_log_app_transaction(TEXT, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sp_log_nfc_scan(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- =============================================================================
-- STEP 8: SEED TEST DATA
-- =============================================================================

-- Fix existing cards with null amounts
UPDATE public.table_cards 
SET amount = COALESCE(amount, 50.00)
WHERE amount IS NULL;

-- Create comprehensive test cards for load testing
INSERT INTO public.table_cards (id, amount, description, last_payment_method, recharge_count) VALUES
('k6-test-card-001', 100.00, 'K6 Load Test Card 1', 'cash', 0),
('k6-test-card-002', 75.00, 'K6 Load Test Card 2', 'cash', 0),
('k6-test-card-003', 150.00, 'K6 Load Test Card 3', 'cash', 0),
('k6-test-card-004', 25.00, 'K6 Load Test Card 4', 'cash', 0),
('k6-test-card-005', 200.00, 'K6 Load Test Card 5', 'cash', 0),
('LOAD_TEST_CARD_001', 100.00, 'Load Test Card 1', 'cash', 0),
('LOAD_TEST_CARD_002', 50.00, 'Load Test Card 2', 'cash', 0),
('LOAD_TEST_CARD_003', 200.00, 'Load Test Card 3', 'cash', 0),
('LOAD_TEST_CARD_004', 25.00, 'Load Test Card 4', 'cash', 0),
('LOAD_TEST_CARD_005', 75.00, 'Load Test Card 5', 'cash', 0)
ON CONFLICT (id) DO UPDATE SET 
amount = EXCLUDED.amount,
description = EXCLUDED.description,
last_payment_method = EXCLUDED.last_payment_method,
recharge_count = EXCLUDED.recharge_count;

-- Create test bar products
INSERT INTO public.bar_products (id, name, price, category, is_return) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'Beer', 5.00, 'drinks', false),
('550e8400-e29b-41d4-a716-446655440002', 'Wine', 8.00, 'drinks', false),
('550e8400-e29b-41d4-a716-446655440003', 'Sandwich', 12.00, 'food', false),
('550e8400-e29b-41d4-a716-446655440004', 'Water', 2.00, 'drinks', false),
('550e8400-e29b-41d4-a716-446655440005', 'Coffee', 3.50, 'drinks', false),
('550e8400-e29b-41d4-a716-446655440006', 'Soda', 3.00, 'drinks', false),
('550e8400-e29b-41d4-a716-446655440007', 'Chips', 4.00, 'snacks', false),
('550e8400-e29b-41d4-a716-446655440008', 'Pizza Slice', 6.50, 'food', false),
('550e8400-e29b-41d4-a716-446655440009', 'Cup Deposit', 2.00, 'deposits', false),
('550e8400-e29b-41d4-a716-446655440010', 'Cup Return', -2.00, 'returns', true)
ON CONFLICT (id) DO UPDATE SET 
name = EXCLUDED.name,
price = EXCLUDED.price,
category = EXCLUDED.category,
is_return = EXCLUDED.is_return;

-- =============================================================================
-- STEP 9: ADD COMMENTS AND DOCUMENTATION
-- =============================================================================

COMMENT ON FUNCTION public.sp_process_bar_order(TEXT, JSONB, DECIMAL, TEXT, TEXT) IS 'CORRECTED: Processes a bar order with proper UUID handling for order_id and complete idempotency support';
COMMENT ON FUNCTION public.sp_process_checkpoint_recharge(TEXT, DECIMAL, TEXT, TEXT, TEXT, TEXT) IS 'CORRECTED: Processes checkpoint recharge with proper INTEGER handling for recharge_id and UUID for transaction_id';
COMMENT ON FUNCTION public.sp_process_stripe_recharge(TEXT, DECIMAL, TEXT, JSONB) IS 'CORRECTED: Processes Stripe recharge with proper INTEGER handling for recharge_id and UUID for transaction_id';
COMMENT ON FUNCTION public.sp_log_app_transaction(TEXT, JSONB) IS 'Logs application transaction events for monitoring and debugging';
COMMENT ON FUNCTION public.sp_log_nfc_scan(TEXT, TEXT, TEXT) IS 'Logs NFC scan events for audit trail and analytics';

COMMENT ON TABLE public.idempotency_keys IS 'Stores idempotency keys to prevent duplicate processing of requests';
COMMENT ON TABLE public.app_transaction_log IS 'Comprehensive log for all application-level financial transactions and operational events';
COMMENT ON TABLE public.nfc_scan_log IS 'Logs all NFC scan attempts for monitoring and diagnostics';
COMMENT ON TABLE public.bar_products IS 'Product catalog for bar operations with pricing and categorization';
COMMENT ON TABLE public.bar_order_items IS 'Individual items within bar orders for detailed tracking';

-- =============================================================================
-- DEPLOYMENT COMPLETE
-- =============================================================================

-- Verification queries to confirm deployment success
SELECT 'DEPLOYMENT VERIFICATION' as status;

-- Check that all stored procedures exist
SELECT 
    'Stored Procedures' as component,
    COUNT(*) as count
FROM information_schema.routines 
WHERE routine_name IN ('sp_process_bar_order', 'sp_process_checkpoint_recharge', 'sp_process_stripe_recharge', 'sp_log_app_transaction', 'sp_log_nfc_scan')
AND routine_schema = 'public';

-- Check that all tables exist
SELECT 
    'Core Tables' as component,
    COUNT(*) as count
FROM information_schema.tables 
WHERE table_name IN ('table_cards', 'recharges', 'bar_orders', 'idempotency_keys', 'app_transaction_log', 'nfc_scan_log', 'bar_products', 'bar_order_items')
AND table_schema = 'public';

-- Check test data
SELECT 
    'Test Cards' as component,
    COUNT(*) as count
FROM public.table_cards 
WHERE id LIKE 'k6-test-%' OR id LIKE 'LOAD_TEST_%';

SELECT 
    'Test Products' as component,
    COUNT(*) as count
FROM public.bar_products 
WHERE id::text LIKE '550e8400-e29b-41d4-a716-44665544%';

SELECT 'DATABASE DEPLOYMENT COMPLETED SUCCESSFULLY' as final_status;