import { connectToDatabase } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { ADMIN_USER_ID } from "@/lib/api-helpers";
import { findUserByIdentity } from "@/lib/user-profile-store";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  if (user.userId === "guest") {
    return NextResponse.json({
      userId: "guest",
      username: "游客",
      bio: "游客账号，仅供浏览",
      avatar: "",
      backgroundImage: "",
      verified: false,
      isAdmin: false,
    });
  }

  try {
    const { db } = await connectToDatabase();
    const doc = await findUserByIdentity(db, user);

    if (user.userId === ADMIN_USER_ID) {
      if (doc) {
        return NextResponse.json({
          userId: ADMIN_USER_ID,
          username: String(doc.username ?? "admin"),
          bio: doc.bio ?? "论坛管理员",
          avatar: doc.avatar ?? "",
          backgroundImage: doc.backgroundImage ?? "",
          realName: doc.realName ?? "",
          classId: doc.classId ?? "",
          verified: doc.verified ?? false,
          isAdmin: true,
        });
      }

      return NextResponse.json({
        userId: ADMIN_USER_ID,
        username: "admin",
        bio: "论坛管理员",
        avatar: "",
        backgroundImage: "",
        verified: false,
        isAdmin: true,
      });
    }

    if (!doc) {
      return NextResponse.json({
        userId: user.userId,
        username: user.username,
        bio: "",
        avatar: "",
        backgroundImage: "",
        verified: false,
        isAdmin: false,
      });
    }

    return NextResponse.json({
      userId: String(doc._id),
      username: doc.username,
      bio: doc.bio ?? "",
      avatar: doc.avatar ?? "",
      backgroundImage: doc.backgroundImage ?? "",
      realName: doc.realName ?? "",
      classId: doc.classId ?? "",
      verified: doc.verified ?? false,
      isAdmin: false,
    });
  } catch {
    return NextResponse.json({
      userId: user.userId,
      username: user.username,
      bio: "",
      avatar: "",
      backgroundImage: "",
      verified: false,
      isAdmin: user.userId === ADMIN_USER_ID,
    });
  }
}
