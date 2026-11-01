import { Button } from '@/components/ui/button'
import { TrackPage } from '@/lib/analytics/track-page'
import { Hand, Plus, ReceiptText, Scale } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

// FIX for https://github.com/vercel/next.js/issues/58615
// export const dynamic = 'force-dynamic'

export default function HomePage() {
  const t = useTranslations()
  return (
    <main>
      <TrackPage path="/" />
      <section className="py-10 md:py-24 lg:py-32">
        <div className="container px-4 flex max-w-screen-md flex-col items-center gap-4 text-center">
          <h1 className="!leading-none font-bold text-2xl sm:text-3xl md:text-4xl lg:text-5xl landing-header py-2">
            {t.rich('Homepage.title', {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </h1>
          <p className="max-w-[42rem] leading-normal text-muted-foreground sm:text-xl sm:leading-8">
            {t.rich('Homepage.description', {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
          <div className="flex flex-col gap-2 w-full sm:w-auto sm:flex-row">
            <Button asChild size="lg">
              <Link href="/groups/create">
                <Plus className="w-4 h-4 mr-2" />
                {t('Homepage.button.create')}
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="/groups">{t('Homepage.button.groups')}</Link>
            </Button>
          </div>
          <ul className="mt-6 grid w-full gap-3 text-left text-sm sm:grid-cols-3">
            {[
              {
                icon: <ReceiptText className="h-5 w-5" />,
                title: 'Scan the receipt',
                text: 'Snap a photo and the items are read for you.',
              },
              {
                icon: <Hand className="h-5 w-5" />,
                title: 'Claim your stuff',
                text: 'Everyone taps what’s theirs, or splits it.',
              },
              {
                icon: <Scale className="h-5 w-5" />,
                title: 'Stay square',
                text: 'Balances update as items are approved.',
              },
            ].map((feature) => (
              <li
                key={feature.title}
                className="flex gap-3 rounded-lg border bg-card p-4"
              >
                <span className="text-primary">{feature.icon}</span>
                <span>
                  <span className="block font-semibold">{feature.title}</span>
                  <span className="text-muted-foreground">{feature.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  )
}
