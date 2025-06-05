import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

export type NfcState =
  | 'IDLE'
  | 'SCANNING'
  | 'CARD_DETECTED'
  | 'VALIDATING_CARD'
  | 'PROCESSING_INITIATED'
  | 'COOLDOWN'
  | 'ERROR';

interface NfcScanLogData {
  card_id_scanned: string | null;
  raw_data_if_any: any;
  scan_timestamp: string;
  scan_status:
    | 'READ_SUCCESS'
    | 'READ_FAIL_DECODE'
    | 'VALIDATION_FAIL'
    | 'IGNORED_DUPLICATE_SCAN_ATTEMPT'
    | 'PROCESSING_TRIGGERED'
    | 'ERROR_READER'
    | 'ERROR_START_SCAN'
    | 'ERROR_UNSUPPORTED'
    | 'INFO_SCAN_STOPPED'
    | 'INFO_SCAN_STARTED';
  scan_location_context: string;
  message?: string;
  current_nfc_state: NfcState;
}

interface UseNfcOptions {
  onScan?: (id: string, rawData?: any) => void;
  validateId?: (id: string) => boolean;
  scan_location_context?: string;
  cooldownDuration?: number; // Milliseconds
}

interface LastProcessedCardInfo {
  id: string | null;
  processingInitiatedTimestamp: number | null;
  lastScanTimestamp: number | null;
}

const DEFAULT_COOLDOWN_DURATION = 3000; // 3 seconds

export function useNfc(options: UseNfcOptions = {}) {
  const {
    onScan,
    validateId,
    scan_location_context = 'unknown_context',
    cooldownDuration = DEFAULT_COOLDOWN_DURATION,
  } = options;

  const [nfcState, setNfcState] = useState<NfcState>('IDLE');
  const [isSupported, setIsSupported] = useState<boolean | null>(null);
  const [lastProcessedCardInfo, setLastProcessedCardInfo] = useState<LastProcessedCardInfo>({
    id: null,
    processingInitiatedTimestamp: null,
    lastScanTimestamp: null,
  });
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  const nfcAbortController = useRef<AbortController | null>(null);
  const nfcReaderRef = useRef<any>(null); // NDEFReader instance
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  const logNfcEvent = useCallback((
    status: NfcScanLogData['scan_status'],
    details: Partial<Omit<NfcScanLogData, 'scan_status' | 'scan_location_context' | 'scan_timestamp' | 'current_nfc_state'>> = {}
  ) => {
    const eventData: NfcScanLogData = {
      scan_timestamp: new Date().toISOString(),
      scan_status: status,
      scan_location_context,
      card_id_scanned: details.card_id_scanned !== undefined ? details.card_id_scanned : null,
      raw_data_if_any: details.raw_data_if_any !== undefined ? details.raw_data_if_any : null,
      message: details.message,
      current_nfc_state: nfcState, // Log state *before* this event might change it
    };
    logger.nfc('NFC Event', eventData);
  }, [scan_location_context, nfcState]);


  useEffect(() => {
    isMountedRef.current = true;
    const hasNDEFReader = 'NDEFReader' in window;
    logger.nfc('NDEFReader support check', { hasNDEFReader, secureContext: window.isSecureContext });
    
    if (isMountedRef.current) {
      setIsSupported(hasNDEFReader);
      if (!hasNDEFReader) {
        setNfcState('ERROR');
        const errMsg = 'Web NFC API not supported. Requires Chrome on Android (v89+) over HTTPS.';
        setErrorDetails(errMsg);
        logNfcEvent('ERROR_UNSUPPORTED', { message: errMsg });
        toast({ title: "NFC non supporté", description: errMsg, variant: "destructive" });
      }
    }

    return () => {
      isMountedRef.current = false;
      stopScanInternal(true);
    };
  }, [logNfcEvent]);

  const extractIdFromText = (text: string): string | null => {
    const idMatch = text.match(/[a-zA-Z0-9]{8}/);
    if (idMatch) return idMatch[0];
    if (/^[a-zA-Z0-9]{8}$/.test(text)) return text;
    if (text.length < 8 && /^[a-zA-Z0-9]+$/.test(text)) return text.padStart(8, '0');
    return null;
  };
  
  const stopScanInternal = useCallback((isUnmounting = false) => {
    logNfcEvent('INFO_SCAN_STOPPED', { message: `Called stopScanInternal. Unmounting: ${isUnmounting}` });
    
    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }

    if (nfcAbortController.current) {
      if (!nfcAbortController.current.signal.aborted) {
        try {
          nfcAbortController.current.abort();
          logger.nfc('AbortController aborted successfully by stopScanInternal.');
        } catch (error) {
          logger.error('Error aborting NFC controller in stopScanInternal:', error);
        }
      }
      nfcAbortController.current = null;
    }
    // nfcReaderRef.current = null; // NDEFReader instance is managed by _initiateScanSequence

    if (!isUnmounting && isMountedRef.current && nfcState !== 'IDLE') {
      setNfcState('IDLE');
    }
  }, [logNfcEvent, nfcState]);

  const enterCooldownState = useCallback((restartScanAfterCooldown: boolean) => {
    if (!isMountedRef.current) return;

    setNfcState('COOLDOWN');
    logNfcEvent('READ_SUCCESS', { card_id_scanned: lastProcessedCardInfo.id, message: `Entering COOLDOWN. Restart: ${restartScanAfterCooldown}` });

    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    cooldownTimerRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      cooldownTimerRef.current = null;
      
      if (nfcState === 'IDLE' || nfcAbortController.current === null) {
        logger.nfc('Cooldown ended, but scan was stopped or not active. Staying IDLE or current state.');
        if (nfcState !== 'IDLE' && nfcState !== 'ERROR') setNfcState('IDLE');
        return;
      }

      if (restartScanAfterCooldown) {
        logger.nfc('Cooldown ended. Attempting to restart scan.');
        _initiateScanSequence(); // This will set state to SCANNING if successful
      } else {
        logger.nfc('Cooldown ended. Not restarting scan. Moving to IDLE.');
        setNfcState('IDLE');
      }
    }, cooldownDuration);
  }, [cooldownDuration, lastProcessedCardInfo.id, logNfcEvent, nfcState]); // Added nfcState

  const _handleNfcError = useCallback((
    errorMessage: string,
    status: NfcScanLogData['scan_status'],
    cardId: string | null = null,
    rawData: any = null,
    restartAfterCooldown = true
  ) => {
    if (!isMountedRef.current) return;

    logger.error(`NFC Error: ${errorMessage}`, { cardId, rawData, status });
    logNfcEvent(status, { card_id_scanned: cardId, raw_data_if_any: rawData, message: errorMessage });
    
    setErrorDetails(errorMessage);
    setNfcState('ERROR');

    if (nfcAbortController.current && !nfcAbortController.current.signal.aborted) {
        try { nfcAbortController.current.abort(); } catch (e) { logger.error('Error aborting controller in _handleNfcError', e); }
    }
    // nfcAbortController.current = null; // Let _initiateScanSequence create a new one
    // nfcReaderRef.current = null;

    toast({ title: "Erreur NFC", description: errorMessage, variant: "destructive" });
    
    enterCooldownState(restartAfterCooldown);
  }, [enterCooldownState, logNfcEvent]);

  const _initiateScanSequence = useCallback(async () => {
    if (!isMountedRef.current) return false;
    if (!isSupported) {
      _handleNfcError('NFC not supported.', 'ERROR_UNSUPPORTED', null, null, false);
      return false;
    }

    // Ensure any previous scan is fully stopped before starting a new one.
    // This also means aborting any ongoing NDEFReader.scan() promise.
    if (nfcAbortController.current && !nfcAbortController.current.signal.aborted) {
        nfcAbortController.current.abort();
        logger.nfc('Previous AbortController aborted for new scan sequence.');
    }
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    
    nfcAbortController.current = new AbortController();
    const signal = nfcAbortController.current.signal;

    try {
      // @ts-ignore NDEFReader might not be in global types
      const reader = new NDEFReader();
      nfcReaderRef.current = reader; // Store the active reader instance
      
      setNfcState('SCANNING');
      logNfcEvent('INFO_SCAN_STARTED', { message: 'NDEFReader instance created, scan initiated.' });

      reader.addEventListener("error", (event: any) => {
        if (signal.aborted) {
          logger.nfc('NFC reader error event on an aborted signal (likely intentional stop/restart).');
          return; // Error due to abort() is expected in some scenarios
        }
        // Only handle unexpected errors
        _handleNfcError(`NFC Reader Error: ${event.message || 'Unknown reader error'}`, 'ERROR_READER', null, null, true);
      });

      reader.addEventListener("reading", async ({ message, serialNumber }: { message?: { records: any[] }, serialNumber?: string }) => {
        if (!isMountedRef.current || signal.aborted) return;
        if (nfcState === 'IDLE' || nfcState === 'ERROR' || nfcState === 'COOLDOWN') {
            logger.warn(`NFC reading event received in unexpected state: ${nfcState}. Ignoring.`);
            return;
        }

        const scanTime = Date.now();
        setNfcState('CARD_DETECTED');
        logger.nfc('NFC reading event received', { serialNumberPresent: !!serialNumber, messagePresent: !!message });

        let extractedId: string | null = null;
        let rawDataFromRecord: any = null;

        if (message && message.records && message.records.length > 0) {
          for (const record of message.records) {
            rawDataFromRecord = record.data; // Capture raw data from the first relevant record
            const recordType = record.recordType;
            try {
              if (recordType === "text") {
                const textDecoder = new TextDecoder(record.encoding || 'utf-8');
                let text = textDecoder.decode(record.data);
                if (text.length > 0 && !/[a-zA-Z0-9]/.test(text[0]) && (text.charCodeAt(0) < 32 || text.charCodeAt(0) > 126) ) { // Check for typical language code prefix
                  text = text.substring(1); // Basic attempt to strip potential language code byte
                }
                extractedId = extractIdFromText(text);
                logger.nfc('Decoded text from NFC', {text, extractedId});
              } else if (recordType === "url") {
                const textDecoder = new TextDecoder(); // Default UTF-8
                const url = textDecoder.decode(record.data);
                extractedId = extractIdFromText(url); // Try to find ID in URL
                 logger.nfc('Decoded URL from NFC', {url, extractedId});
              } else { // "unknown", empty, or other types
                const textDecoder = new TextDecoder(); // Try decoding as text
                const dataStr = textDecoder.decode(record.data);
                extractedId = extractIdFromText(dataStr);
                logger.nfc('Decoded unknown/other record type as text', {dataStr, extractedId, recordType});
              }
            } catch (decodeError) {
              logger.error('Error decoding NFC record', {recordType, error: decodeError});
            }
            if (extractedId) break;
          }
        }

        if (!extractedId && serialNumber) {
          logger.nfc('No ID from NDEF message, trying serial number.', { serialNumber });
          extractedId = extractIdFromText(serialNumber); // Use same extraction logic for consistency
          rawDataFromRecord = serialNumber; // Use serial number as raw data in this case
        }

        if (!extractedId) {
          _handleNfcError("Impossible de décoder l'ID de la carte.", 'READ_FAIL_DECODE', null, rawDataFromRecord, true);
          return;
        }
        
        logNfcEvent('READ_SUCCESS', { card_id_scanned: extractedId, raw_data_if_any: rawDataFromRecord, message: 'Card ID extracted.' });

        if (validateId) {
          setNfcState('VALIDATING_CARD');
          if (!validateId(extractedId)) {
            _handleNfcError("Validation de la carte échouée.", 'VALIDATION_FAIL', extractedId, rawDataFromRecord, true);
            return;
          }
          logger.nfc('Card ID validated successfully.', { cardId: extractedId });
        }

        if (
          lastProcessedCardInfo.id === extractedId &&
          lastProcessedCardInfo.processingInitiatedTimestamp &&
          (scanTime - lastProcessedCardInfo.processingInitiatedTimestamp < cooldownDuration)
        ) {
          logNfcEvent('IGNORED_DUPLICATE_SCAN_ATTEMPT', { card_id_scanned: extractedId, raw_data_if_any: rawDataFromRecord, message: 'Duplicate scan during app processing cooldown' });
          enterCooldownState(true); // Still go to cooldown and restart scan later
          return;
        }
        
        // Abort this specific scan attempt before calling onScan, to prevent re-reads while onScan runs
        // This is a local abort for the current reading, not stopping the whole hook.
        // The NDEFReader might still be active for the next approach of the card after cooldown.
        // However, the original code fully restarted. Let's stick to that pattern via enterCooldownState -> _initiateScanSequence.
        // So, we don't need to abort here explicitly if cooldown handles restart.

        if (onScan) {
          setNfcState('PROCESSING_INITIATED');
          const newProcessedInfo = { id: extractedId, processingInitiatedTimestamp: scanTime, lastScanTimestamp: scanTime };
          setLastProcessedCardInfo(newProcessedInfo);
          logNfcEvent('PROCESSING_TRIGGERED', { card_id_scanned: extractedId, raw_data_if_any: rawDataFromRecord, message: 'onScan called' });
          
          onScan(extractedId, rawDataFromRecord);
          enterCooldownState(true);
        } else {
          const newProcessedInfo = { id: extractedId, processingInitiatedTimestamp: null, lastScanTimestamp: scanTime };
          setLastProcessedCardInfo(newProcessedInfo);
          logNfcEvent('READ_SUCCESS', { card_id_scanned: extractedId, raw_data_if_any: rawDataFromRecord, message: 'Card read, no onScan handler provided' });
          enterCooldownState(true);
        }
      });

      await reader.scan({ signal });
      // If reader.scan() resolves and signal was not aborted, it means scan was active until card was moved away or an error not caught by listener.
      // Or, it could mean the scan completed (e.g. single read mode, though not used here).
      // If signal is aborted here, it means stopScanInternal or an error handler aborted it.
      if (!signal.aborted && isMountedRef.current && nfcState === 'SCANNING') {
         logger.nfc('NDEFReader.scan() promise resolved while still in SCANNING state and not aborted. This might mean card moved away.');
         // Potentially go to IDLE or re-trigger scan if continuous scanning is desired without card tap.
         // For now, this means the scan session for that tap ended. Cooldown should handle restart.
         // If we are here, it means no 'reading' event was fired, or it was handled and we are back.
         // This path is less common with continuous scan until abort.
      } else if (signal.aborted) {
         logger.nfc('NDEFReader.scan() promise resolved or rejected due to signal abort.');
      }

      return true;

    } catch (error: any) {
      if (signal.aborted) {
        logger.nfc('NFC scan setup aborted (expected during stop or error handling).', { message: error.message });
        // If nfcState is still SCANNING, it means an abort happened without proper state change.
        if (isMountedRef.current && (nfcState === 'SCANNING' || nfcState === 'CARD_DETECTED')) {
            setNfcState('IDLE');
        }
      } else {
        _handleNfcError(`Error starting NFC scan sequence: ${error.message}`, 'ERROR_START_SCAN', null, null, false);
      }
      return false;
    }
  }, [isSupported, validateId, onScan, cooldownDuration, _handleNfcError, enterCooldownState, logNfcEvent, lastProcessedCardInfo, nfcState]);

  const startScan = useCallback(async (): Promise<boolean> => {
    logNfcEvent('INFO_SCAN_STARTED', { message: 'User requested startScan.' });
    if (!isMountedRef.current) return false;

    if (!isSupported) {
      // Error already logged and toasted by useEffect or _initiateScanSequence if called
      return false;
    }
    
    if (nfcState === 'SCANNING' || nfcState === 'CARD_DETECTED' || nfcState === 'PROCESSING_INITIATED' || nfcState === 'COOLDOWN') {
        logger.warn(`startScan called when already in an active state: ${nfcState}. Ignoring.`);
        return true;
    }
    
    if (isMountedRef.current) setErrorDetails(null); // Reset error details from previous attempts

    return _initiateScanSequence();
  }, [isSupported, _initiateScanSequence, nfcState, logNfcEvent]);

  const stopScan = useCallback((): boolean => {
    // logNfcEvent is called by stopScanInternal
    if (!isMountedRef.current) return false;
    stopScanInternal(false);
    return true;
  }, [stopScanInternal]);

  return {
    nfcState,
    isSupported,
    lastProcessedCardId: lastProcessedCardInfo.id,
    errorDetails,
    startScan,
    stopScan,
  };
}
