-- schema/09_create_stored_procedures.sql
-- Migration for Phase 2.5: Create stored procedures for atomic operations

-- Stored Procedure: sp_process_bar_order
-- This is a placeholder structure. The internal logic for idempotency,
-- balance checks, updates, and logging will be complex and needs careful implementation.
CREATE OR REPLACE FUNCTION public.sp_process_bar_order(
    card_id_in TEXT,
    items_in JSONB, -- Expected format: [{"product_id": "uuid", "quantity": 2, "price_at_purchase": 10.50}, ...]
    total_amount_in DECIMAL(10, 2),
    client_request_id_in TEXT,
    point_of_sale_in TEXT -- Changed from INT to TEXT for flexibility (e.g. "BAR_MAIN_TILL_01")
)
RETURNS JSONB -- Returns a status and message, or the order details
LANGUAGE plpgsql
SECURITY DEFINER -- Important for Supabase to allow table access
AS $$
DECLARE
    current_balance DECIMAL(10, 2);
    new_balance DECIMAL(10, 2);
    order_id_out INTEGER;
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
            RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Order processing already in progress for request ID %', client_request_id_in USING ERRCODE = 'P0001'; -- Custom error code
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

    INSERT INTO public.bar_orders (card_id, total_amount, point_of_sale_id, client_request_id)
    VALUES (card_id_in, total_amount_in, point_of_sale_in, client_request_id_in)
    RETURNING id INTO order_id_out;

    DECLARE
        item JSONB;
    BEGIN
        FOR item IN SELECT * FROM jsonb_array_elements(items_in)
        LOOP
            INSERT INTO public.bar_order_items (order_id, product_id, quantity, price_at_purchase)
            VALUES (order_id_out, (item->>'product_id')::UUID, (item->>'quantity')::INT, (item->>'price_at_purchase')::DECIMAL);
        END LOOP;
    END;

    UPDATE public.table_cards SET amount = new_balance WHERE id = card_id_in;

    DECLARE
        success_payload JSONB;
    BEGIN
        success_payload := jsonb_build_object('status', 'SUCCESS', 'message', 'Bar order processed successfully.', 'order_id', order_id_out, 'new_balance', new_balance);
        UPDATE public.idempotency_keys SET status = 'COMPLETED', response_payload = success_payload, updated_at = now() WHERE request_id = client_request_id_in;
        INSERT INTO public.app_transaction_log (transaction_id, correlation_id, card_id, transaction_type, status, amount_involved, previous_balance_on_card, new_balance_on_card, details, client_request_id, point_of_sale_id)
        VALUES (order_id_out, log_correlation_id, card_id_in, 'BAR_ORDER_SALE', 'SUCCESS', total_amount_in, current_balance, new_balance, success_payload, client_request_id_in, point_of_sale_in);
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
                -- log this failure to update idempotency key if necessary, or handle
            END;

            INSERT INTO public.app_transaction_log (correlation_id, card_id, transaction_type, status, amount_involved, details, client_request_id, point_of_sale_id)
            VALUES (log_correlation_id, card_id_in, 'BAR_ORDER_SALE', 'ERROR_SYSTEM_UNHANDLED', total_amount_in, failed_payload, client_request_id_in, point_of_sale_in);
            RAISE; 
            RETURN failed_payload; 
        END;
END;
$$;

COMMENT ON FUNCTION public.sp_process_bar_order(TEXT, JSONB, DECIMAL, TEXT, TEXT) IS 'Processes a bar order: checks idempotency, validates card, checks balance, records order and items, updates card balance, and logs transaction. Returns order details or error. items_in JSONB format: [{"product_id": "uuid", "quantity": 2, "price_at_purchase": 10.50}, ...]';

-- Stored Procedure: sp_process_stripe_recharge
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

    INSERT INTO public.recharges (card_id, amount, payment_method, stripe_session_id, metadata, client_request_id) 
    VALUES (card_id_in, amount_in, 'STRIPE_ONLINE', stripe_session_id_in, stripe_metadata_in, stripe_session_id_in) 
    RETURNING id INTO recharge_id_out;

    UPDATE public.table_cards SET amount = new_balance WHERE id = card_id_in;

    DECLARE
        success_payload JSONB;
    BEGIN
        success_payload := jsonb_build_object('status', 'SUCCESS', 'message', 'Stripe recharge processed successfully.', 'recharge_id', recharge_id_out, 'new_balance', new_balance);
        UPDATE public.idempotency_keys SET status = 'COMPLETED', response_payload = success_payload, updated_at = now() WHERE request_id = stripe_session_id_in;
        INSERT INTO public.app_transaction_log (transaction_id, correlation_id, card_id, transaction_type, status, amount_involved, previous_balance_on_card, new_balance_on_card, details, client_request_id)
        VALUES (recharge_id_out, log_correlation_id, card_id_in, 'STRIPE_RECHARGE', 'SUCCESS', amount_in, current_balance, new_balance, success_payload, stripe_session_id_in);
        RETURN success_payload;
    END;

EXCEPTION
    WHEN OTHERS THEN
        DECLARE
            error_context TEXT;
            failed_payload JSONB;
        BEGIN
            GET STACKED DIAGNOSTICS error_context = PG_EXCEPTION_CONTEXT;
            failed_payload := jsonb_build_object('status', 'ERROR_SYSTEM_UNHANDLED', 'message', SQLERRM, 'context', error_context, 'stripe_session_id', stripe_session_id_in);
            BEGIN
                UPDATE public.idempotency_keys SET status = 'FAILED', response_payload = failed_payload, updated_at = now() WHERE request_id = stripe_session_id_in;
            EXCEPTION WHEN OTHERS THEN
                -- log this failure
            END;
            INSERT INTO public.app_transaction_log (correlation_id, card_id, transaction_type, status, amount_involved, details, client_request_id)
            VALUES (log_correlation_id, card_id_in, 'STRIPE_RECHARGE', 'ERROR_SYSTEM_UNHANDLED', amount_in, failed_payload, stripe_session_id_in);
            RAISE;
            RETURN failed_payload;
        END;
END;
$$;

COMMENT ON FUNCTION public.sp_process_stripe_recharge(TEXT, DECIMAL, TEXT, JSONB) IS 'Processes a Stripe recharge: checks idempotency using stripe_session_id, validates card, records recharge, updates card balance, and logs. Returns recharge details or error.';

-- Stored Procedure: sp_process_checkpoint_recharge
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

    INSERT INTO public.recharges (card_id, amount, payment_method, staff_id, checkpoint_id, client_request_id)
    VALUES (card_id_in, amount_in, payment_method_in, staff_id_in, checkpoint_id_in, client_request_id_in)
    RETURNING id INTO recharge_id_out;

    UPDATE public.table_cards SET amount = new_balance WHERE id = card_id_in;

    DECLARE
        success_payload JSONB;
    BEGIN
        success_payload := jsonb_build_object('status', 'SUCCESS', 'message', 'Checkpoint recharge processed successfully.', 'recharge_id', recharge_id_out, 'new_balance', new_balance);
        UPDATE public.idempotency_keys SET status = 'COMPLETED', response_payload = success_payload, updated_at = now() WHERE request_id = client_request_id_in;
        INSERT INTO public.app_transaction_log (transaction_id, correlation_id, card_id, transaction_type, status, amount_involved, previous_balance_on_card, new_balance_on_card, details, client_request_id, staff_id, point_of_sale_id)
        VALUES (recharge_id_out, log_correlation_id, card_id_in, 'CHECKPOINT_RECHARGE', 'SUCCESS', amount_in, current_balance, new_balance, success_payload, client_request_id_in, staff_id_in, checkpoint_id_in);
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
            RETURN failed_payload;
        END;
END;
$$;

COMMENT ON FUNCTION public.sp_process_checkpoint_recharge(TEXT, DECIMAL, TEXT, TEXT, TEXT, TEXT) IS 'Processes a staff-assisted checkpoint recharge: checks idempotency, validates card, records recharge, updates card balance, and logs. Returns recharge details or error.';