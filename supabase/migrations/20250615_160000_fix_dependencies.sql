-- =====================================================
-- Phase 4 Monitoring System - Dependency Fixes
-- =====================================================
-- Description: Ensures all required tables exist and adds proper error handling
-- Author: Kilo Code
-- Date: 2025-06-15
-- Version: 1.0.1
-- =====================================================

-- Ensure app_transaction_log table exists with proper structure
CREATE TABLE IF NOT EXISTS app_transaction_log (
    transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id TEXT NOT NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN (
        'stripe_recharge', 'checkpoint_recharge', 'bar_order'
    )),
    status TEXT NOT NULL CHECK (status IN (
        'pending', 'completed', 'failed', 'cancelled'
    )),
    amount_involved DECIMAL(10, 2) NOT NULL,
    previous_balance DECIMAL(10, 2),
    new_balance DECIMAL(10, 2),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    details JSONB DEFAULT '{}',
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure nfc_scan_log table exists with proper structure
CREATE TABLE IF NOT EXISTS nfc_scan_log (
    scan_log_id BIGSERIAL PRIMARY KEY,
    card_id_scanned TEXT,
    scan_timestamp TIMESTAMPTZ DEFAULT NOW(),
    scan_result TEXT CHECK (scan_result IN ('success', 'failure', 'duplicate')),
    processing_time_ms INTEGER,
    error_details JSONB,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure table_cards table exists with proper structure
CREATE TABLE IF NOT EXISTS table_cards (
    id TEXT PRIMARY KEY,
    amount DECIMAL(10, 2) DEFAULT 0.00,
    last_recharge_date TIMESTAMPTZ,
    recharge_count INTEGER DEFAULT 0,
    last_payment_method TEXT,
    description TEXT,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance if they don't exist
CREATE INDEX IF NOT EXISTS idx_app_transaction_log_card_id ON app_transaction_log(card_id);
CREATE INDEX IF NOT EXISTS idx_app_transaction_log_timestamp ON app_transaction_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_app_transaction_log_status ON app_transaction_log(status);
CREATE INDEX IF NOT EXISTS idx_app_transaction_log_type ON app_transaction_log(transaction_type);

CREATE INDEX IF NOT EXISTS idx_nfc_scan_log_card_id ON nfc_scan_log(card_id_scanned);
CREATE INDEX IF NOT EXISTS idx_nfc_scan_log_timestamp ON nfc_scan_log(scan_timestamp);
CREATE INDEX IF NOT EXISTS idx_nfc_scan_log_result ON nfc_scan_log(scan_result);

CREATE INDEX IF NOT EXISTS idx_table_cards_amount ON table_cards(amount);

-- Update detection functions to handle missing tables gracefully
CREATE OR REPLACE FUNCTION detect_transaction_failures()
RETURNS JSONB AS $$
DECLARE
    v_events_created INTEGER := 0;
    v_event_id BIGINT;
    v_failure_record RECORD;
    v_consecutive_record RECORD;
    v_result JSONB;
    v_table_exists BOOLEAN;
BEGIN
    -- Check if required tables exist
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'app_transaction_log'
    ) INTO v_table_exists;
    
    IF NOT v_table_exists THEN
        RAISE WARNING 'app_transaction_log table does not exist, skipping transaction failure detection';
        RETURN jsonb_build_object(
            'detection_type', 'transaction_failures',
            'events_created', 0,
            'detection_timestamp', NOW(),
            'success', false,
            'error', 'Required table app_transaction_log does not exist'
        );
    END IF;

    -- Check if table_cards exists
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'table_cards'
    ) INTO v_table_exists;
    
    IF NOT v_table_exists THEN
        RAISE WARNING 'table_cards table does not exist, skipping transaction failure detection';
        RETURN jsonb_build_object(
            'detection_type', 'transaction_failures',
            'events_created', 0,
            'detection_timestamp', NOW(),
            'success', false,
            'error', 'Required table table_cards does not exist'
        );
    END IF;

    BEGIN
        -- 1. Critical: Balance deducted on failed transaction
        FOR v_failure_record IN
            SELECT 
                t.transaction_id,
                t.card_id,
                t.amount_involved,
                t.previous_balance,
                t.new_balance,
                c.amount as current_balance,
                t.timestamp,
                t.details
            FROM app_transaction_log t
            JOIN table_cards c ON c.id = t.card_id
            WHERE t.status = 'failed' 
              AND t.new_balance != t.previous_balance
              AND t.timestamp > NOW() - INTERVAL '5 minutes'
              AND NOT EXISTS (
                  SELECT 1 FROM monitoring_events me 
                  WHERE me.transaction_id = t.transaction_id 
                    AND me.event_type = 'transaction_failure'
                    AND me.detection_algorithm = 'balance_deduction_on_failure'
              )
        LOOP
            SELECT create_monitoring_event(
                'transaction_failure',
                'CRITICAL',
                'balance_deduction_on_failure',
                v_failure_record.card_id,
                v_failure_record.transaction_id,
                v_failure_record.amount_involved,
                1.0,
                jsonb_build_object(
                    'previous_balance', v_failure_record.previous_balance,
                    'new_balance', v_failure_record.new_balance,
                    'current_balance', v_failure_record.current_balance,
                    'discrepancy', v_failure_record.previous_balance - v_failure_record.new_balance,
                    'transaction_timestamp', v_failure_record.timestamp
                ),
                jsonb_build_object(
                    'transaction_details', v_failure_record.details,
                    'detection_time', NOW(),
                    'requires_immediate_investigation', true
                )
            ) INTO v_event_id;
            
            v_events_created := v_events_created + 1;
        END LOOP;
        
        -- 2. High: Consecutive failures for same card
        FOR v_consecutive_record IN
            WITH consecutive_failures AS (
                SELECT 
                    card_id,
                    COUNT(*) as failure_count,
                    array_agg(transaction_id ORDER BY timestamp) as failed_transactions,
                    MIN(timestamp) as first_failure,
                    MAX(timestamp) as last_failure
                FROM app_transaction_log
                WHERE status = 'failed'
                  AND timestamp > NOW() - INTERVAL '10 minutes'
                GROUP BY card_id
                HAVING COUNT(*) >= 3
            )
            SELECT * FROM consecutive_failures cf
            WHERE NOT EXISTS (
                SELECT 1 FROM monitoring_events me 
                WHERE me.card_id = cf.card_id 
                  AND me.event_type = 'transaction_failure'
                  AND me.detection_algorithm = 'consecutive_failures'
                  AND me.detection_timestamp > NOW() - INTERVAL '10 minutes'
            )
        LOOP
            SELECT create_monitoring_event(
                'transaction_failure',
                'HIGH',
                'consecutive_failures',
                v_consecutive_record.card_id,
                NULL,
                NULL,
                0.9,
                jsonb_build_object(
                    'failure_count', v_consecutive_record.failure_count,
                    'failed_transactions', v_consecutive_record.failed_transactions,
                    'time_span_minutes', EXTRACT(EPOCH FROM (v_consecutive_record.last_failure - v_consecutive_record.first_failure)) / 60,
                    'first_failure', v_consecutive_record.first_failure,
                    'last_failure', v_consecutive_record.last_failure
                ),
                jsonb_build_object(
                    'detection_time', NOW(),
                    'pattern_type', 'consecutive_failures',
                    'requires_card_investigation', true
                )
            ) INTO v_event_id;
            
            v_events_created := v_events_created + 1;
        END LOOP;
        
        -- 3. Medium: System-wide failure rate spike
        DECLARE
            v_total_transactions INTEGER;
            v_failed_transactions INTEGER;
            v_failure_rate DECIMAL(5, 2);
        BEGIN
            SELECT 
                COUNT(*),
                COUNT(*) FILTER (WHERE status = 'failed')
            INTO v_total_transactions, v_failed_transactions
            FROM app_transaction_log
            WHERE timestamp > NOW() - INTERVAL '15 minutes';
            
            IF v_total_transactions > 10 THEN
                v_failure_rate := (v_failed_transactions::DECIMAL / v_total_transactions) * 100;
                
                IF v_failure_rate > 5.0 THEN
                    -- Check if we haven't already detected this spike
                    IF NOT EXISTS (
                        SELECT 1 FROM monitoring_events 
                        WHERE event_type = 'transaction_failure'
                          AND detection_algorithm = 'system_failure_spike'
                          AND detection_timestamp > NOW() - INTERVAL '15 minutes'
                    ) THEN
                        SELECT create_monitoring_event(
                            'transaction_failure',
                            'MEDIUM',
                            'system_failure_spike',
                            NULL,
                            NULL,
                            NULL,
                            0.8,
                            jsonb_build_object(
                                'total_transactions', v_total_transactions,
                                'failed_transactions', v_failed_transactions,
                                'failure_rate_percent', v_failure_rate,
                                'threshold_percent', 5.0,
                                'time_window_minutes', 15
                            ),
                            jsonb_build_object(
                                'detection_time', NOW(),
                                'system_wide_issue', true,
                                'requires_system_investigation', v_failure_rate > 10.0
                            )
                        ) INTO v_event_id;
                        
                        v_events_created := v_events_created + 1;
                    END IF;
                END IF;
            END IF;
        END;

    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Error in transaction failure detection: %', SQLERRM;
        RETURN jsonb_build_object(
            'detection_type', 'transaction_failures',
            'events_created', v_events_created,
            'detection_timestamp', NOW(),
            'success', false,
            'error', SQLERRM
        );
    END;
    
    -- Build result
    v_result := jsonb_build_object(
        'detection_type', 'transaction_failures',
        'events_created', v_events_created,
        'detection_timestamp', NOW(),
        'success', true
    );
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Update balance discrepancy detection with error handling
CREATE OR REPLACE FUNCTION detect_balance_discrepancies()
RETURNS JSONB AS $$
DECLARE
    v_events_created INTEGER := 0;
    v_event_id BIGINT;
    v_discrepancy_record RECORD;
    v_negative_record RECORD;
    v_result JSONB;
    v_table_exists BOOLEAN;
BEGIN
    -- Check if required tables exist
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'table_cards'
    ) INTO v_table_exists;
    
    IF NOT v_table_exists THEN
        RAISE WARNING 'table_cards table does not exist, skipping balance discrepancy detection';
        RETURN jsonb_build_object(
            'detection_type', 'balance_discrepancies',
            'events_created', 0,
            'detection_timestamp', NOW(),
            'success', false,
            'error', 'Required table table_cards does not exist'
        );
    END IF;

    BEGIN
        -- 1. Critical: Balance mismatch with transaction history
        FOR v_discrepancy_record IN
            WITH calculated_balances AS (
                SELECT 
                    card_id,
                    SUM(CASE 
                        WHEN transaction_type IN ('stripe_recharge', 'checkpoint_recharge') 
                          AND status = 'completed' THEN amount_involved
                        WHEN transaction_type = 'bar_order' 
                          AND status = 'completed' THEN -amount_involved
                        ELSE 0
                    END) as expected_balance,
                    COUNT(*) as transaction_count,
                    MAX(timestamp) as last_transaction
                FROM app_transaction_log
                GROUP BY card_id
            )
            SELECT 
                c.id as card_id,
                c.amount as actual_balance,
                COALESCE(cb.expected_balance, 0) as expected_balance,
                ABS(c.amount - COALESCE(cb.expected_balance, 0)) as discrepancy,
                cb.transaction_count,
                cb.last_transaction
            FROM table_cards c
            LEFT JOIN calculated_balances cb ON cb.card_id = c.id
            WHERE ABS(c.amount - COALESCE(cb.expected_balance, 0)) > 0.01
              AND NOT EXISTS (
                  SELECT 1 FROM monitoring_events me 
                  WHERE me.card_id = c.id 
                    AND me.event_type = 'balance_discrepancy'
                    AND me.detection_algorithm = 'balance_mismatch_detection'
                    AND me.detection_timestamp > NOW() - INTERVAL '1 hour'
              )
        LOOP
            SELECT create_monitoring_event(
                'balance_discrepancy',
                'CRITICAL',
                'balance_mismatch_detection',
                v_discrepancy_record.card_id,
                NULL,
                v_discrepancy_record.discrepancy,
                1.0,
                jsonb_build_object(
                    'actual_balance', v_discrepancy_record.actual_balance,
                    'expected_balance', v_discrepancy_record.expected_balance,
                    'discrepancy', v_discrepancy_record.discrepancy,
                    'transaction_count', v_discrepancy_record.transaction_count,
                    'last_transaction', v_discrepancy_record.last_transaction
                ),
                jsonb_build_object(
                    'detection_time', NOW(),
                    'requires_immediate_investigation', v_discrepancy_record.discrepancy > 10.0,
                    'financial_impact', 'high'
                )
            ) INTO v_event_id;
            
            v_events_created := v_events_created + 1;
        END LOOP;
        
        -- 2. High: Negative balances (impossible scenario)
        FOR v_negative_record IN
            SELECT id, amount
            FROM table_cards 
            WHERE amount < 0
              AND NOT EXISTS (
                  SELECT 1 FROM monitoring_events me 
                  WHERE me.card_id = table_cards.id 
                    AND me.event_type = 'balance_discrepancy'
                    AND me.detection_algorithm = 'negative_balance_detection'
                    AND me.detection_timestamp > NOW() - INTERVAL '1 hour'
              )
        LOOP
            SELECT create_monitoring_event(
                'balance_discrepancy',
                'HIGH',
                'negative_balance_detection',
                v_negative_record.id,
                NULL,
                ABS(v_negative_record.amount),
                1.0,
                jsonb_build_object(
                    'negative_balance', v_negative_record.amount,
                    'impossible_scenario', true
                ),
                jsonb_build_object(
                    'detection_time', NOW(),
                    'requires_immediate_investigation', true,
                    'system_integrity_issue', true
                )
            ) INTO v_event_id;
            
            v_events_created := v_events_created + 1;
        END LOOP;

    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Error in balance discrepancy detection: %', SQLERRM;
        RETURN jsonb_build_object(
            'detection_type', 'balance_discrepancies',
            'events_created', v_events_created,
            'detection_timestamp', NOW(),
            'success', false,
            'error', SQLERRM
        );
    END;
    
    -- Build result
    v_result := jsonb_build_object(
        'detection_type', 'balance_discrepancies',
        'events_created', v_events_created,
        'detection_timestamp', NOW(),
        'success', true
    );
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Update NFC duplicate detection with error handling
CREATE OR REPLACE FUNCTION detect_duplicate_nfc_scans()
RETURNS JSONB AS $$
DECLARE
    v_events_created INTEGER := 0;
    v_event_id BIGINT;
    v_duplicate_record RECORD;
    v_result JSONB;
    v_table_exists BOOLEAN;
BEGIN
    -- Check if required table exists
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'nfc_scan_log'
    ) INTO v_table_exists;
    
    IF NOT v_table_exists THEN
        RAISE WARNING 'nfc_scan_log table does not exist, skipping duplicate NFC detection';
        RETURN jsonb_build_object(
            'detection_type', 'duplicate_nfc_scans',
            'events_created', 0,
            'detection_timestamp', NOW(),
            'success', false,
            'error', 'Required table nfc_scan_log does not exist'
        );
    END IF;

    BEGIN
        -- Temporal correlation analysis - same card scanned multiple times within 5 seconds
        FOR v_duplicate_record IN
            SELECT 
                card_id_scanned,
                COUNT(*) as scan_count,
                array_agg(scan_log_id ORDER BY scan_timestamp) as scan_ids,
                array_agg(scan_timestamp ORDER BY scan_timestamp) as scan_timestamps,
                MAX(scan_timestamp) - MIN(scan_timestamp) as time_span
            FROM nfc_scan_log
            WHERE scan_timestamp > NOW() - INTERVAL '2 minutes'
              AND card_id_scanned IS NOT NULL
            GROUP BY card_id_scanned
            HAVING COUNT(*) > 1 
              AND MAX(scan_timestamp) - MIN(scan_timestamp) < INTERVAL '5 seconds'
              AND NOT EXISTS (
                  SELECT 1 FROM monitoring_events me 
                  WHERE me.card_id = card_id_scanned 
                    AND me.event_type = 'duplicate_nfc'
                    AND me.detection_algorithm = 'temporal_duplicate_detection'
                    AND me.detection_timestamp > NOW() - INTERVAL '2 minutes'
              )
        LOOP
            SELECT create_monitoring_event(
                'duplicate_nfc',
                'MEDIUM',
                'temporal_duplicate_detection',
                v_duplicate_record.card_id_scanned,
                NULL,
                NULL,
                0.8,
                jsonb_build_object(
                    'scan_count', v_duplicate_record.scan_count,
                    'scan_ids', v_duplicate_record.scan_ids,
                    'scan_timestamps', v_duplicate_record.scan_timestamps,
                    'time_span_seconds', EXTRACT(EPOCH FROM v_duplicate_record.time_span),
                    'threshold_seconds', 5
                ),
                jsonb_build_object(
                    'detection_time', NOW(),
                    'pattern_type', 'temporal_duplicates',
                    'potential_user_error', true
                )
            ) INTO v_event_id;
            
            v_events_created := v_events_created + 1;
        END LOOP;

    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Error in duplicate NFC detection: %', SQLERRM;
        RETURN jsonb_build_object(
            'detection_type', 'duplicate_nfc_scans',
            'events_created', v_events_created,
            'detection_timestamp', NOW(),
            'success', false,
            'error', SQLERRM
        );
    END;
    
    -- Build result
    v_result := jsonb_build_object(
        'detection_type', 'duplicate_nfc_scans',
        'events_created', v_events_created,
        'detection_timestamp', NOW(),
        'success', true
    );
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Update race condition detection with error handling
CREATE OR REPLACE FUNCTION detect_race_conditions()
RETURNS JSONB AS $$
DECLARE
    v_events_created INTEGER := 0;
    v_event_id BIGINT;
    v_race_record RECORD;
    v_result JSONB;
    v_table_exists BOOLEAN;
BEGIN
    -- Check if required table exists
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'app_transaction_log'
    ) INTO v_table_exists;
    
    IF NOT v_table_exists THEN
        RAISE WARNING 'app_transaction_log table does not exist, skipping race condition detection';
        RETURN jsonb_build_object(
            'detection_type', 'race_conditions',
            'events_created', 0,
            'detection_timestamp', NOW(),
            'success', false,
            'error', 'Required table app_transaction_log does not exist'
        );
    END IF;

    BEGIN
        -- Detect concurrent transactions for same card within 2-second interval
        FOR v_race_record IN
            SELECT 
                card_id,
                COUNT(*) as concurrent_count,
                array_agg(transaction_id ORDER BY timestamp) as transaction_ids,
                array_agg(timestamp ORDER BY timestamp) as timestamps,
                array_agg(transaction_type ORDER BY timestamp) as transaction_types,
                MAX(timestamp) - MIN(timestamp) as time_span
            FROM app_transaction_log
            WHERE timestamp > NOW() - INTERVAL '1 minute'
            GROUP BY card_id, DATE_TRUNC('second', timestamp)
            HAVING COUNT(*) > 1
              AND MAX(timestamp) - MIN(timestamp) < INTERVAL '2 seconds'
              AND NOT EXISTS (
                  SELECT 1 FROM monitoring_events me 
                  WHERE me.card_id = card_id 
                    AND me.event_type = 'race_condition'
                    AND me.detection_algorithm = 'concurrent_transaction_detection'
                    AND me.detection_timestamp > NOW() - INTERVAL '1 minute'
              )
        LOOP
            SELECT create_monitoring_event(
                'race_condition',
                'MEDIUM',
                'concurrent_transaction_detection',
                v_race_record.card_id,
                NULL,
                NULL,
                0.7,
                jsonb_build_object(
                    'concurrent_count', v_race_record.concurrent_count,
                    'transaction_ids', v_race_record.transaction_ids,
                    'timestamps', v_race_record.timestamps,
                    'transaction_types', v_race_record.transaction_types,
                    'time_span_seconds', EXTRACT(EPOCH FROM v_race_record.time_span),
                    'threshold_seconds', 2
                ),
                jsonb_build_object(
                    'detection_time', NOW(),
                    'pattern_type', 'concurrent_transactions',
                    'potential_race_condition', true,
                    'requires_investigation', v_race_record.concurrent_count > 2
                )
            ) INTO v_event_id;
            
            v_events_created := v_events_created + 1;
        END LOOP;

    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Error in race condition detection: %', SQLERRM;
        RETURN jsonb_build_object(
            'detection_type', 'race_conditions',
            'events_created', v_events_created,
            'detection_timestamp', NOW(),
            'success', false,
            'error', SQLERRM
        );
    END;
    
    -- Build result
    v_result := jsonb_build_object(
        'detection_type', 'race_conditions',
        'events_created', v_events_created,
        'detection_timestamp', NOW(),
        'success', true
    );
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Log successful migration completion
DO $$
BEGIN
    RAISE NOTICE '=================================================';
    RAISE NOTICE 'Phase 4 Monitoring System - Dependency Fixes Completed';
    RAISE NOTICE '=================================================';
    RAISE NOTICE 'Migration: 20250615_160000_fix_dependencies.sql';
    RAISE NOTICE 'Timestamp: %', NOW();
    RAISE NOTICE 'Tables Ensured: app_transaction_log, nfc_scan_log, table_cards';
    RAISE NOTICE 'Functions Updated: All detection functions with error handling';
    RAISE NOTICE 'Indexes Added: Performance indexes for all tables';
    RAISE NOTICE '=================================================';
END $$;