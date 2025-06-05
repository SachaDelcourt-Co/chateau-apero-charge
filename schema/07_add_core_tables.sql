-- schema/07_add_core_tables.sql
-- Migration for Phase 2.5: Add core tables for idempotency, transaction logging, and NFC scan logging

-- New Table: idempotency_keys
CREATE TABLE public.idempotency_keys (
    request_id TEXT PRIMARY KEY,
    source_function TEXT NOT NULL, -- e.g., 'sp_process_bar_order', 'stripe-webhook', 'sp_process_checkpoint_recharge'
    status TEXT NOT NULL, -- e.g., 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'
    response_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.idempotency_keys IS 'Stores idempotency keys to prevent duplicate processing of requests. request_id is the key, source_function indicates the caller, status tracks progress, and response_payload can store the result of an already completed idempotent call.';
COMMENT ON COLUMN public.idempotency_keys.request_id IS 'Unique identifier for the request (e.g., client-generated UUID, Stripe session ID).';
COMMENT ON COLUMN public.idempotency_keys.source_function IS 'Identifier of the function or process that this key is for (e.g., ''process-bar-order'', ''stripe-webhook'').';
COMMENT ON COLUMN public.idempotency_keys.status IS 'Current status of the idempotent request processing (e.g., PENDING, COMPLETED, FAILED).';
COMMENT ON COLUMN public.idempotency_keys.response_payload IS 'Stored response for an already processed request, to be returned on subsequent identical requests.';
COMMENT ON COLUMN public.idempotency_keys.created_at IS 'Timestamp of when the idempotency key was first recorded.';
COMMENT ON COLUMN public.idempotency_keys.updated_at IS 'Timestamp of when the idempotency key was last updated.';

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at ON public.idempotency_keys(created_at); -- For potential cleanup jobs

-- New Table: app_transaction_log
CREATE TABLE public.app_transaction_log (
    log_id BIGSERIAL PRIMARY KEY,
    transaction_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    correlation_id UUID, -- To link related logs, e.g., multiple steps of a saga
    card_id TEXT, -- REFERENCES public.table_cards(id) ON DELETE SET NULL, -- FK to be added carefully
    transaction_type TEXT NOT NULL, -- e.g., 'BAR_ORDER_SALE', 'STRIPE_RECHARGE_SUCCESS', 'CHECKPOINT_RECHARGE_CASH', 'REFUND_PROCESSED', 'BALANCE_ADJUSTMENT_STAFF'
    status TEXT NOT NULL, -- e.g., 'INITIATED', 'PENDING_CONFIRMATION', 'SUCCESS', 'FAILED_INSUFFICIENT_FUNDS', 'FAILED_CARD_INVALID', 'FAILED_IDEMPOTENCY_REJECT', 'ERROR_SYSTEM_DB', 'ERROR_EXTERNAL_API'
    amount_involved DECIMAL(10, 2) NOT NULL,
    previous_balance_on_card DECIMAL(10, 2),
    new_balance_on_card DECIMAL(10, 2),
    details JSONB, -- For items in order, payment method details, error messages, staff notes
    edge_function_name TEXT, -- Name of the Supabase Edge Function, if applicable
    edge_function_request_id TEXT, -- Specific invocation ID of the Edge Function
    client_request_id TEXT, -- Client-generated ID, often same as idempotency_keys.request_id
    staff_id TEXT, -- Staff member involved, if any
    point_of_sale_id TEXT, -- POS terminal or checkpoint ID
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_transaction_log_card_id ON public.app_transaction_log(card_id);
CREATE INDEX IF NOT EXISTS idx_app_transaction_log_timestamp ON public.app_transaction_log("timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_app_transaction_log_transaction_type ON public.app_transaction_log(transaction_type);
CREATE INDEX IF NOT EXISTS idx_app_transaction_log_client_request_id ON public.app_transaction_log(client_request_id);
CREATE INDEX IF NOT EXISTS idx_app_transaction_log_correlation_id ON public.app_transaction_log(correlation_id);
CREATE INDEX IF NOT EXISTS idx_app_transaction_log_status ON public.app_transaction_log(status);

COMMENT ON TABLE public.app_transaction_log IS 'Comprehensive log for all application-level financial transactions, balance changes, and significant operational events. Provides an audit trail.';
COMMENT ON COLUMN public.app_transaction_log.log_id IS 'Unique sequential identifier for the log entry.';
COMMENT ON COLUMN public.app_transaction_log.transaction_id IS 'Globally unique identifier for the specific transaction or operation being logged.';
COMMENT ON COLUMN public.app_transaction_log.correlation_id IS 'Identifier used to group related log entries, such as multiple attempts or steps of a single logical operation.';
COMMENT ON COLUMN public.app_transaction_log.card_id IS 'Identifier of the NFC card involved. Foreign key to table_cards.id (to be added post table_cards confirmation).';
COMMENT ON COLUMN public.app_transaction_log.transaction_type IS 'Categorizes the transaction (e.g., BAR_ORDER_SALE, STRIPE_RECHARGE_SUCCESS, CHECKPOINT_RECHARGE_CASH).';
COMMENT ON COLUMN public.app_transaction_log.status IS 'Outcome or current state of the transaction (e.g., SUCCESS, FAILED_INSUFFICIENT_FUNDS, PENDING_CONFIRMATION).';
COMMENT ON COLUMN public.app_transaction_log.amount_involved IS 'Monetary value of the transaction. Positive for credits to card, negative for debits.';
COMMENT ON COLUMN public.app_transaction_log.previous_balance_on_card IS 'Balance of the card before this transaction was applied.';
COMMENT ON COLUMN public.app_transaction_log.new_balance_on_card IS 'Balance of the card after this transaction was applied.';
COMMENT ON COLUMN public.app_transaction_log.details IS 'JSONB field for additional context-specific data (e.g., items in a bar order, Stripe charge ID, error details, staff notes).';
COMMENT ON COLUMN public.app_transaction_log.edge_function_name IS 'Name of the Supabase Edge Function that handled or initiated this transaction, if applicable.';
COMMENT ON COLUMN public.app_transaction_log.edge_function_request_id IS 'The unique request ID for the specific invocation of the Edge Function.';
COMMENT ON COLUMN public.app_transaction_log.client_request_id IS 'Client-generated identifier for the request, often used for idempotency checks.';
COMMENT ON COLUMN public.app_transaction_log.staff_id IS 'Identifier of the staff member involved in the transaction (e.g., for checkpoint recharges or manual adjustments).';
COMMENT ON COLUMN public.app_transaction_log.point_of_sale_id IS 'Identifier of the point of sale terminal, checkpoint, or system component where the transaction originated.';
COMMENT ON COLUMN public.app_transaction_log."timestamp" IS 'Timestamp of when the log entry was recorded.';

-- New Table: nfc_scan_log
CREATE TABLE public.nfc_scan_log (
    scan_log_id BIGSERIAL PRIMARY KEY,
    card_id_scanned TEXT, -- The UID or identifier read from the card
    raw_data_if_any TEXT, -- Full raw data from the scan, if available and useful for debugging
    scan_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    scan_status TEXT NOT NULL, -- e.g., 'SUCCESS_CARD_READ', 'SUCCESS_NO_APP_DATA', 'FAILURE_READ_ERROR', 'FAILURE_NO_CARD_DETECTED', 'DEBOUNCED_CLIENT_SIDE', 'DEBOUNCED_BACKEND_LOCK', 'PROCESSING_INITIATED_BY_SCAN'
    scan_location_context TEXT, -- e.g., 'BAR_TERMINAL_01', 'CHECKPOINT_ALPHA_SCANNER_02', 'ENTRANCE_GATE_WEST', 'USER_SELF_SCAN_APP'
    device_identifier TEXT, -- Serial number or unique ID of the NFC reader/device
    user_agent_performing_scan TEXT, -- User agent of the client app (web, mobile) that performed or reported the scan
    session_id TEXT -- Optional: session ID of the user/terminal performing scan
);

CREATE INDEX IF NOT EXISTS idx_nfc_scan_log_scan_timestamp ON public.nfc_scan_log(scan_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_nfc_scan_log_card_id_scanned ON public.nfc_scan_log(card_id_scanned);
CREATE INDEX IF NOT EXISTS idx_nfc_scan_log_scan_status ON public.nfc_scan_log(scan_status);
CREATE INDEX IF NOT EXISTS idx_nfc_scan_log_scan_location_context ON public.nfc_scan_log(scan_location_context);

COMMENT ON TABLE public.nfc_scan_log IS 'Logs all NFC scan attempts, successful or failed, to monitor interaction patterns and diagnose issues with NFC hardware or card reads.';
COMMENT ON COLUMN public.nfc_scan_log.scan_log_id IS 'Unique sequential identifier for the scan log entry.';
COMMENT ON COLUMN public.nfc_scan_log.card_id_scanned IS 'Identifier of the NFC card detected during the scan, if a read was successful.';
COMMENT ON COLUMN public.nfc_scan_log.raw_data_if_any IS 'Raw data payload read from the NFC card, potentially useful for debugging unrecognized cards or data formats.';
COMMENT ON COLUMN public.nfc_scan_log.scan_timestamp IS 'Timestamp of when the NFC scan event occurred.';
COMMENT ON COLUMN public.nfc_scan_log.scan_status IS 'Outcome of the NFC scan attempt (e.g., SUCCESS_CARD_READ, FAILURE_READ_ERROR, DEBOUNCED_CLIENT_SIDE).';
COMMENT ON COLUMN public.nfc_scan_log.scan_location_context IS 'Contextual information about where the scan took place (e.g., specific POS terminal ID, checkpoint name, app module).';
COMMENT ON COLUMN public.nfc_scan_log.device_identifier IS 'Identifier of the physical NFC reader or device that performed the scan, if available.';
COMMENT ON COLUMN public.nfc_scan_log.user_agent_performing_scan IS 'User agent string of the client application (e.g., browser, mobile app version) that initiated or reported the scan.';
COMMENT ON COLUMN public.nfc_scan_log.session_id IS 'Optional session identifier for the user or terminal session during which the scan occurred.';