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

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
    ...(resolvedUrl ? { datasources: { db: { url: resolvedUrl } } } : {})
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db