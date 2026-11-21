import { useRef, useState } from 'react'
import { Check, Copy, Crown, RefreshCw } from 'lucide-react'
import { Button, Popover, PopoverContent, PopoverTrigger, useToast } from '@/components/ui'
import { BUDGET_CATEGORIES } from '../../schemas/trip-schemas'
import { callAction } from '../../lib/actions-client'
import { usePublicBudgets, type Member, type Trip } from '../../lib/trip-data'
import { MemberAvatar } from './MemberAvatar'
import { useOnlineUsers } from './TripPresence'

const MAX_SHOWN = 5
const LABELS = { housing: 'Housing', gas: 'Gas', food: 'Food', activities: 'Activities' } as const

/**
 * Overlapping profile circles. Clicking opens the members panel: everyone's
 * name, online state and any budgets they made public; the organizer also
 * gets the invite link.
 */
export function MembersStack({ trip, members, isOrganizer }: { trip: Trip; members: Member[]; isOrganizer: boolean }) {
  const online = useOnlineUsers()
  const publicBudgets = usePublicBudgets(trip.id)
  // Online people first, so the colored circles lead the stack.
  const ordered = [...members].sort((a, b) => Number(online.has(b.userId)) - Number(online.has(a.userId)))
  const shown = ordered.slice(0, MAX_SHOWN)
  const extra = ordered.length - shown.length

  return (
    <Popover>
      <PopoverTrigger
        data-testid="members-stack"
        aria-label={`${members.length} ${members.length === 1 ? 'member' : 'members'}, ${online.size} online. Show members`}
        className="flex items-center rounded-full p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex -space-x-2">
          {shown.map((m) => (
            <MemberAvatar key={m.userId} userId={m.userId} name={m.displayName} imageUrl={m.imageUrl} online={online.has(m.userId)} />
          ))}
          {extra > 0 && (
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground ring-2 ring-card">
              +{extra}
            </span>
          )}
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-32px)] p-0">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Members</p>
          <p className="text-xs text-muted-foreground">
            {members.length} in this trip · {online.size} online
          </p>
        </div>
        <ul className="max-h-72 overflow-y-auto px-2 py-2" data-testid="members-list">
          {ordered.map((m) => {
            const pub = publicBudgets.get(m.userId) ?? {}
            return (
              <li key={m.userId} className="flex items-start gap-3 rounded-lg px-2 py-2" data-testid="member-row">
                <MemberAvatar userId={m.userId} name={m.displayName} imageUrl={m.imageUrl} online={online.has(m.userId)} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm">
                    <span className="truncate" data-testid="member-name">{m.displayName}</span>
                    {m.tripRole === 'organizer' && <Crown className="h-3.5 w-3.5 shrink-0 text-warning" aria-label="Organizer" />}
                  </p>
                  {BUDGET_CATEGORIES.some((c) => pub[c] != null) && (
                    <p className="mt-0.5 flex flex-wrap gap-1" data-testid="member-public-budgets">
                      {BUDGET_CATEGORIES.filter((c) => pub[c] != null).map((c) => (
                        <span key={c} className="rounded-full bg-accent px-2 py-0.5 text-[11px] text-accent-foreground">
                          {LABELS[c]} ${pub[c]}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
        {isOrganizer && <InviteControls trip={trip} />}
      </PopoverContent>
    </Popover>
  )
}

function InviteControls({ trip }: { trip: Trip }) {
  const { success, error } = useToast()
  const [copied, setCopied] = useState(false)
  const [rotating, setRotating] = useState(false)
  const link = `${window.location.origin}/join/${trip.inviteCode}`

  const linkInput = useRef<HTMLInputElement>(null)

  // Some browsers (notably Safari and Firefox) refuse the async clipboard API
  // in cases Chrome allows, e.g. right after a popup opens. Fall back to
  // copying the selected text of the visible link box, which they accept
  // during a click. Only if both fail do we ask the person to copy by hand.
  const copy = async () => {
    let ok = false
    try {
      await navigator.clipboard.writeText(link)
      ok = true
    } catch (e) {
      console.warn('[invite-link] clipboard API refused, trying fallback:', e instanceof Error ? `${e.name}: ${e.message}` : e)
      const input = linkInput.current
      if (input) {
        input.focus()
        input.select()
        try {
          ok = document.execCommand('copy')
        } catch {
          ok = false
        }
      }
    }
    if (!ok) return error('Could not copy', 'The link is selected: copy it by hand.')
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  const rotate = async () => {
    setRotating(true)
    const res = await callAction('rotateInviteCode', { tripId: trip.id })
    setRotating(false)
    if (res.success) success('New invite link made', 'The old link no longer works.')
    else error('Could not make a new link', res.error)
  }

  return (
    <div className="border-t border-border px-4 py-3">
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">Invite link</p>
      <div className="flex items-center gap-2">
        <input
          ref={linkInput}
          readOnly
          value={link}
          aria-label="Invite link"
          data-testid="invite-link"
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs"
        />
        <Button size="sm" variant="outline" onClick={copy} aria-label="Copy invite link">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <Button size="sm" variant="ghost" className="mt-2 px-0 text-xs" onClick={rotate} loading={rotating}>
        <RefreshCw className="h-3.5 w-3.5" /> New link (the old one stops working)
      </Button>
    </div>
  )
}
