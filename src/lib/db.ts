import { PrismaClient } from '@prisma/client'
import path from 'path'
import fs from 'fs'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function isWritableDb(filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) return false
    fs.accessSync(filePath, fs.constants.R_OK | fs.constants.W_OK)
    return true
  } catch {
    return false
  }
}

function resolveDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL
  if (url && url.startsWith('file:') && !url.startsWith('file:/')) {
    const rawPath = url.replace(/^file:/, '')
    // Prisma CLI resolve caminhos relativos em relação a prisma/schema.prisma (ex: prisma/db/custom.db).
    // Prioriza esse caminho se existir e tiver permissão de escrita, evitando abrir cópias vazias/somente-leitura.
    const candidates = [
      path.resolve(process.cwd(), 'prisma', rawPath),
      path.resolve(process.cwd(), 'prisma/db/custom.db'),
      path.resolve(process.cwd(), '../prisma', rawPath),
      path.resolve(process.cwd(), rawPath),
      path.resolve(process.cwd(), 'db/custom.db'),
      path.resolve(process.cwd(), '../db/custom.db'),
    ]
    for (const candidate of candidates) {
      if (isWritableDb(candidate) && fs.statSync(candidate).size > 0) {
        return `file:${candidate}`
      }
    }
    for (const candidate of candidates) {
      if (isWritableDb(candidate)) {
        return `file:${candidate}`
      }
    }
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
  db.$queryRawUnsafe('PRAGMA synchronous = FULL;')
    .catch(() => {});
  db.$queryRawUnsafe('PRAGMA busy_timeout = 5000;')
    .catch(() => {});
}

if (isDev) globalForPrisma.prisma = db