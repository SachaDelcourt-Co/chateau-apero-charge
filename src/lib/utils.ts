import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Timezone utilities for dashboard statistics
 * All festival data should be interpreted in CET timezone regardless of user's local timezone
 */

/**
 * Determine if a given date is in Central European Daylight Saving Time (CEST)
 * DST in Europe: Last Sunday in March to last Sunday in October
 * @param dateStr Date string in format 'YYYY-MM-DD'
 * @returns boolean - true if in DST (CEST), false if in standard time (CET)
 */
function isCETDaylightSavingTime(dateStr: string): boolean {
  const date = new Date(dateStr + 'T12:00:00Z'); // Use noon UTC to avoid timezone edge cases
  const year = date.getFullYear();
  
  // Calculate last Sunday of March (DST start)
  const marchEnd = new Date(year, 2, 31); // March 31
  const dstStart = new Date(marchEnd.getTime() - ((marchEnd.getDay() || 7) - 1) * 24 * 60 * 60 * 1000);
  
  // Calculate last Sunday of October (DST end)  
  const octoberEnd = new Date(year, 9, 31); // October 31
  const dstEnd = new Date(octoberEnd.getTime() - ((octoberEnd.getDay() || 7) - 1) * 24 * 60 * 60 * 1000);
  
  // Check if date is between DST start and end
  return date >= dstStart && date < dstEnd;
}

/**
 * Convert a date string to CET timezone for database queries
 * @param dateStr Date string in format 'YYYY-MM-DD'
 * @param isEndOfDay Whether to set time to end of day (23:59:59.999)
 * @returns ISO string in CET timezone
 */
export function toCETTimezone(dateStr: string, isEndOfDay: boolean = false): string {
  // Determine if the date is in DST (summer time) or standard time
  const isDST = isCETDaylightSavingTime(dateStr);
  const timezone = isDST ? '+02:00' : '+01:00'; // CEST vs CET
  
  if (isEndOfDay) {
    // End of day in CET/CEST timezone
    const date = new Date(dateStr + 'T23:59:59.999' + timezone);
    return date.toISOString();
  } else {
    // Start of day in CET/CEST timezone  
    const date = new Date(dateStr + 'T00:00:00.000' + timezone);
    return date.toISOString();
  }
}

/**
 * Get CET date range for festival edition queries
 * @param startDate Start date string 'YYYY-MM-DD'
 * @param endDate End date string 'YYYY-MM-DD'
 * @returns Object with CET timezone adjusted start and end dates
 */
export function getCETDateRange(startDate: string, endDate: string) {
  return {
    start: toCETTimezone(startDate, false),
    end: toCETTimezone(endDate, true)
  };
}

/**
 * Check if a timestamp is within CET business hours (17:00-24:00)
 * @param timestamp ISO timestamp string
 * @returns boolean
 */
export function isCETBusinessHours(timestamp: string): boolean {
  const cetTime = getCETTime(timestamp);
  return cetTime.hour >= 17 && cetTime.hour < 24;
}

/**
 * Get CET hour and minute from a timestamp
 * @param timestamp ISO timestamp string
 * @returns Object with hour and minute in CET
 */
export function getCETTime(timestamp: string): { hour: number; minute: number } {
  const date = new Date(timestamp);
  
  // Extract date part to check DST
  const dateStr = timestamp.split('T')[0];
  const isDST = isCETDaylightSavingTime(dateStr);
  
  // Convert to CET: add 1 hour (CET) or 2 hours (CEST) to UTC
  const offsetHours = isDST ? 2 : 1;
  const cetHours = (date.getUTCHours() + offsetHours) % 24;
  const cetMinutes = date.getUTCMinutes();
  
  return {
    hour: cetHours,
    minute: cetMinutes
  };
}
