/**
 * Phase 4 Monitoring System - Background Processor
 * 
 * This service manages the background processing of monitoring detection cycles,
 * implementing staggered scheduling, circuit breaker patterns, and resource management.
 * 
 * @version 1.0.0
 * @author Phase 4 Implementation Team
 * @date 2025-06-14
 */

import { detectionService } from './detection-service';
import {
  CircuitBreakerState,
  DEFAULT_MONITORING_CONFIG
} from '@/types/monitoring';
import type {
  BackgroundJobConfig,
  BackgroundJobResult,
  CircuitBreakerConfig,
  CircuitBreakerInfo,
  MonitoringDetectionCycleResult,
  PerformanceMetrics
} from '@/types/monitoring';

/**
 * Circuit breaker implementation for fault tolerance
 */
class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private halfOpenCalls = 0;

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.config.recovery_timeout_ms) {
        this.state = CircuitBreakerState.HALF_OPEN;
        this.halfOpenCalls = 0;
      } else {
        throw new Error('Circuit breaker is OPEN - operation blocked');
      }
    }

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      if (this.halfOpenCalls >= this.config.half_open_max_calls) {
        throw new Error('Circuit breaker HALF_OPEN - max calls exceeded');
      }
      this.halfOpenCalls++;
    }

    try {
      const result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Operation timeout')), this.config.timeout_ms)
        )
      ]);

      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = CircuitBreakerState.CLOSED;
    this.halfOpenCalls = 0;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.config.failure_threshold) {
      this.state = CircuitBreakerState.OPEN;
    }
  }

  getInfo(): CircuitBreakerInfo {
    return {
      name: 'monitoring-detection',
      state: this.state,
      failure_count: this.failureCount,
      last_failure_time: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null,
      half_open_calls: this.halfOpenCalls,
      config: this.config
    };
  }
}

/**
 * Background processor for monitoring detection cycles
 */
export class BackgroundProcessor {
  private readonly config = DEFAULT_MONITORING_CONFIG;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly jobConfigs: Record<string, BackgroundJobConfig>;
  private readonly activeJobs = new Map<string, NodeJS.Timeout>();
  private isRunning = false;
  private startTime = 0;

  constructor() {
    this.circuitBreaker = new CircuitBreaker(this.config.circuit_breaker);
    
    this.jobConfigs = {
      CRITICAL_DETECTION: {
        name: 'critical_detection',
        interval_ms: this.config.intervals.critical_checks,
        priority: 'HIGH',
        timeout_ms: 30000,
        retry_attempts: 3,
        retry_delay_ms: 5000
      },
      MEDIUM_DETECTION: {
        name: 'medium_detection',
        interval_ms: this.config.intervals.medium_checks,
        priority: 'MEDIUM',
        timeout_ms: 30000,
        retry_attempts: 2,
        retry_delay_ms: 10000
      },
      HEALTH_SNAPSHOT: {
        name: 'health_snapshot',
        interval_ms: this.config.intervals.health_checks,
        priority: 'LOW',
        timeout_ms: 15000,
        retry_attempts: 1,
        retry_delay_ms: 30000
      },
      CLEANUP: {
        name: 'cleanup',
        interval_ms: this.config.intervals.cleanup,
        priority: 'MAINTENANCE',
        timeout_ms: 60000,
        retry_attempts: 1,
        retry_delay_ms: 300000
      }
    };
  }

  /**
   * Start the background processor with staggered scheduling
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('Background processor is already running');
      return;
    }

    this.isRunning = true;
    this.startTime = Date.now();

    console.log('Starting Phase 4 monitoring background processor...');

    // Start jobs with staggered delays to prevent resource contention
    const startupDelays = {
      CRITICAL_DETECTION: 0,        // Start immediately
      MEDIUM_DETECTION: 15000,      // Start after 15 seconds
      HEALTH_SNAPSHOT: 30000,       // Start after 30 seconds
      CLEANUP: 60000                // Start after 1 minute
    };

    for (const [jobName, config] of Object.entries(this.jobConfigs)) {
      const delay = startupDelays[jobName as keyof typeof startupDelays] || 0;
      
      setTimeout(() => {
        if (this.isRunning) {
          this.scheduleJob(jobName, config);
        }
      }, delay);
    }

    console.log('Background processor started successfully');
  }

  /**
   * Stop the background processor
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.warn('Background processor is not running');
      return;
    }

    console.log('Stopping Phase 4 monitoring background processor...');

    this.isRunning = false;

    // Clear all active jobs
    for (const [jobName, timeout] of this.activeJobs.entries()) {
      clearTimeout(timeout);
      this.activeJobs.delete(jobName);
    }

    console.log('Background processor stopped successfully');
  }

  /**
   * Get processor status and metrics
   */
  getStatus(): {
    isRunning: boolean;
    uptime_seconds: number;
    active_jobs: string[];
    circuit_breaker: CircuitBreakerInfo;
    performance_metrics: PerformanceMetrics;
  } {
    const uptime = this.isRunning ? (Date.now() - this.startTime) / 1000 : 0;
    
    return {
      isRunning: this.isRunning,
      uptime_seconds: uptime,
      active_jobs: Array.from(this.activeJobs.keys()),
      circuit_breaker: this.circuitBreaker.getInfo(),
      performance_metrics: {
        operation_name: 'background_processor',
        start_time: new Date(this.startTime).toISOString(),
        end_time: new Date().toISOString(),
        duration_ms: Date.now() - this.startTime,
        memory_usage_mb: this.getMemoryUsage(),
        cpu_usage_percent: 0, // Would need additional monitoring
        database_queries: 0,  // Would need query counting
        cache_hits: 0,        // Would need cache monitoring
        cache_misses: 0
      }
    };
  }

  /**
   * Run a single detection cycle manually
   */
  async runDetectionCycle(): Promise<MonitoringDetectionCycleResult> {
    return await this.circuitBreaker.execute(async () => {
      return await detectionService.runDetectionCycle();
    });
  }

  // =====================================================
  // PRIVATE METHODS
  // =====================================================

  /**
   * Schedule a background job
   */
  private scheduleJob(jobName: string, config: BackgroundJobConfig): void {
    const executeJob = async () => {
      if (!this.isRunning) return;

      try {
        const result = await this.executeJobWithRetry(config);
        
        if (result.success) {
          console.log(`Job ${jobName} completed successfully in ${result.duration_ms}ms`);
        } else {
          console.error(`Job ${jobName} failed:`, result.error);
        }
      } catch (error) {
        console.error(`Job ${jobName} execution error:`, error);
      }

      // Schedule next execution
      if (this.isRunning) {
        const timeout = setTimeout(executeJob, config.interval_ms);
        this.activeJobs.set(jobName, timeout);
      }
    };

    // Start the job
    executeJob();
  }

  /**
   * Execute a job with retry logic
   */
  private async executeJobWithRetry(config: BackgroundJobConfig): Promise<BackgroundJobResult> {
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= config.retry_attempts + 1; attempt++) {
      try {
        const result = await this.executeJob(config);
        
        return {
          job_name: config.name,
          started_at: new Date(startTime).toISOString(),
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startTime,
          success: true,
          events_processed: result.total_events_created || 0,
          metadata: {
            attempt: attempt,
            circuit_breaker_state: this.circuitBreaker.getInfo().state
          }
        };
      } catch (error) {
        lastError = error as Error;
        
        if (attempt <= config.retry_attempts) {
          console.warn(`Job ${config.name} failed (attempt ${attempt}), retrying in ${config.retry_delay_ms}ms:`, error);
          await this.sleep(config.retry_delay_ms);
        }
      }
    }

    return {
      job_name: config.name,
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      success: false,
      error: lastError?.message || 'Unknown error',
      metadata: {
        attempts: config.retry_attempts + 1,
        circuit_breaker_state: this.circuitBreaker.getInfo().state
      }
    };
  }

  /**
   * Execute a specific job based on its type
   */
  private async executeJob(config: BackgroundJobConfig): Promise<any> {
    switch (config.name) {
      case 'critical_detection':
        return await this.circuitBreaker.execute(() => 
          detectionService.runDetectionCycle()
        );
      
      case 'medium_detection':
        return await this.circuitBreaker.execute(() => 
          detectionService.runDetectionCycle()
        );
      
      case 'health_snapshot':
        return await this.circuitBreaker.execute(() => 
          detectionService.getSystemHealth()
        );
      
      case 'cleanup':
        return await this.executeCleanup();
      
      default:
        throw new Error(`Unknown job type: ${config.name}`);
    }
  }

  /**
   * Execute cleanup operations
   */
  private async executeCleanup(): Promise<any> {
    try {
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Log memory usage
      const memoryUsage = this.getMemoryUsage();
      console.log(`Cleanup completed. Memory usage: ${memoryUsage}MB`);

      return {
        cleanup_completed: true,
        memory_usage_mb: memoryUsage,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Get current memory usage in MB
   */
  private getMemoryUsage(): number {
    const usage = process.memoryUsage();
    return Math.round(usage.heapUsed / 1024 / 1024);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Singleton instance of the background processor
 */
export const backgroundProcessor = new BackgroundProcessor();