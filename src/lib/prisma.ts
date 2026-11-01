import { PrismaClient } from '@/generated/prisma/client'
import {
  PERF_INSTRUMENTATION_ENABLED,
  recordQuery,
} from '@/lib/perf-instrumentation'
import { PrismaNeon } from '@prisma/adapter-neon'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

// Prisma 7 ships a Rust-free client and requires an explicit driver adapter.
// We use the `pg` adapter with the pooled connection string.
// On Cloudflare Workers (PRISMA_ADAPTER=neon) the Neon serverless driver is
// used instead: it speaks WebSockets, which also works where raw TCP to
// Postgres is unavailable.
function createPrismaClient() {
  const connectionString = process.env['POSTGRES_PRISMA_URL']
  const adapter =
    process.env['PRISMA_ADAPTER'] === 'neon'
      ? new PrismaNeon({ connectionString })
      : new PrismaPg({ connectionString })
  const client = new PrismaClient({
    adapter,
    // log: [{ emit: 'stdout', level: 'query' }],
  })

  if (!PERF_INSTRUMENTATION_ENABLED) return client

  // Counts operations into whatever `withPerfCounters` scope is active, so
  // /api/trpc can report how much database work a request did. Only reached
  // when PERF_INSTRUMENTATION=1, i.e. under compose.perf.yaml.
  //
  // `$extends` returns a structurally different (narrower) type than
  // PrismaClient, so the cast is needed to keep one type for both branches.
  // Nothing is removed by the extension -- it only wraps each operation.
  return client.$extends({
    query: {
      async $allOperations({ args, query }) {
        const start = performance.now()
        try {
          return await query(args)
        } finally {
          recordQuery(performance.now() - start)
        }
      },
    },
  }) as unknown as PrismaClient
}

// Workers forbid reusing an I/O object (such as a database socket) across
// requests, so there one client is created per request, keyed by the
// per-request context object that @opennextjs/cloudflare exposes. Everywhere
// else (Node.js) a single client is shared, as before.
const CLOUDFLARE_CONTEXT = Symbol.for('__cloudflare-context__')
const perRequestClients = new WeakMap<object, PrismaClient>()

function getClient(): PrismaClient {
  const ctx = (globalThis as Record<symbol, object | undefined>)[
    CLOUDFLARE_CONTEXT
  ]
  if (ctx) {
    let client = perRequestClients.get(ctx)
    if (!client) {
      client = createPrismaClient()
      perRequestClients.set(ctx, client)
    }
    return client
  }
  globalForPrisma.prisma ??= createPrismaClient()
  return globalForPrisma.prisma
}

export const p: PrismaClient =
  typeof window === 'undefined'
    ? new Proxy({} as PrismaClient, {
        get(_target, prop) {
          const client = getClient()
          const value = Reflect.get(client, prop, client)
          return typeof value === 'function' ? value.bind(client) : value
        },
      })
    : (undefined as any as PrismaClient)

export const prisma = p
