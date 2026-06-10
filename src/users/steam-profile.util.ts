/** Shape returned by passport-steam after GetPlayerSummaries */
export type SteamPassportProfile = {
  id?: string;
  displayName?: string;
  photos?: Array<{ value: string }>;
  _json?: { avatarfull?: string };
};

export function steamAvatarUrlFromProfile(
  profile: SteamPassportProfile | undefined,
): string | null {
  if (!profile) {
    return null;
  }
  const full = profile._json?.avatarfull;
  if (full) {
    return full;
  }
  const photos = profile.photos;
  if (photos?.length) {
    const last = photos[photos.length - 1];
    return last?.value ?? null;
  }
  return null;
}
