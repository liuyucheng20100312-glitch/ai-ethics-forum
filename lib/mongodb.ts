import { MongoClient, Db } from "mongodb";
import { getLocalDb } from "./localdb";

const MONGODB_URI = process.env.MONGODB_URI || "";
const MONGODB_DB = process.env.MONGODB_DB || "ai-ethics-forum";

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;
// Once MongoDB is confirmed unreachable in this process, skip retrying
let mongoUnreachable = false;

export type AnyDb = Db | ReturnType<typeof getLocalDb>;

export async function connectToDatabase(): Promise<{ client: MongoClient | null; db: AnyDb; isLocal: boolean }> {
  if (!MONGODB_URI) {
    console.warn("⚠️  MONGODB_URI 未设置，使用本地文件数据库");
    return { client: null, db: getLocalDb(), isLocal: true };
  }

  // Fast path: known unreachable → local DB immediately
  if (mongoUnreachable) {
    return { client: null, db: getLocalDb(), isLocal: true };
  }

  if (cachedClient && cachedDb) {
    try {
      await cachedDb.command({ ping: 1 });
      return { client: cachedClient, db: cachedDb, isLocal: false };
    } catch {
      cachedClient = null;
      cachedDb = null;
    }
  }

  try {
    const client = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
      socketTimeoutMS: 15000,
      maxPoolSize: 10,
      minPoolSize: 0,
      maxIdleTimeMS: 60000,
      retryWrites: true,
    });
    await client.connect();
    const db = client.db(MONGODB_DB);

    cachedClient = client;
    cachedDb = db;

    await db.collection("users").createIndex({ username: 1 }, { unique: true });

    console.log("✅ MongoDB 连接成功");
    return { client, db, isLocal: false };
  } catch (error) {
    mongoUnreachable = true;
    console.warn("⚠️  MongoDB 不可用，切换至本地文件数据库:", (error as Error).message.split("\n")[0]);
    return { client: null, db: getLocalDb(), isLocal: true };
  }
}

export async function connectDB(): Promise<AnyDb> {
  const { db } = await connectToDatabase();
  return db;
}