import { MongoClient } from 'mongodb';
const uri = 'mongodb://lyc:lyc77@119.91.221.122:8081/';
const client = new MongoClient(uri);
async function run() {
  await client.connect();
  const db = client.db('AIEthics');
  const topics = await db.collection('vote_topics').find({}).toArray();
  console.log(JSON.stringify(topics, null, 2));
  await client.close();
}
run();
