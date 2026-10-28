import { respondInput } from '@/lib/receipts/schemas'
import { respondToClaim } from '@/lib/receipts/service'
import { receiptProcedure } from '@/trpc/routers/groups/receipts/receipt-procedure'

export const respondGroupReceiptClaimProcedure = receiptProcedure
  .input(respondInput)
  .mutation(async ({ input }) => {
    await respondToClaim(input)
    return {}
  })
