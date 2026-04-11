import { connectToDatabase } from "@/lib/mongodb";
import { isAdminUser, unauth, forbidden, badRequest, serverError } from "@/lib/api-helpers";
import { getUserFromRequest } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

// GET /api/admin/users - 获取用户列表（含分页、筛选、搜索）
export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return unauth();
  if (!isAdminUser(user.userId)) return forbidden();

  try {
    const { db } = await connectToDatabase();
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "20", 10));
    const status = searchParams.get("status"); // all | active | disabled
    const search = searchParams.get("search") || "";

    const query: Record<string, unknown> = {};
    if (status === "active") query.disabled = { $ne: true };
    else if (status === "disabled") query.disabled = true;

    if (search) {
      query.$or = [
        { username: { $regex: search, $options: "i" } },
        { realName: { $regex: search, $options: "i" } },
        { classId: { $regex: search, $options: "i" } },
      ];
    }

    // 用 Promise.all 并行发起列表查询 + 统计计数，避免多次串行往返。
    // 注意：不能用 aggregate($group) 因为本地 JSON 备用数据库不支持该操作。
    const [users, total, totalAll, disabledCount, verifiedCount] = await Promise.all([
      db
        .collection("users")
        .find(query, { projection: { passwordHash: 0 } })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      db.collection("users").countDocuments(query),
      db.collection("users").countDocuments({}),
      db.collection("users").countDocuments({ disabled: true }),
      db.collection("users").countDocuments({ verified: true }),
    ]);

    const stats = {
      total: totalAll,
      active: totalAll - disabledCount,
      disabled: disabledCount,
      verified: verifiedCount,
    };

    return NextResponse.json({
      users: users.map((u) => ({
        ...u,
        id: u._id?.toString?.() ?? String(u._id),
        _id: undefined,
      })),
      pagination: { page, totalPages: Math.ceil(total / limit), total },
      stats,
    });
  } catch (error) {
    console.error("获取用户列表失败:", error);
    return serverError("获取用户列表失败");
  }
}

// POST /api/admin/users - 新增用户
export async function POST(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) return unauth();
  if (!isAdminUser(user.userId)) return forbidden();

  try {
    const body = await request.json();
    const { username, password, bio, realName, classId, verified, disabled } = body;

    if (!username || !password) return badRequest("用户名和密码不能为空");

    const { db } = await connectToDatabase();

    const existing = await db.collection("users").findOne({ username });
    if (existing) return badRequest("用户名已存在");

    const bcrypt = await import("bcryptjs");
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await db.collection("users").insertOne({
      username,
      passwordHash,
      bio: bio || "",
      avatar: "",
      realName: realName || "",
      classId: classId || "",
      verified: verified || false,
      disabled: disabled || false,
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true, userId: result.insertedId.toString() });
  } catch (error) {
    console.error("创建用户失败:", error);
    return serverError("创建用户失败");
  }
}
