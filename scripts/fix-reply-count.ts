import { connectDB } from "../lib/mongodb";
import { ObjectId } from "mongodb";

// Helper: try to create ObjectId, return null if invalid format
function tryParseObjectId(id: string): ObjectId | null {
  try {
    if (/^[a-fA-F0-9]{24}$/.test(id)) {
      return new ObjectId(id);
    }
    return null;
  } catch {
    return null;
  }
}

async function fixReplyCount() {
  console.log("开始修复帖子回复数...");

  try {
    const db = await connectDB();
    const postsCollection = db.collection("posts");
    const repliesCollection = db.collection("replies");

    // 获取所有帖子
    const posts = await postsCollection.find({}).toArray() as Array<{
      _id: unknown;
      replies?: number;
    }>;
    console.log(`找到 ${posts.length} 个帖子`);

    let fixedCount = 0;

    for (const post of posts) {
      const postId = String(post._id);

      // 统计该帖子已审核通过的回复数（排除被拒绝的）
      const actualReplyCount = await repliesCollection.countDocuments({
        postId: postId,
        status: { $ne: "rejected" }
      });

      // 如果回复数不一致，则更新
      if (post.replies !== actualReplyCount) {
        await postsCollection.updateOne(
          { _id: post._id as ObjectId },
          { $set: { replies: actualReplyCount } }
        );
        console.log(`帖子 ${postId} 回复数已修正: ${post.replies} -> ${actualReplyCount}`);
        fixedCount++;
      }
    }

    console.log(`\n修复完成！共修正 ${fixedCount} 个帖子的回复数`);
    process.exit(0);
  } catch (error) {
    console.error("修复失败:", error);
    process.exit(1);
  }
}

fixReplyCount();
