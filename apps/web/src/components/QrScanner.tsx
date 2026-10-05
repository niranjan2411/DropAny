import { BrowserQRCodeReader } from '@zxing/browser';
import { useEffect, useRef, useState } from 'react';

export function QrScanner({ onResult, onClose }: { onResult: (value: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scannerError, setScannerError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const onResultRef = useRef(onResult);
  const onCloseRef = useRef(onClose);
  onResultRef.current = onResult;
  onCloseRef.current = onClose;

  useEffect(() => {
    const reader = new BrowserQRCodeReader();
    let controls: { stop: () => void } | undefined;
    let cancelled = false;
    setScannerError('');
    void reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } } }, videoRef.current!, (result) => {
      if (result && !cancelled) {
        cancelled = true;
        controls?.stop();
        onResultRef.current(result.getText());
      }
    }).then((nextControls) => {
      if (cancelled) {
        controls?.stop();
      } else {
        controls = nextControls;
      }
    }).catch(() => {
      if (!cancelled) setScannerError('Camera access is unavailable. Allow camera permission and try again.');
    });
    return () => { cancelled = true; controls?.stop(); };
  }, [retryKey]);

  return <div className="scanner" role="dialog" aria-label="Scan QR code"><video ref={videoRef} autoPlay muted playsInline />{scannerError ? <p className="error" role="alert">{scannerError}</p> : <p>Point your camera at the room QR code.</p>}<div className="scanner-actions">{scannerError && <button onClick={() => setRetryKey((current) => current + 1)}>Try again</button>}<button className="secondary" onClick={() => onCloseRef.current()}>Cancel</button></div></div>;
}
