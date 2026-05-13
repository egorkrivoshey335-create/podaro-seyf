import { PrismaPg } from "@prisma/adapter-pg";
import prismaClientPkg from "@prisma/client";

import { config } from "../config.js";

const { PrismaClient } = prismaClientPkg;

const globalForPrisma = globalThis;
const adapter = new PrismaPg({
  connectionString: config.databaseUrl,
});

export const prisma =
  globalForPrisma.__giftSafePrisma ||
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__giftSafePrisma = prisma;
}
