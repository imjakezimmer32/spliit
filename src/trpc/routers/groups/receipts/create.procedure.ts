import { createReceiptInput } from '@/lib/receipts/schemas'
import { createReceipt } from '@/lib/receipts/service'
import { receiptProcedure } from '@/trpc/routers/groups/receipts/receipt-procedure'

export const createGroupReceiptProcedure = receiptProcedure
  .input(createReceiptInput)
  .mutation(({ input }) => createReceipt(input))
