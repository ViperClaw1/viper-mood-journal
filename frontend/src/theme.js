/**
 * Sync document theme from user.theme (Prisma enum LIGHT | DARK).
 * Uses class `dark` on body so CSS can swap variables in one place.
 */
export function applyThemeForUser(user) {
  if (typeof document === "undefined") return;
  const dark = user?.theme === "DARK";
  document.body.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}
