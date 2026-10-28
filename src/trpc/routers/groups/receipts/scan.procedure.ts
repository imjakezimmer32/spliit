import { scanReceiptInput } from '@/lib/receipts/schemas'
import { scanReceipt } from '@/lib/receipts/service'
import { receiptProcedure } from '@/trpc/routers/groups/receipts/receipt-procedure'

export const scanGroupReceiptProcedure = receiptProcedure
  .input(scanReceiptInput)
  .mutation(({ input }) => scanReceipt(input))
