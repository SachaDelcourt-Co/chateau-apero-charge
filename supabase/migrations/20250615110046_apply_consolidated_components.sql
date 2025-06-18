-- =====================================================
-- Consolidated Missing Components Migration
-- =====================================================
-- Description: Adds all missing database components required by the implementation plan
--              This migration is production-safe and only ADDS missing components
-- Author: Comprehensive Schema Analysis
-- Date: 2025-06-15
-- Version: 1.0.0
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- =====================================================
-- 1. MISSING INDEXES FOR PERFORMANCE OPTIMIZATION
-- =====================================================

-- Additional indexes for table_cards
CREATE INDEX IF NOT EXISTS idx_table_cards_updated_at ON table_cards(updated_at);
CREATE INDEX IF NOT EXISTS idx_table_cards_created_at ON table_cards(created_at);

-- Additional indexes for bar_orders
CREATE INDEX IF NOT EXISTS idx_bar_orders_status ON bar_orders(status);
CREATE INDEX IF NOT EXISTS idx_bar_orders_point_of_sale ON bar_orders(point_of_sale);
CREATE INDEX IF NOT EXISTS idx_bar_orders_total_amount ON bar_orders(total_amount);
CREATE INDEX IF NOT EXISTS idx_bar_orders_updated_at ON bar_orders(updated_at);

-- Additional indexes for bar_order_items
CREATE INDEX IF NOT EXISTS idx_bar_order_items_product_name ON bar_order_items(product_name);
CREATE INDEX IF NOT EXISTS idx_bar_order_items_price ON bar_order_items(price);
CREATE INDEX IF NOT EXISTS idx_bar_order_items_is_deposit ON bar_order_items(is_deposit);
CREATE INDEX IF NOT EXISTS idx_bar_order_items_is_return ON bar_order_items(is_return);
CREATE INDEX IF NOT EXISTS idx_bar_order_items_created_at ON bar_order_items(created_at);

-- Additional indexes for recharges
CREATE INDEX IF NOT EXISTS idx_recharges_amount ON recharges(amount);
CREATE INDEX IF NOT EXISTS idx_recharges_paid_by_card ON recharges(paid_by_card);
CREATE INDEX IF NOT EXISTS idx_recharges_staff_id ON recharges(staff_id);
CREATE INDEX IF NOT EXISTS idx_recharges_checkpoint_id ON recharges(checkpoint_id);
CREATE INDEX IF NOT EXISTS idx_recharges_stripe_session_id ON recharges(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_recharges_updated_at ON recharges(updated_at);

-- Additional indexes for idempotency_keys
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_source_function ON idempotency_keys(source_function);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_status ON idempotency_keys(status);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at ON idempotency_keys(created_at);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_updated_at ON idempotency_keys(updated_at);

-- Additional indexes for app_transaction_log
CREATE INDEX IF NOT EXISTS idx_transaction_log_correlation_id ON app_transaction_log(correlation_id);
CREATE INDEX IF NOT EXISTS idx_transaction_log_edge_function_name ON app_transaction_log(edge_function_name);
CREATE INDEX IF NOT EXISTS idx_transaction_log_edge_function_request_id ON app_transaction_log(edge_function_request_id);
CREATE INDEX IF NOT EXISTS idx_transaction_log_amount_involved ON app_transaction_log(amount_involved);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_bar_orders_card_status_date ON bar_orders(card_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_recharges_card_date_amount ON recharges(id_card, created_at, amount);
CREATE INDEX IF NOT EXISTS idx_transaction_log_card_type_date ON app_transaction_log(card_id, transaction_type, timestamp);

-- =====================================================
-- 2. MISSING STORED PROCEDURES AND FUNCTIONS
-- =====================================================

-- Function to get card balance with transaction history
CREATE OR REPLACE FUNCTION get_card_balance_with_history(
    card_id_in TEXT,
    limit_transactions INTEGER DEFAULT 10
) RETURNS JSONB AS $$
DECLARE
    current_balance DECIMAL(10, 2);
    transaction_history JSONB;
    result JSONB;
BEGIN
    -- Get current balance
    SELECT amount INTO current_balance
    FROM table_cards
    WHERE id = card_id_in;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Card not found',
            'card_id', card_id_in
        );
    END IF;
    
    -- Get recent transaction history
    SELECT jsonb_agg(
        jsonb_build_object(
            'transaction_id', transaction_id,
            'transaction_type', transaction_type,
            'status', status,
            'amount_involved', amount_involved,
            'previous_balance', previous_balance,
            'new_balance', new_balance,
            'timestamp', timestamp,
            'details', details
        ) ORDER BY timestamp DESC
    ) INTO transaction_history
    FROM (
        SELECT *
        FROM app_transaction_log
        WHERE card_id = card_id_in
        ORDER BY timestamp DESC
        LIMIT limit_transactions
    ) recent_transactions;
    
    -- Build result
    result := jsonb_build_object(
        'success', true,
        'card_id', card_id_in,
        'current_balance', current_balance,
        'transaction_history', COALESCE(transaction_history, '[]'::jsonb),
        'query_timestamp', NOW()
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to validate card balance integrity
CREATE OR REPLACE FUNCTION validate_card_balance_integrity(
    card_id_in TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    validation_record RECORD;
    discrepancies JSONB := '[]'::jsonb;
    total_discrepancies INTEGER := 0;
    result JSONB;
BEGIN
    -- Validate specific card or all cards
    FOR validation_record IN
        WITH calculated_balances AS (
            SELECT 
                card_id,
                SUM(CASE 
                    WHEN transaction_type IN ('stripe_recharge', 'checkpoint_recharge') 
                      AND status = 'completed' THEN amount_involved
                    WHEN transaction_type = 'bar_order' 
                      AND status = 'completed' THEN -amount_involved
                    ELSE 0
                END) as calculated_balance,
                COUNT(*) as transaction_count
            FROM app_transaction_log
            WHERE (card_id_in IS NULL OR card_id = card_id_in)
            GROUP BY card_id
        )
        SELECT 
            c.id as card_id,
            c.amount as actual_balance,
            COALESCE(cb.calculated_balance, 0) as calculated_balance,
            ABS(c.amount - COALESCE(cb.calculated_balance, 0)) as discrepancy,
            cb.transaction_count
        FROM table_cards c
        LEFT JOIN calculated_balances cb ON cb.card_id = c.id
        WHERE (card_id_in IS NULL OR c.id = card_id_in)
          AND ABS(c.amount - COALESCE(cb.calculated_balance, 0)) > 0.01
    LOOP
        discrepancies := discrepancies || jsonb_build_object(
            'card_id', validation_record.card_id,
            'actual_balance', validation_record.actual_balance,
            'calculated_balance', validation_record.calculated_balance,
            'discrepancy', validation_record.discrepancy,
            'transaction_count', validation_record.transaction_count
        );
        total_discrepancies := total_discrepancies + 1;
    END LOOP;
    
    result := jsonb_build_object(
        'validation_timestamp', NOW(),
        'card_id_filter', card_id_in,
        'total_discrepancies', total_discrepancies,
        'discrepancies', discrepancies,
        'integrity_status', CASE WHEN total_discrepancies = 0 THEN 'VALID' ELSE 'INVALID' END
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to get system statistics
CREATE OR REPLACE FUNCTION get_system_statistics(
    time_window_hours INTEGER DEFAULT 24
) RETURNS JSONB AS $$
DECLARE
    stats JSONB;
    card_stats JSONB;
    transaction_stats JSONB;
    nfc_stats JSONB;
    system_health JSONB;
BEGIN
    -- Card statistics
    SELECT jsonb_build_object(
        'total_cards', COUNT(*),
        'active_cards', COUNT(*) FILTER (WHERE amount > 0),
        'total_balance', COALESCE(SUM(amount), 0),
        'avg_balance', COALESCE(AVG(amount), 0),
        'max_balance', COALESCE(MAX(amount), 0),
        'min_balance', COALESCE(MIN(amount), 0)
    ) INTO card_stats
    FROM table_cards;
    
    -- Transaction statistics
    SELECT jsonb_build_object(
        'total_transactions', COUNT(*),
        'successful_transactions', COUNT(*) FILTER (WHERE status = 'completed'),
        'failed_transactions', COUNT(*) FILTER (WHERE status = 'failed'),
        'success_rate_percent', CASE 
            WHEN COUNT(*) > 0 THEN 
                ROUND((COUNT(*) FILTER (WHERE status = 'completed')::DECIMAL / COUNT(*)) * 100, 2)
            ELSE 0 
        END,
        'total_volume', COALESCE(SUM(amount_involved) FILTER (WHERE status = 'completed'), 0),
        'avg_transaction_amount', COALESCE(AVG(amount_involved) FILTER (WHERE status = 'completed'), 0),
        'transaction_types', jsonb_object_agg(
            transaction_type, 
            COUNT(*) FILTER (WHERE status = 'completed')
        )
    ) INTO transaction_stats
    FROM app_transaction_log
    WHERE timestamp > NOW() - (time_window_hours || ' hours')::INTERVAL;
    
    -- NFC scan statistics
    SELECT jsonb_build_object(
        'total_scans', COUNT(*),
        'successful_scans', COUNT(*) FILTER (WHERE scan_status = 'success'),
        'failed_scans', COUNT(*) FILTER (WHERE scan_status != 'success'),
        'success_rate_percent', CASE 
            WHEN COUNT(*) > 0 THEN 
                ROUND((COUNT(*) FILTER (WHERE scan_status = 'success')::DECIMAL / COUNT(*)) * 100, 2)
            ELSE 0 
        END,
        'scan_statuses', jsonb_object_agg(scan_status, COUNT(*))
    ) INTO nfc_stats
    FROM nfc_scan_log
    WHERE scan_timestamp > NOW() - (time_window_hours || ' hours')::INTERVAL;
    
    -- System health indicators (skip if monitoring_events table doesn't exist)
    BEGIN
        SELECT jsonb_build_object(
            'monitoring_events_count', COUNT(*),
            'critical_events_count', COUNT(*) FILTER (WHERE severity = 'CRITICAL'),
            'open_events_count', COUNT(*) FILTER (WHERE status = 'OPEN'),
            'event_types', jsonb_object_agg(event_type, COUNT(*))
        ) INTO system_health
        FROM monitoring_events
        WHERE detection_timestamp > NOW() - (time_window_hours || ' hours')::INTERVAL;
    EXCEPTION
        WHEN undefined_table THEN
            system_health := jsonb_build_object(
                'monitoring_events_count', 0,
                'critical_events_count', 0,
                'open_events_count', 0,
                'event_types', '{}'::jsonb,
                'note', 'monitoring_events table not found'
            );
    END;
    
    -- Combine all statistics
    stats := jsonb_build_object(
        'statistics_timestamp', NOW(),
        'time_window_hours', time_window_hours,
        'cards', card_stats,
        'transactions', transaction_stats,
        'nfc_scans', nfc_stats,
        'system_health', system_health
    );
    
    RETURN stats;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 3. MISSING TRIGGERS FOR AUTOMATION
-- =====================================================

-- Trigger to update updated_at timestamp on table_cards
CREATE OR REPLACE FUNCTION update_table_cards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_table_cards_updated_at') THEN
        CREATE TRIGGER trigger_table_cards_updated_at
            BEFORE UPDATE ON table_cards
            FOR EACH ROW
            EXECUTE FUNCTION update_table_cards_updated_at();
    END IF;
END $$;

-- Trigger to update updated_at timestamp on bar_orders
CREATE OR REPLACE FUNCTION update_bar_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_bar_orders_updated_at') THEN
        CREATE TRIGGER trigger_bar_orders_updated_at
            BEFORE UPDATE ON bar_orders
            FOR EACH ROW
            EXECUTE FUNCTION update_bar_orders_updated_at();
    END IF;
END $$;

-- Trigger to update updated_at timestamp on recharges
CREATE OR REPLACE FUNCTION update_recharges_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_recharges_updated_at') THEN
        CREATE TRIGGER trigger_recharges_updated_at
            BEFORE UPDATE ON recharges
            FOR EACH ROW
            EXECUTE FUNCTION update_recharges_updated_at();
    END IF;
END $$;

-- =====================================================
-- 4. MISSING MATERIALIZED VIEW FOR ANALYTICS
-- =====================================================

-- Transaction analytics materialized view
CREATE MATERIALIZED VIEW IF NOT EXISTS transaction_analytics AS
SELECT
    DATE_TRUNC('hour', timestamp) as hour,
    transaction_type,
    status,
    COUNT(*) as transaction_count,
    SUM(amount_involved) as total_amount,
    AVG(amount_involved) as avg_amount,
    MIN(amount_involved) as min_amount,
    MAX(amount_involved) as max_amount,
    COUNT(DISTINCT card_id) as unique_cards
FROM app_transaction_log
WHERE timestamp > NOW() - INTERVAL '7 days'
GROUP BY hour, transaction_type, status
ORDER BY hour DESC, transaction_type, status;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_transaction_analytics_unique
ON transaction_analytics(hour, transaction_type, status);

-- =====================================================
-- 5. ENHANCED CLEANUP AND MAINTENANCE FUNCTIONS
-- =====================================================

-- Comprehensive cleanup function
CREATE OR REPLACE FUNCTION comprehensive_system_cleanup(
    transaction_log_retention_days INTEGER DEFAULT 90,
    nfc_log_retention_days INTEGER DEFAULT 30,
    monitoring_retention_days INTEGER DEFAULT 30,
    idempotency_retention_hours INTEGER DEFAULT 24
) RETURNS JSONB AS $$
DECLARE
    deleted_transactions INTEGER;
    deleted_nfc_logs INTEGER;
    deleted_monitoring INTEGER;
    deleted_idempotency INTEGER;
    deleted_locks INTEGER;
    result JSONB;
BEGIN
    -- Clean up old transaction logs
    DELETE FROM app_transaction_log 
    WHERE timestamp < NOW() - (transaction_log_retention_days || ' days')::INTERVAL;
    GET DIAGNOSTICS deleted_transactions = ROW_COUNT;
    
    -- Clean up old NFC scan logs
    DELETE FROM nfc_scan_log 
    WHERE scan_timestamp < NOW() - (nfc_log_retention_days || ' days')::INTERVAL;
    GET DIAGNOSTICS deleted_nfc_logs = ROW_COUNT;
    
    -- Clean up old monitoring events (skip if table doesn't exist)
    BEGIN
        DELETE FROM monitoring_events 
        WHERE detection_timestamp < NOW() - (monitoring_retention_days || ' days')::INTERVAL;
        GET DIAGNOSTICS deleted_monitoring = ROW_COUNT;
    EXCEPTION
        WHEN undefined_table THEN
            deleted_monitoring := 0;
    END;
    
    -- Clean up expired idempotency keys
    DELETE FROM idempotency_keys 
    WHERE expires_at < NOW() OR created_at < NOW() - (idempotency_retention_hours || ' hours')::INTERVAL;
    GET DIAGNOSTICS deleted_idempotency = ROW_COUNT;
    
    -- Clean up expired NFC operation locks (skip if table doesn't exist)
    BEGIN
        DELETE FROM nfc_operation_locks 
        WHERE expires_at < NOW();
        GET DIAGNOSTICS deleted_locks = ROW_COUNT;
    EXCEPTION
        WHEN undefined_table THEN
            deleted_locks := 0;
    END;
    
    -- Update table statistics
    ANALYZE app_transaction_log;
    ANALYZE nfc_scan_log;
    ANALYZE idempotency_keys;
    
    -- Refresh materialized views
    REFRESH MATERIALIZED VIEW CONCURRENTLY transaction_analytics;
    
    result := jsonb_build_object(
        'cleanup_timestamp', NOW(),
        'deleted_records', jsonb_build_object(
            'transaction_logs', deleted_transactions,
            'nfc_logs', deleted_nfc_logs,
            'monitoring_events', deleted_monitoring,
            'idempotency_keys', deleted_idempotency,
            'nfc_locks', deleted_locks
        ),
        'retention_policies', jsonb_build_object(
            'transaction_log_days', transaction_log_retention_days,
            'nfc_log_days', nfc_log_retention_days,
            'monitoring_days', monitoring_retention_days,
            'idempotency_hours', idempotency_retention_hours
        ),
        'success', true
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 6. MISSING CONSTRAINTS AND VALIDATIONS
-- =====================================================

-- Add check constraints for data integrity
DO $$
BEGIN
    -- Ensure positive amounts in table_cards
    IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints 
                   WHERE constraint_name = 'check_table_cards_amount_non_negative') THEN
        ALTER TABLE table_cards ADD CONSTRAINT check_table_cards_amount_non_negative 
        CHECK (amount >= 0);
    END IF;
    
    -- Ensure positive amounts in bar_orders
    IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints 
                   WHERE constraint_name = 'check_bar_orders_amount_positive') THEN
        ALTER TABLE bar_orders ADD CONSTRAINT check_bar_orders_amount_positive 
        CHECK (total_amount > 0);
    END IF;
    
    -- Ensure positive amounts in recharges
    IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints 
                   WHERE constraint_name = 'check_recharges_amount_positive') THEN
        ALTER TABLE recharges ADD CONSTRAINT check_recharges_amount_positive 
        CHECK (amount > 0);
    END IF;
    
    -- Ensure positive quantities in bar_order_items
    IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints 
                   WHERE constraint_name = 'check_bar_order_items_quantity_positive') THEN
        ALTER TABLE bar_order_items ADD CONSTRAINT check_bar_order_items_quantity_positive 
        CHECK (quantity > 0);
    END IF;
    
    -- Ensure positive prices in bar_order_items
    IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints 
                   WHERE constraint_name = 'check_bar_order_items_price_positive') THEN
        ALTER TABLE bar_order_items ADD CONSTRAINT check_bar_order_items_price_positive 
        CHECK (price > 0);
    END IF;
END $$;

-- =====================================================
-- 7. PERFORMANCE OPTIMIZATION SETTINGS
-- =====================================================

-- Set optimal storage parameters for high-traffic tables
ALTER TABLE app_transaction_log SET (
    fillfactor = 90,
    autovacuum_vacuum_scale_factor = 0.1,
    autovacuum_analyze_scale_factor = 0.05
);

ALTER TABLE nfc_scan_log SET (
    fillfactor = 85,
    autovacuum_vacuum_scale_factor = 0.1,
    autovacuum_analyze_scale_factor = 0.05
);

ALTER TABLE idempotency_keys SET (
    fillfactor = 80,
    autovacuum_vacuum_scale_factor = 0.2,
    autovacuum_analyze_scale_factor = 0.1
);

-- =====================================================
-- 8. COMPREHENSIVE DOCUMENTATION
-- =====================================================

-- Add comprehensive comments for all new functions
COMMENT ON FUNCTION get_card_balance_with_history IS 'Retrieves card balance with recent transaction history for detailed card analysis';
COMMENT ON FUNCTION validate_card_balance_integrity IS 'Validates card balance integrity by comparing actual vs calculated balances from transaction history';
COMMENT ON FUNCTION get_system_statistics IS 'Provides comprehensive system statistics including cards, transactions, NFC scans, and system health metrics';
COMMENT ON FUNCTION comprehensive_system_cleanup IS 'Performs comprehensive cleanup of old data across all tables with configurable retention policies';

-- Add comments for materialized views
COMMENT ON MATERIALIZED VIEW transaction_analytics IS 'Hourly transaction analytics for performance monitoring and business intelligence';

-- Add comments for new indexes
COMMENT ON INDEX idx_bar_orders_card_status_date IS 'Composite index for efficient card order history queries';
COMMENT ON INDEX idx_recharges_card_date_amount IS 'Composite index for efficient card recharge history queries';
COMMENT ON INDEX idx_transaction_log_card_type_date IS 'Composite index for efficient transaction log queries by card and type';

-- =====================================================
-- MIGRATION COMPLETION LOG
-- =====================================================

-- Log successful migration completion
DO $$
BEGIN
    RAISE NOTICE '=================================================';
    RAISE NOTICE 'Consolidated Missing Components Migration Completed';
    RAISE NOTICE '=================================================';
    RAISE NOTICE 'Migration: 20250615110046_apply_consolidated_components.sql';
    RAISE NOTICE 'Timestamp: %', NOW();
    RAISE NOTICE 'Components Added:';
    RAISE NOTICE '- 25+ Performance Indexes';
    RAISE NOTICE '- 3 New Stored Procedures/Functions';
    RAISE NOTICE '- 3 Update Triggers';
    RAISE NOTICE '- 1 Analytics Materialized View';
    RAISE NOTICE '- 1 Comprehensive Cleanup Function';
    RAISE NOTICE '- 5 Data Integrity Constraints';
    RAISE NOTICE '- Performance Optimization Settings';
    RAISE NOTICE '=================================================';
    RAISE NOTICE 'Database Schema Status: COMPLETE';
    RAISE NOTICE 'All missing components have been safely added';
    RAISE NOTICE '=================================================';
END $$;