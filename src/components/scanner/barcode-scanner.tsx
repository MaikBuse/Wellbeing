'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createFoodFromOff, lookupBarcode } from '@/actions/foods';
import { Button } from '@/components/ui/button';
import { Card, CardMeta, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { useBarcodeScanner } from './use-barcode-scanner';

export function BarcodeScanner() {
  const router = useRouter();
  const [manual, setManual] = useState('');
  const [pending, startTransition] = useTransition();

  function handle(barcode: string) {
    startTransition(async () => {
      const result = await lookupBarcode(barcode);

      if (result.kind === 'existing') {
        toast.success(`${result.name} ist schon in deiner Liste`);
        router.push(`/foods/${result.foodId}`);
        return;
      }
      if (result.kind === 'not_found') {
        toast.info(
          'Dieses Produkt kennt Open Food Facts nicht. Du kannst es selbst anlegen.'
        );
        router.push(`/foods/new?barcode=${barcode}`);
        return;
      }
      if (result.kind === 'error') {
        toast.error(result.message);
        router.push(`/foods/new?barcode=${barcode}`);
        return;
      }

      const created = await createFoodFromOff(barcode);
      if (!created.ok) {
        toast.error(created.error);
        return;
      }
      // Nutrients are frequently missing in OFF; send her to the form to
      // complete them rather than logging a 0 kcal entry.
      if (result.product.needsManualNutrients) {
        toast.warning(
          'Für dieses Produkt fehlen die Nährwerte – bitte ergänzen.'
        );
      } else {
        toast.success(`${result.product.productName ?? 'Produkt'} angelegt`);
      }
      router.push(`/foods/${created.foodId}`);
    });
  }

  const { videoRef, state, start, stop } = useBarcodeScanner(handle);

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>Barcode scannen</CardTitle>
        <CardMeta className="mt-1">
          Die Kamera funktioniert nur über HTTPS.
        </CardMeta>

        <div className="relative mt-3 overflow-hidden rounded-control bg-fg/5">
          <video
            ref={videoRef}
            // Without playsInline iOS goes fullscreen-native and the overlay
            // disappears.
            playsInline
            muted
            autoPlay
            className="aspect-[4/3] w-full object-cover"
          />

          {/* The hint below says "hold the barcode in the image area", so there
            * had better be a visible area to hold it in. */}
          {state.status === 'scanning' ? (
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <div
                className="absolute left-1/2 top-1/2 h-[38%] w-[78%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-sm"
                // The huge spread dims everything outside the window in one
                // declaration; the parent's overflow-hidden clips it.
                style={{ boxShadow: '0 0 0 9999px rgb(42 34 36 / 0.38)' }}
              >
                <span className="animate-scan absolute inset-x-0 top-0 h-px bg-primary shadow-[0_0_8px_rgb(241_168_133)]" />
              </div>

              {/* Corner brackets, drawn outside the dimmed window. */}
              {[
                'left-[11%] top-[31%] border-l-2 border-t-2 rounded-tl-sm',
                'right-[11%] top-[31%] border-r-2 border-t-2 rounded-tr-sm',
                'left-[11%] bottom-[31%] border-l-2 border-b-2 rounded-bl-sm',
                'right-[11%] bottom-[31%] border-r-2 border-b-2 rounded-br-sm',
              ].map((position) => (
                <span
                  key={position}
                  className={`absolute size-6 border-primary ${position}`}
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-3 flex gap-2">
          {state.status === 'scanning' || state.status === 'starting' ? (
            <Button variant="outline" className="flex-1" onClick={stop}>
              Stoppen
            </Button>
          ) : (
            <Button className="flex-1" onClick={start} disabled={pending}>
              <Camera aria-hidden className="size-4" />
              Kamera starten
            </Button>
          )}
        </div>

        {state.status === 'error' ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {state.message}
          </p>
        ) : null}
        {state.status === 'scanning' ? (
          <p className="mt-2 text-sm text-muted">
            Barcode in den Bildbereich halten …
          </p>
        ) : null}
      </Card>

      <Card>
        <Field label="Barcode eintippen" htmlFor="manual-barcode">
          <div className="flex gap-2">
            <Input
              id="manual-barcode"
              type="text"
              inputMode="numeric"
              pattern="\d*"
              value={manual}
              onChange={(event) =>
                setManual(event.target.value.replace(/\D/g, ''))
              }
              placeholder="z. B. 4008400202020"
            />
            <Button
              onClick={() => handle(manual)}
              disabled={pending || manual.length < 6}
            >
              {pending ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : null}
              Suchen
            </Button>
          </div>
        </Field>
      </Card>
    </div>
  );
}
