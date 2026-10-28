import { receiptRefInput } from '@/lib/receipts/schemas'
import { deleteReceipt } from '@/lib/receipts/service'
import { receiptProcedure } from '@/trpc/routers/groups/receipts/receipt-procedure'

export const deleteGroupReceiptProcedure = receiptProcedure
  .input(receiptRefInput)
  .mutation(async ({ input }) => {
    await deleteReceipt(input)
    return {}
  })
