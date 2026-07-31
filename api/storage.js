import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  const key = req.query.key;
  if (!key || typeof key !== "string") {
    return res.status(400).json({ error: "Missing key" });
  }

  if (req.method === "GET") {
    const value = await redis.get(key);
    return res.status(200).json({ key, value: value ?? null });
  }

  if (req.method === "POST") {
    const { value } = req.body || {};
    if (value === undefined) {
      return res.status(400).json({ error: "Missing value" });
    }
    await redis.set(key, value);
    return res.status(200).json({ key, value });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
