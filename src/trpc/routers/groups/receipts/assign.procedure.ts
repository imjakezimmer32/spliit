import { assignItemInput } from '@/lib/receipts/schemas'
import { assignItem } from '@/lib/receipts/service'
import { receiptProcedure } from '@/trpc/routers/groups/receipts/receipt-procedure'

export const assignGroupReceiptItemProcedure = receiptProcedure
  .input(assignItemInput)
  .mutation(async ({ input }) => {
    await assignItem(input)
    return {}
  })
