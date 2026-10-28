import { splitItemInput } from '@/lib/receipts/schemas'
import { splitItem } from '@/lib/receipts/service'
import { receiptProcedure } from '@/trpc/routers/groups/receipts/receipt-procedure'

export const splitGroupReceiptItemProcedure = receiptProcedure
  .input(splitItemInput)
  .mutation(async ({ input }) => {
    await splitItem(input)
    return {}
  })
