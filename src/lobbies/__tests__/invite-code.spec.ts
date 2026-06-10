import {
  LOBBY_INVITE_CODE_ALPHABET,
  LOBBY_INVITE_CODE_LENGTH,
} from '../lobby.types';
import {
  generateInviteCode,
  generateUniqueInviteCode,
} from '../invite-code';

describe('invite-code', () => {
  it('generates 6-char codes from the Crockford alphabet', () => {
    for (let i = 0; i < 100; i += 1) {
      const code = generateInviteCode();
      expect(code).toHaveLength(LOBBY_INVITE_CODE_LENGTH);
      for (const ch of code) {
        expect(LOBBY_INVITE_CODE_ALPHABET).toContain(ch);
      }
    }
  });

  it('excludes visually confusable characters', () => {
    expect(LOBBY_INVITE_CODE_ALPHABET).not.toMatch(/[01ILO]/);
  });

  it('retries on collision and surfaces a distinct code', async () => {
    const seen = new Set<string>();
    let callCount = 0;
    const code = await generateUniqueInviteCode(async (candidate) => {
      callCount += 1;
      if (callCount === 1) {
        seen.add(candidate);
        return true;
      }
      return false;
    });
    expect(seen.has(code)).toBe(false);
    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  it('throws after exhausting attempts', async () => {
    await expect(
      generateUniqueInviteCode(async () => true, 3),
    ).rejects.toThrow(/unique invite code/);
  });
});
