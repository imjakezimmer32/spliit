import { saveItemsInput } from '@/lib/receipts/schemas'
import { saveReceiptItems } from '@/lib/receipts/service'
import { receiptProcedure } from '@/trpc/routers/groups/receipts/receipt-procedure'

export const saveGroupReceiptItemsProcedure = receiptProcedure
  .input(saveItemsInput)
  .mutation(async ({ input }) => {
    await saveReceiptItems(input)
    return {}
  })
