/**
 * Plaid webhook verification — JWT/JWKS (production-grade).
 *
 * Plaid signs every webhook with a JWT in the `Plaid-Verification` header.
 * The JWT header contains a `kid` we fetch the verifying public key for via
 * `POST /webhook_verification_key/get`. The JWT body contains a SHA-256 hash
 * of the request body that we must match against ours.
 *
 * Reference: https://plaid.com/docs/api/webhooks/webhook-verification/
 *
 * We retain the HMAC-shared-secret path (Pass 5) as a fallback when
 * PLAID_WEBHOOK_SECRET is set and the JWT header is absent. Production should
 * always have the JWT path active.
 */

import { createVerify, createHash, KeyObject, createPublicKey } from 'node:crypto';
import { plaidEnabled } from './client.js';

type Jwk = {
  alg: string;
  kty: string;
  use: string;
  kid: string;
  crv: string;
  x: string;
  y: string;
  created_at: number;
  expired_at: number | null;
};

// In-memory key cache keyed by `kid`. Lives for the server's lifetime;
// production should add a TTL / cache invalidation on JWKS rotation.
const KEY_CACHE = new Map<string, { jwk: Jwk; publicKey: KeyObject }>();

export type PlaidVerifyResult =
  | { ok: true; method: 'jwt' }
  | { ok: true; method: 'hmac' }
  | { ok: false; reason: string };

export async function verifyPlaidWebhook(args: {
  rawBody: Buffer;
  jwtHeader: string | undefined;
  hmacHeader: string | undefined;
}): Promise<PlaidVerifyResult> {
  if (args.jwtHeader) {
    return verifyJwt(args.rawBody, args.jwtHeader);
  }
  // Fall back to shared-secret HMAC (Pass 5 mode). Useful for sandbox
  // testing where the JWT path isn't always practical.
  const secret = process.env.PLAID_WEBHOOK_SECRET;
  if (secret) {
    const provided = args.hmacHeader;
    if (typeof provided !== 'string') return { ok: false, reason: 'No HMAC header' };
    const expected = createHash('sha256').update(secret + ':' + args.rawBody.toString('utf8')).digest('hex');
    return provided === expected
      ? { ok: true, method: 'hmac' }
      : { ok: false, reason: 'HMAC mismatch' };
  }
  // No verification configured at all.
  if (process.env.NODE_ENV === 'production') {
    return { ok: false, reason: 'No verification configured (production)' };
  }
  return { ok: true, method: 'hmac' }; // dev-mode allow
}

async function verifyJwt(rawBody: Buffer, jwt: string): Promise<PlaidVerifyResult> {
  const parts = jwt.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'Malformed JWT' };
  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { alg: string; kid: string };
  let payload: { iat: number; request_body_sha256: string };
  try {
    header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'JWT parse failed' };
  }

  if (header.alg !== 'ES256') return { ok: false, reason: `Unexpected alg: ${header.alg}` };

  // 1. Verify the signature against Plaid's published key.
  const keyEntry = await getKey(header.kid);
  if (!keyEntry) return { ok: false, reason: 'Verification key not found' };

  const data = Buffer.from(`${headerB64}.${payloadB64}`);
  const signature = der(Buffer.from(signatureB64, 'base64url'));
  const verifier = createVerify('SHA256');
  verifier.update(data);
  if (!verifier.verify(keyEntry.publicKey, signature)) {
    return { ok: false, reason: 'JWT signature invalid' };
  }

  // 2. Verify the body hash.
  const bodyHash = createHash('sha256').update(rawBody).digest('hex');
  if (bodyHash !== payload.request_body_sha256) {
    return { ok: false, reason: 'Body hash mismatch' };
  }

  // 3. Reject very old JWTs (> 5 minutes) to limit replay.
  const ageSec = Math.floor(Date.now() / 1000) - payload.iat;
  if (ageSec > 300) return { ok: false, reason: 'JWT too old' };

  return { ok: true, method: 'jwt' };
}

async function getKey(kid: string): Promise<{ jwk: Jwk; publicKey: KeyObject } | null> {
  const cached = KEY_CACHE.get(kid);
  if (cached) return cached;
  if (!plaidEnabled()) return null;

  const baseUrl =
    process.env.PLAID_ENV === 'production'  ? 'https://production.plaid.com'  :
    process.env.PLAID_ENV === 'development' ? 'https://development.plaid.com' :
    'https://sandbox.plaid.com';

  const res = await fetch(`${baseUrl}/webhook_verification_key/get`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      key_id: kid,
    }),
  });
  if (!res.ok) return null;
  const body = await res.json() as { key: Jwk };
  const publicKey = createPublicKey({ key: body.key as any, format: 'jwk' });
  const entry = { jwk: body.key, publicKey };
  KEY_CACHE.set(kid, entry);
  return entry;
}

/** Convert a raw ECDSA signature (r||s) to DER for Node's crypto.verify. */
function der(raw: Buffer): Buffer {
  if (raw.length !== 64) return raw; // already DER (or unexpected); let verify fail
  const r = trimZeros(raw.subarray(0, 32));
  const s = trimZeros(raw.subarray(32, 64));
  const seqLen = 2 + r.length + 2 + s.length;
  const out = Buffer.alloc(2 + seqLen);
  let i = 0;
  out[i++] = 0x30; out[i++] = seqLen;
  out[i++] = 0x02; out[i++] = r.length; r.copy(out, i); i += r.length;
  out[i++] = 0x02; out[i++] = s.length; s.copy(out, i); i += s.length;
  return out;
}

function trimZeros(buf: Buffer): Buffer {
  let i = 0;
  while (i < buf.length - 1 && buf[i] === 0) i++;
  // DER requires a leading zero byte if the high bit is set, to keep the
  // value positive.
  const trimmed = buf.subarray(i);
  return (trimmed[0] & 0x80) ? Buffer.concat([Buffer.from([0]), trimmed]) : trimmed;
}
