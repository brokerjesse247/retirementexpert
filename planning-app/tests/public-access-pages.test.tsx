import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IntakeForm } from '../components/intake/IntakeForm';
import IntakePage from '../app/intake/page';
import PlanningHome from '../app/page';
import PlatformPage from '../app/platform/page';

const navigation = vi.hoisted(() => ({ redirect: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: navigation.redirect,
  useRouter: () => ({ replace: navigation.replace }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  navigation.redirect.mockReset();
  navigation.replace.mockReset();
});

describe('public access pages', () => {
  it('keeps the full client intake component available in development preview', () => {
    vi.stubEnv('NODE_ENV', 'development');

    const page = IntakePage();
    const html = renderToStaticMarkup(<IntakePage />);

    expect(page.type).toBe(IntakeForm);
    expect(html).toContain('Retirement planning intake');
    expect(html).toContain('Development preview — fictional information only.');
    expect(html).not.toContain('Client intake collection');
  });

  it('renders a no-data collection-closed page before the client intake component in blocked production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('REAL_CLIENT_INTAKE_ENABLED', 'false');

    const html = renderToStaticMarkup(<IntakePage />);

    expect(html).toContain('Client intake collection');
    expect(html).toContain('is currently closed.');
    expect(html).toContain('Please do not enter personal, financial, account, or login information here.');
    expect(html).toContain('Advisor log in');
    expect(html).not.toContain('Opening your secure draft');
    expect(html).not.toContain('Build your retirement planning profile');
    expect(html).not.toContain('<input');
  });

  it('shows advisor login and closed collection status on the production landing page', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('REAL_CLIENT_INTAKE_ENABLED', 'false');

    const html = renderToStaticMarkup(<PlanningHome />);

    expect(html).toContain('CLIENT INTAKE COLLECTION CLOSED');
    expect(html).toContain('Client intake collection is currently closed.');
    expect(html).toContain('Advisor log in');
    expect(html).toContain('href="/login"');
    expect(html).not.toContain('Start my retirement plan');
  });

  it('redirects the legacy platform route to advisor login and declares it in the route manifest', () => {
    PlatformPage();

    expect(navigation.redirect).toHaveBeenCalledWith('/login');
    const manifest = JSON.parse(readFileSync('public/manus-routes.json', 'utf8')) as { routes: Array<{ path: string; title?: string }> };
    expect(manifest.routes).toContainEqual({ path: '/platform', title: 'Advisor login' });
  });
});
