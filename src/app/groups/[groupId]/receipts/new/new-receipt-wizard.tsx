'use client'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useToast } from '@/components/ui/use-toast'
import { downscaleImage } from '@/lib/receipts/downscale-image'
import { useReceiptHelpers } from '@/lib/receipts/use-receipt-helpers'
import { trpc } from '@/trpc/client'
import { ArrowLeft, Camera, Loader2, PencilLine } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { getImageData, usePresignedUpload } from 'next-s3-upload'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useCurrentGroup } from '../../current-group-context'
import { RequireActiveParticipant } from '../require-active-participant'

type Step = 'payer' | 'capture'
type Busy = 'uploading' | 'scanning' | 'creating' | null

function todayIso() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function NewReceiptWizard({
  groupId,
  enableReceiptExtract,
}: {
  groupId: string
  enableReceiptExtract: boolean
}) {
  return (
    <RequireActiveParticipant>
      {(participantId) => (
        <NewReceiptSteps
          groupId={groupId}
          participantId={participantId}
          enableReceiptExtract={enableReceiptExtract}
        />
      )}
    </RequireActiveParticipant>
  )
}

function NewReceiptSteps({
  groupId,
  participantId,
  enableReceiptExtract,
}: {
  groupId: string
  participantId: string
  enableReceiptExtract: boolean
}) {
  const t = useTranslations('Receipts')
  const { group } = useCurrentGroup()
  const router = useRouter()
  const { toast } = useToast()
  const { invalidate, showError } = useReceiptHelpers()
  const { FileInput, openFileDialog, uploadToS3 } = usePresignedUpload()
  const create = trpc.groups.receipts.create.useMutation()
  const scan = trpc.groups.receipts.scan.useMutation()

  const [step, setStep] = useState<Step>('payer')
  const [paidById, setPaidById] = useState(participantId)
  const [title, setTitle] = useState(t('New.defaultTitle'))
  const [receiptDate, setReceiptDate] = useState(todayIso())
  const [busy, setBusy] = useState<Busy>(null)

  if (!group) return null

  const titleValid = title.trim().length >= 2
  const disabled = busy !== null || !titleValid

  const baseInput = {
    groupId,
    actorId: participantId,
    paidById,
    title: title.trim(),
    receiptDate: receiptDate || undefined,
  }

  const navigateTo = (receiptId: string) =>
    router.push(`/groups/${groupId}/receipts/${receiptId}`)

  const createManually = async () => {
    try {
      setBusy('creating')
      const { receiptId } = await create.mutateAsync(baseInput)
      await invalidate()
      navigateTo(receiptId)
    } catch (error) {
      console.error(error)
      showError(error)
      setBusy(null)
    }
  }

  const handlePhoto = async (file: File) => {
    try {
      setBusy('uploading')
      const scaled = await downscaleImage(file)
      const { url } = await uploadToS3(scaled)
      const { width, height } = await getImageData(scaled)
      if (!width || !height) throw new Error('Could not read image size.')
      const { receiptId } = await create.mutateAsync({
        ...baseInput,
        image: { url, width, height },
      })
      setBusy('scanning')
      try {
        await scan.mutateAsync({ groupId, actorId: participantId, receiptId })
      } catch (error) {
        // The receipt exists either way; the draft page offers "Scan again".
        console.error(error)
        toast({
          description: t('Errors.scanFailed'),
          variant: 'destructive',
        })
      }
      await invalidate()
      navigateTo(receiptId)
    } catch (error) {
      console.error(error)
      showError(error)
      setBusy(null)
    }
  }

  if (step === 'payer') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('New.payerTitle')}</CardTitle>
          <CardDescription>{t('New.payerDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={paidById}
            onValueChange={setPaidById}
            className="gap-2"
          >
            {group.participants.map((participant) => (
              <div
                key={participant.id}
                className="flex items-center gap-3 rounded-md border p-3 has-[:checked]:border-primary"
              >
                <RadioGroupItem
                  value={participant.id}
                  id={`payer-${participant.id}`}
                  data-testid="payer-option"
                />
                <Label
                  htmlFor={`payer-${participant.id}`}
                  className="flex-1 cursor-pointer"
                >
                  {participant.name}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={() => setStep('capture')}>{t('New.next')}</Button>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('New.captureTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-2">
          <Label htmlFor="receipt-title">{t('New.titleLabel')}</Label>
          <Input
            id="receipt-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            disabled={busy !== null}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="receipt-date">{t('New.dateLabel')}</Label>
          <Input
            id="receipt-date"
            type="date"
            value={receiptDate}
            onChange={(e) => setReceiptDate(e.target.value)}
            disabled={busy !== null}
          />
        </div>

        {enableReceiptExtract && (
          <FileInput
            accept="image/jpeg,image/png"
            capture="environment"
            onChange={handlePhoto}
          />
        )}

        {busy ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            {busy === 'uploading' && t('New.uploading')}
            {busy === 'scanning' && t('New.scanning')}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {enableReceiptExtract && (
              <>
                <Button
                  className="h-auto flex-col gap-2 py-6"
                  disabled={disabled}
                  onClick={openFileDialog}
                >
                  <Camera className="h-6 w-6" />
                  {t('New.takePhoto')}
                </Button>
              </>
            )}
            <Button
              variant="secondary"
              className="h-auto flex-col gap-2 py-6"
              disabled={disabled}
              onClick={createManually}
            >
              <PencilLine className="h-6 w-6" />
              {t('New.enterManually')}
            </Button>
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-start">
        <Button
          variant="ghost"
          disabled={busy !== null}
          onClick={() => setStep('payer')}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('New.back')}
        </Button>
      </CardFooter>
    </Card>
  )
}
