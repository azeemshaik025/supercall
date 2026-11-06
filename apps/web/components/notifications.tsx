'use client'

export function Notifications({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-label="Notifications"
      className="surface-card absolute top-11 right-0 z-30 w-80 shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="text-[14px] font-medium">Notifications</span>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer text-[12px] text-muted hover:text-ink"
        >
          Close
        </button>
      </div>
      <p className="px-4 py-8 text-center text-[13px] text-muted">No notifications yet.</p>
    </div>
  )
}
