/**
 * Device recovery code endpoints.
 *
 * Allows users to generate an anonymous recovery code for their watchlist
 * and claim it on a new browser/device without requiring accounts.
 */

import {
  createRecoveryCode,
  deleteRecoveryCode,
  getRecoveryCode,
  transferDeviceData,
} from '../db/queries.js';
import { deviceIdFrom, errorJson, json } from '../lib/http.js';
import { logger } from '../lib/logger.js';

const CODE_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

function generateRandomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Base32 unambiguous characters
  let code = '';
  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    code += chars[randomIndex];
  }
  return code;
}

export async function handleGenerateRecovery(request, env) {
  const deviceId = deviceIdFrom(request);
  if (!deviceId) {
    logger.warn('Recovery generation rejected due to missing/invalid token');
    return errorJson('Missing or malformed device token', 401, 'UNAUTHORIZED');
  }

  const now = Date.now();
  const expiresAt = now + CODE_EXPIRY_MS;
  const code = generateRandomCode();

  await createRecoveryCode(env, { code, deviceId, now, expiresAt });
  logger.info('Generated new recovery code', { code });

  return json({
    ok: true,
    code,
    expiresAt,
  });
}

export async function handleClaimRecovery(request, env) {
  const newDeviceId = deviceIdFrom(request);
  if (!newDeviceId) {
    logger.warn('Recovery claim rejected due to missing/invalid target token');
    return errorJson('Missing or malformed device token', 401, 'UNAUTHORIZED');
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errorJson('Body must be JSON', 400, 'INVALID_BODY');
  }

  const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';
  if (!code || code.length !== 6) {
    return errorJson('Field "code" must be a 6-character recovery code', 400, 'INVALID_CODE');
  }

  const record = await getRecoveryCode(env, code);
  const now = Date.now();

  if (!record || record.expires_at < now) {
    logger.warn('Recovery claim failed: invalid or expired code', { code });
    return errorJson('Invalid or expired recovery code', 404, 'RECOVERY_CODE_NOT_FOUND');
  }

  const oldDeviceId = record.device_id;
  if (oldDeviceId === newDeviceId) {
    return json({ ok: true, message: 'Device already owns this watchlist' });
  }

  await transferDeviceData(env, { oldDeviceId, newDeviceId });
  await deleteRecoveryCode(env, code);

  logger.info('Successfully claimed recovery code and transferred watchlist', { code });
  return json({
    ok: true,
    message: 'Watchlist transferred successfully',
  });
}
