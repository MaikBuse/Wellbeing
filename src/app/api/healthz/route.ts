/**
 * Liveness/readiness endpoint. Deliberately does NOT touch the database: a
 * DB-checking readiness probe would pull the pod out of service on every
 * Postgres restart, turning a rendered error page into a 503 from Traefik.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ ok: true });
}
