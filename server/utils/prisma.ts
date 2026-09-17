import { PrismaClient } from "@prisma/client";

// Nuxt hot-reloads server files in dev, which would otherwise spin up
// a fresh PrismaClient (and a fresh connection pool) on every save.
// Stashing it on globalThis keeps one instance alive across reloads.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
