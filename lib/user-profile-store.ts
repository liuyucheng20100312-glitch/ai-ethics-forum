import type { AnyDb } from "@/lib/mongodb";
import type { JwtPayload } from "@/lib/auth";
import { ADMIN_USER_ID, tryParseObjectId } from "@/lib/api-helpers";
type UserDoc = Record<string, unknown>;

/**
 * Finds a user document by JWT identity.
 * Lookup order:
 * 1) `_id` as ObjectId (when userId is a valid ObjectId string)
 * 2) `_id` as raw string (for legacy/string ids like offline_admin)
 * 3) `username`
 */
export async function findUserByIdentity(db: AnyDb, user: JwtPayload): Promise<UserDoc | null> {
  const users = db.collection("users");
  const objectId = tryParseObjectId(user.userId);

  if (objectId) {
    const byObjectId = await users.findOne({ _id: objectId } as never);
    if (byObjectId) return byObjectId;
  }

  const byRawId = await users.findOne({ _id: user.userId } as never);
  if (byRawId) return byRawId;

  return users.findOne({ username: user.username } as never);
}

/**
 * Updates profile fields for the current JWT identity.
 * Returns true when a record is updated or created.
 *
 * For built-in admin (`offline_admin`), when no existing record is found,
 * it will upsert a minimal user row so profile media/settings can persist.
 */
export async function updateUserProfileFields(
  db: AnyDb,
  user: JwtPayload,
  fields: Record<string, unknown>
): Promise<boolean> {
  const users = db.collection("users");
  const objectId = tryParseObjectId(user.userId);

  if (objectId) {
    const byObjectId = await users.updateOne({ _id: objectId } as never, { $set: fields });
    if (byObjectId.matchedCount > 0) return true;
  }

  const byRawId = await users.updateOne({ _id: user.userId } as never, { $set: fields });
  if (byRawId.matchedCount > 0) return true;

  const byUsername = await users.updateOne({ username: user.username } as never, { $set: fields });
  if (byUsername.matchedCount > 0) return true;

  if (user.userId !== ADMIN_USER_ID) return false;

  await users.insertOne({
    _id: ADMIN_USER_ID,
    username: user.username,
    bio: "论坛管理员",
    avatar: "",
    backgroundImage: "",
    verified: false,
    createdAt: new Date(),
    ...fields,
  } as never);

  return true;
}
