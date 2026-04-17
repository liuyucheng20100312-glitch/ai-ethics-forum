/**
 * Determines whether the provided user id belongs to the built-in admin account.
 */
export function isAdminUserId(userId: string | undefined): boolean {
  return userId === "offline_admin";
}
