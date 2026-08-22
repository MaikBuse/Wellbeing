import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export default function NotFound() {
  return (
    <div className="p-4 pt-8">
      <EmptyState
        title="Nicht gefunden"
        description="Diese Seite gibt es nicht."
        action={
          <Button asChild variant="outline">
            <Link href="/">Zu Heute</Link>
          </Button>
        }
      />
    </div>
  );
}
