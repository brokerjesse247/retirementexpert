import { NextRequest, NextResponse } from 'next/server';
import { isIP } from 'node:net';
import { SecurityConfigurationError, constantTimeEqual } from './crypto';

export const ADVISOR_COOKIE = 'rp_advisor_session';
export const DRAFT_COOKIE = 'rp_intake_draft';
export const CHALLENGE_COOKIE = 'rp_login_challenge';
export const SESSION_IDLE_SECONDS = 30 * 60;
const MAX_JSON_BODY_BYTES = 256 * 1024;

export class ApiError extends Error {
  constructor(public status: number, public message: string, public fields?: Record<string, string>) {
    super(message);
  }
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(error.fields ? { error: error.message, fields: error.fields } : { error: error.message }, { status: error.status });
  }
  if (error instanceof SecurityConfigurationError) {
    return NextResponse.json({ error: 'Service is temporarily unavailable.' }, { status: 503 });
  }
  // Deliberately do not serialize database/provider/crypto errors.
  return NextResponse.json({ error: 'Unable to process this request.' }, { status: 500 });
}

export async function jsonBody(request: NextRequest): Promise<Record<string, unknown>> {
  const advertisedLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(advertisedLength) && advertisedLength > MAX_JSON_BODY_BYTES) throw new ApiError(413, 'Request body is too large.');
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error('missing');
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_JSON_BODY_BYTES) {
        await reader.cancel();
        throw new ApiError(413, 'Request body is too large.');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('bad');
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'Invalid request body.');
  }
}

function configuredOrigin(): URL {
  const configured = process.env.APP_ORIGIN;
  if (!configured) throw new SecurityConfigurationError('APP_ORIGIN is required');
  try {
    const origin = new URL(configured);
    if (origin.origin !== configured.replace(/\/$/, '')) throw new Error('not origin');
    return origin;
  } catch {
    throw new SecurityConfigurationError('APP_ORIGIN is invalid');
  }
}

export function appOrigin(): string {
  return configuredOrigin().origin;
}

/** Mutating routes accept only browser requests from the explicitly configured public origin. */
export function requireTrustedOrigin(request: NextRequest): void {
  const expected = configuredOrigin().origin;
  const actual = request.headers.get('origin');
  if (!actual || actual !== expected) throw new ApiError(403, 'Request origin is not allowed.');
}

export function requireCsrf(expected: string, supplied: unknown): void {
  if (typeof supplied !== 'string' || !constantTimeEqual(expected, supplied)) {
    throw new ApiError(403, 'Invalid security token.');
  }
}

/**
 * A client key for abuse controls, not authentication. `x-forwarded-for` is
 * accepted only when the deployed ingress is configured to strip client-set
 * values and set this flag. Without that explicit trust boundary all traffic
 * shares a conservative key rather than accepting a spoofable header.
 */
export function clientRateLimitKey(request: NextRequest): string {
  if (process.env.TRUST_PROXY_X_FORWARDED_FOR === 'true') {
    const first = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (first && isIP(first)) return `ip:${first.toLowerCase()}`;
  }
  return 'untrusted-network';
}

function localHttpAllowed(hostname: string): boolean {
  return process.env.COOKIE_LOCAL_HTTP === 'true' && ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);
}

export function cookieOptions(request: NextRequest, httpOnly = true) {
  const local = localHttpAllowed(request.nextUrl.hostname);
  return {
    httpOnly,
    secure: !local,
    sameSite: (local ? 'lax' : 'none') as 'lax' | 'none',
    path: '/',
    maxAge: SESSION_IDLE_SECONDS,
  };
}

export function setSessionCookie(response: NextResponse, request: NextRequest, name: string, token: string): void {
  response.cookies.set(name, token, cookieOptions(request));
}

export function clearSessionCookie(response: NextResponse, request: NextRequest, name: string): void {
  response.cookies.set(name, '', { ...cookieOptions(request), maxAge: 0 });
}

export function noStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
