import { connectToDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

// 检查管理员权限
async function checkAdmin(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const token = authHeader.slice(7);
  const decoded = verifyToken(token);
  return decoded?.userId === "offline_admin";
}

// GET /api/admin/users - 获取用户列表
export async function GET(request: NextRequest) {
  try {
    if (!(await checkAdmin(request))) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    const { db } = await connectToDatabase();
    const { searchParams } = new URL(request.url);

    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const status = searchParams.get("status"); // all, active, disabled
    const search = searchParams.get("search") || "";

    const query: Record<string, unknown> = {};

    // 状态筛选
    if (status === "active") {
      query.disabled = { $ne: true };
    } else if (status === "disabled") {
      query.disabled = true;
    }

    // 搜索
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: "i" } },
        { realName: { $regex: search, $options: "i" } },
        { classId: { $regex: search, $options: "i" } },
      ];
    }

    const total = await db.collection("users").countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    const users = await db.collection("users")
      .find(query, { projection: { passwordHash: 0 } })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    // 统计
    const stats = {
      total: await db.collection("users").countDocuments(),
      active: await db.collection("users").countDocuments({ disabled: { $ne: true } }),
      disabled: await db.collection("users").countDocuments({ disabled: true }),
      verified: await db.collection("users").countDocuments({ verified: true }),
    };

    return NextResponse.json({
      users: users.map(u => ({
        ...u,
        id: u._id?.toString?.() || u._id,
        _id: undefined,
      })),
      pagination: { page, totalPages, total },
      stats,
    });
  } catch (error) {
    console.error("获取用户列表失败:", error);
    return NextResponse.json({ error: "获取用户列表失败" }, { status: 500 });
  }
}

// POST /api/admin/users - 新增用户
export async function POST(request: NextRequest) {
  try {
    if (!(await checkAdmin(request))) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    const body = await request.json();
    const { username, password, bio, realName, classId, verified, disabled } = body;

    if (!username || !password) {
      return NextResponse.json({ error: "用户名和密码不能为空" }, { status: 400 });
    }

    const { db } = await connectToDatabase();

    // 检查用户名是否已存在
    const existing = await db.collection("users").findOne({ username });
    if (existing) {
      return NextResponse.json({ error: "用户名已存在" }, { status: 400 });
    }

    // 创建用户
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
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      userId: result.insertedId.toString(),
    });
  } catch (error) {
    console.error("创建用户失败:", error);
    return NextResponse.json({ error: "创建用户失败" }, { status: 500 });
  }
}
