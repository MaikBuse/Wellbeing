import { expect, test } from '@playwright/test';

/**
 * Verifies the auth boundary and the pages that need no session. The OIDC
 * round trip itself cannot run here — Zitadel is internal-only — so it is a
 * manual step on the LAN, documented in the README.
 */
test('an unauthenticated visitor is sent to the sign-in page', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/signin$/);
  await expect(page.getByRole('button', { name: 'Anmelden' })).toBeVisible();
});

test('the health endpoint answers without a session or a database', async ({
  request,
}) => {
  const response = await request.get('/api/healthz');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
});

test('the offline fallback page renders', async ({ page }) => {
  await page.goto('/offline');
  await expect(
    page.getByRole('heading', { name: 'Keine Verbindung' })
  ).toBeVisible();
});

test('the manifest is installable', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest.display).toBe('standalone');
  // Chromium requires both sizes for the install prompt.
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toContain('192x192');
  expect(sizes).toContain('512x512');
});

test('a rejected account gets a German explanation, not a stack trace', async ({
  page,
}) => {
  await page.goto('/error?error=AccessDenied');
  await expect(
    page.getByRole('heading', { name: 'Kein Zugriff' })
  ).toBeVisible();
});
