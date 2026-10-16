import { PrismaClient } from '@prisma/client'
import path from 'path'
import fs from 'fs'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function resolveDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL
  if (url && url.startsWith('file:') && !url.startsWith('file:/')) {
    const rawPath = url.replace(/^file:/, '')
    const candidate1 = path.resolve(process.cwd(), rawPath)
    if (fs.existsSync(candidate1)) return `file:${candidate1}`
    const candidate2 = path.resolve(process.cwd(), 'db/custom.db')
    if (fs.existsSync(candidate2)) return `file:${candidate2}`
    const candidate3 = path.resolve(process.cwd(), '../db/custom.db')
    if (fs.existsSync(candidate3)) return `file:${candidate3}`
  }
  return url
}

const resolvedUrl = resolveDatabaseUrl()

const isDev = process.env.NODE_ENV !== 'production'
const debugQueries = process.env.DEBUG_QUERIES === 'true'

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: debugQueries ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
    ...(resolvedUrl ? { datasources: { db: { url: resolvedUrl } } } : {})
  })

// Habilitar modo WAL e otimizações de concorrência no SQLite
if (!globalForPrisma.prisma) {
  db.$queryRawUnsafe('PRAGMA journal_mode = WAL;')
    .catch((err) => console.warn('[Prisma] Falha ao definir PRAGMA journal_mode = WAL:', err.message));
  db.$queryRawUnsafe('PRAGMA synchronous = NORMAL;')
    .catch(() => {});
  db.$queryRawUnsafe('PRAGMA busy_timeout = 5000;')
    .catch(() => {});
}

if (isDev) globalForPrisma.prisma = db