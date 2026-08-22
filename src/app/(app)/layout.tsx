import { requireUser } from '@/auth.helpers';
import { BottomNav } from '@/components/nav/bottom-nav';

/**
 * THE authentication boundary for every page in this group. Putting it in the
 * layout means it cannot be forgotten on a new page.
 *
 * Note that this does NOT protect server actions — those are addressable POST
 * endpoints and each one calls requireUserForAction() itself.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();

  return (
    <div className="mx-auto max-w-lg pb-24">
      {children}
      <BottomNav />
    </div>
  );
}
