/**
 * Phase 4 Monitoring System - Main Export File
 * 
 * This file exports all monitoring services and utilities for easy import
 * throughout the application.
 * 
 * @version 1.0.0
 * @author Phase 4 Implementation Team
 * @date 2025-06-14
 */

// Export main services
export { DetectionService, detectionService } from './detection-service.ts';
export { BackgroundProcessor, backgroundProcessor } from './background-processor.ts';
export { MonitoringClient, monitoringClient } from './monitoring-client.ts';

// Export types for convenience
export type {
  MonitoringEvent,
  MonitoringEventInsert,
  MonitoringEventUpdate,
  SystemHealthSnapshot,
  AlertHistory,
  MonitoringDetectionCycleResult,
  TransactionFailureDetectionResult,
  BalanceDiscrepancyDetectionResult,
  DuplicateNFCDetectionResult,
  RaceConditionDetectionResult,
  HealthCheckResponse,
  MetricsResponse,
  DashboardResponse,
  MonitoringEventsResponse,
  BackgroundJobConfig,
  BackgroundJobResult,
  CircuitBreakerInfo,
  PerformanceMetrics
} from '../../types/monitoring';

export {
  MonitoringEventType,
  MonitoringSeverity,
  MonitoringEventStatus,
  SystemHealthStatus,
  AlertLevel,
  CircuitBreakerState,
  ComponentStatus,
  DEFAULT_MONITORING_CONFIG,
  DETECTION_PRIORITIES,
  SEVERITY_WEIGHTS
} from '../../types/monitoring';

// Import the instances we need
import { detectionService } from './detection-service.ts';
import { backgroundProcessor } from './background-processor.ts';
import { monitoringClient } from './monitoring-client.ts';

/**
 * Initialize the monitoring system
 */
export async function initializeMonitoring(): Promise<void> {
  try {
    console.log('Initializing Phase 4 monitoring system...');
    
    // Start background processor
    await backgroundProcessor.start();
    
    console.log('Phase 4 monitoring system initialized successfully');
  } catch (error) {
    console.error('Failed to initialize monitoring system:', error);
    throw error;
  }
}

/**
 * Shutdown the monitoring system
 */
export async function shutdownMonitoring(): Promise<void> {
  try {
    console.log('Shutting down Phase 4 monitoring system...');
    
    // Stop background processor
    await backgroundProcessor.stop();
    
    // Cleanup monitoring client
    monitoringClient.cleanup();
    
    console.log('Phase 4 monitoring system shutdown complete');
  } catch (error) {
    console.error('Error during monitoring system shutdown:', error);
    throw error;
  }
}

/**
 * Get monitoring system status
 */
export function getMonitoringStatus(): {
  detection_service: boolean;
  background_processor: any;
  monitoring_client: boolean;
} {
  return {
    detection_service: true, // DetectionService is always available
    background_processor: backgroundProcessor.getStatus(),
    monitoring_client: true, // MonitoringClient is always available
  };
}

/**
 * Run a manual detection cycle
 */
export async function runManualDetectionCycle(): Promise<import('@/types/monitoring').MonitoringDetectionCycleResult> {
  try {
    console.log('Running manual detection cycle...');
    const result = await detectionService.runDetectionCycle();
    console.log('Manual detection cycle completed:', result);
    return result;
  } catch (error) {
    console.error('Manual detection cycle failed:', error);
    throw error;
  }
}

/**
 * Get current system health
 */
export async function getCurrentSystemHealth(): Promise<import('@/types/monitoring').HealthCheckResponse> {
  try {
    return await monitoringClient.getHealthCheck();
  } catch (error) {
    console.error('Failed to get system health:', error);
    throw error;
  }
}

/**
 * Subscribe to monitoring events
 */
export function subscribeToMonitoringEvents(
  callback: (event: import('@/types/monitoring').MonitoringEvent) => void,
  filters?: any
): () => void {
  return monitoringClient.subscribeToEvents(callback, filters);
}