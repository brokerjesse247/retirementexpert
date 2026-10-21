import { describe, expect, it, vi } from 'vitest';
import { runOperationsDispatch } from '../scripts/operations-dispatch';
import { signOperationsDispatch } from '../lib/operations/jobs';

describe('native signed scheduler client', () => {
  it('uses only the fixed loopback route, signed headers and no redirects', async () => {
    const mock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const secret = 's'.repeat(32);
    expect(await runOperationsDispatch({ OPERATIONS_CRON_HMAC_SECRET: secret }, mock)).toEqual({ httpStatus: 200 });
    const [url, options] = mock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:3117/api/operations/dispatch');
    expect(options.redirect).toBe('error');
    const headers = options.headers;
    expect(headers['x-operations-signature']).toBe(signOperationsDispatch({ timestamp: headers['x-operations-timestamp'], nonce: headers['x-operations-nonce'], secret }));
    expect(JSON.stringify(options)).not.toContain(secret);
  });
  it('fails before fetching without a signing key and rejects unsuccessful responses', async () => {
    const mock = vi.fn();
    await expect(runOperationsDispatch({}, mock)).rejects.toThrow('missing');
    expect(mock).not.toHaveBeenCalled();
    mock.mockResolvedValue(new Response(null, { status: 503 }));
    await expect(runOperationsDispatch({ OPERATIONS_CRON_HMAC_SECRET: 's'.repeat(32) }, mock)).rejects.toThrow('HTTP 503');
  });
});
