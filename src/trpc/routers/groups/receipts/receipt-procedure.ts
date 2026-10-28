import { getRuntimeFeatureFlags } from '@/lib/featureFlags'
import { baseProcedure } from '@/trpc/init'
import { TRPCError } from '@trpc/server'

export const receiptProcedure = baseProcedure.use(async ({ next }) => {
  const { enableReceiptClaims } = await getRuntimeFeatureFlags()
  if (!enableReceiptClaims) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Receipt claims are not enabled.',
    })
  }
  return next()
})
