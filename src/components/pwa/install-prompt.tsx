'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Share, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';

type InstallEvent = Event & { prompt: () => Promise<void> };

/**
 * Android fires `beforeinstallprompt`; iOS never has and never will, so it gets
 * instructions instead. Both matter — assume one of the two phones is an
 * iPhone.
 *
 * The browser facts are read through useSyncExternalStore rather than an effect
 * so there is no render-then-correct flash and no state sync in an effect body.
 */
function subscribeDisplayMode(onChange: () => void): () => void {
  const query = window.matchMedia('(display-mode: standalone)');
  query.addEventListener('change', onChange);
  window.addEventListener('appinstalled', onChange);
  return () => {
    query.removeEventListener('change', onChange);
    window.removeEventListener('appinstalled', onChange);
  };
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function subscribeNothing(): () => void {
  return () => {};
}

function isIosDevice(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent))
  );
}

export function InstallPrompt() {
  const installed = useSyncExternalStore(
    subscribeDisplayMode,
    isStandalone,
    () => false
  );
  const isIos = useSyncExternalStore(
    subscribeNothing,
    isIosDevice,
    () => false
  );
  const [event, setEvent] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (installed) {
    return (
      <p className="text-sm text-muted">
        Wellbeing läuft als installierte App.
      </p>
    );
  }

  if (event) {
    return (
      <Button onClick={() => event.prompt()} variant="outline">
        <Smartphone aria-hidden className="size-4" />
        Zum Startbildschirm hinzufügen
      </Button>
    );
  }

  if (isIos) {
    return (
      <p className="flex items-start gap-2 text-sm text-muted">
        <Share aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          Zum Installieren: unten auf „Teilen“ tippen und dann „Zum
          Home-Bildschirm“. In der installierten App musst du dich einmal neu
          anmelden – sie hat ihre eigenen Cookies.
        </span>
      </p>
    );
  }

  return (
    <p className="text-sm text-muted">
      Über das Browser-Menü lässt sich Wellbeing zum Startbildschirm hinzufügen.
    </p>
  );
}
