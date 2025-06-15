/**
 * Phase 4 Monitoring System - Demo and Testing
 * 
 * This file provides demonstration functions and testing utilities
 * for the Phase 4 monitoring system.
 * 
 * @version 1.0.0
 * @author Phase 4 Implementation Team
 * @date 2025-06-14
 */

import {
  initializeMonitoring,
  shutdownMonitoring,
  runManualDetectionCycle,
  getCurrentSystemHealth,
  subscribeToMonitoringEvents,
  getMonitoringStatus,
  detectionService,
  backgroundProcessor,
  monitoringClient
} from './index';

/**
 * Demo function to showcase monitoring system capabilities
 */
export async function runMonitoringDemo(): Promise<void> {
  console.log('🚀 Starting Phase 4 Monitoring System Demo...\n');

  try {
    // 1. Initialize the monitoring system
    console.log('1️⃣ Initializing monitoring system...');
    await initializeMonitoring();
    console.log('✅ Monitoring system initialized successfully\n');

    // 2. Get system status
    console.log('2️⃣ Getting system status...');
    const status = getMonitoringStatus();
    console.log('📊 System Status:', JSON.stringify(status, null, 2));
    console.log('');

    // 3. Run a manual detection cycle
    console.log('3️⃣ Running manual detection cycle...');
    const detectionResult = await runManualDetectionCycle();
    console.log('🔍 Detection Result:', JSON.stringify(detectionResult, null, 2));
    console.log('');

    // 4. Get current system health
    console.log('4️⃣ Getting system health...');
    const health = await getCurrentSystemHealth();
    console.log('🏥 System Health:', JSON.stringify(health, null, 2));
    console.log('');

    // 5. Get monitoring events
    console.log('5️⃣ Getting recent monitoring events...');
    const events = await detectionService.getMonitoringEvents({ limit: 5 });
    console.log(`📋 Found ${events.length} recent events:`);
    events.forEach((event, index) => {
      console.log(`   ${index + 1}. ${event.event_type} - ${event.severity} - ${event.detection_timestamp}`);
    });
    console.log('');

    // 6. Subscribe to real-time events (demo for 10 seconds)
    console.log('6️⃣ Subscribing to real-time events for 10 seconds...');
    const unsubscribe = subscribeToMonitoringEvents((event) => {
      console.log('🔔 New Event:', event.event_type, '-', event.severity);
    });

    // Wait 10 seconds then unsubscribe
    await new Promise(resolve => setTimeout(resolve, 10000));
    unsubscribe();
    console.log('✅ Unsubscribed from real-time events\n');

    // 7. Get dashboard data
    console.log('7️⃣ Getting dashboard data...');
    const dashboard = await monitoringClient.getDashboard();
    console.log('📊 Dashboard KPIs:', JSON.stringify(dashboard.kpis, null, 2));
    console.log('⚡ Real-time Data:', JSON.stringify(dashboard.real_time, null, 2));
    console.log('');

    // 8. Test background processor
    console.log('8️⃣ Testing background processor...');
    const processorStatus = backgroundProcessor.getStatus();
    console.log('⚙️ Processor Status:', JSON.stringify(processorStatus, null, 2));
    console.log('');

    console.log('🎉 Demo completed successfully!');

  } catch (error) {
    console.error('❌ Demo failed:', error);
    throw error;
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await shutdownMonitoring();
    console.log('✅ Cleanup completed');
  }
}

/**
 * Test individual detection algorithms
 */
export async function testDetectionAlgorithms(): Promise<void> {
  console.log('🧪 Testing individual detection algorithms...\n');

  try {
    // Test transaction failure detection
    console.log('1️⃣ Testing transaction failure detection...');
    const transactionResult = await detectionService.detectTransactionFailures();
    console.log('📊 Transaction Failures:', JSON.stringify(transactionResult, null, 2));
    console.log('');

    // Test balance discrepancy detection
    console.log('2️⃣ Testing balance discrepancy detection...');
    const balanceResult = await detectionService.detectBalanceDiscrepancies();
    console.log('📊 Balance Discrepancies:', JSON.stringify(balanceResult, null, 2));
    console.log('');

    // Test duplicate NFC detection
    console.log('3️⃣ Testing duplicate NFC detection...');
    const nfcResult = await detectionService.detectDuplicateNFCScans();
    console.log('📊 Duplicate NFC Scans:', JSON.stringify(nfcResult, null, 2));
    console.log('');

    // Test race condition detection
    console.log('4️⃣ Testing race condition detection...');
    const raceResult = await detectionService.detectRaceConditions();
    console.log('📊 Race Conditions:', JSON.stringify(raceResult, null, 2));
    console.log('');

    console.log('✅ All detection algorithms tested successfully!');

  } catch (error) {
    console.error('❌ Detection algorithm testing failed:', error);
    throw error;
  }
}

/**
 * Performance benchmark for the monitoring system
 */
export async function benchmarkMonitoringSystem(): Promise<void> {
  console.log('⚡ Benchmarking monitoring system performance...\n');

  const iterations = 5;
  const results: number[] = [];

  try {
    for (let i = 1; i <= iterations; i++) {
      console.log(`🏃 Running benchmark iteration ${i}/${iterations}...`);
      
      const startTime = Date.now();
      await runManualDetectionCycle();
      const duration = Date.now() - startTime;
      
      results.push(duration);
      console.log(`⏱️ Iteration ${i} completed in ${duration}ms`);
    }

    // Calculate statistics
    const avgTime = results.reduce((sum, time) => sum + time, 0) / results.length;
    const minTime = Math.min(...results);
    const maxTime = Math.max(...results);

    console.log('\n📊 Benchmark Results:');
    console.log(`   Average time: ${avgTime.toFixed(2)}ms`);
    console.log(`   Minimum time: ${minTime}ms`);
    console.log(`   Maximum time: ${maxTime}ms`);
    console.log(`   Total iterations: ${iterations}`);

    // Performance assessment
    if (avgTime < 5000) {
      console.log('🟢 Performance: Excellent (< 5s average)');
    } else if (avgTime < 10000) {
      console.log('🟡 Performance: Good (< 10s average)');
    } else {
      console.log('🔴 Performance: Needs optimization (> 10s average)');
    }

  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    throw error;
  }
}

/**
 * Stress test the monitoring system
 */
export async function stressTestMonitoringSystem(): Promise<void> {
  console.log('💪 Stress testing monitoring system...\n');

  const concurrentCycles = 3;
  const cyclesPerTest = 2;

  try {
    console.log(`🔥 Running ${concurrentCycles} concurrent detection cycles, ${cyclesPerTest} times each...`);

    for (let test = 1; test <= cyclesPerTest; test++) {
      console.log(`\n🧪 Stress test ${test}/${cyclesPerTest}:`);
      
      const startTime = Date.now();
      
      // Run multiple detection cycles concurrently
      const promises = Array(concurrentCycles).fill(null).map(async (_, index) => {
        try {
          console.log(`   🚀 Starting concurrent cycle ${index + 1}...`);
          const result = await runManualDetectionCycle();
          console.log(`   ✅ Concurrent cycle ${index + 1} completed`);
          return result;
        } catch (error) {
          console.error(`   ❌ Concurrent cycle ${index + 1} failed:`, error);
          throw error;
        }
      });

      const results = await Promise.allSettled(promises);
      const duration = Date.now() - startTime;

      // Analyze results
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      console.log(`   📊 Test ${test} results: ${successful} successful, ${failed} failed in ${duration}ms`);

      if (failed > 0) {
        console.log('   ⚠️ Some cycles failed - checking circuit breaker status...');
        const status = backgroundProcessor.getStatus();
        console.log('   🔌 Circuit breaker state:', status.circuit_breaker.state);
      }

      // Wait between tests to allow system recovery
      if (test < cyclesPerTest) {
        console.log('   ⏳ Waiting 5 seconds before next test...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    console.log('\n✅ Stress test completed!');

  } catch (error) {
    console.error('❌ Stress test failed:', error);
    throw error;
  }
}

/**
 * Monitor system health over time
 */
export async function monitorSystemHealthOverTime(durationMinutes: number = 5): Promise<void> {
  console.log(`📈 Monitoring system health for ${durationMinutes} minutes...\n`);

  const checkInterval = 30000; // 30 seconds
  const totalChecks = (durationMinutes * 60 * 1000) / checkInterval;
  let checkCount = 0;

  try {
    const healthHistory: any[] = [];

    const healthMonitor = setInterval(async () => {
      checkCount++;
      console.log(`🔍 Health check ${checkCount}/${totalChecks}...`);

      try {
        const health = await getCurrentSystemHealth();
        const timestamp = new Date().toISOString();
        
        healthHistory.push({
          timestamp,
          status: health.status,
          uptime: health.uptime_seconds,
          transactions_last_hour: health.system_metrics.transactions_last_hour,
          success_rate: health.system_metrics.success_rate_percent,
          critical_events: health.system_metrics.critical_events_count
        });

        console.log(`   Status: ${health.status}, Success Rate: ${health.system_metrics.success_rate_percent}%`);

        if (checkCount >= totalChecks) {
          clearInterval(healthMonitor);
          
          console.log('\n📊 Health monitoring summary:');
          console.log(`   Total checks: ${healthHistory.length}`);
          console.log(`   Status distribution:`);
          
          const statusCounts = healthHistory.reduce((acc, h) => {
            acc[h.status] = (acc[h.status] || 0) + 1;
            return acc;
          }, {});
          
          Object.entries(statusCounts).forEach(([status, count]) => {
            console.log(`     ${status}: ${count} times`);
          });

          const avgSuccessRate = healthHistory.reduce((sum, h) => sum + h.success_rate, 0) / healthHistory.length;
          console.log(`   Average success rate: ${avgSuccessRate.toFixed(2)}%`);
          
          console.log('\n✅ Health monitoring completed!');
        }

      } catch (error) {
        console.error(`   ❌ Health check ${checkCount} failed:`, error);
      }
    }, checkInterval);

  } catch (error) {
    console.error('❌ Health monitoring failed:', error);
    throw error;
  }
}

/**
 * Run all demo functions
 */
export async function runFullDemo(): Promise<void> {
  console.log('🎬 Running full Phase 4 Monitoring System demo...\n');

  try {
    await runMonitoringDemo();
    console.log('\n' + '='.repeat(50) + '\n');
    
    await testDetectionAlgorithms();
    console.log('\n' + '='.repeat(50) + '\n');
    
    await benchmarkMonitoringSystem();
    console.log('\n' + '='.repeat(50) + '\n');
    
    await stressTestMonitoringSystem();
    console.log('\n' + '='.repeat(50) + '\n');
    
    await monitorSystemHealthOverTime(2); // 2 minutes for demo
    
    console.log('\n🎉 Full demo completed successfully!');

  } catch (error) {
    console.error('❌ Full demo failed:', error);
    throw error;
  }
}

// Export for easy testing
export const monitoringDemo = {
  runMonitoringDemo,
  testDetectionAlgorithms,
  benchmarkMonitoringSystem,
  stressTestMonitoringSystem,
  monitorSystemHealthOverTime,
  runFullDemo
};