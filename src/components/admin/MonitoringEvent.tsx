/**
 * Phase 4 Monitoring System - Monitoring Event Component
 * 
 * This component displays individual monitoring events with severity-based styling,
 * event details, and action buttons for event management.
 * 
 * @version 1.0.0
 * @author Phase 4 Implementation Team
 * @date 2025-06-15
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  CheckCircle, 
  Clock, 
  User, 
  CreditCard, 
  Hash,
  Calendar,
  ChevronDown,
  ChevronRight,
  Eye,
  CheckSquare,
  X,
  MessageSquare
} from "lucide-react";
import type {
  MonitoringEvent as MonitoringEventData
} from '@/types/monitoring';
import {
  MonitoringSeverity,
  MonitoringEventStatus,
  MonitoringEventType,
  isTransactionFailureEvent,
  isBalanceDiscrepancyEvent,
  isDuplicateNFCEvent,
  isRaceConditionEvent,
  isSystemHealthEvent
} from '@/types/monitoring';

// =====================================================
// COMPONENT INTERFACES
// =====================================================

interface MonitoringEventProps {
  event: MonitoringEventData;
  onResolve?: (eventId: number, notes?: string) => void;
  onDismiss?: (eventId: number, notes?: string) => void;
  onInvestigate?: (eventId: number) => void;
  showActions?: boolean;
  compact?: boolean;
  className?: string;
}

interface EventActionButtonsProps {
  event: MonitoringEventData;
  onResolve?: (eventId: number, notes?: string) => void;
  onDismiss?: (eventId: number, notes?: string) => void;
  onInvestigate?: (eventId: number) => void;
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

/**
 * Get severity icon and color
 */
function getSeverityConfig(severity: MonitoringSeverity) {
  switch (severity) {
    case MonitoringSeverity.CRITICAL:
      return {
        icon: AlertTriangle,
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        badgeVariant: 'destructive' as const
      };
    case MonitoringSeverity.HIGH:
      return {
        icon: AlertCircle,
        color: 'text-orange-600',
        bgColor: 'bg-orange-50',
        borderColor: 'border-orange-200',
        badgeVariant: 'secondary' as const
      };
    case MonitoringSeverity.MEDIUM:
      return {
        icon: AlertCircle,
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-50',
        borderColor: 'border-yellow-200',
        badgeVariant: 'outline' as const
      };
    case MonitoringSeverity.LOW:
      return {
        icon: Info,
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
        badgeVariant: 'outline' as const
      };
    case MonitoringSeverity.INFO:
      return {
        icon: Info,
        color: 'text-gray-600',
        bgColor: 'bg-gray-50',
        borderColor: 'border-gray-200',
        badgeVariant: 'outline' as const
      };
    default:
      return {
        icon: Info,
        color: 'text-gray-600',
        bgColor: 'bg-gray-50',
        borderColor: 'border-gray-200',
        badgeVariant: 'outline' as const
      };
  }
}

/**
 * Get status icon and color
 */
function getStatusConfig(status: MonitoringEventStatus) {
  switch (status) {
    case MonitoringEventStatus.OPEN:
      return {
        icon: AlertCircle,
        color: 'text-red-600',
        badgeVariant: 'destructive' as const
      };
    case MonitoringEventStatus.INVESTIGATING:
      return {
        icon: Eye,
        color: 'text-yellow-600',
        badgeVariant: 'secondary' as const
      };
    case MonitoringEventStatus.RESOLVED:
      return {
        icon: CheckCircle,
        color: 'text-green-600',
        badgeVariant: 'default' as const
      };
    case MonitoringEventStatus.FALSE_POSITIVE:
      return {
        icon: X,
        color: 'text-gray-600',
        badgeVariant: 'outline' as const
      };
    default:
      return {
        icon: Clock,
        color: 'text-gray-600',
        badgeVariant: 'outline' as const
      };
  }
}

/**
 * Get event type display name and icon
 */
function getEventTypeConfig(eventType: MonitoringEventType) {
  switch (eventType) {
    case MonitoringEventType.TRANSACTION_FAILURE:
      return {
        name: 'Transaction Failure',
        icon: AlertTriangle,
        description: 'Transaction processing failure detected'
      };
    case MonitoringEventType.BALANCE_DISCREPANCY:
      return {
        name: 'Balance Discrepancy',
        icon: AlertCircle,
        description: 'Card balance mismatch detected'
      };
    case MonitoringEventType.DUPLICATE_NFC:
      return {
        name: 'Duplicate NFC Scan',
        icon: CreditCard,
        description: 'Multiple NFC scans detected in short timeframe'
      };
    case MonitoringEventType.RACE_CONDITION:
      return {
        name: 'Race Condition',
        icon: Clock,
        description: 'Concurrent transaction processing detected'
      };
    case MonitoringEventType.SYSTEM_HEALTH:
      return {
        name: 'System Health',
        icon: Info,
        description: 'System health status update'
      };
    default:
      return {
        name: 'Unknown Event',
        icon: Info,
        description: 'Unknown event type'
      };
  }
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString('fr-FR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Format amount for display
 */
function formatAmount(amount: number | null): string {
  if (amount === null || amount === undefined) return 'N/A';
  return `${amount.toFixed(2)}€`;
}

// =====================================================
// EVENT DETAILS COMPONENTS
// =====================================================

/**
 * Render event-specific details based on event type
 */
function EventDetails({ event }: { event: MonitoringEventData }) {
  if (isTransactionFailureEvent(event)) {
    const data = event.event_data;
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-4 text-sm">
          {data.failure_count && (
            <div>
              <span className="font-medium">Failure Count:</span>
              <span className="ml-2">{data.failure_count}</span>
            </div>
          )}
          {data.failure_rate_percent && (
            <div>
              <span className="font-medium">Failure Rate:</span>
              <span className="ml-2">{data.failure_rate_percent.toFixed(2)}%</span>
            </div>
          )}
          {data.time_span_minutes && (
            <div>
              <span className="font-medium">Time Span:</span>
              <span className="ml-2">{data.time_span_minutes} minutes</span>
            </div>
          )}
          {data.total_transactions && (
            <div>
              <span className="font-medium">Total Transactions:</span>
              <span className="ml-2">{data.total_transactions}</span>
            </div>
          )}
        </div>
        {data.failed_transactions && data.failed_transactions.length > 0 && (
          <div>
            <span className="font-medium text-sm">Failed Transaction IDs:</span>
            <div className="mt-1 text-xs text-gray-600">
              {data.failed_transactions.slice(0, 3).join(', ')}
              {data.failed_transactions.length > 3 && ` +${data.failed_transactions.length - 3} more`}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (isBalanceDiscrepancyEvent(event)) {
    const data = event.event_data;
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">Expected Balance:</span>
            <span className="ml-2">{formatAmount(data.expected_balance)}</span>
          </div>
          <div>
            <span className="font-medium">Actual Balance:</span>
            <span className="ml-2">{formatAmount(data.actual_balance)}</span>
          </div>
          <div>
            <span className="font-medium">Discrepancy:</span>
            <span className="ml-2 text-red-600 font-medium">{formatAmount(data.discrepancy)}</span>
          </div>
          {data.transaction_count && (
            <div>
              <span className="font-medium">Transaction Count:</span>
              <span className="ml-2">{data.transaction_count}</span>
            </div>
          )}
        </div>
        {data.negative_balance && (
          <div className="text-sm text-red-600">
            <AlertTriangle className="inline h-4 w-4 mr-1" />
            Negative balance detected: {formatAmount(data.negative_balance)}
          </div>
        )}
      </div>
    );
  }

  if (isDuplicateNFCEvent(event)) {
    const data = event.event_data;
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">Scan Count:</span>
            <span className="ml-2">{data.scan_count}</span>
          </div>
          <div>
            <span className="font-medium">Time Span:</span>
            <span className="ml-2">{data.time_span_seconds} seconds</span>
          </div>
          <div>
            <span className="font-medium">Threshold:</span>
            <span className="ml-2">{data.threshold_seconds} seconds</span>
          </div>
        </div>
        {data.scan_timestamps && data.scan_timestamps.length > 0 && (
          <div>
            <span className="font-medium text-sm">Scan Timestamps:</span>
            <div className="mt-1 text-xs text-gray-600">
              {data.scan_timestamps.slice(0, 3).map(ts => formatTimestamp(ts)).join(', ')}
              {data.scan_timestamps.length > 3 && ` +${data.scan_timestamps.length - 3} more`}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (isRaceConditionEvent(event)) {
    const data = event.event_data;
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">Concurrent Count:</span>
            <span className="ml-2">{data.concurrent_count}</span>
          </div>
          <div>
            <span className="font-medium">Time Span:</span>
            <span className="ml-2">{data.time_span_seconds} seconds</span>
          </div>
        </div>
        {data.transaction_ids && data.transaction_ids.length > 0 && (
          <div>
            <span className="font-medium text-sm">Transaction IDs:</span>
            <div className="mt-1 text-xs text-gray-600">
              {data.transaction_ids.slice(0, 3).join(', ')}
              {data.transaction_ids.length > 3 && ` +${data.transaction_ids.length - 3} more`}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (isSystemHealthEvent(event)) {
    const data = event.event_data;
    return (
      <div className="space-y-2">
        <div className="text-sm">
          {data.migration_completed && (
            <div className="text-green-600">
              <CheckCircle className="inline h-4 w-4 mr-1" />
              Migration completed successfully
            </div>
          )}
          {data.tables_created && data.tables_created.length > 0 && (
            <div>
              <span className="font-medium">Tables Created:</span>
              <span className="ml-2">{data.tables_created.join(', ')}</span>
            </div>
          )}
          {data.functions_created && data.functions_created.length > 0 && (
            <div>
              <span className="font-medium">Functions Created:</span>
              <span className="ml-2">{data.functions_created.join(', ')}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="text-sm text-gray-600">
      No specific details available for this event type.
    </div>
  );
}

/**
 * Event action buttons component
 */
function EventActionButtons({ event, onResolve, onDismiss, onInvestigate }: EventActionButtonsProps) {
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState('');

  const handleResolve = () => {
    if (onResolve) {
      onResolve(event.event_id, notes || undefined);
      setNotes('');
      setShowNotes(false);
    }
  };

  const handleDismiss = () => {
    if (onDismiss) {
      onDismiss(event.event_id, notes || undefined);
      setNotes('');
      setShowNotes(false);
    }
  };

  const handleInvestigate = () => {
    if (onInvestigate) {
      onInvestigate(event.event_id);
    }
  };

  const isResolved = event.status === MonitoringEventStatus.RESOLVED;
  const isFalsePositive = event.status === MonitoringEventStatus.FALSE_POSITIVE;

  if (isResolved || isFalsePositive) {
    return (
      <div className="text-sm text-gray-600">
        {isResolved ? 'Event resolved' : 'Marked as false positive'}
        {event.resolved_at && (
          <div className="text-xs">
            on {formatTimestamp(event.resolved_at)}
          </div>
        )}
        {event.resolution_notes && (
          <div className="text-xs mt-1 italic">
            "{event.resolution_notes}"
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={handleInvestigate}
          className="flex items-center gap-1"
        >
          <Eye className="h-3 w-3" />
          Investigate
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowNotes(!showNotes)}
          className="flex items-center gap-1"
        >
          <MessageSquare className="h-3 w-3" />
          {showNotes ? 'Cancel' : 'Add Notes'}
        </Button>
      </div>

      {showNotes && (
        <div className="space-y-2">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add resolution notes..."
            className="w-full p-2 text-sm border rounded-md resize-none"
            rows={2}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleResolve}
              className="flex items-center gap-1"
            >
              <CheckSquare className="h-3 w-3" />
              Resolve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDismiss}
              className="flex items-center gap-1"
            >
              <X className="h-3 w-3" />
              False Positive
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================
// MAIN COMPONENT
// =====================================================

/**
 * MonitoringEvent component for displaying individual monitoring events
 */
export function MonitoringEvent({
  event,
  onResolve,
  onDismiss,
  onInvestigate,
  showActions = true,
  compact = false,
  className = ''
}: MonitoringEventProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const severityConfig = getSeverityConfig(event.severity);
  const statusConfig = getStatusConfig(event.status);
  const eventTypeConfig = getEventTypeConfig(event.event_type);

  const SeverityIcon = severityConfig.icon;
  const StatusIcon = statusConfig.icon;
  const EventTypeIcon = eventTypeConfig.icon;

  if (compact) {
    return (
      <div className={`flex items-center justify-between p-3 border rounded-lg ${severityConfig.bgColor} ${severityConfig.borderColor} ${className}`}>
        <div className="flex items-center gap-3">
          <SeverityIcon className={`h-4 w-4 ${severityConfig.color}`} />
          <div>
            <div className="font-medium text-sm">{eventTypeConfig.name}</div>
            <div className="text-xs text-gray-600">
              {event.card_id && `Card: ${event.card_id}`}
              {event.affected_amount && ` • Amount: ${formatAmount(event.affected_amount)}`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusConfig.badgeVariant} className="text-xs">
            {event.status}
          </Badge>
          <div className="text-xs text-gray-500">
            {formatTimestamp(event.detection_timestamp)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card className={`${severityConfig.borderColor} ${className}`}>
      <CardHeader className={`pb-3 ${severityConfig.bgColor}`}>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <SeverityIcon className={`h-5 w-5 mt-0.5 ${severityConfig.color}`} />
            <div className="flex-1">
              <CardTitle className="text-base flex items-center gap-2">
                <EventTypeIcon className="h-4 w-4" />
                {eventTypeConfig.name}
                <Badge variant={severityConfig.badgeVariant} className="text-xs">
                  {event.severity}
                </Badge>
              </CardTitle>
              <p className="text-sm text-gray-600 mt-1">
                {eventTypeConfig.description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={statusConfig.badgeVariant} className="flex items-center gap-1">
              <StatusIcon className="h-3 w-3" />
              {event.status}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Basic Event Information */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-gray-400" />
            <div>
              <div className="font-medium">Event ID</div>
              <div className="text-gray-600">{event.event_id}</div>
            </div>
          </div>
          
          {event.card_id && (
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-gray-400" />
              <div>
                <div className="font-medium">Card ID</div>
                <div className="text-gray-600">{event.card_id}</div>
              </div>
            </div>
          )}

          {event.transaction_id && (
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-gray-400" />
              <div>
                <div className="font-medium">Transaction ID</div>
                <div className="text-gray-600 truncate">{event.transaction_id}</div>
              </div>
            </div>
          )}

          {event.affected_amount !== null && (
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 text-gray-400">€</div>
              <div>
                <div className="font-medium">Amount</div>
                <div className="text-gray-600">{formatAmount(event.affected_amount)}</div>
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Detection Information */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-400" />
            <div>
              <div className="font-medium">Detected At</div>
              <div className="text-gray-600">{formatTimestamp(event.detection_timestamp)}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-gray-400" />
            <div>
              <div className="font-medium">Algorithm</div>
              <div className="text-gray-600">{event.detection_algorithm}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="h-4 w-4 text-gray-400">%</div>
            <div>
              <div className="font-medium">Confidence</div>
              <div className="text-gray-600">{(event.confidence_score * 100).toFixed(1)}%</div>
            </div>
          </div>
        </div>

        {/* Expandable Event Details */}
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between p-0 h-auto">
              <span className="font-medium">Event Details</span>
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 mt-3">
            <Separator />
            <EventDetails event={event} />
            
            {/* Context Information */}
            {event.context_data && Object.keys(event.context_data).length > 1 && (
              <div>
                <div className="font-medium text-sm mb-2">Context Information</div>
                <div className="text-xs text-gray-600 space-y-1">
                  {event.context_data.requires_immediate_investigation && (
                    <div className="text-red-600">⚠️ Requires immediate investigation</div>
                  )}
                  {event.context_data.financial_impact && (
                    <div>Financial Impact: {event.context_data.financial_impact}</div>
                  )}
                  {event.context_data.system_wide_issue && (
                    <div className="text-orange-600">🔄 System-wide issue detected</div>
                  )}
                </div>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Action Buttons */}
        {showActions && (
          <>
            <Separator />
            <EventActionButtons
              event={event}
              onResolve={onResolve}
              onDismiss={onDismiss}
              onInvestigate={onInvestigate}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default MonitoringEvent;