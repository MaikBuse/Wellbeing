import NextAuth from 'next-auth';
import Zitadel from 'next-auth/providers/zitadel';
import { upsertUserFromZitadel } from '@/db/queries/users';

/**
 * Zitadel needs the org scope so the correct login policy applies. Auth.js
 * REPLACES the scope string rather than merging, so every scope goes into one
 * string.
 */
const ORG_ID = process.env.ZITADEL_ORG_ID;
const REQUIRED_ROLE = process.env.WELLBEING_REQUIRED_ROLE ?? 'wellbeing-user';

const scope = [
  'openid',
  'profile',
  'email',
  ...(ORG_ID ? [`urn:zitadel:iam:org:id:${ORG_ID}`] : []),
].join(' ');

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Zitadel({
      // clientId / clientSecret / issuer come from AUTH_ZITADEL_ID,
      // AUTH_ZITADEL_SECRET and AUTH_ZITADEL_ISSUER.
      authorization: { params: { scope } },
    }),
  ],
  session: {
    strategy: 'jwt',
    // A short session means redoing the OIDC dance constantly on a phone,
    // and the installed PWA has its own cookie jar on top of that.
    maxAge: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  pages: { signIn: '/signin', error: '/error' },
  callbacks: {
    /**
     * Authorisation lives in Zitadel, not in an env allowlist: the org-wide
     * groupsClaim action flattens project role grants into `groups`, so adding
     * or removing a person is a `tofu apply` rather than a redeploy.
     */
    async signIn({ profile }) {
      if (!profile?.sub) return false;
      if (profile.email_verified === false) return false;
      const groups = (profile as { groups?: unknown }).groups;
      return Array.isArray(groups) && groups.includes(REQUIRED_ROLE);
    },
    async jwt({ token, profile }) {
      if (profile?.sub) {
        const user = await upsertUserFromZitadel({
          sub: profile.sub,
          email: typeof profile.email === 'string' ? profile.email : null,
          name:
            typeof profile.name === 'string'
              ? profile.name
              : typeof profile.preferred_username === 'string'
                ? profile.preferred_username
                : null,
        });
        token.uid = user.id;
        token.sub = profile.sub;
      }
      return token;
    },
    async session({ session, token }) {
      if (typeof token.uid === 'string') session.user.id = token.uid;
      return session;
    },
  },
});
