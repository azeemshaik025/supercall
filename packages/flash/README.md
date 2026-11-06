# @supercall/flash

Typed client for the [Definitive Flash](https://flash.definitive.fi/docs) API, the venue copies trade on.

- `createFlashClient({ apiKey, integratorFeeBps })`: search, quote, submit order, setup transactions, order detail, list orders, cancel, balances. **Server only**: it holds the API key.
- `copyOrderQuote(...)`: the quote for copying a call. A market buy with USDC, with the call's target and stop attached as take-profit and stop-loss.
- `signingSteps(quote)` and `orderFromQuote(request, quote, signed)`: the wallet prompts a quote needs, in order, and the order built from their results. Safe in the browser.
- `cancelMessage(orderId)`: the text the funder signs to cancel.
- `summarizeFills(order)`, `isWorking`, `isTerminal`: what an order filled at, for settlement.

## Flow for a copy

1. API: `flash.quote(copyOrderQuote({ ... }))`.
2. Browser: run `signingSteps(quote)`. Approvals are transactions and must be mined first; the rest are EIP-712 signatures.
3. API: `flash.submitOrder(orderFromQuote(request, quote, signed))` returns the `orderId`.
4. Later: `flash.getOrder(orderId, funder)`, then `summarizeFills(...)`.

Flash requires the same integrator fee on the quote and the order; the client sends it on both.

## Notes

- Flash trades on Arc **mainnet** (`arc`, chain 5042). It lists no testnets.
- Cancelling needs the funder's EIP-191 signature over `cancelMessage(orderId)`.
- `pnpm --filter @supercall/flash assets` lists what trades on Arc (needs `FLASH_API_KEY`).
