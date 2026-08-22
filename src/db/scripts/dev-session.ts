/**
 * Prints a valid Auth.js session cookie for a local user.
 *
 * Development aid: the token is minted with the real AUTH_SECRET, so it is the
 * same artefact a successful Zitadel login would produce. It only works against
 * a server that shares that secret. Never run this against production.
 */
import { encode } from '@auth/core/jwt';
import { db } from '../index';
import { appUsers, userSettings } from '../schema';

const secret = process.env.AUTH_SECRET;
if (!secret) throw new Error('AUTH_SECRET is not set');

const sub = process.env.DEV_USER_SUB ?? 'dev-local-user';
const [user] = await db
  .insert(appUsers)
  .values({ zitadelSub: sub, email: 'dev@local.invalid', name: 'Dev' })
  .onConflictDoUpdate({ target: appUsers.zitadelSub, set: { name: 'Dev' } })
  .returning({ id: appUsers.id });
await db.insert(userSettings).values({ userId: user.id }).onConflictDoNothing();

const cookieName = 'authjs.session-token';
const token = await encode({
  token: { sub, uid: user.id, name: 'Dev', email: 'dev@local.invalid' },
  secret,
  salt: cookieName,
  maxAge: 60 * 60,
});

console.log(`${cookieName}=${token}`);
process.exit(0);
