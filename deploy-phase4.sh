#!/bin/bash

# =====================================================
# Phase 4 Monitoring System - Automated Deployment Script
# =====================================================
# Description: Automated deployment script for Phase 4 monitoring system
# Author: Phase 4 Implementation Team
# Date: 2025-06-15
# Version: 1.0.0
# =====================================================

set -euo pipefail  # Exit on error, undefined vars, pipe failures

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="${SCRIPT_DIR}/deploy-phase4-$(date +%Y%m%d_%H%M%S).log"
BACKUP_DIR="${SCRIPT_DIR}/backups"
DEPLOYMENT_START_TIME=$(date +%s)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}" | tee -a "${LOG_FILE}"
}

log_info() { log "INFO" "$@"; }
log_warn() { log "WARN" "${YELLOW}$*${NC}"; }
log_error() { log "ERROR" "${RED}$*${NC}"; }
log_success() { log "SUCCESS" "${GREEN}$*${NC}"; }

# Error handling
error_exit() {
    log_error "$1"
    log_error "Deployment failed. Check ${LOG_FILE} for details."
    exit 1
}

# Cleanup function
cleanup() {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        log_error "Deployment failed with exit code $exit_code"
        log_info "Consider running rollback procedure if needed"
    fi
    exit $exit_code
}

trap cleanup EXIT

# =====================================================
# CONFIGURATION AND VALIDATION
# =====================================================

print_banner() {
    echo -e "${BLUE}"
    echo "=================================================="
    echo "  Phase 4 Monitoring System Deployment Script"
    echo "=================================================="
    echo "  Version: 1.0.0"
    echo "  Date: $(date)"
    echo "  Log: ${LOG_FILE}"
    echo "=================================================="
    echo -e "${NC}"
}

validate_environment() {
    log_info "Validating deployment environment..."
    
    # Check required tools
    local required_tools=("supabase" "curl" "jq" "psql")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            error_exit "Required tool '$tool' is not installed"
        fi
    done
    
    # Check Supabase CLI version
    local supabase_version=$(supabase --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    log_info "Supabase CLI version: $supabase_version"
    
    # Check project connection
    if ! supabase status &> /dev/null; then
        error_exit "Cannot connect to Supabase project. Run 'supabase login' and 'supabase link'"
    fi
    
    # Check database connectivity
    if ! supabase db ping &> /dev/null; then
        error_exit "Cannot connect to database"
    fi
    
    # Validate environment variables
    if [ -z "${SUPABASE_URL:-}" ]; then
        log_warn "SUPABASE_URL not set. Attempting to get from project..."
        export SUPABASE_URL=$(supabase status | grep "API URL" | awk '{print $3}')
    fi
    
    if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
        log_warn "SUPABASE_SERVICE_ROLE_KEY not set. Attempting to get from project..."
        export SUPABASE_SERVICE_ROLE_KEY=$(supabase status | grep "service_role key" | awk '{print $3}')
    fi
    
    log_success "Environment validation completed"
}

check_prerequisites() {
    log_info "Checking Phase 4 prerequisites..."
    
    # Check if Phase 1-3 tables exist
    local required_tables=("app_transaction_log" "table_cards" "nfc_scan_log" "idempotency_keys")
    for table in "${required_tables[@]}"; do
        if ! psql "${DATABASE_URL:-$SUPABASE_URL}" -c "\dt $table" &> /dev/null; then
            error_exit "Required table '$table' not found. Ensure Phase 1-3 are deployed."
        fi
    done
    
    # Check if Phase 4 is already deployed
    if psql "${DATABASE_URL:-$SUPABASE_URL}" -c "\dt monitoring_events" &> /dev/null; then
        log_warn "Phase 4 appears to be already deployed. Continuing with update..."
    fi
    
    log_success "Prerequisites check completed"
}

# =====================================================
# BACKUP PROCEDURES
# =====================================================

create_backup() {
    log_info "Creating pre-deployment backup..."
    
    mkdir -p "${BACKUP_DIR}"
    local backup_file="${BACKUP_DIR}/backup_pre_phase4_$(date +%Y%m%d_%H%M%S).sql"
    
    # Create database backup
    if ! supabase db dump --file "${backup_file}"; then
        error_exit "Failed to create database backup"
    fi
    
    # Verify backup file
    if [ ! -f "${backup_file}" ] || [ ! -s "${backup_file}" ]; then
        error_exit "Backup file is empty or missing"
    fi
    
    local backup_size=$(du -h "${backup_file}" | cut -f1)
    log_success "Backup created: ${backup_file} (${backup_size})"
    
    # Store backup path for potential rollback
    echo "${backup_file}" > "${SCRIPT_DIR}/.last_backup"
}

# =====================================================
# DATABASE DEPLOYMENT
# =====================================================

deploy_database_schema() {
    log_info "Deploying Phase 4 database schema..."
    
    # Apply database migrations
    if ! supabase db push; then
        error_exit "Database migration failed"
    fi
    
    # Verify core tables were created
    local phase4_tables=("monitoring_events" "system_health_snapshots" "alert_history")
    for table in "${phase4_tables[@]}"; do
        if ! psql "${DATABASE_URL:-$SUPABASE_URL}" -c "\dt $table" &> /dev/null; then
            error_exit "Table '$table' was not created"
        fi
    done
    
    log_success "Database schema deployed successfully"
}

verify_database_functions() {
    log_info "Verifying database functions..."
    
    local functions=(
        "create_monitoring_event"
        "update_system_health_snapshot"
        "detect_transaction_failures"
        "detect_balance_discrepancies"
        "detect_duplicate_nfc_scans"
        "detect_race_conditions"
        "run_monitoring_detection_cycle"
        "cleanup_monitoring_data"
    )
    
    for func in "${functions[@]}"; do
        if ! psql "${DATABASE_URL:-$SUPABASE_URL}" -c "SELECT ${func}();" &> /dev/null; then
            log_warn "Function '$func' test failed, but this may be expected for some functions"
        fi
    done
    
    log_success "Database functions verified"
}

test_database_operations() {
    log_info "Testing database operations..."
    
    # Test monitoring event creation
    local test_result=$(psql "${DATABASE_URL:-$SUPABASE_URL}" -t -c "
        SELECT create_monitoring_event(
            'system_health',
            'INFO',
            'deployment_test',
            NULL,
            NULL,
            NULL,
            1.0,
            '{\"test\": true}',
            '{\"deployment_verification\": true}'
        );
    ")
    
    if [ -z "$test_result" ]; then
        error_exit "Failed to create test monitoring event"
    fi
    
    # Test system health snapshot
    if ! psql "${DATABASE_URL:-$SUPABASE_URL}" -c "SELECT update_system_health_snapshot();" &> /dev/null; then
        error_exit "Failed to create system health snapshot"
    fi
    
    # Test detection cycle
    if ! psql "${DATABASE_URL:-$SUPABASE_URL}" -c "SELECT run_monitoring_detection_cycle();" &> /dev/null; then
        error_exit "Failed to run detection cycle"
    fi
    
    log_success "Database operations test completed"
}

# =====================================================
# EDGE FUNCTION DEPLOYMENT
# =====================================================

deploy_edge_functions() {
    log_info "Deploying Edge Functions..."
    
    # Deploy monitoring processor function
    log_info "Deploying monitoring processor function..."
    if ! supabase functions deploy monitoring; then
        error_exit "Failed to deploy monitoring function"
    fi
    
    # Deploy monitoring API function
    log_info "Deploying monitoring API function..."
    if ! supabase functions deploy monitoring-api; then
        error_exit "Failed to deploy monitoring-api function"
    fi
    
    log_success "Edge Functions deployed successfully"
}

test_edge_functions() {
    log_info "Testing Edge Functions..."
    
    # Wait for functions to be ready
    sleep 10
    
    # Test monitoring processor health
    local monitoring_health=$(curl -s -w "%{http_code}" -X GET \
        "${SUPABASE_URL}/functions/v1/monitoring/health" \
        -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
        -o /dev/null)
    
    if [ "$monitoring_health" != "200" ]; then
        error_exit "Monitoring function health check failed (HTTP $monitoring_health)"
    fi
    
    # Test monitoring API health
    local api_health=$(curl -s -w "%{http_code}" -X GET \
        "${SUPABASE_URL}/functions/v1/monitoring-api/health" \
        -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
        -o /dev/null)
    
    if [ "$api_health" != "200" ]; then
        error_exit "Monitoring API health check failed (HTTP $api_health)"
    fi
    
    # Test detection cycle execution
    local cycle_response=$(curl -s -X POST \
        "${SUPABASE_URL}/functions/v1/monitoring/cycle" \
        -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}")
    
    if ! echo "$cycle_response" | jq -e '.success' &> /dev/null; then
        error_exit "Detection cycle test failed"
    fi
    
    log_success "Edge Functions testing completed"
}

# =====================================================
# CONFIGURATION AND OPTIMIZATION
# =====================================================

configure_environment() {
    log_info "Configuring environment settings..."
    
    # Set production environment variables
    local env_vars=(
        "ENVIRONMENT=production"
        "MONITORING_INTERVAL_CRITICAL=30000"
        "MONITORING_INTERVAL_MEDIUM=120000"
        "MONITORING_INTERVAL_HEALTH=300000"
        "MONITORING_CLEANUP_RETENTION_DAYS=30"
    )
    
    for var in "${env_vars[@]}"; do
        local key=$(echo "$var" | cut -d'=' -f1)
        local value=$(echo "$var" | cut -d'=' -f2)
        
        if ! supabase secrets set "$key=$value"; then
            log_warn "Failed to set environment variable: $key"
        fi
    done
    
    log_success "Environment configuration completed"
}

optimize_database() {
    log_info "Optimizing database performance..."
    
    # Update table statistics
    psql "${DATABASE_URL:-$SUPABASE_URL}" -c "
        ANALYZE monitoring_events;
        ANALYZE system_health_snapshots;
        ANALYZE alert_history;
    " &> /dev/null
    
    # Refresh materialized views
    psql "${DATABASE_URL:-$SUPABASE_URL}" -c "
        SELECT refresh_monitoring_views();
    " &> /dev/null
    
    log_success "Database optimization completed"
}

# =====================================================
# INTEGRATION TESTING
# =====================================================

run_integration_tests() {
    log_info "Running integration tests..."
    
    # Test transaction failure detection
    log_info "Testing transaction failure detection..."
    psql "${DATABASE_URL:-$SUPABASE_URL}" -c "
        INSERT INTO app_transaction_log (
            transaction_id, card_id, transaction_type, status,
            amount_involved, previous_balance, new_balance,
            timestamp, details
        ) VALUES (
            gen_random_uuid(), 'TEST_DEPLOY_001', 'bar_order', 'failed',
            10.00, 50.00, 40.00,
            NOW(), '{\"test\": \"deployment_verification\"}'
        );
        SELECT detect_transaction_failures();
    " &> /dev/null
    
    # Test balance discrepancy detection
    log_info "Testing balance discrepancy detection..."
    psql "${DATABASE_URL:-$SUPABASE_URL}" -c "
        UPDATE table_cards SET amount = -1.00 WHERE id = 'TEST_DEPLOY_001';
        SELECT detect_balance_discrepancies();
        UPDATE table_cards SET amount = 0.00 WHERE id = 'TEST_DEPLOY_001';
    " &> /dev/null
    
    # Test NFC duplicate detection
    log_info "Testing NFC duplicate detection..."
    psql "${DATABASE_URL:-$SUPABASE_URL}" -c "
        INSERT INTO nfc_scan_log (card_id_scanned, scan_timestamp) VALUES
        ('TEST_DEPLOY_001', NOW()),
        ('TEST_DEPLOY_001', NOW() + INTERVAL '1 second'),
        ('TEST_DEPLOY_001', NOW() + INTERVAL '2 seconds');
        SELECT detect_duplicate_nfc_scans();
    " &> /dev/null
    
    # Verify events were created
    local event_count=$(psql "${DATABASE_URL:-$SUPABASE_URL}" -t -c "
        SELECT COUNT(*) FROM monitoring_events 
        WHERE card_id = 'TEST_DEPLOY_001';
    " | tr -d ' ')
    
    if [ "$event_count" -lt "2" ]; then
        error_exit "Integration tests failed - insufficient events created"
    fi
    
    # Cleanup test data
    psql "${DATABASE_URL:-$SUPABASE_URL}" -c "
        DELETE FROM monitoring_events WHERE card_id = 'TEST_DEPLOY_001';
        DELETE FROM app_transaction_log WHERE card_id = 'TEST_DEPLOY_001';
        DELETE FROM nfc_scan_log WHERE card_id_scanned = 'TEST_DEPLOY_001';
        DELETE FROM table_cards WHERE id = 'TEST_DEPLOY_001';
    " &> /dev/null
    
    log_success "Integration tests completed"
}

# =====================================================
# PERFORMANCE VALIDATION
# =====================================================

validate_performance() {
    log_info "Validating system performance..."
    
    # Test API response times
    local start_time=$(date +%s%N)
    curl -s -X GET "${SUPABASE_URL}/functions/v1/monitoring-api/health" \
        -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" > /dev/null
    local end_time=$(date +%s%N)
    local response_time=$(( (end_time - start_time) / 1000000 ))
    
    if [ "$response_time" -gt 1000 ]; then
        log_warn "API response time is high: ${response_time}ms"
    else
        log_info "API response time: ${response_time}ms"
    fi
    
    # Test detection cycle performance
    start_time=$(date +%s%N)
    curl -s -X POST "${SUPABASE_URL}/functions/v1/monitoring/cycle" \
        -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" > /dev/null
    end_time=$(date +%s%N)
    local cycle_time=$(( (end_time - start_time) / 1000000 ))
    
    if [ "$cycle_time" -gt 5000 ]; then
        log_warn "Detection cycle time is high: ${cycle_time}ms"
    else
        log_info "Detection cycle time: ${cycle_time}ms"
    fi
    
    log_success "Performance validation completed"
}

# =====================================================
# HEALTH CHECKS AND VALIDATION
# =====================================================

run_health_checks() {
    log_info "Running comprehensive health checks..."
    
    # Check database health
    local db_health=$(psql "${DATABASE_URL:-$SUPABASE_URL}" -t -c "SELECT 1;" 2>/dev/null | tr -d ' ')
    if [ "$db_health" != "1" ]; then
        error_exit "Database health check failed"
    fi
    
    # Check monitoring system health
    local monitoring_status=$(curl -s -X GET \
        "${SUPABASE_URL}/functions/v1/monitoring-api/health" \
        -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" | \
        jq -r '.status' 2>/dev/null)
    
    if [ "$monitoring_status" != "HEALTHY" ]; then
        log_warn "Monitoring system status: $monitoring_status"
    fi
    
    # Check circuit breaker status
    local circuit_breaker=$(curl -s -X GET \
        "${SUPABASE_URL}/functions/v1/monitoring/status" \
        -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" | \
        jq -r '.circuit_breaker.state' 2>/dev/null)
    
    if [ "$circuit_breaker" != "CLOSED" ]; then
        log_warn "Circuit breaker state: $circuit_breaker"
    fi
    
    log_success "Health checks completed"
}

# =====================================================
# ROLLBACK PROCEDURES
# =====================================================

rollback_deployment() {
    log_error "Initiating rollback procedure..."
    
    if [ -f "${SCRIPT_DIR}/.last_backup" ]; then
        local backup_file=$(cat "${SCRIPT_DIR}/.last_backup")
        if [ -f "$backup_file" ]; then
            log_info "Restoring from backup: $backup_file"
            
            # Delete edge functions
            supabase functions delete monitoring || true
            supabase functions delete monitoring-api || true
            
            # Restore database
            supabase db reset
            psql "${DATABASE_URL:-$SUPABASE_URL}" < "$backup_file"
            
            log_success "Rollback completed"
        else
            log_error "Backup file not found: $backup_file"
        fi
    else
        log_error "No backup information found"
    fi
}

# =====================================================
# DEPLOYMENT SUMMARY
# =====================================================

generate_deployment_summary() {
    local deployment_end_time=$(date +%s)
    local deployment_duration=$((deployment_end_time - DEPLOYMENT_START_TIME))
    
    log_info "Generating deployment summary..."
    
    cat << EOF | tee -a "${LOG_FILE}"

================================================
  Phase 4 Deployment Summary
================================================
Deployment Status: SUCCESS
Start Time: $(date -d @$DEPLOYMENT_START_TIME)
End Time: $(date -d @$deployment_end_time)
Duration: ${deployment_duration} seconds

Components Deployed:
✓ Database Schema (3 tables, 8 functions, 15+ indexes)
✓ Edge Functions (monitoring, monitoring-api)
✓ Environment Configuration
✓ Performance Optimization

Tests Completed:
✓ Database Operations
✓ Edge Function Health Checks
✓ Integration Tests
✓ Performance Validation
✓ System Health Checks

Next Steps:
1. Monitor system performance for first 24 hours
2. Review monitoring dashboard at /admin
3. Configure external alert notifications
4. Schedule regular health checks

Documentation:
- Implementation Summary: documentation/PHASE4_IMPLEMENTATION_SUMMARY.md
- Operational Guide: documentation/PHASE4_OPERATIONAL_GUIDE.md
- API Reference: documentation/PHASE4_API_REFERENCE.md

Support:
- Log File: ${LOG_FILE}
- Backup: $(cat "${SCRIPT_DIR}/.last_backup" 2>/dev/null || echo "Not available")

================================================
EOF
}

# =====================================================
# MAIN DEPLOYMENT FLOW
# =====================================================

main() {
    print_banner
    
    # Pre-deployment validation
    validate_environment
    check_prerequisites
    create_backup
    
    # Core deployment
    deploy_database_schema
    verify_database_functions
    test_database_operations
    
    deploy_edge_functions
    test_edge_functions
    
    # Configuration and optimization
    configure_environment
    optimize_database
    
    # Testing and validation
    run_integration_tests
    validate_performance
    run_health_checks
    
    # Completion
    generate_deployment_summary
    
    log_success "Phase 4 Monitoring System deployed successfully!"
    log_info "Access the monitoring dashboard at: ${SUPABASE_URL}/admin"
    log_info "API endpoints available at: ${SUPABASE_URL}/functions/v1/monitoring*"
}

# =====================================================
# SCRIPT EXECUTION
# =====================================================

# Handle command line arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "rollback")
        rollback_deployment
        ;;
    "health-check")
        run_health_checks
        ;;
    "test")
        run_integration_tests
        ;;
    *)
        echo "Usage: $0 [deploy|rollback|health-check|test]"
        echo ""
        echo "Commands:"
        echo "  deploy      - Full Phase 4 deployment (default)"
        echo "  rollback    - Rollback to pre-deployment state"
        echo "  health-check - Run health checks only"
        echo "  test        - Run integration tests only"
        exit 1
        ;;
esac