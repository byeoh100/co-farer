/**
 * Shared pieces of the Midnight Basecamp cards (co-farer-redesign/SPEC.md):
 * the card shell and header, pill buttons and pills, labelled bars, and
 * VoterSegments. Colours come from the --cf-* tokens and the person palette.
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { pickedByLabel } from '../../lib/overview'
import { usePersonColor } from '../../lib/person-colors-context'

export function CardShell({
  sectionId, className, children, testId,
}: {
  /** Marks the card an ExpandableSection grows from. */
  sectionId?: string
  className?: string
  children: ReactNode
  testId?: string
}) {
  return (
    <article
      data-section-card={sectionId}
      data-testid={testId}
      className={cn('flex min-w-0 flex-col gap-4 rounded-[20px] bg-cf-surface p-5', className)}
    >
      {children}
    </article>
  )
}

export function CardHeader({
  title, sub, action, small = false, subTestId,
}: {
  title: ReactNode
  sub?: ReactNode
  action?: ReactNode
  /** 24px title (Your essentials) instead of 30px. */
  small?: boolean
  subTestId?: string
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className={cn('font-display', small ? 'text-[24px]' : 'text-[30px]')}>{title}</h2>
        {sub && (
          <p className="mt-0.5 text-[13px] text-cf-muted" data-testid={subTestId}>
            {sub}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}

type PillButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'outline' | 'ink'
  size?: 'sm' | 'md'
}

/** Primary (accent fill), outline (1px border) or ink-outline pill buttons, 36 or 40px tall. */
export const PillButton = forwardRef<HTMLButtonElement, PillButtonProps>(function PillButton(
  { variant = 'outline', size = 'md', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full transition-colors disabled:opacity-50 aria-disabled:opacity-60',
        size === 'md' ? 'h-10 px-[18px] text-sm' : 'h-9 px-3.5 text-[13px]',
        variant === 'primary' && 'bg-cf-accent font-semibold text-white hover:bg-[#3456b8]',
        variant === 'outline' && 'border border-cf-border bg-transparent text-cf-text hover:bg-cf-surface-2',
        variant === 'ink' && 'border border-cf-accent-ink bg-transparent text-cf-text hover:bg-cf-surface-2',
        className,
      )}
      {...rest}
    />
  )
})

export function Pill({ tone, children, className, testId }: { tone: 'accent' | 'soft' | 'ok' | 'dark' | 'surface'; children: ReactNode; className?: string; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className={cn(
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold',
        tone === 'accent' && 'bg-cf-accent text-white',
        tone === 'soft' && 'bg-cf-accent-soft text-cf-accent-ink',
        tone === 'ok' && 'bg-cf-ok-bg text-cf-ok',
        tone === 'dark' && 'bg-[rgba(17,17,17,0.85)] text-cf-text',
        tone === 'surface' && 'bg-cf-surface-2 font-normal text-cf-text',
        className,
      )}
    >
      {children}
    </span>
  )
}

/** A horizontal bar with its value in words (never colour alone). */
export function Bar({
  value, label, height = 8, color = 'var(--cf-accent)', track = 'var(--cf-track)',
}: {
  /** 0–100 */
  value: number
  label: string
  height?: number
  color?: string
  track?: string
}) {
  return (
    <div role="img" aria-label={label} className="w-full overflow-hidden" style={{ height, background: track, borderRadius: height / 2 }}>
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, height, background: color, borderRadius: height / 2 }} />
    </div>
  )
}

/**
 * One slot per current member, in join order; a member who picked this
 * option fills their slot in their colour. Names via title and aria-label;
 * never "N of M" text.
 */
export function VoterSegments({
  members, voters, size = 'lg',
}: {
  members: Array<{ userId: string; displayName: string }>
  voters: string[]
  size?: 'lg' | 'sm'
}) {
  const colorOf = usePersonColor()
  const picked = new Set(voters)
  const names = members.filter((m) => picked.has(m.userId)).map((m) => m.displayName)
  const h = size === 'lg' ? 8 : 6
  return (
    <div
      role="img"
      aria-label={pickedByLabel(names)}
      data-testid="voter-segments"
      className="grid"
      style={{ gridTemplateColumns: `repeat(${Math.max(1, members.length)}, minmax(0, 1fr))`, gap: size === 'lg' ? 4 : 3 }}
    >
      {members.map((m) => (
        <span
          key={m.userId}
          title={picked.has(m.userId) ? m.displayName : undefined}
          style={{ height: h, borderRadius: 4, background: picked.has(m.userId) ? colorOf(m.userId) : 'var(--cf-border)' }}
        />
      ))}
    </div>
  )
}

/** "$1,234" */
export const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`
