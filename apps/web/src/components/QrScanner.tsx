import { BrowserQRCodeReader } from '@zxing/browser';
import { useEffect, useRef } from 'react';

export function QrScanner({ onResult, onClose }: { onResult: (value: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const reader = new BrowserQRCodeReader();
    let controls: { stop: () => void } | undefined;
    void reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, videoRef.current!, (result) => {
      if (result) {
        onResult(result.getText());
        controls?.stop();
      }
    }).then((nextControls) => { controls = nextControls; });
    return () => controls?.stop();
  }, [onResult]);

  return <div className="scanner" role="dialog" aria-label="Scan QR code"><video ref={videoRef} autoPlay muted playsInline /><p>Point your camera at the room QR code.</p><button className="secondary" onClick={onClose}>Cancel</button></div>;
}
