import { receiptRefInput } from '@/lib/receipts/schemas'
import { reopenReceipt } from '@/lib/receipts/service'
import { receiptProcedure } from '@/trpc/routers/groups/receipts/receipt-procedure'

export const reopenGroupReceiptProcedure = receiptProcedure
  .input(receiptRefInput)
  .mutation(async ({ input }) => {
    await reopenReceipt(input)
    return {}
  })
