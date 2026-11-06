import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Privacy · Supercall' }

const sections: { title: string; body: string[] }[] = [
  {
    title: 'What the extension reads',
    body: [
      'On x.com, the id and author handle of each post on screen, and the handle of a profile you open. They are sent to the Supercall API to ask whether the post is a trade call or the profile is a Supercall caller. Post text, your timeline, your messages and your X account are never read or sent.',
      'On the Supercall site, your Supercall sign-in token, so the extension uses the same sign-in instead of asking again. It is kept in the browser’s session storage and is gone when the browser closes.',
    ],
  },
  {
    title: 'What it stores',
    body: [
      'Answers about posts and callers, cached in session storage so X stays fast, and the call you picked to copy. Nothing is kept after the browser closes, and nothing is stored on a server by the extension itself.',
    ],
  },
  {
    title: 'Wallets and copies',
    body: [
      'Your wallet address is read to show your USDC balance on Arc. Everything your wallet signs, a copy, a fee or a published call, is signed on the Supercall site in your own wallet. The extension never holds keys and never signs anything.',
      'A copy is recorded with your wallet address, the call, its size and its order, so it can be settled. Copies are private: only you can list your own.',
    ],
  },
  {
    title: 'What is never done',
    body: [
      'No ads, no analytics or tracking in the extension, no selling or sharing of data, and no remote code: everything the extension runs ships in the extension.',
    ],
  },
  {
    title: 'Contact',
    body: ['Questions or deletion requests: open an issue at github.com/azeemshaik025/supercall.'],
  },
]

export default function Privacy() {
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-8 px-6 py-14">
      <div className="flex flex-col gap-2">
        <h1 className="text-[32px] font-medium tracking-[-0.03em]">Privacy</h1>
        <p className="text-[13px] text-muted">Supercall site and Chrome extension · November 2026</p>
      </div>
      {sections.map((s) => (
        <section key={s.title} className="flex flex-col gap-3 border-t border-line pt-6">
          <h2 className="text-[16px] font-medium">{s.title}</h2>
          {s.body.map((p) => (
            <p key={p.slice(0, 24)} className="text-[14px] leading-relaxed text-silver">
              {p}
            </p>
          ))}
        </section>
      ))}
    </main>
  )
}
