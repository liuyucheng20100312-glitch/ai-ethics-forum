import { MongoClient } from 'mongodb';
const uri = 'mongodb://admin:kslmFVQVylH2VXgD@119.91.221.122:8081/?authSource=admin';
const client = new MongoClient(uri);
async function run() {
  await client.connect();
  const db = client.db('ai-ethics-forum');
  const topics = await db.collection('vote_topics').find({}).toArray();
  console.log(JSON.stringify(topics, null, 2));
  await client.close();
}
run();
