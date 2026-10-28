import { createTRPCRouter } from '@/trpc/init'
import { approveAllGroupReceiptClaimsProcedure } from '@/trpc/routers/groups/receipts/approve-all.procedure'
import { assignGroupReceiptItemProcedure } from '@/trpc/routers/groups/receipts/assign.procedure'
import { claimGroupReceiptItemProcedure } from '@/trpc/routers/groups/receipts/claim.procedure'
import { createGroupReceiptProcedure } from '@/trpc/routers/groups/receipts/create.procedure'
import { deleteGroupReceiptProcedure } from '@/trpc/routers/groups/receipts/delete.procedure'
import { finalizeGroupReceiptProcedure } from '@/trpc/routers/groups/receipts/finalize.procedure'
import { getGroupReceiptProcedure } from '@/trpc/routers/groups/receipts/get.procedure'
import { groupReceiptInboxProcedure } from '@/trpc/routers/groups/receipts/inbox.procedure'
import { listGroupReceiptsProcedure } from '@/trpc/routers/groups/receipts/list.procedure'
import { openGroupReceiptProcedure } from '@/trpc/routers/groups/receipts/open.procedure'
import { groupReceiptPendingCountProcedure } from '@/trpc/routers/groups/receipts/pending-count.procedure'
import { reopenGroupReceiptProcedure } from '@/trpc/routers/groups/receipts/reopen.procedure'
import { respondGroupReceiptClaimProcedure } from '@/trpc/routers/groups/receipts/respond.procedure'
import { saveGroupReceiptItemsProcedure } from '@/trpc/routers/groups/receipts/save-items.procedure'
import { scanGroupReceiptProcedure } from '@/trpc/routers/groups/receipts/scan.procedure'
import { splitGroupReceiptItemProcedure } from '@/trpc/routers/groups/receipts/split.procedure'
import { unclaimGroupReceiptItemProcedure } from '@/trpc/routers/groups/receipts/unclaim.procedure'
import { updateGroupReceiptProcedure } from '@/trpc/routers/groups/receipts/update.procedure'

export const groupReceiptsRouter = createTRPCRouter({
  list: listGroupReceiptsProcedure,
  get: getGroupReceiptProcedure,
  inbox: groupReceiptInboxProcedure,
  pendingCount: groupReceiptPendingCountProcedure,
  create: createGroupReceiptProcedure,
  scan: scanGroupReceiptProcedure,
  update: updateGroupReceiptProcedure,
  saveItems: saveGroupReceiptItemsProcedure,
  open: openGroupReceiptProcedure,
  claim: claimGroupReceiptItemProcedure,
  assign: assignGroupReceiptItemProcedure,
  split: splitGroupReceiptItemProcedure,
  unclaim: unclaimGroupReceiptItemProcedure,
  respond: respondGroupReceiptClaimProcedure,
  approveAll: approveAllGroupReceiptClaimsProcedure,
  finalize: finalizeGroupReceiptProcedure,
  reopen: reopenGroupReceiptProcedure,
  delete: deleteGroupReceiptProcedure,
})
