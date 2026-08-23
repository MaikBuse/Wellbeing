'use client';

import { useTransition } from 'react';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { acknowledgeAchievement } from '@/actions/progress';
import { Button } from '@/components/ui/button';

/**
 * The one-time celebration for a newly reached milestone.
 *
 * An inline card rather than a modal sheet: this appears on a screen someone
 * opened to record a meal, and a dialog that has to be dismissed before the app
 * works again would be a toll booth on the one action that matters.
 *
 * Dismissing writes the `achievement` row, which is the only thing about
 * milestones that is ever persisted. Until then it reappears — a celebration
 * missed because the phone locked mid-tap is not a celebration had.
 *
 * The title and description come from the milestone catalogue and never contain
 * a food, a symptom or a weight, so nothing sensitive rides along in a toast.
 */
export function MilestoneCelebration({
  milestoneKey,
  title,
  description,
}: {
  milestoneKey: string;
  title: string;
  description: string;
}) {
  const [pending, startTransition] = useTransition();

  function dismiss() {
    startTransition(async () => {
      const result = await acknowledgeAchievement({ key: milestoneKey });
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <section className="animate-pop relative isolate overflow-hidden rounded-card border border-primary/40 bg-gradient-to-br from-soft via-card to-primary-tint p-4 shadow-float">
      {/* One expanding ring, fired once. Decoration only — the card reads the
       * same when prefers-reduced-motion stops it. */}
      <span
        aria-hidden
        className="animate-burst pointer-events-none absolute -right-6 -top-6 -z-10 size-28 rounded-pill bg-primary/30"
      />

      <p className="flex items-center gap-1.5 text-eyebrow font-semibold uppercase text-primary-strong">
        <Sparkles aria-hidden className="size-3.5" />
        Meilenstein erreicht
      </p>

      <h2 className="mt-1 font-display text-title text-fg">{title}</h2>
      <p className="mt-1 text-sm text-muted">{description}</p>

      {/* Default size, not sm: this is the only target in its row, and sm sits
       * below the 44 px floor. */}
      <Button
        variant="primary"
        className="mt-3"
        onClick={dismiss}
        disabled={pending}
      >
        {pending ? 'Einen Moment …' : 'Weiter'}
      </Button>
    </section>
  );
}
