import { updateReceiptInput } from '@/lib/receipts/schemas'
import { updateReceipt } from '@/lib/receipts/service'
import { receiptProcedure } from '@/trpc/routers/groups/receipts/receipt-procedure'

export const updateGroupReceiptProcedure = receiptProcedure
  .input(updateReceiptInput)
  .mutation(async ({ input }) => {
    await updateReceipt(input)
    return {}
  })
