import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** The in-card scroll area (SPEC.md, ScrollArea): thin scrollbar, keyboard-scrollable. */
export function ScrollArea({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div tabIndex={0} role="region" aria-label={label} data-scroll-area className={cn('cf-scroll flex-1 pr-1.5', className)}>
      {children}
    </div>
  )
}
