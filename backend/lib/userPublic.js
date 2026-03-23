/**
 * Safe user object for API responses (no password hash or reset tokens).
 * @param {{ id: string; name: string; email: string; avatarUrl: string | null; theme: string; createdAt: Date }} user
 */
export function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    theme: user.theme,
    createdAt: user.createdAt,
  };
}
