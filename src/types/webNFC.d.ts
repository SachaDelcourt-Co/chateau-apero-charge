// Type definitions for Web NFC API
// https://w3c.github.io/web-nfc/

interface NDEFMessage {
  records: NDEFRecord[];
}

interface NDEFRecord {
  recordType: string;
  mediaType?: string;
  id?: string;
  data?: ArrayBuffer;
  encoding?: string;
  lang?: string;
}

interface NDEFReaderOptions {
  signal?: AbortSignal;
}

interface NDEFReadingEvent extends Event {
  serialNumber?: string;
  message: NDEFMessage;
}

interface NDEFReader extends EventTarget {
  scan(options?: NDEFReaderOptions): Promise<void>;
  write(message: NDEFMessage, options?: NDEFReaderOptions): Promise<void>;
  addEventListener(type: "reading", listener: (event: NDEFReadingEvent) => void): void;
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
  removeEventListener(type: string, callback: EventListenerOrEventListenerObject, options?: EventListenerOptions | boolean): void;
}

interface NDEFReaderConstructor {
  new(): NDEFReader;
}

interface Window {
  NDEFReader: NDEFReaderConstructor;
}

declare var NDEFReader: NDEFReaderConstructor; 