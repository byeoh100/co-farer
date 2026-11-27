/**
 * The app header (co-farer-redesign/SPEC.md, AppHeader): the logo mark and
 * CO-FARER wordmark, then the nav links (the active one underlined in accent
 * ink, aria-current="page"). A trip page adds its name to the nav and its
 * avatar stack + Invite on the right (HeaderPortal). Then the account menu,
 * or "Sign in". Under 768px the nav links move into a menu.
 *
 * Kept test hooks: app-navigation, nav-sign-in-button, nav-user-name,
 * nav-user-email.
 */

import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuthProfileReady } from 'deepspace'
import { LogOut, Menu, X } from 'lucide-react'
import type { Role } from '../constants'
import { nav } from '../nav'
import { cn } from '../lib/utils'
import { initials } from '../lib/personColor'
import { fallbackColor } from '../lib/person-colors-context'
import { signInPath, signOutEverywhere } from './SignIn'
import { useHeaderSlotRef } from './HeaderSlot'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from './ui'

export default function Navigation() {
  const { isLoaded, isSignedIn, user, userLoading } = useAuthProfileReady({ requireUser: true })
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const navSlot = useHeaderSlotRef('nav')
  const endSlot = useHeaderSlotRef('end')

  const profileReady = !isSignedIn || (!userLoading && !!user)
  const userRole = (user?.role ?? 'anonymous') as Role | 'anonymous'

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  const visibleNav = nav.filter((item) => {
    if (item.devOnly && !import.meta.env.DEV) return false
    if (!item.roles) return true
    if (!profileReady) return false
    if (userRole === 'admin') return true
    return item.roles.includes(userRole as Role)
  })

  const navLink = (item: (typeof nav)[number], mobile = false) => {
    const active = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
    return (
      <Link
        key={item.path}
        to={item.path}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'whitespace-nowrap border-b-2 pb-1.5 text-sm',
          active ? 'border-cf-accent-ink text-cf-text' : 'border-transparent text-cf-muted hover:text-cf-text',
          mobile && 'px-2 py-2.5',
        )}
      >
        {item.label}
      </Link>
    )
  }

  const [first, ...rest] = visibleNav

  return (
    <nav data-testid="app-navigation" className="bg-cf-bg">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-7 gap-y-3 border-b border-cf-line px-4 py-4 sm:px-8">
        <Link to="/trips" className="flex items-center gap-2.5" aria-label="Co-farer home">
          <img src="/logo-mark.svg" alt="" width={30} height={30} className="h-[30px] w-[30px]" />
          <span className="font-display text-[26px] tracking-[0.5px]">Co-farer</span>
        </Link>

        <div className="hidden items-center gap-[22px] pt-1.5 md:flex">
          {first && navLink(first)}
          {/* The current trip's name (trip pages only). */}
          <span ref={navSlot} className="contents" />
          {rest.map((item) => navLink(item))}
        </div>

        <div className="flex-1" />

        <div ref={endSlot} className="contents" />

        {!isLoaded ? null : isSignedIn && !profileReady ? (
          <div className="h-[34px] w-[34px] animate-pulse rounded-full bg-cf-surface-2" />
        ) : isSignedIn && user ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  aria-label="Account menu"
                  className="flex h-[34px] w-[34px] items-center justify-center rounded-full text-xs font-semibold text-[#111111]"
                  style={{ background: fallbackColor(user.id ?? user.email ?? 'me') }}
                >
                  <span aria-hidden>{initials(user.name || user.email || '?')}</span>
                  <span data-testid="nav-user-name" className="sr-only">
                    {user.name || user.email}
                  </span>
                </button>
              }
            />
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="truncate font-medium text-foreground">{user.name || 'Signed in'}</div>
                <div data-testid="nav-user-email" className="truncate text-xs font-normal text-muted-foreground">
                  {user.email}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOutEverywhere}>
                <LogOut aria-hidden />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : location.pathname === '/sign-in' ? null : (
          <Link
            data-testid="nav-sign-in-button"
            to={signInPath(`${location.pathname}${location.search}`)}
            className="inline-flex h-10 items-center rounded-full bg-cf-accent px-[18px] text-sm font-semibold text-white hover:bg-[#3456b8]"
          >
            Sign in
          </Link>
        )}

        <button
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-cf-muted hover:text-cf-text md:hidden"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          aria-label="Toggle menu"
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
        </button>

        {mobileMenuOpen && <div className="flex w-full flex-col md:hidden">{visibleNav.map((item) => navLink(item, true))}</div>}
      </div>
    </nav>
  )
}
