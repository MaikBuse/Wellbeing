'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Barcode scanning with a native-first, WASM-fallback strategy.
 *
 * On iOS `BarcodeDetector` does not work (flag-gated in 17, broken since 18),
 * so the zxing-wasm path is not a fallback there — it is THE path. It is loaded
 * dynamically so the ~500 KB wasm never lands in the initial bundle of any
 * other route.
 *
 * Restricting the format list is the single biggest accuracy and latency win.
 */
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;

type DetectorLike = {
  detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
};

type ScanState =
  | { status: 'idle' }
  | { status: 'starting' }
  | { status: 'scanning' }
  | { status: 'error'; message: string };

export function useBarcodeScanner(onDetected: (barcode: string) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastScanRef = useRef(0);
  const detectorRef = useRef<DetectorLike | null>(null);
  const stoppedRef = useRef(false);
  const [state, setState] = useState<ScanState>({ status: 'idle' });

  const stop = useCallback(() => {
    stoppedRef.current = true;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    // Without this the camera indicator stays on after leaving the page.
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    detectorRef.current = null;
    setState({ status: 'idle' });
  }, []);

  const start = useCallback(async () => {
    stoppedRef.current = false;
    setState({ status: 'starting' });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
        },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error('Kein Video-Element');
      video.srcObject = stream;
      await video.play();

      detectorRef.current = await createDetector();
      setState({ status: 'scanning' });

      const tick = async (timestamp: number) => {
        if (stoppedRef.current) return;
        // ~6 fps: running the wasm decoder at 60 fps only heats the phone.
        if (timestamp - lastScanRef.current > 160) {
          lastScanRef.current = timestamp;
          const detector = detectorRef.current;
          const element = videoRef.current;
          if (detector && element && element.readyState >= 2) {
            try {
              const results = await detector.detect(element);
              const hit = results.find((r) => /^\d{6,14}$/.test(r.rawValue));
              if (hit) {
                navigator.vibrate?.(50);
                stop();
                onDetected(hit.rawValue);
                return;
              }
            } catch {
              // A single failed frame is not an error worth surfacing.
            }
          }
        }
        frameRef.current = requestAnimationFrame(tick);
      };
      frameRef.current = requestAnimationFrame(tick);
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'Kein Zugriff auf die Kamera. Bitte in den Browser-Einstellungen erlauben.'
          : 'Die Kamera konnte nicht gestartet werden. Barcode bitte eintippen.';
      setState({ status: 'error', message });
      stop();
    }
  }, [onDetected, stop]);

  useEffect(() => stop, [stop]);

  return { videoRef, state, start, stop };
}

async function createDetector(): Promise<DetectorLike> {
  const native = (
    globalThis as unknown as {
      BarcodeDetector?: {
        new (options: { formats: string[] }): DetectorLike;
        getSupportedFormats?: () => Promise<string[]>;
      };
    }
  ).BarcodeDetector;

  if (native?.getSupportedFormats) {
    try {
      const supported = await native.getSupportedFormats();
      if (supported.includes('ean_13')) {
        return new native({ formats: [...FORMATS] });
      }
    } catch {
      // Fall through to the wasm decoder.
    }
  }

  const { readBarcodesFromImageData, prepareZXingModule } =
    await import('zxing-wasm/reader');
  await prepareZXingModule({ fireImmediately: true });

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });

  return {
    async detect(video: HTMLVideoElement) {
      if (!context) return [];
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (width === 0 || height === 0) return [];
      canvas.width = width;
      canvas.height = height;
      context.drawImage(video, 0, 0, width, height);
      const imageData = context.getImageData(0, 0, width, height);
      const results = await readBarcodesFromImageData(imageData, {
        formats: ['EAN-13', 'EAN-8', 'UPC-A', 'UPC-E'],
        tryHarder: false,
      });
      return results
        .filter((result) => result.isValid)
        .map((result) => ({ rawValue: result.text }));
    },
  };
}
