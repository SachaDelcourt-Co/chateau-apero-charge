// Type definitions for Web NFC API
// https://w3c.github.io/web-nfc/

interface NDEFMessage {
  records: NDEFRecord[];
}

interface NDEFRecord {
  recordType: string; // "text", "url", "mime", "empty", "unknown", "smart-poster", or custom types
  mediaType?: string; // MIME type (for "mime" recordType)
  id?: string;
  data?: ArrayBuffer; // The raw data of the record
  encoding?: string; // For text records, e.g., "utf-8"
  lang?: string; // For text records, e.g., "en"
}

interface NDEFReaderOptions {
  signal?: AbortSignal;
}

interface NDEFReadingEvent extends Event {
  serialNumber?: string; // The serial number of the NFC tag
  message: NDEFMessage; // The NDEF message read from the tag
}

interface NDEFWriteOptions extends NDEFReaderOptions {
  overwrite?: boolean; // Whether to overwrite existing NDEF messages
}

interface NDEFReader extends EventTarget {
  scan(options?: NDEFReaderOptions): Promise<void>;
  write(message: NDEFMessageInit | NDEFMessageSource, options?: NDEFWriteOptions): Promise<void>;
  makeReadOnly(options?: NDEFReaderOptions): Promise<void>;
  
  // Event listeners
  addEventListener(type: "reading", listener: (event: NDEFReadingEvent) => void): void;
  addEventListener(type: "readingerror", listener: (event: Event) => void): void;
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
  removeEventListener(type: string, callback: EventListenerOrEventListenerObject, options?: EventListenerOptions | boolean): void;
}

type NDEFMessageSource = string | BufferSource | NDEFMessageInit;

interface NDEFMessageInit {
  records: NDEFRecordInit[];
}

type NDEFRecordDataSource = string | BufferSource | NDEFRecordInit;

interface NDEFRecordInit {
  recordType: string;
  mediaType?: string;
  id?: string;
  encoding?: string;
  lang?: string;
  data?: NDEFRecordDataSource | NDEFRecordDataSource[];
}

interface NDEFReaderConstructor {
  new(): NDEFReader;
}

interface Window {
  NDEFReader: NDEFReaderConstructor;
}

declare var NDEFReader: NDEFReaderConstructor; 