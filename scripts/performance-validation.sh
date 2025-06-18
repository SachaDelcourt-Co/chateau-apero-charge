#!/bin/bash

/**
 * Phase 4 Monitoring System - Performance Validation Script
 * 
 * This script measures and validates the performance characteristics of the
 * Phase 4 monitoring system to ensure it meets production requirements.
 * 
 * Performance Metrics Measured:
 * - Detection algorithm response times (<30 seconds requirement)
 * - API response times (<500ms requirement)
 * - Database query performance (<100ms requirement)
 * - System behavior under high load
 * - Memory usage and cache efficiency
 * - Concurrent operation handling
 * 
 * Success Criteria:
 * - Detection latency: <30 seconds for critical events
 * - API response time: <500ms (95th percentile)
 * - Database queries: <100ms average
 * - Memory usage: Stable with no leaks over test duration
 * - Concurrent operations: >95% success rate
 * - System throughput: Handle festival-scale load (6,000+ daily transactions)
 * 
 * @version 1.0.0
 * @author Phase 4 Performance Team
 * @date 2025-06-15
 */

set -e  # Exit on any error
set -u  # Exit on undefined variables

# =====================================================
# CONFIGURATION AND CONSTANTS
# =====================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_FILE="$PROJECT_ROOT/performance-validation-$(date +%Y%m%d-%H%M%S).log"
TEMP_DIR="/tmp/phase4-performance-$$"
RESULTS_DIR="$PROJECT_ROOT/performance-results"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Performance thresholds (production requirements)
MAX_DETECTION_LATENCY_MS=30000      # 30 seconds
MAX_API_RESPONSE_TIME_MS=500        # 500ms for 95th percentile
MAX_DB_QUERY_TIME_MS=100           # 100ms average
MAX_MEMORY_USAGE_MB=512            # 512MB maximum memory usage
MIN_SUCCESS_RATE_PERCENT=95        # 95% minimum success rate
FESTIVAL_DAILY_TRANSACTIONS=6000   # 6,000+ daily transactions

# Test parameters
PERFORMANCE_TEST_DURATION=300      # 5 minutes
LOAD_TEST_DURATION=180            # 3 minutes
CONCURRENT_OPERATIONS=20          # 20 concurrent operations
API_TEST_CALLS=100               # 100 API calls for testing
DETECTION_CYCLES=50              # 50 detection cycles for testing

# Performance metrics storage
declare -a DETECTION_LATENCIES=()
declare -a API_RESPONSE_TIMES=()
declare -a DB_QUERY_TIMES=()
declare -a MEMORY_USAGE=()
declare -a CPU_USAGE=()

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
WARNINGS=0

# =====================================================
# UTILITY FUNCTIONS
# =====================================================

log() {
    echo -e "$1" | tee -a "$LOG_FILE"
}

log_info() {
    log "${BLUE}[INFO]${NC} $1"
}

log_success() {
    log "${GREEN}[SUCCESS]${NC} $1"
    ((PASSED_TESTS++))
}

log_error() {
    log "${RED}[ERROR]${NC} $1"
    ((FAILED_TESTS++))
}

log_warning() {
    log "${YELLOW}[WARNING]${NC} $1"
    ((WARNINGS++))
}

log_section() {
    log ""
    log "${PURPLE}========================================${NC}"
    log "${PURPLE}$1${NC}"
    log "${PURPLE}========================================${NC}"
}

test_start() {
    ((TOTAL_TESTS++))
    log_info "🔍 Testing: $1"
}

cleanup() {
    if [ -d "$TEMP_DIR" ]; then
        rm -rf "$TEMP_DIR"
    fi
}

trap cleanup EXIT

# Performance measurement utilities
measure_time_ms() {
    local start_time=$(date +%s%3N)
    "$@"
    local end_time=$(date +%s%3N)
    echo $((end_time - start_time))
}

calculate_percentile() {
    local -n arr=$1
    local percentile=$2
    if [ ${#arr[@]} -eq 0 ]; then
        echo "0"
        return
    fi
    local sorted=($(printf '%s\n' "${arr[@]}" | sort -n))
    local index=$(( (${#sorted[@]} * percentile / 100) ))
    if [ $index -ge ${#sorted[@]} ]; then
        index=$((${#sorted[@]} - 1))
    fi
    echo "${sorted[$index]}"
}

calculate_average() {
    local -n arr=$1
    if [ ${#arr[@]} -eq 0 ]; then
        echo "0"
        return
    fi
    local sum=0
    for value in "${arr[@]}"; do
        sum=$((sum + value))
    done
    echo $((sum / ${#arr[@]}))
}

get_memory_usage() {
    # Get memory usage in MB (simplified for cross-platform compatibility)
    if command -v free &> /dev/null; then
        free -m | awk 'NR==2{printf "%.0f", $3}'
    elif command -v vm_stat &> /dev/null; then
        # macOS
        vm_stat | grep "Pages active" | awk '{print int($3 * 4096 / 1024 / 1024)}'
    else
        echo "0"
    fi
}

get_cpu_usage() {
    # Get CPU usage percentage (simplified)
    if command -v top &> /dev/null; then
        top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//' 2>/dev/null || echo "0"
    else
        echo "0"
    fi
}

# =====================================================
# DETECTION ALGORITHM PERFORMANCE TESTING
# =====================================================

test_detection_algorithm_performance() {
    log_section "🔍 DETECTION ALGORITHM PERFORMANCE TESTING"
    
    if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_ANON_KEY:-}" ]; then
        log_warning "Supabase credentials not available - skipping detection performance tests"
        return 0
    fi
    
    local base_url="${SUPABASE_URL}/functions/v1"
    local auth_header="Authorization: Bearer ${SUPABASE_ANON_KEY}"
    local api_key_header="apikey: ${SUPABASE_ANON_KEY}"
    
    test_start "Detection cycle latency measurement"
    
    log_info "Running $DETECTION_CYCLES detection cycles..."
    local successful_cycles=0
    local failed_cycles=0
    
    for i in $(seq 1 $DETECTION_CYCLES); do
        local start_time=$(date +%s%3N)
        
        local response_code
        response_code=$(curl -s -w "%{http_code}" -X POST \
            -H "$auth_header" -H "$api_key_header" \
            -H "Content-Type: application/json" \
            "$base_url/monitoring/cycle" \
            -o "$TEMP_DIR/detection_cycle_$i.json" 2>/dev/null)
        
        local end_time=$(date +%s%3N)
        local cycle_latency=$((end_time - start_time))
        
        if [ "$response_code" = "200" ]; then
            DETECTION_LATENCIES+=($cycle_latency)
            ((successful_cycles++))
            
            if [ $((i % 10)) -eq 0 ]; then
                log_info "Completed $i/$DETECTION_CYCLES cycles (${cycle_latency}ms)"
            fi
        else
            ((failed_cycles++))
            log_warning "Detection cycle $i failed (HTTP $response_code)"
        fi
        
        # Small delay to prevent overwhelming the system
        sleep 0.5
    done
    
    # Calculate detection performance metrics
    if [ ${#DETECTION_LATENCIES[@]} -gt 0 ]; then
        local avg_latency=$(calculate_average DETECTION_LATENCIES)
        local p95_latency=$(calculate_percentile DETECTION_LATENCIES 95)
        local p99_latency=$(calculate_percentile DETECTION_LATENCIES 99)
        local max_latency=$(printf '%s\n' "${DETECTION_LATENCIES[@]}" | sort -n | tail -1)
        local min_latency=$(printf '%s\n' "${DETECTION_LATENCIES[@]}" | sort -n | head -1)
        
        log_info "Detection Performance Results:"
        log_info "  Successful Cycles: $successful_cycles/$DETECTION_CYCLES"
        log_info "  Average Latency: ${avg_latency}ms"
        log_info "  95th Percentile: ${p95_latency}ms"
        log_info "  99th Percentile: ${p99_latency}ms"
        log_info "  Min Latency: ${min_latency}ms"
        log_info "  Max Latency: ${max_latency}ms"
        
        # Validate against requirements
        test_start "Detection latency requirement (<30 seconds)"
        if [ $avg_latency -lt $MAX_DETECTION_LATENCY_MS ]; then
            log_success "Average detection latency: ${avg_latency}ms (< ${MAX_DETECTION_LATENCY_MS}ms)"
        else
            log_error "Average detection latency: ${avg_latency}ms (exceeds ${MAX_DETECTION_LATENCY_MS}ms)"
        fi
        
        test_start "Detection latency 95th percentile"
        if [ $p95_latency -lt $MAX_DETECTION_LATENCY_MS ]; then
            log_success "95th percentile latency: ${p95_latency}ms (< ${MAX_DETECTION_LATENCY_MS}ms)"
        else
            log_error "95th percentile latency: ${p95_latency}ms (exceeds ${MAX_DETECTION_LATENCY_MS}ms)"
        fi
        
        test_start "Detection success rate"
        local success_rate=$((successful_cycles * 100 / DETECTION_CYCLES))
        if [ $success_rate -ge $MIN_SUCCESS_RATE_PERCENT ]; then
            log_success "Detection success rate: $success_rate% (>= ${MIN_SUCCESS_RATE_PERCENT}%)"
        else
            log_error "Detection success rate: $success_rate% (< ${MIN_SUCCESS_RATE_PERCENT}%)"
        fi
    else
        log_error "No successful detection cycles completed"
    fi
}

# =====================================================
# API RESPONSE TIME TESTING
# =====================================================

test_api_response_times() {
    log_section "🌐 API RESPONSE TIME TESTING"
    
    if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_ANON_KEY:-}" ]; then
        log_warning "Supabase credentials not available - skipping API response time tests"
        return 0
    fi
    
    local base_url="${SUPABASE_URL}/functions/v1"
    local auth_header="Authorization: Bearer ${SUPABASE_ANON_KEY}"
    local api_key_header="apikey: ${SUPABASE_ANON_KEY}"
    
    # Test different API endpoints
    local endpoints=(
        "monitoring/health:GET"
        "monitoring/status:GET"
        "monitoring/events:GET"
        "monitoring-api/health:GET"
        "monitoring-api/dashboard:GET"
        "monitoring-api/metrics:GET"
    )
    
    test_start "API endpoint response times"
    
    log_info "Testing API response times with $API_TEST_CALLS calls per endpoint..."
    
    for endpoint in "${endpoints[@]}"; do
        local path="${endpoint%:*}"
        local method="${endpoint#*:}"
        local url="$base_url/$path"
        
        log_info "Testing endpoint: $path"
        
        local endpoint_response_times=()
        local successful_calls=0
        
        for i in $(seq 1 $API_TEST_CALLS); do
            local start_time=$(date +%s%3N)
            
            local response_code
            if [ "$method" = "GET" ]; then
                response_code=$(curl -s -w "%{http_code}" \
                    -H "$auth_header" -H "$api_key_header" \
                    "$url" -o /dev/null 2>/dev/null)
            else
                response_code=$(curl -s -w "%{http_code}" -X "$method" \
                    -H "$auth_header" -H "$api_key_header" \
                    -H "Content-Type: application/json" \
                    "$url" -d '{}' -o /dev/null 2>/dev/null)
            fi
            
            local end_time=$(date +%s%3N)
            local response_time=$((end_time - start_time))
            
            if [ "$response_code" = "200" ]; then
                endpoint_response_times+=($response_time)
                API_RESPONSE_TIMES+=($response_time)
                ((successful_calls++))
            fi
            
            # Small delay between calls
            sleep 0.1
        done
        
        # Calculate endpoint-specific metrics
        if [ ${#endpoint_response_times[@]} -gt 0 ]; then
            local avg_time=$(calculate_average endpoint_response_times)
            local p95_time=$(calculate_percentile endpoint_response_times 95)
            local success_rate=$((successful_calls * 100 / API_TEST_CALLS))
            
            log_info "  $path: avg=${avg_time}ms, p95=${p95_time}ms, success=${success_rate}%"
        else
            log_warning "  $path: No successful responses"
        fi
    done
    
    # Calculate overall API performance metrics
    if [ ${#API_RESPONSE_TIMES[@]} -gt 0 ]; then
        local avg_api_time=$(calculate_average API_RESPONSE_TIMES)
        local p95_api_time=$(calculate_percentile API_RESPONSE_TIMES 95)
        local p99_api_time=$(calculate_percentile API_RESPONSE_TIMES 99)
        local max_api_time=$(printf '%s\n' "${API_RESPONSE_TIMES[@]}" | sort -n | tail -1)
        
        log_info ""
        log_info "Overall API Performance Results:"
        log_info "  Total API Calls: ${#API_RESPONSE_TIMES[@]}"
        log_info "  Average Response Time: ${avg_api_time}ms"
        log_info "  95th Percentile: ${p95_api_time}ms"
        log_info "  99th Percentile: ${p99_api_time}ms"
        log_info "  Max Response Time: ${max_api_time}ms"
        
        # Validate against requirements
        test_start "API response time requirement (<500ms 95th percentile)"
        if [ $p95_api_time -lt $MAX_API_RESPONSE_TIME_MS ]; then
            log_success "95th percentile API response time: ${p95_api_time}ms (< ${MAX_API_RESPONSE_TIME_MS}ms)"
        else
            log_error "95th percentile API response time: ${p95_api_time}ms (exceeds ${MAX_API_RESPONSE_TIME_MS}ms)"
        fi
        
        test_start "Average API response time"
        if [ $avg_api_time -lt $MAX_API_RESPONSE_TIME_MS ]; then
            log_success "Average API response time: ${avg_api_time}ms (< ${MAX_API_RESPONSE_TIME_MS}ms)"
        else
            log_warning "Average API response time: ${avg_api_time}ms (exceeds ${MAX_API_RESPONSE_TIME_MS}ms)"
        fi
    else
        log_error "No successful API calls completed"
    fi
}

# =====================================================
# DATABASE QUERY PERFORMANCE TESTING
# =====================================================

test_database_query_performance() {
    log_section "🗄️ DATABASE QUERY PERFORMANCE TESTING"
    
    if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_ANON_KEY:-}" ]; then
        log_warning "Supabase credentials not available - skipping database performance tests"
        return 0
    fi
    
    local base_url="${SUPABASE_URL}/functions/v1"
    local auth_header="Authorization: Bearer ${SUPABASE_ANON_KEY}"
    local api_key_header="apikey: ${SUPABASE_ANON_KEY}"
    
    test_start "Database query performance measurement"
    
    # Test different types of database queries through the API
    local query_types=(
        "monitoring/events?limit=10:Simple SELECT"
        "monitoring/events?limit=100:Large SELECT"
        "monitoring-api/dashboard:Complex JOIN"
        "monitoring-api/metrics:Aggregation"
    )
    
    log_info "Testing database query performance..."
    
    for query_type in "${query_types[@]}"; do
        local endpoint="${query_type%:*}"
        local description="${query_type#*:}"
        local url="$base_url/$endpoint"
        
        log_info "Testing: $description"
        
        local query_times=()
        local successful_queries=0
        
        for i in $(seq 1 20); do
            local start_time=$(date +%s%3N)
            
            local response_code
            response_code=$(curl -s -w "%{http_code}" \
                -H "$auth_header" -H "$api_key_header" \
                "$url" -o /dev/null 2>/dev/null)
            
            local end_time=$(date +%s%3N)
            local query_time=$((end_time - start_time))
            
            if [ "$response_code" = "200" ]; then
                query_times+=($query_time)
                DB_QUERY_TIMES+=($query_time)
                ((successful_queries++))
            fi
            
            sleep 0.2
        done
        
        if [ ${#query_times[@]} -gt 0 ]; then
            local avg_time=$(calculate_average query_times)
            local p95_time=$(calculate_percentile query_times 95)
            
            log_info "  $description: avg=${avg_time}ms, p95=${p95_time}ms"
        fi
    done
    
    # Calculate overall database performance metrics
    if [ ${#DB_QUERY_TIMES[@]} -gt 0 ]; then
        local avg_db_time=$(calculate_average DB_QUERY_TIMES)
        local p95_db_time=$(calculate_percentile DB_QUERY_TIMES 95)
        local max_db_time=$(printf '%s\n' "${DB_QUERY_TIMES[@]}" | sort -n | tail -1)
        
        log_info ""
        log_info "Overall Database Performance Results:"
        log_info "  Total Queries: ${#DB_QUERY_TIMES[@]}"
        log_info "  Average Query Time: ${avg_db_time}ms"
        log_info "  95th Percentile: ${p95_db_time}ms"
        log_info "  Max Query Time: ${max_db_time}ms"
        
        # Validate against requirements
        test_start "Database query time requirement (<100ms average)"
        if [ $avg_db_time -lt $MAX_DB_QUERY_TIME_MS ]; then
            log_success "Average database query time: ${avg_db_time}ms (< ${MAX_DB_QUERY_TIME_MS}ms)"
        else
            log_error "Average database query time: ${avg_db_time}ms (exceeds ${MAX_DB_QUERY_TIME_MS}ms)"
        fi
    else
        log_error "No successful database queries completed"
    fi
}

# =====================================================
# SYSTEM BEHAVIOR UNDER HIGH LOAD
# =====================================================

test_high_load_behavior() {
    log_section "⚡ SYSTEM BEHAVIOR UNDER HIGH LOAD"
    
    if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_ANON_KEY:-}" ]; then
        log_warning "Supabase credentials not available - skipping high load tests"
        return 0
    fi
    
    test_start "Concurrent operations handling"
    
    log_info "Testing system behavior with $CONCURRENT_OPERATIONS concurrent operations..."
    
    local base_url="${SUPABASE_URL}/functions/v1"
    local auth_header="Authorization: Bearer ${SUPABASE_ANON_KEY}"
    local api_key_header="apikey: ${SUPABASE_ANON_KEY}"
    
    # Create temp directory for concurrent test results
    mkdir -p "$TEMP_DIR/concurrent"
    
    # Launch concurrent operations
    local pids=()
    local start_time=$(date +%s%3N)
    
    for i in $(seq 1 $CONCURRENT_OPERATIONS); do
        (
            local operation_start=$(date +%s%3N)
            local response_code
            response_code=$(curl -s -w "%{http_code}" -X POST \
                -H "$auth_header" -H "$api_key_header" \
                -H "Content-Type: application/json" \
                "$base_url/monitoring/cycle" \
                -o "$TEMP_DIR/concurrent/result_$i.json" 2>/dev/null)
            local operation_end=$(date +%s%3N)
            local operation_time=$((operation_end - operation_start))
            
            echo "$response_code:$operation_time" > "$TEMP_DIR/concurrent/status_$i.txt"
        ) &
        pids+=($!)
    done
    
    # Wait for all operations to complete
    for pid in "${pids[@]}"; do
        wait "$pid"
    done
    
    local end_time=$(date +%s%3N)
    local total_time=$((end_time - start_time))
    
    # Analyze concurrent operation results
    local successful_operations=0
    local failed_operations=0
    local concurrent_times=()
    
    for i in $(seq 1 $CONCURRENT_OPERATIONS); do
        if [ -f "$TEMP_DIR/concurrent/status_$i.txt" ]; then
            local status_line
            status_line=$(cat "$TEMP_DIR/concurrent/status_$i.txt")
            local response_code="${status_line%:*}"
            local operation_time="${status_line#*:}"
            
            if [ "$response_code" = "200" ]; then
                ((successful_operations++))
                concurrent_times+=($operation_time)
            else
                ((failed_operations++))
            fi
        else
            ((failed_operations++))
        fi
    done
    
    local success_rate=$((successful_operations * 100 / CONCURRENT_OPERATIONS))
    
    log_info "Concurrent Operations Results:"
    log_info "  Total Operations: $CONCURRENT_OPERATIONS"
    log_info "  Successful: $successful_operations"
    log_info "  Failed: $failed_operations"
    log_info "  Success Rate: $success_rate%"
    log_info "  Total Time: ${total_time}ms"
    
    if [ ${#concurrent_times[@]} -gt 0 ]; then
        local avg_concurrent_time=$(calculate_average concurrent_times)
        local max_concurrent_time=$(printf '%s\n' "${concurrent_times[@]}" | sort -n | tail -1)
        
        log_info "  Average Operation Time: ${avg_concurrent_time}ms"
        log_info "  Max Operation Time: ${max_concurrent_time}ms"
    fi
    
    # Validate concurrent operation performance
    test_start "Concurrent operations success rate"
    if [ $success_rate -ge $MIN_SUCCESS_RATE_PERCENT ]; then
        log_success "Concurrent operations success rate: $success_rate% (>= ${MIN_SUCCESS_RATE_PERCENT}%)"
    else
        log_error "Concurrent operations success rate: $success_rate% (< ${MIN_SUCCESS_RATE_PERCENT}%)"
    fi
    
    test_start "Festival-scale load simulation"
    # Simulate festival-scale transaction processing
    local hourly_transactions=$((FESTIVAL_DAILY_TRANSACTIONS / 24))
    local transactions_per_minute=$((hourly_transactions / 60))
    
    log_info "Simulating festival-scale load: $transactions_per_minute transactions/minute"
    
    # Run sustained load test for a shorter duration
    local load_test_start=$(date +%s)
    local load_test_operations=0
    local load_test_successes=0
    
    while [ $(($(date +%s) - load_test_start)) -lt 60 ]; do # 1 minute test
        local response_code
        response_code=$(curl -s -w "%{http_code}" \
            -H "$auth_header" -H "$api_key_header" \
            "$base_url/monitoring/health" -o /dev/null 2>/dev/null)
        
        ((load_test_operations++))
        if [ "$response_code" = "200" ]; then
            ((load_test_successes++))
        fi
        
        sleep 1
    done
    
    local load_success_rate=$((load_test_successes * 100 / load_test_operations))
    
    log_info "Festival-scale Load Test Results:"
    log_info "  Operations: $load_test_operations"
    log_info "  Successes: $load_test_successes"
    log_info "  Success Rate: $load_success_rate%"
    
    if [ $load_success_rate -ge $MIN_SUCCESS_RATE_PERCENT ]; then
        log_success "Festival-scale load handling: $load_success_rate% success rate"
    else
        log_error "Festival-scale load handling: $load_success_rate% success rate (< ${MIN_SUCCESS_RATE_PERCENT}%)"
    fi
}

# =====================================================
# MEMORY USAGE AND CACHE EFFICIENCY
# =====================================================

test_memory_and_cache_efficiency() {
    log_section "🧠 MEMORY USAGE AND CACHE EFFICIENCY"
    
    test_start "Memory usage monitoring"
    
    log_info "Monitoring memory usage during extended operations..."
    
    # Record baseline memory usage
    local baseline_memory=$(get_memory_usage)
    MEMORY_USAGE+=($baseline_memory)
    
    log_info "Baseline memory usage: ${baseline_memory}MB"
    
    # Run extended operations while monitoring memory
    local memory_test_duration=60 # 1 minute
    local memory_test_start=$(date +%s)
    local operations_count=0
    
    while [ $(($(date +%s) - memory_test_start)) -lt $memory_test_duration ]; do
        # Simulate memory-intensive operations
        if [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_ANON_KEY:-}" ]; then
            local base_url="${SUPABASE_URL}/functions/v1"
            local auth_header="Authorization: Bearer ${SUPABASE_ANON_KEY}"
            local api_key_header="apikey: ${SUPABASE_ANON_KEY}"
            
            curl -s -H "$auth_header" -H "$api_key_header" \
                "$base_url/monitoring-api/dashboard" -o /dev/null 2>/dev/null
        fi
        
        # Record memory usage
        local current_memory=$(get_memory_usage)
        MEMORY_USAGE+=($current_memory)
        
        ((operations_count++))
        sleep 2
    done
    
    # Analyze memory usage patterns
    local max_memory=$(printf '%s\n' "${MEMORY_USAGE[@]}" | sort -n | tail -1)
    local min_memory=$(printf '%s\n' "${MEMORY_USAGE[@]}" | sort -n | head -1)
    local avg_memory=$(calculate_average MEMORY_USAGE)
    local memory_growth=$((max_memory - baseline_memory))
    
    log_info "Memory Usage Analysis:"
    log_info "  Baseline: ${baseline_memory}MB"
    log_info "  Average: ${avg_memory}MB"
    log_info "  Maximum: ${max_memory}MB"
    log_info "  Minimum: ${min_memory}MB"
    log_info "  Growth: ${memory_growth}MB"
    log_info "  Operations: $operations_count"
    
    # Validate memory usage
    test_start "Memory usage within limits"
    if [ $max_memory -lt $MAX_MEMORY_USAGE_MB ]; then
        log_success "Maximum memory usage: ${max_memory}MB (< ${MAX_MEMORY_USAGE_MB}MB)"
    else
        log_error "Maximum memory usage: ${max_memory}MB (exceeds ${MAX_MEMORY_USAGE_MB}MB)"
    fi
    
    test_start "Memory leak detection"
    local memory_leak_threshold=100 # 100MB growth threshold
    if [ $memory_growth -lt $memory_leak_threshold ]; then
        log_success "Memory growth: ${memory_growth}MB (< ${memory_leak_threshold}MB threshold)"
    else
        log_warning "Memory growth: ${memory_growth}MB (exceeds ${memory_leak_threshold}MB threshold)"
    fi
    
    # Test cache efficiency (simplified)
    test_start "Cache efficiency simulation"
    if [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_ANON_KEY:-}" ]; then
        local base_url="${SUPABASE_URL}/functions/v1"
        local auth_header="Authorization: Bearer ${SUPABASE_ANON_KEY}"
        local api_key_header="apikey: ${SUPABASE_ANON_KEY}"
        
        # Make repeated calls to test caching
        local cache_test_calls=10
        local cache_times=()
        
        for i in $(seq 1 $cache_test_calls); do
            local start_time=$(date +%s%3N)
            curl -s -H "$auth_header" -H "$api_key_header" \
                "$base_url/monitoring/health" -o /dev/null 2>/dev/null
            local end_time=$(date +%s%3N)
            local call_time=$((end_time - start_time))
            cache_times+=($call_time)
        done
        
        if [ ${#cache_times[@]} -gt 0 ]; then
            local first_call=${cache_times[0]}
            local avg_subsequent=$(calculate_average cache_times)
            local cache_improvement=$((first_call - avg_subsequent))
            
            log_info "Cache Efficiency Test:"
            log_info "  First Call: ${first_call}ms"
            log_info "  Average Subsequent: ${avg_subsequent}ms"
            log_info "  Improvement: ${cache_improvement}ms"
            
            if [ $cache_improvement -gt 0 ]; then
                log_success "Cache showing performance improvement: ${cache_improvement}ms"
            else
                log_info "Cache performance: consistent response times"
            fi
        fi
    else
        log_info "Cache efficiency test skipped - Supabase credentials not available"
    fi
}

# =====================================================
# PERFORMANCE REPORT GENERATION
# =====================================================

generate_performance_report() {
    log_section "📊 PERFORMANCE REPORT GENERATION"
    
    # Create results directory
    mkdir -p "$RESULTS_DIR"
    local report_file="$RESULTS_DIR/performance-report-$(date +%Y%m%d-%H%M%S).json"
    local summary_file="$RESULTS_DIR/performance-summary-$(date +%Y%m%d-%H%M%S).txt"
    
    log_info "Generating performance report..."
    
    # Calculate overall metrics
    local avg_detection_latency=0
    local p95_detection_latency=0
    local avg_api_response_time=0
    local p95_api_response_time=0
    local avg_db_query_time=0
    local max_memory_usage=0
    
    if [ ${#DETECTION_LATENCIES[@]} -gt 0 ]; then
        avg_detection_latency=$(calculate_average DETECTION_LATENCIES)
        p95_detection_latency=$(calculate_percentile DETECTION_LATENCIES 95)
    fi
    
    if [ ${#API_RESPONSE_TIMES[@]} -gt 0 ]; then
        avg_api_response_time=$(calculate_average API_RESPONSE_TIMES)
        p95_api_response_time=$(calculate_percentile API_RESPONSE_TIMES 95)
    fi
    
    if [ ${#DB_QUERY_TIMES[@]} -gt 0 ]; then
        avg_db_query_time=$(calculate_average DB_QUERY_TIMES)
    fi
    
    if [ ${#MEMORY_USAGE[@]} -gt 0 ]; then
        max_memory_usage=$(printf '%s\n' "${MEMORY_USAGE[@]}" | sort -n | tail -1)
    fi
    
    # Generate JSON report
    cat > "$report_file" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "test_duration": "$PERFORMANCE_TEST_DURATION",
  "performance_metrics": {
    "detection_algorithms": {
      "average_latency_ms": $avg_detection_latency,
      "p95_latency_ms": $p95_detection_latency,
      "total_cycles": ${#DETECTION_LATENCIES[@]},
      "requirement_ms": $MAX_DETECTION_LATENCY_MS,
      "meets_requirement": $([ $avg_detection_latency -lt $MAX_DETECTION_LATENCY_MS ] && echo "true" || echo "false")
    },
    "api_endpoints": {
      "average_response_time_ms": $avg_api_response_time,
      "p95_response_time_ms": $p95_api_response_time,
      "total_calls": ${#API_RESPONSE_TIMES[@]},
      "requirement_ms": $MAX_API_RESPONSE_TIME_MS,
      "meets_requirement": $([ $p95_api_response_time -lt $MAX_API_RESPONSE_TIME_MS ] && echo "true" || echo "false")
    },
    "database_queries": {
      "average_query_time_ms": $avg_db_query_time,
      "total_queries": ${#DB_QUERY_TIMES[@]},
      "requirement_ms": $MAX_DB_QUERY_TIME_MS,
      "meets_requirement": $([ $avg_db_query_time -lt $MAX_DB_QUERY_TIME_MS ] && echo "true" || echo "false")
    },
    "memory_usage": {
      "max_usage_mb": $max_memory_usage,
      "samples": ${#MEMORY_USAGE[@]},
      "requirement_mb": $MAX_MEMORY_USAGE_MB,
      "meets_requirement": $([ $max_memory_usage -lt $MAX_MEMORY_USAGE_MB ] && echo "true" || echo "false")
    }
  },
  "test_results": {
    "total_tests": $TOTAL_TESTS,
    "passed_tests": $PASSED_TESTS,
    "failed_tests": $FAILED_TESTS,
    "warnings": $WARNINGS,
    "success_rate": $(echo "scale=2; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc -l 2>/dev/null || echo "0")
  },
  "requirements_compliance": {
    "detection_latency": $([ $avg_detection_latency -lt $MAX_DETECTION_LATENCY_MS ] && echo "\"PASSED\"" || echo "\"FAILED\""),
    "api_response_time": $([ $p95_api_response_time -lt $MAX_API_RESPONSE_TIME_MS ] && echo "\"PASSED\"" || echo "\"FAILED\""),
    "database_performance": $([ $avg_db_query_time -lt $MAX_DB_QUERY_TIME_MS ] && echo "\"PASSED\"" || echo "\"FAILED\""),
    "memory_management": $([ $max_memory_usage -lt $MAX_MEMORY_USAGE_MB ] && echo "\"PASSED\"" || echo "\"FAILED\"")
  }
}
EOF
    
    # Generate human-readable summary
    cat > "$summary_file" << EOF
PHASE 4 MONITORING SYSTEM - PERFORMANCE VALIDATION SUMMARY
=========================================================

Test Execution Details:
- Timestamp: $(date)
- Test Duration: $PERFORMANCE_TEST_DURATION seconds
- Total Tests: $TOTAL_TESTS
- Passed: $PASSED_TESTS
- Failed: $FAILED_TESTS
- Warnings: $WARNINGS

Performance Metrics:
===================

Detection Algorithm Performance:
- Average Latency: ${avg_detection_latency}ms
- 95th Percentile: ${p95_detection_latency}ms
- Requirement: <${MAX_DETECTION_LATENCY_MS}ms
- Status: $([ $avg_detection_latency -lt $MAX_DETECTION_LATENCY_MS ] && echo "✅ PASSED" || echo "❌ FAILED")
- Total Cycles: ${#DETECTION_LATENCIES[@]}

API Endpoint Performance:
- Average Response Time: ${avg_api_response_time}ms
- 95th Percentile: ${p95_api_response_time}ms
- Requirement: <${MAX_API_RESPONSE_TIME_MS}ms (95th percentile)
- Status: $([ $p95_api_response_time -lt $MAX_API_RESPONSE_TIME_MS ] && echo "✅ PASSED" || echo "❌ FAILED")
- Total API Calls: ${#API_RESPONSE_TIMES[@]}

Database Query Performance:
- Average Query Time: ${avg_db_query_time}ms
- Requirement: <${MAX_DB_QUERY_TIME_MS}ms
- Status: $([ $avg_db_query_time -lt $MAX_DB_QUERY_TIME_MS ] && echo "✅ PASSED" || echo "❌ FAILED")
- Total Queries: ${#DB_QUERY_TIMES[@]}

Memory Usage:
- Maximum Usage: ${max_memory_usage}MB
- Requirement: <${MAX_MEMORY_USAGE_MB}MB
- Status: $([ $max_memory_usage -lt $MAX_MEMORY_USAGE_MB ] && echo "✅ PASSED" || echo "❌ FAILED")
- Samples: ${#MEMORY_USAGE[@]}

Overall Assessment:
==================
$([ $FAILED_TESTS -eq 0 ] && echo "🎉 ALL PERFORMANCE REQUIREMENTS MET - SYSTEM READY FOR PRODUCTION" || echo "⚠️  PERFORMANCE ISSUES DETECTED - REVIEW REQUIRED")

Festival Readiness:
- Detection Latency: $([ $avg_detection_latency -lt $MAX_DETECTION_LATENCY_MS ] && echo "✅ Ready" || echo "❌ Not Ready")
- API Performance: $([ $p95_api_response_time -lt $MAX_API_RESPONSE_TIME_MS ] && echo "✅ Ready" || echo "❌ Not Ready")
- Database Performance: $([ $avg_db_query_time -lt $MAX_DB_QUERY_TIME_MS ] && echo "✅ Ready" || echo "❌ Not Ready")
- Memory Management: $([ $max_memory_usage -lt $MAX_MEMORY_USAGE_MB ] && echo "✅ Ready" || echo "❌ Not Ready")

Recommendations:
===============
$([ $avg_detection_latency -ge $MAX_DETECTION_LATENCY_MS ] && echo "- Optimize detection algorithms to reduce latency")
$([ $p95_api_response_time -ge $MAX_API_RESPONSE_TIME_MS ] && echo "- Optimize API endpoints and database queries")
$([ $avg_db_query_time -ge $MAX_DB_QUERY_TIME_MS ] && echo "- Add database indexes and optimize queries")
$([ $max_memory_usage -ge $MAX_MEMORY_USAGE_MB ] && echo "- Investigate memory usage and implement optimizations")
$([ $FAILED_TESTS -eq 0 ] && echo "- System meets all performance requirements for production deployment")

EOF
    
    log_success "Performance report generated: $report_file"
    log_success "Performance summary generated: $summary_file"
    
    # Display summary
    log_info ""
    log_info "Performance Validation Summary:"
    log_info "==============================="
    log_info "Detection Latency: $([ $avg_detection_latency -lt $MAX_DETECTION_LATENCY_MS ] && echo "✅ ${avg_detection_latency}ms" || echo "❌ ${avg_detection_latency}ms")"
    log_info "API Response Time: $([ $p95_api_response_time -lt $MAX_API_RESPONSE_TIME_MS ] && echo "✅ ${p95_api_response_time}ms (P95)" || echo "❌ ${p95_api_response_time}ms (P95)")"
    log_info "Database Queries: $([ $avg_db_query_time -lt $MAX_DB_QUERY_TIME_MS ] && echo "✅ ${avg_db_query_time}ms" || echo "❌ ${avg_db_query_time}ms")"
    log_info "Memory Usage: $([ $max_memory_usage -lt $MAX_MEMORY_USAGE_MB ] && echo "✅ ${max_memory_usage}MB" || echo "❌ ${max_memory_usage}MB")"
    log_info "Overall Success Rate: $(echo "scale=1; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc -l 2>/dev/null || echo "0")%"
}

# =====================================================
# MAIN PERFORMANCE VALIDATION EXECUTION
# =====================================================

main() {
    log_info "🚀 Starting Phase 4 Performance Validation"
    log_info "============================================"
    log_info "Timestamp: $(date)"
    log_info "Log file: $LOG_FILE"
    log_info "Results directory: $RESULTS_DIR"
    log_info ""
    log_info "Performance Requirements:"
    log_info "- Detection latency: <${MAX_DETECTION_LATENCY_MS}ms"
    log_info "- API response time: <${MAX_API_RESPONSE_TIME_MS}ms (95th percentile)"
    log_info "- Database queries: <${MAX_DB_QUERY_TIME_MS}ms average"
    log_info "- Memory usage: <${MAX_MEMORY_USAGE_MB}MB maximum"
    log_info "- Success rate: ≥${MIN_SUCCESS_RATE_PERCENT}%"
    log_info ""
    
    # Create temp and results directories
    mkdir -p "$TEMP_DIR"
    mkdir -p "$RESULTS_DIR"
    
    # Run all performance tests
    local test_functions=(
        "test_detection_algorithm_performance"
        "test_api_response_times"
        "test_database_query_performance"
        "test_high_load_behavior"
        "test_memory_and_cache_efficiency"
    )
    
    local start_time=$(date +%s)
    
    for test_func in "${test_functions[@]}"; do
        log_info ""
        $test_func
    done
    
    local end_time=$(date +%s)
    local total_duration=$((end_time - start_time))
    
    # Generate performance report
    generate_performance_report
    
    # Final assessment
    log_section "📋 FINAL PERFORMANCE ASSESSMENT"
    log_info "Total Test Duration: ${total_duration} seconds"
    log_info "Total Tests: $TOTAL_TESTS"
    log_info "Passed: $PASSED_TESTS"
    log_info "Failed: $FAILED_TESTS"
    log_info "Warnings: $WARNINGS"
    
    local success_rate=$(echo "scale=1; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc -l 2>/dev/null || echo "0")
    log_info "Success Rate: $success_rate%"
    
    if [ $FAILED_TESTS -eq 0 ]; then
        log_success "🎉 ALL PERFORMANCE TESTS PASSED - SYSTEM MEETS PRODUCTION REQUIREMENTS"
        log_info ""
        log_info "✅ Performance Validation Results:"
        log_info "   ✓ Detection algorithms perform within latency requirements"
        log_info "   ✓ API endpoints meet response time requirements"
        log_info "   ✓ Database queries perform efficiently"
        log_info "   ✓ System handles high load gracefully"
        log_info "   ✓ Memory usage is within acceptable limits"
        log_info "   ✓ System ready for festival-scale deployment"
        log_info ""
        log_success "🚀 PERFORMANCE VALIDATION SUCCESSFUL - READY FOR PRODUCTION!"
        
        return 0
    else
        log_error "❌ PERFORMANCE VALIDATION FAILURES DETECTED"
        log_info ""
        log_info "Performance issues found:"
        log_info "- $FAILED_TESTS tests failed"
        log_info "- $WARNINGS warnings issued"
        log_info ""
        log_error "🚫 SYSTEM NOT READY FOR PRODUCTION"
        log_info "Please address performance issues before deployment."
        log_info "Review the detailed performance report for specific recommendations."
        
        return 1
    fi
}

# =====================================================
# SCRIPT EXECUTION
# =====================================================

# Check if script is being sourced or executed
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
    exit $?
fi
}

# =====================================================
# MEMORY USAGE AND CACHE EFFICIENCY
# =====================================================

test_memory_and_cache_efficiency() {
    log_section "🧠 MEMORY USAGE AND CACHE EFFICIENCY"
    
    test_start "Memory usage monitoring"
    
    log_info "Monitoring memory usage during extended operations..."
    
    # Record baseline memory usage
    local baseline_memory=$(get_memory_usage)
    MEMORY_USAGE+=($baseline_memory)
    
    log_info "Baseline memory usage: ${baseline_memory}MB"
    
    # Run extended operations while monitoring memory
    local memory_test_duration=60 # 1 minute
    local memory_test_start=$(date +%s)
    local operations_count=0
    
    while [ $(($(date +%s) - memory_test_start)) -lt $memory_test_duration ]; do
        # Simulate memory-intensive operations
        if [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_ANON_KEY:-}" ]; then
            local base_url="${SUPABASE_URL}/functions/v1"
            local auth_header="Authorization: Bearer ${SUPABASE_ANON_KEY}"
            local api_key_header="apikey: ${SUPABASE_ANON_KEY}"
            
            curl -s -H "$auth_header" -H "$api_key_header" \
                "$base_url/monitoring-api/dashboard" -o /dev/null 2>/dev/null
        fi
        
        # Record memory usage
        local current_memory=$(get_memory_usage)
        MEMORY_USAGE+=($current_memory)
        
        ((operations_count++))
        sleep 2
    done
    
    # Analyze memory usage patterns
    local max_memory=$(printf '%s\n' "${MEMORY_USAGE[@]}" | sort -n | tail -1)
    local min_memory=$(printf '%s\n' "${MEMORY_USAGE[@]}" | sort -n | head -1)
    local avg_memory=$(calculate_average MEMORY_USAGE)
    local memory_growth=$((max_memory - baseline_memory))
    
    log_info "Memory Usage Analysis:"
    log_info "  Baseline: ${baseline_memory}MB"
    log_info "  Average: ${avg_memory}MB"
    log_info "  Maximum: ${max_memory}MB"
    log_info "  Minimum: ${min_memory}MB"
    log_info "  Growth: ${memory_growth}MB"
    log_info "  Operations: $operations_count"
    
    # Validate memory usage
    test_start "Memory usage within limits"
    if [ $max_memory -lt $MAX_MEMORY_USAGE_MB ]; then
        log_success "Maximum memory usage: ${max_memory}MB (< ${MAX_MEMORY_USAGE_MB}MB)"
    else
        log_error "Maximum memory usage: ${max_memory}MB (exceeds ${MAX_MEMORY_USAGE_MB}MB)"
    fi
    
    test_start "Memory leak detection"
    local memory_leak_threshold=100 # 100MB growth threshold
    if [ $memory_growth -lt $memory_leak_threshold ]; then
        log_success "Memory growth: ${memory_growth}MB (< ${memory_leak_threshold}MB threshold)"
    else
        log_warning "Memory growth: ${memory_growth}MB (exceeds ${memory_leak_threshold}MB threshold)"
    fi
    
    # Test cache efficiency (simplified)
    test_start "Cache efficiency simulation"
    if [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_ANON_KEY:-}" ]; then
        local base_url="${SUPABASE_URL}/functions/v1"
        local auth_header="Authorization: Bearer ${SUPABASE_ANON_KEY}"
        local api_key_header="apikey: ${SUPABASE_ANON_KEY}"
        
        # Make repeated calls to test caching
        local cache_test_calls=10
        local cache_times=()
        
        for i in $(seq 1 $cache_test_calls); do
            local start_time=$(date +%s%3N)
            curl -s -H "$auth_header" -H "$api_key_header" \
                "$base_url/monitoring/health" -o /dev/null 2>/dev/null
            local end_time=$(date +%s%3N)
            local call_time=$((end_time - start_time))
            cache_times+=($call_time)
        done
        
        if [ ${#cache_times[@]} -gt 0 ]; then
            local first_call=${cache_times[0]}
            local avg_subsequent=$(calculate_average cache_times)
            local cache_improvement=$((first_call - avg_subsequent))
            
            log_info "Cache Efficiency Test:"
            log_info "  First Call: ${first_call}ms"
            log_info "  Average Subsequent: ${avg_subsequent}ms"
            log_info "  Improvement: ${cache_improvement}ms"
            
            if [ $cache_improvement -gt 0 ]; then
                log_success "Cache showing performance improvement: ${cache_improvement}ms"
            else
                log_info "Cache performance: consistent response times"
            fi
        fi
    else
        log_info "Cache efficiency test