-- Migration: Add stored procedure for standard recharge processing
-- This procedure provides atomic operations for standard (non-checkpoint) recharges
-- Similar to checkpoint recharges but without staff requirements

CREATE OR REPLACE FUNCTION sp_process_standard_recharge(
    card_id_in TEXT,
    amount_in NUMERIC,
    payment_method_in TEXT,
    client_request_id_in TEXT
) RETURNS JSONB AS $$
DECLARE
    current_balance NUMERIC := 0;
    new_balance NUMERIC := 0;
    transaction_id_out INTEGER;
    result JSONB;
BEGIN
    -- Validate payment method
    IF payment_method_in NOT IN ('cash', 'card') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid payment method. Must be "cash" or "card".'
        );
    END IF;

    -- Check for duplicate client_request_id
    IF EXISTS (SELECT 1 FROM idempotency_keys WHERE request_id = client_request_id_in) THEN
        -- Return existing result if already processed
        SELECT response_payload INTO result 
        FROM idempotency_keys 
        WHERE request_id = client_request_id_in AND status = 'completed';
        
        IF result IS NOT NULL THEN
            RETURN result;
        ELSE
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Request is being processed or has failed. Please try again with a new request ID.'
            );
        END IF;
    END IF;

    -- Insert idempotency key
    INSERT INTO idempotency_keys (request_id, source_function, status, created_at)
    VALUES (client_request_id_in, 'process-standard-recharge', 'processing', NOW());

    -- Start atomic transaction
    BEGIN
        -- Get and lock card for update (prevents race conditions)
        SELECT amount INTO current_balance 
        FROM table_cards 
        WHERE id = card_id_in 
        FOR UPDATE;

        -- Validate card exists
        IF NOT FOUND THEN
            -- Update idempotency key status
            UPDATE idempotency_keys 
            SET status = 'failed', updated_at = NOW()
            WHERE request_id = client_request_id_in;
            
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Card not found'
            );
        END IF;

        -- Calculate new balance
        new_balance := current_balance + amount_in;

        -- Create recharge record
        INSERT INTO recharges (
            id_card, amount, paid_by_card, 
            client_request_id, created_at
        ) VALUES (
            card_id_in, amount_in, (payment_method_in = 'card'), 
            client_request_id_in, NOW()
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
            card_id_in, 'standard_recharge', 'completed', amount_in,
            current_balance, new_balance, 
            jsonb_build_object('payment_method', payment_method_in),
            'process-standard-recharge', client_request_id_in
        ) RETURNING transaction_id INTO transaction_id_out;

        -- Prepare success response
        result := jsonb_build_object(
            'success', true,
            'transaction_id', transaction_id_out,
            'previous_balance', current_balance,
            'new_balance', new_balance,
            'recharge_amount', amount_in,
            'payment_method', payment_method_in
        );

        -- Update idempotency key with success
        UPDATE idempotency_keys 
        SET status = 'completed', response_payload = result, updated_at = NOW()
        WHERE request_id = client_request_id_in;

        RETURN result;

    EXCEPTION WHEN OTHERS THEN
        -- Update idempotency key status on error
        UPDATE idempotency_keys 
        SET status = 'failed', updated_at = NOW()
        WHERE request_id = client_request_id_in;
        
        RAISE;
    END;
END;
$$ LANGUAGE plpgsql; 