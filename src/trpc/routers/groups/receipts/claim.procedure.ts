import { claimItemInput } from '@/lib/receipts/schemas'
import { claimItem } from '@/lib/receipts/service'
import { receiptProcedure } from '@/trpc/routers/groups/receipts/receipt-procedure'

export const claimGroupReceiptItemProcedure = receiptProcedure
  .input(claimItemInput)
  .mutation(async ({ input }) => {
    await claimItem(input)
    return {}
  })
