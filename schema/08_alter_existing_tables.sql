-- schema/08_alter_existing_tables.sql
-- Migration for Phase 2.5: Modify existing tables (recharges and bar_orders)

-- Modifications to recharges Table
ALTER TABLE public.recharges
ADD COLUMN IF NOT EXISTS staff_id TEXT,
ADD COLUMN IF NOT EXISTS checkpoint_id TEXT, -- Could be a foreign key to a 'checkpoints' table if it exists
ADD COLUMN IF NOT EXISTS client_request_id TEXT;

-- Add UNIQUE constraint to client_request_id for recharges.
-- This allows multiple NULLs but ensures non-NULL values are unique.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.recharges'::regclass
        AND conname = 'uq_recharges_client_request_id'
        AND contype = 'u'
    ) THEN
        ALTER TABLE public.recharges ADD CONSTRAINT uq_recharges_client_request_id UNIQUE (client_request_id);
    END IF;
END;
$$;

-- Ensure stripe_session_id has a UNIQUE constraint.
-- This assumes stripe_session_id is already a column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.recharges'::regclass
        AND conname = 'uq_recharges_stripe_session_id'
        AND contype = 'u'
    ) THEN
        ALTER TABLE public.recharges ADD CONSTRAINT uq_recharges_stripe_session_id UNIQUE (stripe_session_id);
    END IF;
END;
$$;

COMMENT ON COLUMN public.recharges.staff_id IS 'Identifier of the staff member who processed a manual/checkpoint recharge. Null for Stripe recharges.';
COMMENT ON COLUMN public.recharges.checkpoint_id IS 'Identifier of the physical checkpoint or POS where a manual recharge was performed. Null for Stripe recharges.';
COMMENT ON COLUMN public.recharges.client_request_id IS 'Client-generated unique request ID for this recharge operation, used for idempotency, particularly for checkpoint recharges.';

-- Modifications to bar_orders Table
ALTER TABLE public.bar_orders
ADD COLUMN IF NOT EXISTS client_request_id TEXT;

-- Add UNIQUE constraint to client_request_id for bar_orders.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.bar_orders'::regclass
        AND conname = 'uq_bar_orders_client_request_id'
        AND contype = 'u'
    ) THEN
        ALTER TABLE public.bar_orders ADD CONSTRAINT uq_bar_orders_client_request_id UNIQUE (client_request_id);
    END IF;
END;
$$;

COMMENT ON COLUMN public.bar_orders.client_request_id IS 'Client-generated unique request ID for this bar order, used for idempotency.';

-- Consider adding foreign key constraints if staff_id refers to a staff table or checkpoint_id to a checkpoints table.
-- Example:
-- ALTER TABLE public.recharges ADD CONSTRAINT fk_recharges_staff_id FOREIGN KEY (staff_id) REFERENCES public.staff_users(staff_internal_id);
-- ALTER TABLE public.recharges ADD CONSTRAINT fk_recharges_checkpoint_id FOREIGN KEY (checkpoint_id) REFERENCES public.festival_checkpoints(checkpoint_code);