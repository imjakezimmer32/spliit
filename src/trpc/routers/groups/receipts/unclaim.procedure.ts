import { unclaimInput } from '@/lib/receipts/schemas'
import { unclaimItem } from '@/lib/receipts/service'
import { receiptProcedure } from '@/trpc/routers/groups/receipts/receipt-procedure'

export const unclaimGroupReceiptItemProcedure = receiptProcedure
  .input(unclaimInput)
  .mutation(async ({ input }) => {
    await unclaimItem(input)
    return {}
  })
