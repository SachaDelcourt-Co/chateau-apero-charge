# Phase 4 Monitoring System - API Reference

## 🎯 Overview

This document provides comprehensive API reference documentation for the Phase 4 Monitoring System. The system exposes RESTful APIs through Supabase Edge Functions for accessing monitoring data, triggering detection cycles, and managing system health.

**Base URLs:**
- **Monitoring Processor**: `https://your-project.supabase.co/functions/v1/monitoring`
- **Monitoring API**: `https://your-project.supabase.co/functions/v1/monitoring-api`

**Authentication**: All endpoints require Supabase service role key authentication.

## 🔐 Authentication

All API requests must include authentication headers:

```bash
Authorization: Bearer YOUR_SUPABASE_SERVICE_ROLE_KEY
Content-Type: application/json
```

### Authentication Example

```bash
curl -X GET "https://your-project.supabase.co/functions/v1/monitoring-api/health" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json"
```

### Error Responses

**401 Unauthorized**
```json
{
  "error": "Unauthorized",
  "message": "Invalid or missing authentication token"
}
```

**403 Forbidden**
```json
{
  "error": "Forbidden", 
  "message": "Insufficient permissions for this operation"
}
```

## 📊 Monitoring API Endpoints

### Health Check

Get comprehensive system health information including component status, metrics, and recent alerts.

**Endpoint**: `GET /health`  
**Base URL**: `monitoring-api`

#### Request

```bash
curl -X GET "https://your-project.supabase.co/functions/v1/monitoring-api/health" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

#### Response

```json
{
  "status": "HEALTHY",
  "timestamp": "2025-06-15T13:45:00.000Z",
  "uptime_seconds": 3600,
  "system_metrics": {
    "transactions_last_hour": 1250,
    "success_rate_percent": 99.2,
    "avg_processing_time_ms": 150,
    "active_monitoring_events": 3,
    "critical_events_count": 0
  },
  "components": {
    "transaction_detector": {
      "status": "UP",
      "last_check": "2025-06-15T13:44:30.000Z",
      "response_time_ms": 45,
      "circuit_breaker_state": "CLOSED"
    },
    "balance_detector": {
      "status": "UP", 
      "last_check": "2025-06-15T13:44:30.000Z",
      "response_time_ms": 38,
      "circuit_breaker_state": "CLOSED"
    },
    "nfc_detector": {
      "status": "UP",
      "last_check": "2025-06-15T13:44:30.000Z", 
      "response_time_ms": 52,
      "circuit_breaker_state": "CLOSED"
    },
    "race_detector": {
      "status": "UP",
      "last_check": "2025-06-15T13:44:30.000Z",
      "response_time_ms": 41,
      "circuit_breaker_state": "CLOSED"
    },
    "database": {
      "status": "UP",
      "last_check": "2025-06-15T13:44:30.000Z",
      "response_time_ms": 12,
      "circuit_breaker_state": "CLOSED"
    },
    "circuit_breaker": {
      "status": "UP",
      "last_check": "2025-06-15T13:44:30.000Z",
      "response_time_ms": 5,
      "circuit_breaker_state": "CLOSED"
    }
  },
  "recent_alerts": [
    {
      "alert_id": 123,
      "alert_level": "WARNING",
      "alert_message": "High transaction volume detected",
      "alert_timestamp": "2025-06-15T13:30:00.000Z",
      "event_type": "system_health",
      "resolved": false
    }
  ]
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Overall system health: `HEALTHY`, `WARNING`, `CRITICAL`, `UNKNOWN` |
| `timestamp` | string | Current timestamp in ISO 8601 format |
| `uptime_seconds` | number | System uptime in seconds |
| `system_metrics` | object | Key system performance metrics |
| `components` | object | Individual component health status |
| `recent_alerts` | array | Recent alerts requiring attention |

#### Status Codes

- **200 OK**: Health check successful
- **500 Internal Server Error**: Health check failed

### Monitoring Events

Retrieve monitoring events with filtering, pagination, and sorting capabilities.

**Endpoint**: `GET /events`  
**Base URL**: `monitoring-api`

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `event_type` | string | No | Filter by event type: `transaction_failure`, `balance_discrepancy`, `duplicate_nfc`, `race_condition`, `system_health` |
| `severity` | string | No | Filter by severity: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `INFO` |
| `status` | string | No | Filter by status: `OPEN`, `INVESTIGATING`, `RESOLVED`, `FALSE_POSITIVE` |
| `card_id` | string | No | Filter by specific card ID |
| `start_date` | string | No | Start date filter (ISO 8601 format) |
| `end_date` | string | No | End date filter (ISO 8601 format) |
| `page` | number | No | Page number for pagination (default: 1) |
| `per_page` | number | No | Items per page (default: 50, max: 100) |

#### Request Examples

```bash
# Get all events
curl -X GET "https://your-project.supabase.co/functions/v1/monitoring-api/events" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"

# Get critical events only
curl -X GET "https://your-project.supabase.co/functions/v1/monitoring-api/events?severity=CRITICAL" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"

# Get events for specific card
curl -X GET "https://your-project.supabase.co/functions/v1/monitoring-api/events?card_id=CARD_123" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"

# Get events with date range and pagination
curl -X GET "https://your-project.supabase.co/functions/v1/monitoring-api/events?start_date=2025-06-15T00:00:00Z&end_date=2025-06-15T23:59:59Z&page=2&per_page=25" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

#### Response

```json
{
  "events": [
    {
      "event_id": 1001,
      "event_type": "transaction_failure",
      "severity": "CRITICAL",
      "card_id": "CARD_123",
      "transaction_id": "550e8400-e29b-41d4-a716-446655440000",
      "affected_amount": 15.50,
      "detection_timestamp": "2025-06-15T13:42:15.000Z",
      "detection_algorithm": "balance_deduction_on_failure",
      "confidence_score": 1.0,
      "event_data": {
        "previous_balance": 50.00,
        "new_balance": 34.50,
        "current_balance": 34.50,
        "discrepancy": 15.50,
        "transaction_timestamp": "2025-06-15T13:42:10.000Z"
      },
      "context_data": {
        "detection_time": "2025-06-15T13:42:15.000Z",
        "requires_immediate_investigation": true,
        "financial_impact": "high"
      },
      "status": "OPEN",
      "resolved_at": null,
      "resolution_notes": null,
      "created_at": "2025-06-15T13:42:15.000Z",
      "updated_at": "2025-06-15T13:42:15.000Z"
    }
  ],
  "pagination": {
    "total": 156,
    "page": 1,
    "per_page": 50,
    "total_pages": 4,
    "has_next": true,
    "has_prev": false
  },
  "filters_applied": {
    "event_type": null,
    "severity": null,
    "status": null,
    "card_id": null,
    "start_date": null,
    "end_date": null
  },
  "total_critical": 12,
  "total_open": 23
}
```

#### Status Codes

- **200 OK**: Events retrieved successfully
- **400 Bad Request**: Invalid query parameters
- **500 Internal Server Error**: Server error

### System Metrics

Get comprehensive system metrics and trend data for performance analysis.

**Endpoint**: `GET /metrics`  
**Base URL**: `monitoring-api`

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `start` | string | No | Start time for metrics (ISO 8601, default: 24 hours ago) |
| `end` | string | No | End time for metrics (ISO 8601, default: now) |

#### Request Example

```bash
curl -X GET "https://your-project.supabase.co/functions/v1/monitoring-api/metrics?start=2025-06-14T13:00:00Z&end=2025-06-15T13:00:00Z" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

#### Response

```json
{
  "time_range": {
    "start": "2025-06-14T13:00:00.000Z",
    "end": "2025-06-15T13:00:00.000Z"
  },
  "financial_metrics": {
    "total_transaction_volume": 125000.50,
    "failed_transaction_count": 23,
    "balance_discrepancies_detected": 2,
    "total_discrepancy_amount": 31.00,
    "financial_integrity_score": 99.8
  },
  "performance_metrics": {
    "avg_detection_time_ms": 145,
    "monitoring_cycles_completed": 2880,
    "monitoring_errors": 1,
    "system_uptime_percent": 99.9
  },
  "trends": {
    "hourly_transaction_counts": [
      {
        "timestamp": "2025-06-15T12:00:00.000Z",
        "value": 450,
        "metadata": {
          "hour": 12,
          "generated": false
        }
      }
    ],
    "failure_rates": [
      {
        "timestamp": "2025-06-15T12:00:00.000Z", 
        "value": 1.2,
        "metadata": {
          "hour": 12,
          "generated": false
        }
      }
    ],
    "processing_times": [
      {
        "timestamp": "2025-06-15T12:00:00.000Z",
        "value": 142,
        "metadata": {
          "hour": 12,
          "generated": false
        }
      }
    ],
    "balance_discrepancies": [
      {
        "timestamp": "2025-06-15T12:00:00.000Z",
        "value": 0,
        "metadata": {
          "hour": 12,
          "generated": false
        }
      }
    ]
  }
}
```

#### Status Codes

- **200 OK**: Metrics retrieved successfully
- **400 Bad Request**: Invalid time range parameters
- **500 Internal Server Error**: Server error

### Dashboard Data

Get comprehensive dashboard data including KPIs, real-time metrics, charts, and system status.

**Endpoint**: `GET /dashboard`  
**Base URL**: `monitoring-api`

#### Request Example

```bash
curl -X GET "https://your-project.supabase.co/functions/v1/monitoring-api/dashboard" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

#### Response

```json
{
  "kpis": {
    "system_health": "HEALTHY",
    "transaction_success_rate": 99.2,
    "balance_integrity_score": 99.8,
    "monitoring_system_uptime": 99.9
  },
  "real_time": {
    "active_transactions": 45,
    "recent_failures": 2,
    "open_monitoring_events": 5,
    "system_load_percent": 25
  },
  "charts": {
    "transaction_volume_24h": {
      "labels": ["00:00", "01:00", "02:00", "..."],
      "datasets": [{
        "label": "Transaction Volume",
        "data": [120, 95, 80, 150, 200, 350],
        "backgroundColor": "rgba(54, 162, 235, 0.2)",
        "borderColor": "rgba(54, 162, 235, 1)"
      }]
    },
    "failure_rate_trend": {
      "labels": ["00:00", "01:00", "02:00", "..."],
      "datasets": [{
        "label": "Failure Rate %",
        "data": [0.5, 0.8, 0.3, 1.2, 0.9, 0.6],
        "backgroundColor": "rgba(255, 99, 132, 0.2)",
        "borderColor": "rgba(255, 99, 132, 1)"
      }]
    },
    "balance_discrepancy_trend": {
      "labels": ["00:00", "01:00", "02:00", "..."],
      "datasets": [{
        "label": "Balance Discrepancies",
        "data": [0, 0, 1, 0, 0, 1],
        "backgroundColor": "rgba(255, 206, 86, 0.2)",
        "borderColor": "rgba(255, 206, 86, 1)"
      }]
    },
    "nfc_duplicate_rate": {
      "labels": ["00:00", "01:00", "02:00", "..."],
      "datasets": [{
        "label": "NFC Duplicate Rate %",
        "data": [0.1, 0.2, 0.1, 0.3, 0.2, 0.1],
        "backgroundColor": "rgba(75, 192, 192, 0.2)",
        "borderColor": "rgba(75, 192, 192, 1)"
      }]
    }
  },
  "recent_events": [
    {
      "event_id": 1001,
      "event_type": "transaction_failure",
      "severity": "CRITICAL",
      "card_id": "CARD_123",
      "detection_timestamp": "2025-06-15T13:42:15.000Z",
      "status": "OPEN"
    }
  ],
  "system_status": {
    "database_connection": true,
    "monitoring_processes": [
      {
        "name": "detection_service",
        "status": "UP",
        "uptime_seconds": 3600,
        "memory_usage_mb": 50,
        "cpu_usage_percent": 15,
        "last_activity": "2025-06-15T13:45:00.000Z"
      }
    ],
    "last_successful_check": "2025-06-15T13:45:00.000Z",
    "circuit_breakers": {
      "monitoring-detection": "CLOSED"
    }
  }
}
```

#### Status Codes

- **200 OK**: Dashboard data retrieved successfully
- **500 Internal Server Error**: Server error

## ⚙️ Monitoring Processor Endpoints

### Run Detection Cycle

Manually trigger a complete monitoring detection cycle.

**Endpoint**: `POST /cycle`  
**Base URL**: `monitoring`

#### Request Example

```bash
curl -X POST "https://your-project.supabase.co/functions/v1/monitoring/cycle" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

#### Response

```json
{
  "cycle_timestamp": "2025-06-15T13:45:00.000Z",
  "cycle_duration_seconds": 2.45,
  "total_events_created": 3,
  "health_snapshot_id": 1234,
  "detection_results": {
    "transaction_failures": {
      "detection_type": "transaction_failures",
      "events_created": 1,
      "detection_timestamp": "2025-06-15T13:45:01.000Z",
      "success": true,
      "balance_deduction_failures": 1,
      "consecutive_failures": 0,
      "system_failure_spikes": 0
    },
    "balance_discrepancies": {
      "detection_type": "balance_discrepancies",
      "events_created": 0,
      "detection_timestamp": "2025-06-15T13:45:01.500Z",
      "success": true,
      "balance_mismatches": 0,
      "negative_balances": 0
    },
    "duplicate_nfc_scans": {
      "detection_type": "duplicate_nfc_scans",
      "events_created": 2,
      "detection_timestamp": "2025-06-15T13:45:02.000Z",
      "success": true,
      "temporal_duplicates": 2
    },
    "race_conditions": {
      "detection_type": "race_conditions",
      "events_created": 0,
      "detection_timestamp": "2025-06-15T13:45:02.200Z",
      "success": true,
      "concurrent_transactions": 0
    }
  },
  "success": true
}
```

#### Status Codes

- **200 OK**: Detection cycle completed successfully
- **500 Internal Server Error**: Detection cycle failed

### Processor Health Check

Get monitoring processor health and circuit breaker status.

**Endpoint**: `GET /health`  
**Base URL**: `monitoring`

#### Request Example

```bash
curl -X GET "https://your-project.supabase.co/functions/v1/monitoring/health" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

#### Response

```json
{
  "status": "HEALTHY",
  "timestamp": "2025-06-15T13:45:00.000Z",
  "uptime_seconds": 3600,
  "system_metrics": {
    "transactions_last_hour": 1250,
    "success_rate_percent": 99.2,
    "monitoring_events_last_hour": 15,
    "critical_events_last_hour": 1
  },
  "circuit_breaker": {
    "state": "CLOSED",
    "failure_count": 0,
    "last_failure_time": null,
    "half_open_calls": 0,
    "config": {
      "failure_threshold": 5,
      "recovery_timeout_ms": 60000,
      "half_open_max_calls": 2,
      "timeout_ms": 30000
    }
  }
}
```

#### Status Codes

- **200 OK**: Health check successful
- **500 Internal Server Error**: Health check failed

### Get Monitoring Events

Retrieve monitoring events with basic filtering.

**Endpoint**: `GET /events`  
**Base URL**: `monitoring`

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `event_type` | string | No | Filter by event type |
| `severity` | string | No | Filter by severity |
| `status` | string | No | Filter by status |
| `limit` | number | No | Maximum number of events to return (default: 50) |

#### Request Example

```bash
curl -X GET "https://your-project.supabase.co/functions/v1/monitoring/events?severity=CRITICAL&limit=10" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

#### Response

```json
{
  "events": [
    {
      "event_id": 1001,
      "event_type": "transaction_failure",
      "severity": "CRITICAL",
      "card_id": "CARD_123",
      "detection_timestamp": "2025-06-15T13:42:15.000Z",
      "status": "OPEN"
    }
  ],
  "total": 1,
  "filters_applied": {
    "event_type": null,
    "severity": "CRITICAL",
    "status": null,
    "limit": 10
  },
  "timestamp": "2025-06-15T13:45:00.000Z"
}
```

#### Status Codes

- **200 OK**: Events retrieved successfully
- **500 Internal Server Error**: Server error

### Service Status

Get detailed service status and configuration information.

**Endpoint**: `GET /status`  
**Base URL**: `monitoring`

#### Request Example

```bash
curl -X GET "https://your-project.supabase.co/functions/v1/monitoring/status" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

#### Response

```json
{
  "service": "Phase 4 Monitoring System",
  "version": "1.0.0",
  "timestamp": "2025-06-15T13:45:00.000Z",
  "environment": "production",
  "circuit_breaker": {
    "state": "CLOSED",
    "failure_count": 0,
    "last_failure_time": null,
    "half_open_calls": 0,
    "config": {
      "failure_threshold": 5,
      "recovery_timeout_ms": 60000,
      "half_open_max_calls": 2,
      "timeout_ms": 30000
    }
  },
  "config": {
    "intervals": {
      "critical_checks": 30000,
      "medium_checks": 120000,
      "health_checks": 300000,
      "cleanup": 3600000
    },
    "circuit_breaker": {
      "failure_threshold": 5,
      "recovery_timeout_ms": 60000,
      "half_open_max_calls": 2,
      "timeout_ms": 30000
    }
  }
}
```

#### Status Codes

- **200 OK**: Status retrieved successfully
- **500 Internal Server Error**: Server error

## 🚫 Rate Limiting

### Rate Limits

| Endpoint Category | Rate Limit | Window |
|------------------|------------|---------|
| **Health Checks** | 60 requests | 1 minute |
| **Data Retrieval** | 100 requests | 1 minute |
| **Detection Cycles** | 10 requests | 1 minute |
| **Dashboard** | 30 requests | 1 minute |

### Rate Limit Headers

All responses include rate limiting headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

### Rate Limit Exceeded Response

```json
{
  "error": "Rate Limit Exceeded",
  "message": "Too many requests. Please try again later.",
  "retry_after": 60
}
```

## ❌ Error Handling

### Standard Error Response Format

```json
{
  "error": "Error Type",
  "message": "Human-readable error description",
  "timestamp": "2025-06-15T13:45:00.000Z",
  "details": {
    "code": "SPECIFIC_ERROR_CODE",
    "field": "field_name",
    "value": "invalid_value"
  }
}
```

### Common Error Codes

| HTTP Status | Error Code | Description |
|-------------|------------|-------------|
| **400** | `INVALID_PARAMETERS` | Invalid request parameters |
| **400** | `INVALID_DATE_RANGE` | Invalid date range specified |
| **400** | `INVALID_PAGINATION` | Invalid pagination parameters |
| **401** | `UNAUTHORIZED` | Missing or invalid authentication |
| **403** | `FORBIDDEN` | Insufficient permissions |
| **404** | `NOT_FOUND` | Endpoint or resource not found |
| **429** | `RATE_LIMIT_EXCEEDED` | Rate limit exceeded |
| **500** | `INTERNAL_ERROR` | Internal server error |
| **503** | `SERVICE_UNAVAILABLE` | Service temporarily unavailable |

### Error Response Examples

#### Invalid Parameters
```json
{
  "error": "Bad Request",
  "message": "Invalid severity parameter",
  "timestamp": "2025-06-15T13:45:00.000Z",
  "details": {
    "code": "INVALID_PARAMETERS",
    "field": "severity",
    "value": "INVALID_SEVERITY",
    "allowed_values": ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]
  }
}
```

#### Service Unavailable
```json
{
  "error": "Service Unavailable",
  "message": "Monitoring system is temporarily unavailable due to maintenance",
  "timestamp": "2025-06-15T13:45:00.000Z",
  "details": {
    "code": "MAINTENANCE_MODE",
    "retry_after": 300
  }
}
```

## 🔧 Integration Examples

### JavaScript/TypeScript Integration

```typescript
interface MonitoringAPIClient {
  baseUrl: string;
  apiKey: string;
}

class MonitoringAPI {
  constructor(private config: MonitoringAPIClient) {}

  async getHealth(): Promise<HealthCheckResponse> {
    const response = await fetch(`${this.config.baseUrl}/monitoring-api/health`, {
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`);
    }

    return response.json();
  }

  async getEvents(filters?: EventFilters): Promise<MonitoringEventsResponse> {
    const params = new URLSearchParams();
    if (filters?.event_type) params.append('event_type', filters.event_type);
    if (filters?.severity) params.append('severity', filters.severity);
    if (filters?.status) params.append('status', filters.status);

    const response = await fetch(
      `${this.config.baseUrl}/monitoring-api/events?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get events: ${response.statusText}`);
    }

    return response.json();
  }

  async triggerDetectionCycle(): Promise<DetectionCycleResult> {
    const response = await fetch(`${this.config.baseUrl}/monitoring/cycle`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Detection cycle failed: ${response.statusText}`);
    }

    return response.json();
  }
}

// Usage example
const monitoringAPI = new MonitoringAPI({
  baseUrl: 'https://your-project.supabase.co/functions/v1',
  apiKey: 'your-service-role-key'
});

// Get system health
const health = await monitoringAPI.getHealth();
console.log('System status:', health.status);

// Get critical events
const criticalEvents = await monitoringAPI.getEvents({
  severity: 'CRITICAL',
  status: 'OPEN'
});
console.log('Critical events:', criticalEvents.events.length);
```

### Python Integration

```python
import requests
from typing import Optional, Dict, Any
from datetime import datetime

class MonitoringAPI:
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url
        self.headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        }

    def get_health(self) -> Dict[str, Any]:
        """Get system health status"""
        response = requests.get(
            f'{self.base_url}/monitoring-api/health',
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()

    def get_events(self, 
                   event_type: Optional[str] = None,
                   severity: Optional[str] = None,
                   status: Optional[str] = None,
                   page: int = 1,
                   per_page: int = 50) -> Dict[str, Any]:
        """Get monitoring events with filtering"""
        params = {'page': page, 'per_page': per_page}
        if event_type:
            params['event_type'] = event_type
        if severity:
            params['severity'] = severity
        if status:
            params['status'] = status

        response = requests.get(
            f'{self.base_url}/monitoring-api/events',
            headers=self.headers,
            params=params
        )
        response.raise_for_status()
        return response.json()

    def trigger_detection_cycle(self) -> Dict[str, Any]:
        """Trigger a manual detection cycle"""
        response = requests.post(
            f'{self.base_url}/monitoring/cycle',
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()

    def get_metrics(self, 
                    start_time: Optional[datetime] = None,
                    end_time: Optional[datetime] = None) -> Dict[str, Any]:
        """Get system metrics and trends"""
        params = {}
        if start_time:
            params['start'] = start_time.isoformat()
        if end_time:
            params['end'] = end_time.isoformat()

        response = requests.get(
            f'{self.base_url}/monitoring-api/metrics',
            headers=self.headers,
            params=params
        )
        response.raise_for_status()
        return response.json()

# Usage example
api = MonitoringAPI(
    base_url='https://your-project.supabase.co/functions/v1',
    api_key='your-service-role-key'
)

# Check system health
health = api.get_health()
print(f"System status: {health['status']}")

# Get recent critical events
events = api.get_events(severity='CRITICAL', status='OPEN')
print(f"Open critical events: {len(events['events'])}")

# Trigger detection cycle
result = api.trigger_detection_cycle()
print(f"Detection cycle created {result['total_events_created']} events")
```

### cURL Examples

#### Health Monitoring Script

```bash
#!/bin/bash
# health-monitor.