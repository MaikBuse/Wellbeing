import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { addDays, formatLogDateShort, type LogDate } from '@/lib/time';

/**
 * Day-to-day navigation.
 *
 * `transitionTypes` is what makes the slide directional: going to the previous
 * day pushes content to the right, the next day to the left. The transition
 * type is not automatic — Next has no idea which of two links is "back", so the
 * mapping is declared here and consumed by the ::view-transition rules in
 * globals.css.
 */
export function DateStepper({ logDate }: { logDate: LogDate }) {
  const previous = addDays(logDate, -1);
  const next = addDays(logDate, 1);

  return (
    <nav className="flex items-center justify-between gap-2 px-4 pt-4">
      <Button asChild variant="outline" size="sm">
        <Link href={`/day/${previous}`} transitionTypes={['nav-back']}>
          <ChevronLeft aria-hidden className="size-4" />
          <span className="num">{formatLogDateShort(previous)}</span>
        </Link>
      </Button>

      <Button asChild variant="ghost" size="sm">
        <Link href="/">Heute</Link>
      </Button>

      <Button asChild variant="outline" size="sm">
        <Link href={`/day/${next}`} transitionTypes={['nav-forward']}>
          <span className="num">{formatLogDateShort(next)}</span>
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      </Button>
    </nav>
  );
}
