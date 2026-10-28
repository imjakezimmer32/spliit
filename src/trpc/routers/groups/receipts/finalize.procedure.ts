import { receiptRefInput } from '@/lib/receipts/schemas'
import { finalizeReceipt } from '@/lib/receipts/service'
import { receiptProcedure } from '@/trpc/routers/groups/receipts/receipt-procedure'

export const finalizeGroupReceiptProcedure = receiptProcedure
  .input(receiptRefInput)
  .mutation(async ({ input }) => {
    await finalizeReceipt(input)
    return {}
  })
