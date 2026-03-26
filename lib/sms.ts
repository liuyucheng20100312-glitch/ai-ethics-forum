/**
 * 短信发送服务
 * 参考 .NET 实现，调用短信服务商 API
 */

import { connectToDatabase } from "./mongodb";

// 短信配置
const SMS_IS_OPEN = parseInt(process.env.SMS_IS_OPEN || "0", 10);
const SMS_URL = process.env.SMS_URL || "";
const SMS_ACCOUNT = process.env.SMS_ACCOUNT || "";
const SMS_PASSWORD = process.env.SMS_PASSWORD || "";

// 发送短信请求参数
interface SendSmsRequest {
  phone: string;
  msg: string;
  report?: string;
  extend?: string;
  uid?: string;
}

// 发送短信响应
interface SendSmsResponse {
  success: boolean;
  code?: string;
  msg?: string;
  uid?: string;
}

/**
 * 发送短信
 */
export async function sendSms(request: SendSmsRequest): Promise<SendSmsResponse> {
  if (SMS_IS_OPEN !== 1) {
    console.log("短信服务未开启，跳过发送");
    return { success: true, code: "SMS_DISABLED", msg: "短信服务未开启" };
  }

  if (!SMS_URL || !SMS_ACCOUNT || !SMS_PASSWORD) {
    console.error("短信服务配置不完整");
    return { success: false, code: "CONFIG_ERROR", msg: "短信服务配置不完整" };
  }

  try {
    const requestBody = {
      account: SMS_ACCOUNT,
      password: SMS_PASSWORD,
      phone: request.phone,
      msg: request.msg,
      report: request.report || "true",
      extend: request.extend || "",
      uid: request.uid || "",
    };

    console.log("短信请求URL:", `${SMS_URL}/send/json`);
    console.log("短信请求体:", JSON.stringify(requestBody, null, 2));

    const response = await fetch(`${SMS_URL}/send/json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const result = await response.json();
    console.log("短信服务商返回:", result);

    // 253.com 返回格式: { code: "0", msg: "success", smsId: "xxx" }
    if (result.code === "0" || result.code === 0 || result.success) {
      return {
        success: true,
        code: "0",
        msg: "发送成功",
        uid: result.smsId || result.uid || "",
      };
    }

    return {
      success: false,
      code: String(result.code || "UNKNOWN"),
      msg: result.msg || "发送失败",
    };
  } catch (error) {
    console.error("短信发送异常:", error);
    return {
      success: false,
      code: "NETWORK_ERROR",
      msg: error instanceof Error ? error.message : "网络错误",
    };
  }
}

/**
 * 生成 6 位数字验证码
 */
export function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * 获取短信模板内容
 */
export async function getSmsTemplate(scene: string, code: string): Promise<string> {
  const { db } = await connectToDatabase();

  const template = await db.collection("sms_templates").findOne({
    code: scene.toUpperCase(),
    isActive: true,
  });

  if (template && template.content) {
    return template.content.replace("{code}", code);
  }

  // 默认模板
  const templates: Record<string, string> = {
    REGISTER: `您的注册手机验证码为${code}`,
    LOGIN: `您的登录手机验证码为${code}`,
  };

  return templates[scene.toUpperCase()] || `您的验证码为${code}`;
}

/**
 * 保存验证码到数据库
 */
export async function saveVerificationCode(
  phone: string,
  code: string,
  scene: string
): Promise<void> {
  const { db } = await connectToDatabase();

  // 删除该手机号之前的未使用验证码
  await db.collection("verification_codes").deleteMany({
    phone,
    scene,
    used: false,
  });

  // 保存新验证码，5分钟有效
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await db.collection("verification_codes").insertOne({
    phone,
    code,
    scene,
    expiresAt,
    used: false,
    createdAt: new Date(),
  });
}

/**
 * 验证验证码
 */
export async function verifyCode(
  phone: string,
  code: string,
  scene: string
): Promise<{ valid: boolean; error?: string }> {
  const { db } = await connectToDatabase();

  const record = await db.collection("verification_codes").findOne({
    phone,
    scene,
    used: false,
  });

  if (!record) {
    return { valid: false, error: "验证码不存在或已使用" };
  }

  if (record.code !== code) {
    return { valid: false, error: "验证码错误" };
  }

  if (new Date() > new Date(record.expiresAt)) {
    return { valid: false, error: "验证码已过期" };
  }

  // 标记为已使用
  await db.collection("verification_codes").updateOne(
    { _id: record._id as never },
    { $set: { used: true } }
  );

  return { valid: true };
}

/**
 * 检查发送频率限制（60秒内只能发送一次）
 */
export async function checkSendLimit(phone: string): Promise<{ allowed: boolean; remainingSeconds: number }> {
  const { db } = await connectToDatabase();

  // 使用 find + sort + limit 代替 findOne with sort
  const records = await db.collection("sms_logs")
    .find({ phone })
    .sort({ createdAt: -1 })
    .limit(1)
    .toArray();

  const lastRecord = records[0];

  if (!lastRecord) {
    return { allowed: true, remainingSeconds: 0 };
  }

  const lastSendTime = new Date(lastRecord.createdAt as Date).getTime();
  const now = Date.now();
  const elapsed = now - lastSendTime;
  const cooldown = 60 * 1000; // 60秒

  if (elapsed < cooldown) {
    return {
      allowed: false,
      remainingSeconds: Math.ceil((cooldown - elapsed) / 1000),
    };
  }

  return { allowed: true, remainingSeconds: 0 };
}

/**
 * 保存短信发送记录
 */
export async function saveSmsLog(
  phone: string,
  content: string,
  code: string,
  scene: string,
  uid: string,
  status: string
): Promise<void> {
  const { db } = await connectToDatabase();

  await db.collection("sms_logs").insertOne({
    phone,
    content,
    code,
    scene,
    uid,
    status,
    createdAt: new Date(),
  });
}

/**
 * 发送验证码短信（完整流程）
 */
export async function sendVerificationCode(
  phone: string,
  scene: string
): Promise<{ success: boolean; error?: string; remainingSeconds?: number }> {
  // 检查发送频率限制
  const { allowed, remainingSeconds } = await checkSendLimit(phone);
  if (!allowed) {
    return {
      success: false,
      error: `请等待 ${remainingSeconds} 秒后再试`,
      remainingSeconds,
    };
  }

  // 生成验证码
  const code = generateCode();

  // 获取短信内容
  const content = await getSmsTemplate(scene, code);

  // 发送短信
  const result = await sendSms({
    phone,
    msg: content,
    report: "true",
    extend: code,
    uid: "",
  });

  // 保存短信记录
  await saveSmsLog(phone, content, code, scene, result.uid || "", result.success ? "success" : "failed");

  if (!result.success) {
    return { success: false, error: result.msg || "发送失败" };
  }

  // 保存验证码
  await saveVerificationCode(phone, code, scene);

  return { success: true };
}
