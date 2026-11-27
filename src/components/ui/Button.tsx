import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: 'bg-primary font-semibold text-primary-foreground hover:bg-[#3456b8]',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/20',
        outline:
          'border border-cf-border bg-transparent hover:bg-cf-surface-2 hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-cf-track',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-cf-accent-ink underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-[18px] py-2',
        sm: 'h-9 px-3.5 text-[13px]',
        lg: 'h-11 px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading = false, disabled, children, type, ...props }, ref) => (
    <button
      ref={ref}
      data-slot="button"
      type={type ?? 'button'}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'

export { Button, buttonVariants }
