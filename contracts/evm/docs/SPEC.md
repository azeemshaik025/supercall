# Hisaab: approved design

## Summary
Supercall runs on a contract named Hisaab on Arc Testnet. It holds USDC fees from followers who copy a trade call. A follower pays the fees with one signed Permit2 transfer, which the backend usually submits. The backend's writer key registers each call. A trusted settler then posts one of four endings: Right, Above entry, Wrong, or Refund. The settler settles each call in batches of up to 50 copies, and payouts are pushed to followers, the caller's payout wallet, and the treasury in the same batch. Nobody claims, except for a payout that USDC refused. The contract never reads prices. It is for callers who post trade ideas (callers never transact) and for followers who pay to copy them.

**Money rules (from the spec):**
1. Kept fee. On a Right or Above entry call, the settler posts each copy's kept fee: the smaller of her call fee and half her net profit. Profit comes from her own trade fills, which the contract cannot see. The contract checks only that the kept fee is at most that copy's call fee, and 0 if her buy never filled. The kept fee comes out of the credit-paid part of her call fee first, then the cash-paid part. The rest of her call fee comes back in the form it was paid.
2. Caller's cut. Each call has a cut set at registration, between 10% and 70% of the cash-paid kept fees. Right pays the full cut. Above entry pays half the cut. The rest of the kept cash goes into the earned part of the caller's fund.
3. The caller's fund. The contract holds it and the caller can never withdraw it. It has two parts:
   - Earned: from kept fees paid in cash. It has a limit (a stub for now), and anything above the limit goes to the call's payout wallet as cash.
   - Credit-only: from kept fees paid with credit. No limit, and never paid to the caller.
   The fund is keyed by a bytes32 caller id, not by a wallet. Each call stores the wallet that receives the cut and any overflow.
4. Treasury. It gets only the platform fee, and only from a copy whose buy filled, on a call that worked (Right or Above entry). Otherwise the platform fee goes back to the follower in cash. The treasury never gets any call fee.
5. Wrong. Each follower gets both fees back. The settler posts each copy's credit ask, at most 30% of the copy size minus the call fee. A call's total credit is at most half of the earned and credit-only parts together. If the asks add up to more, all asks are scaled down by the same percentage. The credit comes from credit-only first, then earned, and that USDC moves into a credit reserve.
6. Credit. It pays future call fees only, before cash. It cannot be withdrawn or moved, and it never expires. A call fee paid with credit comes back as credit. If it is kept, all of it goes into the credit-only part of the fund, never to the caller as cash.
7. Payouts and endings.
   - The caller never transacts. The caller's close and a cancel are not functions: the settler posts them as endings, because the backend sees them on the trading venue.
   - The settler settles a call in batches of up to 50 copies, starting at the call's cursor. Each batch pays its followers, the payout wallet, and the treasury at once. Followers never claim.
   - On Wrong, the first batch posts the call's total ask, so the scaling is known before the first payout. The last batch checks that the asks add up to it.
   - If USDC refuses a payout (a blocklisted address), the amount is booked as owed and the batch carries on. `claim(to)` pays it later, only to that address.
   - 7 days after the deadline, anyone can continue an unfinished settlement from the cursor as Refund. Copies already settled stay settled, any credit set aside but not yet handed out goes back to the fund, and the settler can no longer settle that call.

**Assumptions I made because the spec did not pin them down (change before build if wrong):**
1. Copy size is notional. Followers pay only the two fees in USDC, not the copy size. A $1,000 copy pays $6 + $1. The backend places the actual trade off-chain.
2. Call terms stay off-chain. The contract stores only the fingerprint, so it cannot check stop < entry < target or that the call is long-only. `call` is a bytes32 call id chosen by the backend and must be unused. `fingerprint` must be non-zero. `shareBps` is the cut.
3. Limits at registration: the deadline must be in the future, with no upper cap (a call posted on 6 Nov can run to 31 Dec), `shareBps` must be 1000 to 7000, and `caller` and `wallet` must be non-zero. A follower cannot copy a call when she is its payout wallet.
4. Settlement starts at the settler's `startSettlement(callId)` or at the first batch, whichever comes first. The backend can call `startSettlement` as soon as it sees a close on the venue, to stop new copies while it works out the ending. Copying also stops at the deadline.
5. Credit is per follower and can pay call fees on any caller's calls. It is not tied to the fund that issued it. If a credit-paid fee is kept, it goes to the credit-only part of that call's caller id.
6. Kept fees and credit asks are per copy, not per follower. A follower who copies twice has two records and two asks. The 30% bound applies to each copy's own size. Copies settle in the order they were made.
7. The cut is rounded down per copy, so the result does not depend on where batch boundaries fall. The remainder of each copy's kept cash goes to the earned fund. The cut is stored in basis points (10% = 1000), so 50.1% = 5010.
8. Fund limit stub: it applies to the earned part only, and returns "no limit" for now, so nothing overflows to the payout wallet yet. The overflow routing is built and the stub is overridable in tests.
9. Credit rounds down per copy. When a Wrong call finishes or expires, whatever credit was set aside but not handed out goes back to the fund. Handed-out credit counts against the credit-only slice first, so the leftover returns to credit-only up to what remains of its slice, and the rest returns to earned.
10. The treasury gets the platform fee from a filled copy on a worked call even when its kept fee is 0.
11. The treasury is fixed at deploy: it is a constructor argument with no setter, and it must be non-zero. The owner can replace the writer and the settler, and can pause. Pausing blocks only `registerCall` and `payFee`. Settlement, expiry, and `claim` are never paused. Ownership moves in two steps (the owner proposes, the new owner accepts), and renouncing ownership is disabled.
12. Owed amounts are kept per address across all calls. Anyone can call `claim(to)`, which pays `to` only.
13. A call with no copies is completed by the settler with an empty batch, or by the expiry path.
14. The writer is trusted. The fingerprint lets anyone check that the stored call matches its record, but the contract cannot check that the payout wallet is the right one. Replacing the writer does not change calls already registered.
15. `payFee` is the only way to pay a fee. Each follower approves Permit2 for USDC once (a normal ERC-20 approval) before her first payment. The contract builds the Permit2 request itself: token USDC, amount = call fee + platform fee computed from `size`, spender and recipient this contract, witness `CallFee(call, size)`. A signature for a different size or call therefore fails in Permit2. The amount requested is only the cash part.
16. The `nonce` and `deadline` in `payFee` are Permit2's unordered nonce and signature expiry. They are separate from the call's own deadline.
17. Anyone can submit `payFee`, and the backend usually does. A third-party submitter also spends the follower's credit first, as designed. Credit can only reduce what is pulled, never raise it above the signed amount.
18. The USDC and Permit2 addresses are constructor arguments, not hardcoded, so tests can use mocks. On Arc Testnet they are 0x3600000000000000000000000000000000000000 and 0x000000000022D473030F116dDEE9F6B43aC78BA3. The build checks that code exists at both before deploying.
19. Local tests use a mock ERC-20 for USDC (with a blocklist switch) and a locally deployed Permit2, because a Foundry fork cannot run Arc USDC's system contracts. The real USDC path is proven by one live `payFee` on Arc Testnet after deploy. That needs a funded test follower wallet that has approved Permit2, and the writer key to register a proof call. The proof copies $1,000 (notional), so the follower pays only $7: $6.00 call fee + $1.00 platform fee, which is 7,000,000 USDC units.

## Architecture
- Blockchain: Arc Testnet (chain 5042002). USDC is the gas token and the fee token, at the 6-decimal ERC-20 predeploy 0x3600000000000000000000000000000000000000.
- Contract: `Hisaab`, a single escrow contract (OpenZeppelin `Ownable2Step`, `Pausable`, `ReentrancyGuard`).
  - Constructor: `usdc`, `permit2`, `owner`, `writer`, `settler`, `treasury`. The treasury is immutable with no setter.
  - Roles: the OWNER can replace the writer and the settler and can pause. Ownership moves in two steps: `transferOwnership(newOwner)` proposes and `acceptOwnership()` completes it. The WRITER (the backend's key) can only call `registerCall`. The SETTLER can only call `startSettlement` and `settleBatch`. No role can move escrowed funds or redirect a payout. There is no caller record and no controller, because callers never transact.
  - Registration: `registerCall(call, fingerprint, caller, wallet, shareBps, deadline)`, writer only. `call` is the bytes32 call id, `fingerprint` is the hash of the call's off-chain record, `caller` is the bytes32 caller id, `wallet` is the payout wallet, and `shareBps` is the cut. A view lets anyone check a stored fingerprint against a record hash.
  - Call (stored): fingerprint, caller, wallet, shareBps, deadline, status, ending, expired flag, copy count, cursor (next copy to settle), totalAsk, asksSeen, per-call escrow (cash and credit), and the credit set aside on Wrong (drawn from credit-only, drawn from earned, handed out). Asset, entry, target, and stop are not stored; the fingerprint binds them.
  - Copy record (one per copy, in order): follower, size, callFeeCash, callFeeCredit, platformFee. A copy is settled when its index is below the cursor. The filled flag, kept fee, and credit ask are posted in the settling batch and used at once, not stored. Kept fee split: keptCredit = min(keptFee, callFeeCredit), keptCash = keptFee - keptCredit.
  - Balances the contract tracks separately: per-call escrow; earnedFund[caller] and creditOnlyFund[caller] (nothing pays either to the caller, except the earned overflow above the limit); creditReserve (USDC backing issued credit); creditBalance[follower] (ledger only: not withdrawable, not transferable, never expires); owed[address] (payouts USDC refused). There are no treasury or caller balances, because those are pushed.
  - Status flow: Open -> Settling -> Done. Endings: Right, AboveEntry, Wrong, Refund. An expired call settles its remaining copies as Refund.
  - Fees: fixed constants. Call fee is 60 bps of copy size, platform fee is 10 bps, both rounded down. Minimum copy is 1 USDC.
  - Paying a copy: `payFee(call, follower, size, nonce, deadline, signature) returns (uint256 index)`. Anyone may submit it. The call fee is paid from the follower's credit first, up to the full call fee. The cash part (the rest of the call fee plus the platform fee) is pulled through Permit2's `permitWitnessTransferFrom`. Credit used moves from the reserve into the call's escrow.
    - The follower signs a Permit2 `PermitWitnessTransferFrom` for USDC with Hisaab as spender, for exactly call fee + platform fee, and the witness `CallFee(bytes32 call,uint256 size)`.
    - The contract builds the permit itself (token, amount, nonce, deadline), sets the transfer recipient to itself, and requests only the cash part. Permit2 checks the signature, the nonce, and the expiry.
    - The witness type string is `CallFee witness)CallFee(bytes32 call,uint256 size)TokenPermissions(address token,uint256 amount)`, and the witness hash is `keccak256(abi.encode(CALL_FEE_TYPEHASH, call, size))`.
    - Checks: the call is Open, block.timestamp is before the call's deadline, `size` is at least 1 USDC, the follower is non-zero and is not the call's payout wallet, and the contract is not paused. The credit ledger changes only after those checks. Any Permit2 failure reverts the whole call, so credit is never spent without the cash being pulled.
    - It returns the new copy's index and emits `Copied(call, follower, index, size, creditUsed, cashPulled, submitter)`.
  - Settling in batches: `settleBatch(callId, ending, totalAsk, results[])`, settler only. It takes 1 to 50 results (an empty batch only for a call with no copies), applied to the copies starting at the cursor, in order. Each result is {filled, keptFee, creditAsk}. The first batch records the ending, and on Wrong records `totalAsk` and sets the credit aside before any payout. Later batches must repeat the same ending and totalAsk. The whole batch reverts if any check fails.
  - Checks per copy: Right and Above entry: keptFee at most the copy's call fee, 0 if not filled, creditAsk 0. Wrong: keptFee 0, creditAsk at most 30% of copy size minus call fee. Refund: both 0. On Wrong, asksSeen can never exceed totalAsk, and the last batch (the one that reaches the copy count) requires asksSeen to equal totalAsk.
  - What a batch pays, per copy: the follower gets their cash back (as in the payout table). The credit ledger and reserve are updated for credit coming back and for new credit. The cut and any earned overflow go to the call's payout wallet, summed into one transfer for the batch. The platform fees go to the treasury, summed into one transfer for the batch. Earned and credit-only funds are updated. One event per copy tells the backend what each follower received.
  - Wrong, credit set aside (first batch): totalCredit = min(totalAsk, (earnedFund + creditOnlyFund) / 2). It is drawn from creditOnlyFund first, then earnedFund, and held aside in the call. Each copy's credit = ask x totalCredit / totalAsk, rounded down, and moves from the set-aside into the credit reserve and the follower's ledger. After the last batch, whatever is left of the set-aside returns to the fund. If totalAsk is 0, no credit is set aside.
  - Refused payouts: each push to a follower, the payout wallet, or the treasury is a guarded transfer. If USDC refuses it, the amount is added to `owed[to]`, a `PayoutOwed` event is emitted, and the batch carries on. `claim(to)` pays `owed[to]` to `to` and nobody else. If that transfer is refused again, it reverts and the amount stays owed.
  - Expiry: `continueAsRefund(callId, count)`, anyone, up to 50 copies per call, allowed once 7 days have passed since the deadline and the call is not Done. The first call marks the call expired and returns any credit set aside but not handed out to the fund. The settler can no longer settle an expired call. Copies already settled stay settled. Remaining copies are refunded: cash-paid fees and the platform fee in cash, credit-paid fees as credit. The call is Done when the cursor reaches the copy count.
  - Follower functions: none to call directly. The follower signs, and anyone submits `payFee`. `copy` and `copyWithPermit` do not exist. Followers have no claim function for their copies.
  - Settler functions: `startSettlement(callId)` (stops new copies) and `settleBatch(...)`.
  - Copy window: `payFee` works only while status is Open and block.timestamp < deadline. It closes at the deadline, or when settlement starts, whichever comes first. A payment is rejected when the follower is the call's payout wallet.
  - Fund limit: `fundLimit(caller)` is a stub that returns no limit, and applies to the earned part only. It is `virtual` so tests can override it.
  - Safety: pulls only through Permit2 (the contract never holds an allowance from followers), guarded transfers for pushes, ReentrancyGuard on settlement, expiry, and claim, and checks-effects-interactions. Each batch is bounded at 50 copies. The ending and totalAsk are final once the first batch is posted. Each copy settles once. The USDC held always covers every call's escrow, both funds, the credit reserve, credit set aside, and owed amounts. The settler is a trusted role: the contract cannot verify its numbers, but it bounds them (kept fee at most call fee, 0 on an unfilled copy, credit ask at most 30% of size minus call fee, asks adding up to totalAsk, total credit at most half of the earned and credit-only parts together, nothing payable to the settler). The writer is trusted to supply the right payout wallet, and cannot move funds.
  - Events: CallRegistered (all arguments), Copied (see `payFee`), SettlementStarted, BatchSettled (call, from, to, ending), CopySettled (cash back, credit back, new credit), FundChanged, CreditSetAside, CreditReturned, Expired, PayoutOwed, Claimed, WriterReplaced, SettlerReplaced, plus the standard ownership-transfer events.
- Frontend: none in this build (contract-only). A thin test console can be added afterwards on request.
- Wallet: ConnectKit/wagmi already configured in src/config.ts; unused in this build.
- Review level: deeper security review with unit tests (funds custody and intricate accounting), then deploy to Arc Testnet and prove the real USDC transfer with one live `payFee`. Local tests use a mock USDC and a locally deployed Permit2. Any fork rehearsal covers deployment and the non-USDC paths only. A deeper review is a best-effort check, not a substitute for a paid third-party audit.

## Payout Table
Per copy. Platform fee = p. The call fee c has a cash-paid part (c_cash) and a credit-paid part (c_cr). The settler posts the kept fee k (at most c, and 0 if the buy did not fill). The kept fee comes out of the credit-paid part first: k_cr = min(k, c_cr), and k_cash = k - k_cr. The cut is the call's shareBps.

| Ending | Back to follower, cash | Back to follower, credit | Caller's payout wallet, cash | Earned fund | Credit-only fund | Treasury |
| --- | --- | --- | --- | --- | --- | --- |
| Right, buy filled | c_cash - k_cash (p is not returned) | c_cr - k_cr | cut x k_cash | + (k_cash - cut x k_cash); any excess above the limit goes to the wallet | + k_cr | p |
| Right, buy not filled | c_cash + p | c_cr | 0 | 0 | 0 | 0 |
| Above entry, buy filled | c_cash - k_cash (p is not returned) | c_cr - k_cr | (cut / 2) x k_cash | + (k_cash - (cut / 2) x k_cash); any excess above the limit goes to the wallet | + k_cr | p |
| Above entry, buy not filled | c_cash + p | c_cr | 0 | 0 | 0 | 0 |
| Wrong | c_cash + p | c_cr, plus new credit from the fund | 0 | shrinks only after credit-only is used up | shrinks first | 0 |
| Refund (cancelled, never filled, or expired) | c_cash + p | c_cr | 0 | unchanged | unchanged | 0 |

- New credit on Wrong: ask x totalCredit / totalAsk, where totalCredit = min(totalAsk, (earned + credit-only) / 2), fixed in the first batch. That USDC is drawn from credit-only first, then earned, set aside in the call, and moves into the credit reserve as each copy is paid.
- Fund overflow: after any addition, anything in the earned part above fundLimit(caller) is paid to the call's payout wallet as cash. The stub returns no limit, so this does not trigger yet. The credit-only part has no limit and is never paid out.
- The treasury never receives call fees. The caller never receives cash from a credit-paid fee.
- Everything in the table is pushed in the copy's batch. If USDC refuses a cash payout, it is booked as owed to that address and `claim(to)` pays it later. Credit and fund changes are ledger updates and never fail.
- The cut is rounded down per copy: cut = floor(k_cash x shareBps / 10000), halved for Above entry (floor(k_cash x shareBps / 20000)). The earned fund gets k_cash minus that.
- Expired calls: copies not yet settled are paid as Refund. Copies already settled keep their original ending.

Worked examples, with Priya copying $1,000 (c = $6, p = $1) and Raj's cut at 50.1%:
- Right, all cash, net profit $129.94: k = min($6, $64.97) = $6, so k_cash = $6. Raj's wallet gets $3.006. His earned fund gets $2.994. The treasury gets $1. Priya gets nothing back.
- Right, mixed payment: her $6 call fee was $2 credit and $4 cash, and k = $3.49. So k_cr = $2 goes to credit-only. k_cash = $1.49 is split: $0.74649 to Raj's wallet and $0.74351 to earned. Priya gets $4 - $1.49 = $2.51 back in cash, and no credit back. The treasury gets $1.
- Wrong, Raj's fund $100 across both parts: the call's total credit is at most $50, drawn from credit-only first. Priya gets $6 + $1 back in cash, plus her scaled credit (the example's $9.85).

## Files to Create/Modify
1. contracts/Hisaab.sol: the escrow contract. Constructor args: usdc, permit2, owner, writer, settler, treasury.
2. contracts/interfaces/IPermit2.sol: the small slice of the Permit2 interface the contract uses (`permitWitnessTransferFrom` and its structs).
3. contracts/contract-metadata/Hisaab.json: written at deploy with address and ABI.
4. contracts/test/Hisaab.t.sol: unit tests covering the payout table rows, the worked examples, the two-part fund, kept-fee ordering, scaling of credit asks, the settler bounds, batching across 50-copy boundaries, a refused payout and `claim`, expiry mid-settlement, ownership handover, the fixed treasury, `payFee` with signatures, and a solvency invariant (USDC held always covers everything owed).
5. contracts/test/MockUSDC.sol (test helper): a plain 6-decimal ERC-20 that refuses transfers to chosen addresses, used to test refused payouts.
6. A locally deployed Permit2 for tests: the real Uniswap Permit2 source vendored at a pinned release, deployed in test setup. If its exact-version compiler pragma can't build in this project, it is built under a separate compiler profile and deployed from its artifact. If vendoring fails, fall back to a faithful local copy of its signature-transfer logic and say so.
7. scripts/prove-payfee.ts: the live proof on Arc Testnet (see the build sequence).

src/App.tsx stays untouched.

## Build Sequence
1. Write Hisaab.sol and the Permit2 interface with the structs, constants, roles, functions, and events above.
2. Run the deeper security review and static analysis; fix findings.
3. Write and run the unit tests against the mock USDC and the local Permit2: `payFee` with credit and cash (including the case where credit covers the whole call fee), a signature for the wrong size or call, a reused nonce, an expired signature, a third-party submitter, all four endings, a call with more than 50 copies settled in batches, expiry halfway through a settlement, fund-limit overflow with an overridden limit, a fund keyed by caller id across two calls, two-step ownership, and the math for the $1 minimum and the worked examples.
4. Compile. Check that code exists at the USDC and Permit2 addresses on Arc Testnet. Deploy to Arc Testnet with the Arc Testnet USDC and Permit2 addresses. Defaults: the user is owner, writer, settler, and treasury unless other addresses are given.
5. Prove the real USDC transfer with one `payFee` on Arc Testnet, always against the real Permit2 at 0x000000000022D473030F116dDEE9F6B43aC78BA3, even if the unit tests had to use a local Permit2 copy. The writer registers a proof call, a funded test follower with no credit approves Permit2 for USDC once, signs a $1,000 copy (fees $6.00 + $1.00), and one transaction submits it. The trace must show exactly 7,000,000 USDC units moving from the follower into Hisaab. Check Hisaab's USDC balance rose by exactly 7,000,000 and that the same signature cannot be reused.
6. Report the address, the function list, the one-time Permit2 approval each follower needs, and the exact typed data a follower signs, so the backend can integrate.

## Done When
- [ ] A $1,000 copy escrows exactly $6.00 + $1.00 USDC; a $1 copy escrows $0.006 + $0.001.
- [ ] `payFee(call, follower, size, nonce, deadline, signature)` returns the copy index, and pulls only the cash part through Permit2 (the rest of the call fee plus the platform fee). Credit pays the call fee first and is spent only if the pull succeeds.
- [ ] `payFee` is rejected for a size below $1, after the call's deadline, after settlement starts, while paused, and for a follower who is the call's payout wallet. It is also rejected for a signature over a different size or call, an expired signature, and a reused nonce. The same signature cannot be used twice.
- [ ] Anyone can submit `payFee`. The follower's signature binds the follower, the call, the size, and exactly both fees.
- [ ] `registerCall(call, fingerprint, caller, wallet, shareBps, deadline)` works only from the writer, and rejects a reused call id, a shareBps outside 1000 to 7000, and a deadline not in the future. A deadline months away is accepted. The owner can replace the writer and the settler, and nobody else can. The stored fingerprint can be checked against a record hash.
- [ ] The treasury is a constructor argument with no setter. Ownership moves only through propose, then accept, and renouncing is disabled.
- [ ] Only the settler can settle. Batches take 1 to 50 copies from the cursor, in order, and a batch with a failed check reverts as a whole.
- [ ] The settler's posts are rejected when kept fee exceeds the call fee, when kept fee is above 0 on an unfilled copy, or when a credit ask exceeds 30% of size minus call fee. On Wrong, they are rejected when asks go past totalAsk, and the last batch is rejected unless the asks add up to totalAsk.
- [ ] Priya's Right example pays Raj $3.006, his fund $2.994, and the treasury $1.00, with nothing back to Priya.
- [ ] The mixed-payment example holds: a $6 fee paid $2 credit + $4 cash with a $3.49 kept fee sends $2 to credit-only, splits $1.49 by the cut, and returns $2.51 in cash and no credit.
- [ ] Above entry pays the caller's wallet half the cut on kept cash, and the remainder of kept cash goes to the earned fund.
- [ ] The treasury gets the platform fee only from filled copies on worked calls and never any call fee. Otherwise the platform fee returns to the follower in cash.
- [ ] Wrong returns both fees to each follower, and credit is scaled equally when asks exceed half of the earned and credit-only parts together. That USDC is drawn from credit-only first, then earned, into the credit reserve.
- [ ] Credit pays call fees before cash, cannot be withdrawn or transferred, and a credit-paid fee returns as credit or goes entirely to the credit-only fund when kept.
- [ ] The fund is keyed by caller id: two calls under one caller id with different payout wallets share one fund, and each call pays its own wallet.
- [ ] No function lets anyone withdraw the fund to the caller. Only the earned amount above the limit reaches the payout wallet, and the credit-only part is never paid out.
- [ ] Followers never claim. Each batch pays its followers, the payout wallet, and the treasury, and the call's escrow is empty once it is Done.
- [ ] On Wrong, the first batch sets the credit aside from credit-only first, then earned, so every copy's scaling is known before the first payout. When the call finishes, any credit not handed out returns to the fund.
- [ ] A refused payout (a blocklisted follower, wallet, or treasury) is booked in `owed`, the batch still completes, and `claim(to)` later pays that address only. A second refusal reverts and the amount stays owed.
- [ ] Before 7 days after the deadline, `continueAsRefund` is rejected. After that, anyone can call it, copies already settled stay settled, remaining copies are refunded in the form they were paid, unissued credit returns to the fund, and `settleBatch` on that call reverts.
- [ ] The USDC held always covers every call's escrow, both funds, the credit reserve, credit set aside, and owed amounts.
- [ ] All unit tests pass against the mock USDC and the local Permit2.
- [ ] One live `payFee` for a $1,000 copy on Arc Testnet moves exactly 7,000,000 USDC units ($6.00 + $1.00) from the test follower into Hisaab through the real USDC and the real Permit2, and the trace shows that amount.
- [ ] If the unit tests had to use a local copy of Permit2 instead of the real source, the final report says so. The live proof uses the real Permit2 either way.
- [ ] The review reports no unresolved critical or high findings, and Hisaab is deployed on Arc Testnet.
