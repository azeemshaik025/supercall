import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

export const cx = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(' ')

/** An icon from public/icons, tinted with the text colour. */
export function Icon({
  name,
  size = 20,
  className,
}: {
  name: string
  size?: number
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cx('icon', className)}
      style={{ width: size, height: size, maskImage: `url(/icons/${name}.svg)` }}
    />
  )
}

export { TokenIcon } from './token-icon'

export function VerifiedBadge({ size = 12 }: { size?: number }) {
  return (
    <img
      src="/brand/verified.svg"
      alt="Verified human"
      width={size}
      height={size}
      className="shrink-0"
    />
  )
}

type ButtonVariant = 'cta' | 'secondary' | 'ghost' | 'buy'

const buttonStyles: Record<ButtonVariant, string> = {
  cta: 'btn-cta',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-surface-2',
  ghost: 'text-muted hover:text-ink',
  buy: 'bg-good font-semibold text-bg hover:brightness-110',
}

const buttonBase =
  'inline-flex h-10 cursor-pointer items-center justify-center gap-2 px-4 text-[13px]'

export function Button({
  variant = 'cta',
  className,
  ...p
}: ComponentProps<'button'> & { variant?: ButtonVariant }) {
  return (
    <button type="button" className={cx(buttonBase, buttonStyles[variant], className)} {...p} />
  )
}

export function ButtonLink({
  variant = 'cta',
  className,
  ...p
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={cx(buttonBase, buttonStyles[variant], className)} {...p} />
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx('surface-card', className)}>{children}</section>
}

export function SideTag({ long }: { long: boolean }) {
  return (
    <span
      className={cx(
        'px-1.5 py-px text-[11px] font-medium',
        long ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad',
      )}
    >
      {long ? 'Long' : 'Short'}
    </span>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  label: string
}) {
  return (
    <fieldset aria-label={label} className="flex gap-0.5 border border-line bg-sidebar p-[3px]">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={o === value}
          onClick={() => onChange(o)}
          className={cx(
            'h-[30px] cursor-pointer whitespace-nowrap px-2.5 text-[12px]',
            o === value ? 'sheen text-ink' : 'border border-transparent text-muted hover:text-ink',
          )}
        >
          {o}
        </button>
      ))}
    </fieldset>
  )
}

/** ⓘ with its explanation on hover and focus. */
export function Info({ label, text }: { label: string; text: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={text}
      className="inline-flex size-4 cursor-help items-center justify-center text-muted hover:text-ink"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </svg>
    </button>
  )
}

export function PageTitle({
  title,
  sub,
  action,
}: {
  title: string
  sub?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-2">
        <h1 className="text-fade text-[40px] font-medium leading-[1.05] tracking-[-0.035em]">
          {title}
        </h1>
        {sub && <p className="text-sm text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  )
}
