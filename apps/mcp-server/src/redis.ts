import { Redis } from "ioredis";

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  tls?: boolean;
  keyPrefix?: string;
}

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    throw new Error("Redis client not initialized. Call initRedis() first.");
  }
  return redisClient;
}

export async function initRedis(config: RedisConfig): Promise<Redis> {
  redisClient = new Redis({
    host: config.host,
    port: config.port,
    password: config.password,
    tls: config.tls ? {} : undefined,
    keyPrefix: config.keyPrefix ?? "mcp:",
    maxRetriesPerRequest: 3,
    retryStrategy(times: number) {
      return Math.min(times * 200, 5000);
    },
  });

  await redisClient.ping();
  console.log(`Connected to Redis at ${config.host}:${config.port}`);
  return redisClient;
}

export async function shutdownRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log("Redis connection closed");
  }
}
