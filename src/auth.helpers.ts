import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getUserSettings, type UserSettings } from '@/db/queries/users';

export type SessionUser = {
  id: string;
  name: string | null;
  email: string | null;
};

/**
 * The authentication boundary.
 *
 * Called from the (app) layout so every authenticated page is covered, AND as
 * the first statement of every server action. Server actions are addressable
 * POST endpoints — the layout that rendered the form does not protect them, so
 * the check has to be repeated per action. No exceptions.
 */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');
  return {
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email ?? null,
  };
}

/** Same as requireUser, but throws instead of redirecting — for server actions. */
export async function requireUserForAction(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Nicht angemeldet');
  return {
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email ?? null,
  };
}

export async function requireUserWithSettings(): Promise<{
  user: SessionUser;
  settings: UserSettings;
}> {
  const user = await requireUserForAction();
  return { user, settings: await getUserSettings(user.id) };
}
