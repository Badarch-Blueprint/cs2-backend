import { randomInt } from 'node:crypto';

import {
  LOBBY_INVITE_CODE_ALPHABET,
  LOBBY_INVITE_CODE_LENGTH,
} from './lobby.types';

/**
 * Crockford base32 (with confusables removed: I/L/O/0/1) invite code of the
 * configured length (default 6). Uses `crypto.randomInt` for bias-free picks.
 */
export function generateInviteCode(
  length: number = LOBBY_INVITE_CODE_LENGTH,
): string {
  const chars: string[] = new Array<string>(length);
  for (let i = 0; i < length; i += 1) {
    chars[i] = LOBBY_INVITE_CODE_ALPHABET.charAt(
      randomInt(LOBBY_INVITE_CODE_ALPHABET.length),
    );
  }
  return chars.join('');
}

/**
 * Generate a unique invite code, retrying up to `maxAttempts` times when the
 * `existsCheck` callback reports that a candidate is already taken.
 */
export async function generateUniqueInviteCode(
  existsCheck: (candidate: string) => Promise<boolean>,
  maxAttempts = 5,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = generateInviteCode();
    // eslint-disable-next-line no-await-in-loop
    const exists = await existsCheck(candidate);
    if (!exists) {
      return candidate;
    }
  }
  throw new Error(
    `Could not generate a unique invite code after ${maxAttempts} attempts`,
  );
}
