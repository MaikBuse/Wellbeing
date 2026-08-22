import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayView } from '@/components/day/day-view';
import { Button } from '@/components/ui/button';
import { addDays, formatLogDateShort } from '@/lib/time';

export const metadata = { title: 'Tag – Wellbeing' };

export default async function DayPage({
  params,
}: {
  // Next 16: params is async.
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  return (
    <>
      <nav className="flex items-center justify-between gap-2 px-4 pt-4">
        <Button asChild variant="outline" size="sm">
          <Link href={`/day/${addDays(date, -1)}`}>
            <ChevronLeft aria-hidden className="size-4" />
            {formatLogDateShort(addDays(date, -1))}
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/day/${addDays(date, 1)}`}>
            {formatLogDateShort(addDays(date, 1))}
            <ChevronRight aria-hidden className="size-4" />
          </Link>
        </Button>
      </nav>
      <DayView logDate={date} />
    </>
  );
}
