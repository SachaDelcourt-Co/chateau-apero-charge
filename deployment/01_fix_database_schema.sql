-- deployment/01_fix_database_schema.sql
-- Fix database schema mismatches and prepare for load testing

-- Ensure proper data types and constraints
DO $$
BEGIN
    -- Fix recharges table transaction_id column if it exists and is wrong type
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'recharges' 
        AND column_name = 'transaction_id' 
        AND data_type != 'uuid'
    ) THEN
        ALTER TABLE public.recharges 
        ALTER COLUMN transaction_id TYPE UUID USING 
        CASE 
            WHEN transaction_id IS NULL THEN NULL
            WHEN transaction_id ~ '^[0-9]+$' THEN gen_random_uuid()
            ELSE transaction_id::UUID
        END;
    END IF;
END $$;

-- Ensure proper indexes exist for performance
CREATE INDEX IF NOT EXISTS idx_recharges_card_id ON public.recharges(card_id);
CREATE INDEX IF NOT EXISTS idx_recharges_client_request_id ON public.recharges(client_request_id);
CREATE INDEX IF NOT EXISTS idx_bar_orders_card_id ON public.bar_orders(card_id);
CREATE INDEX IF NOT EXISTS idx_bar_orders_client_request_id ON public.bar_orders(client_request_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_request_id ON public.idempotency_keys(request_id);
CREATE INDEX IF NOT EXISTS idx_app_transaction_log_card_id ON public.app_transaction_log(card_id);
CREATE INDEX IF NOT EXISTS idx_app_transaction_log_client_request_id ON public.app_transaction_log(client_request_id);

-- Ensure RLS is properly configured for load testing
ALTER TABLE public.table_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bar_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recharges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_transaction_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nfc_scan_log ENABLE ROW LEVEL SECURITY;

-- Create policies for service role access (needed for load testing)
DROP POLICY IF EXISTS "Service role full access" ON public.table_cards;
CREATE POLICY "Service role full access" ON public.table_cards
FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role full access" ON public.bar_orders;
CREATE POLICY "Service role full access" ON public.bar_orders
FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role full access" ON public.recharges;
CREATE POLICY "Service role full access" ON public.recharges
FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role full access" ON public.idempotency_keys;
CREATE POLICY "Service role full access" ON public.idempotency_keys
FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role full access" ON public.app_transaction_log;
CREATE POLICY "Service role full access" ON public.app_transaction_log
FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role full access" ON public.nfc_scan_log;
CREATE POLICY "Service role full access" ON public.nfc_scan_log
FOR ALL USING (true);

-- Ensure bar_products table has proper structure
CREATE TABLE IF NOT EXISTS public.bar_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    category TEXT,
    is_return BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add any missing columns to existing tables
DO $$
BEGIN
    -- Add missing columns to table_cards if they don't exist
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

-- Create or update functions for logging
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
        created_at
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

-- Grant execute permissions on logging functions
GRANT EXECUTE ON FUNCTION public.sp_log_app_transaction(TEXT, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sp_log_nfc_scan(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.sp_log_app_transaction(TEXT, JSONB) IS 'Logs application transaction events for monitoring and debugging';
COMMENT ON FUNCTION public.sp_log_nfc_scan(TEXT, TEXT, TEXT) IS 'Logs NFC scan events for audit trail and analytics';
