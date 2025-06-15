-- =====================================================
-- Phase 4 Monitoring System Database Migration
-- =====================================================
-- Description: Creates monitoring tables, indexes, and stored procedures
--              for the Phase 4 production monitoring system
-- Author: Phase 4 Implementation
-- Date: 2025-06-14
-- Version: 1.0.0
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. MONITORING EVENTS TABLE
-- =====================================================
-- Core monitoring events storage for all detection types
CREATE TABLE monitoring_events (
    event_id BIGSERIAL PRIMARY KEY,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'transaction_failure', 'balance_discrepancy', 
        'duplicate_nfc', 'race_condition', 'system_health'
    )),
    severity TEXT NOT NULL CHECK (severity IN (
        'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'
    )),
    
    -- Event details
    card_id TEXT,
    transaction_id UUID,
    affected_amount DECIMAL(10, 2),
    
    -- Detection metadata
    detection_timestamp TIMESTAMPTZ DEFAULT NOW(),
    detection_algorithm TEXT NOT NULL,
    confidence_score DECIMAL(3, 2) DEFAULT 1.0 CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
    
    -- Event data (TypeScript-compatible JSON structures)
    event_data JSONB NOT NULL DEFAULT '{}',
    context_data JSONB DEFAULT '{}',
    
    -- Resolution tracking
    status TEXT DEFAULT 'OPEN' CHECK (status IN (
        'OPEN', 'INVESTIGATING', 'RESOLVED', 'FALSE_POSITIVE'
    )),
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance indexes for monitoring_events
CREATE INDEX idx_monitoring_events_timestamp ON monitoring_events(detection_timestamp);
CREATE INDEX idx_monitoring_events_type_severity ON monitoring_events(event_type, severity);
CREATE INDEX idx_monitoring_events_card_id ON monitoring_events(card_id) WHERE card_id IS NOT NULL;
CREATE INDEX idx_monitoring_events_transaction_id ON monitoring_events(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX idx_monitoring_events_status ON monitoring_events(status);
CREATE INDEX idx_monitoring_events_created_at ON monitoring_events(created_at);

-- Covering index for dashboard queries
CREATE INDEX idx_monitoring_events_covering 
ON monitoring_events(detection_timestamp, event_type, severity) 
INCLUDE (card_id, affected_amount, status);

-- Partial index for open events (most frequently queried)
CREATE INDEX idx_monitoring_events_open ON monitoring_events(detection_timestamp, severity) 
WHERE status = 'OPEN';

-- =====================================================
-- 2. SYSTEM HEALTH SNAPSHOTS TABLE
-- =====================================================
-- System health tracking and metrics storage
CREATE TABLE system_health_snapshots (
    snapshot_id BIGSERIAL PRIMARY KEY,
    snapshot_timestamp TIMESTAMPTZ DEFAULT NOW(),
    
    -- Transaction metrics
    total_transactions_last_hour INTEGER DEFAULT 0,
    successful_transactions_last_hour INTEGER DEFAULT 0,
    failed_transactions_last_hour INTEGER DEFAULT 0,
    success_rate_percent DECIMAL(5, 2),
    
    -- Performance metrics
    avg_processing_time_ms INTEGER,
    p95_processing_time_ms INTEGER,
    max_processing_time_ms INTEGER,
    
    -- NFC metrics
    total_nfc_scans_last_hour INTEGER DEFAULT 0,
    duplicate_nfc_scans_last_hour INTEGER DEFAULT 0,
    nfc_success_rate_percent DECIMAL(5, 2),
    
    -- System metrics
    active_cards_count INTEGER,
    total_system_balance DECIMAL(12, 2),
    monitoring_events_last_hour INTEGER DEFAULT 0,
    critical_events_last_hour INTEGER DEFAULT 0,
    
    -- Health status
    overall_health_status TEXT CHECK (overall_health_status IN (
        'HEALTHY', 'WARNING', 'CRITICAL', 'UNKNOWN'
    )) DEFAULT 'UNKNOWN',
    
    -- Additional metrics (TypeScript-compatible JSON)
    metrics_data JSONB DEFAULT '{}'
);

-- Performance indexes for system_health_snapshots
CREATE INDEX idx_system_health_timestamp ON system_health_snapshots(snapshot_timestamp);
CREATE INDEX idx_system_health_status ON system_health_snapshots(overall_health_status);

-- =====================================================
-- 3. ALERT HISTORY TABLE
-- =====================================================
-- Alert tracking and escalation management
CREATE TABLE alert_history (
    alert_id BIGSERIAL PRIMARY KEY,
    monitoring_event_id BIGINT REFERENCES monitoring_events(event_id) ON DELETE CASCADE,
    
    -- Alert details
    alert_level TEXT NOT NULL CHECK (alert_level IN (
        'INFO', 'WARNING', 'CRITICAL', 'EMERGENCY'
    )),
    alert_message TEXT NOT NULL,
    alert_timestamp TIMESTAMPTZ DEFAULT NOW(),
    
    -- Escalation tracking
    escalation_level INTEGER DEFAULT 0,
    escalated_at TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by TEXT,
    
    -- Resolution tracking
    resolved_at TIMESTAMPTZ,
    resolution_time_seconds INTEGER,
    
    -- Alert metadata (TypeScript-compatible JSON)
    alert_data JSONB DEFAULT '{}'
);

-- Performance indexes for alert_history
CREATE INDEX idx_alert_history_timestamp ON alert_history(alert_timestamp);
CREATE INDEX idx_alert_history_level ON alert_history(alert_level);
CREATE INDEX idx_alert_history_monitoring_event ON alert_history(monitoring_event_id);
CREATE INDEX idx_alert_history_unresolved ON alert_history(alert_timestamp) 
WHERE resolved_at IS NULL;

-- =====================================================
-- 4. UTILITY FUNCTIONS
-- =====================================================

-- Function to create monitoring events with proper validation
CREATE OR REPLACE FUNCTION create_monitoring_event(
    p_event_type TEXT,
    p_severity TEXT,
    p_detection_algorithm TEXT,
    p_card_id TEXT DEFAULT NULL,
    p_transaction_id UUID DEFAULT NULL,
    p_affected_amount DECIMAL(10, 2) DEFAULT NULL,
    p_confidence_score DECIMAL(3, 2) DEFAULT 1.0,
    p_event_data JSONB DEFAULT '{}',
    p_context_data JSONB DEFAULT '{}'
) RETURNS BIGINT AS $$
DECLARE
    v_event_id BIGINT;
BEGIN
    -- Validate input parameters
    IF p_event_type NOT IN ('transaction_failure', 'balance_discrepancy', 'duplicate_nfc', 'race_condition', 'system_health') THEN
        RAISE EXCEPTION 'Invalid event_type: %', p_event_type;
    END IF;
    
    IF p_severity NOT IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO') THEN
        RAISE EXCEPTION 'Invalid severity: %', p_severity;
    END IF;
    
    IF p_confidence_score < 0.0 OR p_confidence_score > 1.0 THEN
        RAISE EXCEPTION 'Confidence score must be between 0.0 and 1.0';
    END IF;
    
    -- Insert monitoring event
    INSERT INTO monitoring_events (
        event_type,
        severity,
        card_id,
        transaction_id,
        affected_amount,
        detection_algorithm,
        confidence_score,
        event_data,
        context_data
    ) VALUES (
        p_event_type,
        p_severity,
        p_card_id,
        p_transaction_id,
        p_affected_amount,
        p_detection_algorithm,
        p_confidence_score,
        p_event_data,
        p_context_data
    ) RETURNING event_id INTO v_event_id;
    
    -- Log the event creation
    RAISE NOTICE 'Created monitoring event % with ID %', p_event_type, v_event_id;
    
    RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update system health snapshots
CREATE OR REPLACE FUNCTION update_system_health_snapshot()
RETURNS BIGINT AS $$
DECLARE
    v_snapshot_id BIGINT;
    v_total_transactions INTEGER;
    v_successful_transactions INTEGER;
    v_failed_transactions INTEGER;
    v_success_rate DECIMAL(5, 2);
    v_total_nfc_scans INTEGER;
    v_duplicate_nfc_scans INTEGER;
    v_nfc_success_rate DECIMAL(5, 2);
    v_active_cards INTEGER;
    v_total_balance DECIMAL(12, 2);
    v_monitoring_events INTEGER;
    v_critical_events INTEGER;
    v_health_status TEXT;
BEGIN
    -- Calculate transaction metrics for last hour
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'completed'),
        COUNT(*) FILTER (WHERE status = 'failed')
    INTO v_total_transactions, v_successful_transactions, v_failed_transactions
    FROM app_transaction_log
    WHERE timestamp > NOW() - INTERVAL '1 hour';
    
    -- Calculate success rate
    v_success_rate := CASE 
        WHEN v_total_transactions > 0 THEN 
            ROUND((v_successful_transactions::DECIMAL / v_total_transactions) * 100, 2)
        ELSE 0 
    END;
    
    -- Calculate NFC metrics for last hour
    SELECT COUNT(*)
    INTO v_total_nfc_scans
    FROM nfc_scan_log
    WHERE scan_timestamp > NOW() - INTERVAL '1 hour';
    
    -- Calculate duplicate NFC scans (simplified detection)
    WITH duplicate_scans AS (
        SELECT card_id_scanned, COUNT(*) as scan_count
        FROM nfc_scan_log
        WHERE scan_timestamp > NOW() - INTERVAL '1 hour'
          AND card_id_scanned IS NOT NULL
        GROUP BY card_id_scanned, DATE_TRUNC('minute', scan_timestamp)
        HAVING COUNT(*) > 1
    )
    SELECT COALESCE(SUM(scan_count - 1), 0)
    INTO v_duplicate_nfc_scans
    FROM duplicate_scans;
    
    -- Calculate NFC success rate
    v_nfc_success_rate := CASE 
        WHEN v_total_nfc_scans > 0 THEN 
            ROUND(((v_total_nfc_scans - v_duplicate_nfc_scans)::DECIMAL / v_total_nfc_scans) * 100, 2)
        ELSE 100 
    END;
    
    -- Get system metrics
    SELECT COUNT(*), COALESCE(SUM(amount), 0)
    INTO v_active_cards, v_total_balance
    FROM table_cards
    WHERE amount > 0;
    
    -- Calculate monitoring events for last hour
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE severity = 'CRITICAL')
    INTO v_monitoring_events, v_critical_events
    FROM monitoring_events
    WHERE detection_timestamp > NOW() - INTERVAL '1 hour';
    
    -- Determine overall health status
    v_health_status := CASE
        WHEN v_critical_events > 0 THEN 'CRITICAL'
        WHEN v_success_rate < 95.0 OR v_nfc_success_rate < 95.0 THEN 'WARNING'
        WHEN v_success_rate >= 99.0 AND v_nfc_success_rate >= 99.0 THEN 'HEALTHY'
        ELSE 'WARNING'
    END;
    
    -- Insert health snapshot
    INSERT INTO system_health_snapshots (
        total_transactions_last_hour,
        successful_transactions_last_hour,
        failed_transactions_last_hour,
        success_rate_percent,
        total_nfc_scans_last_hour,
        duplicate_nfc_scans_last_hour,
        nfc_success_rate_percent,
        active_cards_count,
        total_system_balance,
        monitoring_events_last_hour,
        critical_events_last_hour,
        overall_health_status,
        metrics_data
    ) VALUES (
        v_total_transactions,
        v_successful_transactions,
        v_failed_transactions,
        v_success_rate,
        v_total_nfc_scans,
        v_duplicate_nfc_scans,
        v_nfc_success_rate,
        v_active_cards,
        v_total_balance,
        v_monitoring_events,
        v_critical_events,
        v_health_status,
        jsonb_build_object(
            'snapshot_generation_time_ms', EXTRACT(EPOCH FROM NOW()) * 1000,
            'database_connections', (SELECT count(*) FROM pg_stat_activity WHERE state = 'active')
        )
    ) RETURNING snapshot_id INTO v_snapshot_id;
    
    RETURN v_snapshot_id;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old monitoring data
CREATE OR REPLACE FUNCTION cleanup_monitoring_data(
    p_retention_days INTEGER DEFAULT 30
) RETURNS JSONB AS $$
DECLARE
    v_deleted_events INTEGER;
    v_deleted_snapshots INTEGER;
    v_deleted_alerts INTEGER;
    v_result JSONB;
BEGIN
    -- Delete old monitoring events
    DELETE FROM monitoring_events 
    WHERE detection_timestamp < NOW() - (p_retention_days || ' days')::INTERVAL;
    GET DIAGNOSTICS v_deleted_events = ROW_COUNT;
    
    -- Delete old system health snapshots
    DELETE FROM system_health_snapshots 
    WHERE snapshot_timestamp < NOW() - (p_retention_days || ' days')::INTERVAL;
    GET DIAGNOSTICS v_deleted_snapshots = ROW_COUNT;
    
    -- Delete old alert history (keep alerts longer - 90 days)
    DELETE FROM alert_history 
    WHERE alert_timestamp < NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS v_deleted_alerts = ROW_COUNT;
    
    -- Update table statistics
    ANALYZE monitoring_events;
    ANALYZE system_health_snapshots;
    ANALYZE alert_history;
    
    -- Build result
    v_result := jsonb_build_object(
        'cleanup_timestamp', NOW(),
        'retention_days', p_retention_days,
        'deleted_events', v_deleted_events,
        'deleted_snapshots', v_deleted_snapshots,
        'deleted_alerts', v_deleted_alerts,
        'success', true
    );
    
    RAISE NOTICE 'Cleanup completed: % events, % snapshots, % alerts deleted', 
        v_deleted_events, v_deleted_snapshots, v_deleted_alerts;
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 5. DETECTION STORED PROCEDURES
-- =====================================================

-- Critical Priority: Detect transaction failures
CREATE OR REPLACE FUNCTION detect_transaction_failures()
RETURNS JSONB AS $$
DECLARE
    v_events_created INTEGER := 0;
    v_event_id BIGINT;
    v_failure_record RECORD;
    v_consecutive_record RECORD;
    v_result JSONB;
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

-- Critical Priority: Detect balance discrepancies
CREATE OR REPLACE FUNCTION detect_balance_discrepancies()
RETURNS JSONB AS $$
DECLARE
    v_events_created INTEGER := 0;
    v_event_id BIGINT;
    v_discrepancy_record RECORD;
    v_negative_record RECORD;
    v_result JSONB;
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

-- Medium Priority: Detect duplicate NFC scans
CREATE OR REPLACE FUNCTION detect_duplicate_nfc_scans()
RETURNS JSONB AS $$
DECLARE
    v_events_created INTEGER := 0;
    v_event_id BIGINT;
    v_duplicate_record RECORD;
    v_result JSONB;
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

-- Medium Priority: Detect race conditions
CREATE OR REPLACE FUNCTION detect_race_conditions()
RETURNS JSONB AS $$
DECLARE
    v_events_created INTEGER := 0;
    v_event_id BIGINT;
    v_race_record RECORD;
    v_result JSONB;
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

-- =====================================================
-- 6. TRIGGERS AND AUTOMATION
-- =====================================================

-- Trigger to update updated_at timestamp on monitoring_events
CREATE OR REPLACE FUNCTION update_monitoring_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_monitoring_events_updated_at
    BEFORE UPDATE ON monitoring_events
    FOR EACH ROW
    EXECUTE FUNCTION update_monitoring_events_updated_at();

-- Trigger to automatically create alerts for critical events
CREATE OR REPLACE FUNCTION create_alert_for_critical_event()
RETURNS TRIGGER AS $$
BEGIN
    -- Create alert for CRITICAL severity events
    IF NEW.severity = 'CRITICAL' THEN
        INSERT INTO alert_history (
            monitoring_event_id,
            alert_level,
            alert_message,
            alert_data
        ) VALUES (
            NEW.event_id,
            'CRITICAL',
            format('Critical %s detected for card %s', NEW.event_type, COALESCE(NEW.card_id, 'SYSTEM')),
            jsonb_build_object(
                'auto_generated', true,
                'event_type', NEW.event_type,
                'detection_algorithm', NEW.detection_algorithm,
                'affected_amount', NEW.affected_amount
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_alert_for_critical_event
    AFTER INSERT ON monitoring_events
    FOR EACH ROW
    EXECUTE FUNCTION create_alert_for_critical_event();

-- =====================================================
-- 7. MATERIALIZED VIEWS FOR PERFORMANCE
-- =====================================================

-- Dashboard summary view for fast queries
CREATE MATERIALIZED VIEW monitoring_dashboard_summary AS
SELECT
    DATE_TRUNC('hour', detection_timestamp) as hour,
    event_type,
    severity,
    COUNT(*) as event_count,
    COUNT(*) FILTER (WHERE status = 'OPEN') as open_events,
    COUNT(*) FILTER (WHERE status = 'RESOLVED') as resolved_events,
    AVG(affected_amount) as avg_amount,
    SUM(affected_amount) as total_amount,
    AVG(confidence_score) as avg_confidence
FROM monitoring_events
WHERE detection_timestamp > NOW() - INTERVAL '48 hours'
GROUP BY hour, event_type, severity
ORDER BY hour DESC, event_type, severity;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX idx_monitoring_dashboard_summary_unique
ON monitoring_dashboard_summary(hour, event_type, severity);

-- System health trend view
CREATE MATERIALIZED VIEW system_health_trend AS
SELECT
    DATE_TRUNC('hour', snapshot_timestamp) as hour,
    AVG(success_rate_percent) as avg_success_rate,
    AVG(nfc_success_rate_percent) as avg_nfc_success_rate,
    AVG(total_transactions_last_hour) as avg_transactions_per_hour,
    AVG(critical_events_last_hour) as avg_critical_events,
    COUNT(*) FILTER (WHERE overall_health_status = 'HEALTHY') as healthy_snapshots,
    COUNT(*) FILTER (WHERE overall_health_status = 'WARNING') as warning_snapshots,
    COUNT(*) FILTER (WHERE overall_health_status = 'CRITICAL') as critical_snapshots,
    COUNT(*) as total_snapshots
FROM system_health_snapshots
WHERE snapshot_timestamp > NOW() - INTERVAL '7 days'
GROUP BY hour
ORDER BY hour DESC;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX idx_system_health_trend_unique
ON system_health_trend(hour);

-- =====================================================
-- 8. SCHEDULED FUNCTIONS AND MAINTENANCE
-- =====================================================

-- Function to refresh materialized views
CREATE OR REPLACE FUNCTION refresh_monitoring_views()
RETURNS JSONB AS $$
DECLARE
    v_start_time TIMESTAMPTZ;
    v_result JSONB;
BEGIN
    v_start_time := NOW();
    
    -- Refresh dashboard summary
    REFRESH MATERIALIZED VIEW CONCURRENTLY monitoring_dashboard_summary;
    
    -- Refresh health trend
    REFRESH MATERIALIZED VIEW CONCURRENTLY system_health_trend;
    
    v_result := jsonb_build_object(
        'refresh_timestamp', NOW(),
        'duration_seconds', EXTRACT(EPOCH FROM (NOW() - v_start_time)),
        'views_refreshed', ARRAY['monitoring_dashboard_summary', 'system_health_trend'],
        'success', true
    );
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Function to run all detection algorithms
CREATE OR REPLACE FUNCTION run_monitoring_detection_cycle()
RETURNS JSONB AS $$
DECLARE
    v_start_time TIMESTAMPTZ;
    v_transaction_result JSONB;
    v_balance_result JSONB;
    v_nfc_result JSONB;
    v_race_result JSONB;
    v_health_snapshot_id BIGINT;
    v_total_events INTEGER := 0;
    v_result JSONB;
BEGIN
    v_start_time := NOW();
    
    -- Run critical detection algorithms
    BEGIN
        SELECT detect_transaction_failures() INTO v_transaction_result;
        v_total_events := v_total_events + (v_transaction_result->>'events_created')::INTEGER;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Transaction failure detection failed: %', SQLERRM;
        v_transaction_result := jsonb_build_object('error', SQLERRM, 'events_created', 0);
    END;
    
    BEGIN
        SELECT detect_balance_discrepancies() INTO v_balance_result;
        v_total_events := v_total_events + (v_balance_result->>'events_created')::INTEGER;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Balance discrepancy detection failed: %', SQLERRM;
        v_balance_result := jsonb_build_object('error', SQLERRM, 'events_created', 0);
    END;
    
    -- Run medium priority detection algorithms
    BEGIN
        SELECT detect_duplicate_nfc_scans() INTO v_nfc_result;
        v_total_events := v_total_events + (v_nfc_result->>'events_created')::INTEGER;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Duplicate NFC detection failed: %', SQLERRM;
        v_nfc_result := jsonb_build_object('error', SQLERRM, 'events_created', 0);
    END;
    
    BEGIN
        SELECT detect_race_conditions() INTO v_race_result;
        v_total_events := v_total_events + (v_race_result->>'events_created')::INTEGER;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Race condition detection failed: %', SQLERRM;
        v_race_result := jsonb_build_object('error', SQLERRM, 'events_created', 0);
    END;
    
    -- Update system health snapshot
    BEGIN
        SELECT update_system_health_snapshot() INTO v_health_snapshot_id;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'System health snapshot failed: %', SQLERRM;
        v_health_snapshot_id := NULL;
    END;
    
    -- Build comprehensive result
    v_result := jsonb_build_object(
        'cycle_timestamp', NOW(),
        'cycle_duration_seconds', EXTRACT(EPOCH FROM (NOW() - v_start_time)),
        'total_events_created', v_total_events,
        'health_snapshot_id', v_health_snapshot_id,
        'detection_results', jsonb_build_object(
            'transaction_failures', v_transaction_result,
            'balance_discrepancies', v_balance_result,
            'duplicate_nfc_scans', v_nfc_result,
            'race_conditions', v_race_result
        ),
        'success', true
    );
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 9. SECURITY AND PERMISSIONS
-- =====================================================

-- Create monitoring role for read-only access
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'monitoring_reader') THEN
        CREATE ROLE monitoring_reader;
    END IF;
END
$$;

-- Grant read permissions to monitoring tables
GRANT SELECT ON monitoring_events TO monitoring_reader;
GRANT SELECT ON system_health_snapshots TO monitoring_reader;
GRANT SELECT ON alert_history TO monitoring_reader;
GRANT SELECT ON monitoring_dashboard_summary TO monitoring_reader;
GRANT SELECT ON system_health_trend TO monitoring_reader;

-- Create monitoring writer role for detection functions
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'monitoring_writer') THEN
        CREATE ROLE monitoring_writer;
    END IF;
END
$$;

-- Grant necessary permissions to monitoring writer
GRANT SELECT, INSERT, UPDATE ON monitoring_events TO monitoring_writer;
GRANT SELECT, INSERT ON system_health_snapshots TO monitoring_writer;
GRANT SELECT, INSERT, UPDATE ON alert_history TO monitoring_writer;
GRANT SELECT ON app_transaction_log TO monitoring_writer;
GRANT SELECT ON table_cards TO monitoring_writer;
GRANT SELECT ON nfc_scan_log TO monitoring_writer;
GRANT USAGE ON SEQUENCE monitoring_events_event_id_seq TO monitoring_writer;
GRANT USAGE ON SEQUENCE system_health_snapshots_snapshot_id_seq TO monitoring_writer;
GRANT USAGE ON SEQUENCE alert_history_alert_id_seq TO monitoring_writer;

-- Grant execution permissions on monitoring functions
GRANT EXECUTE ON FUNCTION create_monitoring_event TO monitoring_writer;
GRANT EXECUTE ON FUNCTION update_system_health_snapshot TO monitoring_writer;
GRANT EXECUTE ON FUNCTION detect_transaction_failures TO monitoring_writer;
GRANT EXECUTE ON FUNCTION detect_balance_discrepancies TO monitoring_writer;
GRANT EXECUTE ON FUNCTION detect_duplicate_nfc_scans TO monitoring_writer;
GRANT EXECUTE ON FUNCTION detect_race_conditions TO monitoring_writer;
GRANT EXECUTE ON FUNCTION run_monitoring_detection_cycle TO monitoring_writer;

-- =====================================================
-- 10. INITIAL DATA AND CONFIGURATION
-- =====================================================

-- Insert initial system health snapshot
INSERT INTO system_health_snapshots (
    total_transactions_last_hour,
    successful_transactions_last_hour,
    failed_transactions_last_hour,
    success_rate_percent,
    total_nfc_scans_last_hour,
    duplicate_nfc_scans_last_hour,
    nfc_success_rate_percent,
    active_cards_count,
    total_system_balance,
    monitoring_events_last_hour,
    critical_events_last_hour,
    overall_health_status,
    metrics_data
) VALUES (
    0, 0, 0, 100.0, 0, 0, 100.0,
    (SELECT COUNT(*) FROM table_cards WHERE amount > 0),
    (SELECT COALESCE(SUM(amount), 0) FROM table_cards),
    0, 0, 'HEALTHY',
    jsonb_build_object(
        'initialization_timestamp', NOW(),
        'migration_version', '20250614_155252_phase4_monitoring',
        'system_initialized', true
    )
);

-- Create initial monitoring event to test the system
SELECT create_monitoring_event(
    'system_health',
    'INFO',
    'system_initialization',
    NULL,
    NULL,
    NULL,
    1.0,
    jsonb_build_object(
        'migration_completed', true,
        'tables_created', ARRAY['monitoring_events', 'system_health_snapshots', 'alert_history'],
        'functions_created', ARRAY[
            'create_monitoring_event',
            'update_system_health_snapshot',
            'cleanup_monitoring_data',
            'detect_transaction_failures',
            'detect_balance_discrepancies',
            'detect_duplicate_nfc_scans',
            'detect_race_conditions',
            'run_monitoring_detection_cycle'
        ]
    ),
    jsonb_build_object(
        'initialization_time', NOW(),
        'ready_for_production', true,
        'next_steps', 'Configure scheduled detection cycles'
    )
);

-- =====================================================
-- 11. PERFORMANCE OPTIMIZATION
-- =====================================================

-- Set table storage parameters for better performance
ALTER TABLE monitoring_events SET (
    fillfactor = 90,
    autovacuum_vacuum_scale_factor = 0.1,
    autovacuum_analyze_scale_factor = 0.05
);

ALTER TABLE system_health_snapshots SET (
    fillfactor = 95,
    autovacuum_vacuum_scale_factor = 0.2
);

ALTER TABLE alert_history SET (
    fillfactor = 90,
    autovacuum_vacuum_scale_factor = 0.1
);

-- =====================================================
-- 12. COMMENTS AND DOCUMENTATION
-- =====================================================

-- Table comments
COMMENT ON TABLE monitoring_events IS 'Core monitoring events storage for Phase 4 monitoring system. Stores all detected anomalies and system events with full context and resolution tracking.';
COMMENT ON TABLE system_health_snapshots IS 'System health metrics snapshots taken at regular intervals. Used for trend analysis and dashboard displays.';
COMMENT ON TABLE alert_history IS 'Alert escalation and acknowledgment tracking. Links to monitoring events and tracks resolution times.';

-- Function comments
COMMENT ON FUNCTION create_monitoring_event IS 'Creates a new monitoring event with validation and proper JSON structure. Used by all detection algorithms.';
COMMENT ON FUNCTION update_system_health_snapshot IS 'Calculates and stores current system health metrics. Should be called every 5 minutes.';
COMMENT ON FUNCTION cleanup_monitoring_data IS 'Removes old monitoring data based on retention policy. Should be run daily.';
COMMENT ON FUNCTION detect_transaction_failures IS 'Critical priority detection for transaction failures including balance deduction on failed transactions.';
COMMENT ON FUNCTION detect_balance_discrepancies IS 'Critical priority detection for balance mismatches and negative balances.';
COMMENT ON FUNCTION detect_duplicate_nfc_scans IS 'Medium priority detection for duplicate NFC scans within temporal windows.';
COMMENT ON FUNCTION detect_race_conditions IS 'Medium priority detection for concurrent transactions that may indicate race conditions.';
COMMENT ON FUNCTION run_monitoring_detection_cycle IS 'Runs all detection algorithms in a single cycle with error handling and comprehensive reporting.';

-- =====================================================
-- MIGRATION COMPLETION
-- =====================================================

-- Log successful migration completion
DO $$
BEGIN
    RAISE NOTICE '=================================================';
    RAISE NOTICE 'Phase 4 Monitoring System Migration Completed';
    RAISE NOTICE '=================================================';
    RAISE NOTICE 'Migration: 20250614_155252_phase4_monitoring.sql';
    RAISE NOTICE 'Timestamp: %', NOW();
    RAISE NOTICE 'Tables Created: 3 (monitoring_events, system_health_snapshots, alert_history)';
    RAISE NOTICE 'Functions Created: 8 detection and utility functions';
    RAISE NOTICE 'Indexes Created: 15+ performance indexes';
    RAISE NOTICE 'Materialized Views: 2 dashboard views';
    RAISE NOTICE 'Triggers: 2 automation triggers';
    RAISE NOTICE 'Roles: 2 security roles (monitoring_reader, monitoring_writer)';
    RAISE NOTICE '=================================================';
    RAISE NOTICE 'Next Steps:';
    RAISE NOTICE '1. Configure scheduled execution of run_monitoring_detection_cycle()';
    RAISE NOTICE '2. Set up materialized view refresh schedule';
    RAISE NOTICE '3. Configure alert notifications';
    RAISE NOTICE '4. Test detection algorithms with sample data';
    RAISE NOTICE '=================================================';
END $$;