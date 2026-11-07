# Architecture

How a call moves through Supercall, and which part of it lives on Arkiv. GitHub renders the
diagrams below.

## The pieces

```mermaid
flowchart LR
  subgraph Callers
    XPost["Post on X"]
    InApp["Publish in the app<br/>(signed by the caller's wallet)"]
  end

  subgraph Supercall
    API["API<br/>reads the post, checks the caller,<br/>writes records"]
    Worker["Worker<br/>tracks prices, settles calls"]
    Snapshot["Arkiv snapshot<br/>(cached reads)"]
  end

  subgraph Arkiv["Arkiv · Rabdi testnet · project supercall"]
    Caller["caller<br/>writer wallet, editable"]
    Call["call<br/>burned, read-only"]
    Status["status<br/>writer wallet, editable"]
    Close["close<br/>burned, read-only"]
    Settlement["settlement<br/>burned, read-only"]
  end

  subgraph Arc["Arc"]
    Hisaab["Hisaab contract<br/>holds fees, settles in USDC"]
    Pools["DEX pools<br/>Aerodrome, Uniswap v3"]
  end

  Flash["Definitive Flash"]
  WorldID["World ID"]
  Follower["Follower<br/>web app or extension on X"]
  Anyone["Anyone<br/>SDK or JSON-RPC, no key"]

  XPost -->|X Activity webhook| API
  InApp --> API
  WorldID -->|one human per caller| API
  API --> Caller
  API --> Call
  API --> Status
  API --> Close
  API -->|register the call| Hisaab

  Worker -->|price path| Pools
  Worker -->|settle| Hisaab
  Worker -->|settler wallet| Settlement

  Arkiv --> Snapshot --> API
  API --> Follower
  Follower -->|copy: one bracket order| Flash
  Flash -->|trade on chain| Arc
  Follower -->|call fee, Permit2| Hisaab

  Anyone --> Arkiv
```

## The life of one call

```mermaid
sequenceDiagram
  autonumber
  participant C as Caller
  participant X as X
  participant API as Supercall API
  participant A as Arkiv (Rabdi)
  participant F as Follower
  participant FL as Definitive Flash
  participant H as Hisaab (Arc)
  participant W as Worker

  C->>X: posts "$ETH long, TP, SL, deadline"
  X->>API: webhook with the post
  API->>API: reads the levels and the deadline
  API->>A: call record, owned by 0x...dEaD, read-only
  API->>A: status record: pending, then armed / live
  API->>H: registers the call
  F->>API: Copy (from the card on X or the web app)
  F->>FL: one order: buy, take-profit, stop-loss
  F->>H: call fee, held until the call ends
  W->>W: price path from Arc's pools: target, stop or deadline first?
  API->>A: status: won / lost / expired, and a close record if the caller closes on X
  W->>H: settles: fee to the caller if right, back to followers if wrong
  W->>A: settlement record, owned by 0x...dEaD, read-only
```

## What to check on Arkiv

- Every call, close and settlement is created by the writer wallet
  (`0x69C9Fb11006788a118520eD66518a666c0cf0772`) or the settler wallet
  (`0x59B6D1d967bdf035E3849f244063c3F61411A0dE`), then handed to the burn address
  `0x000000000000000000000000000000000000dEaD` and marked read-only. No key can edit them.
- Callers and statuses stay owned by the writer wallet, because they change over a call's life.
- Open a call on the Rabdi explorer: `https://rabdi.explorer.arkiv.network/entity/<call key>`.
  The call page's "Verify on Arkiv" link does this.
- Query every open call with no key: see [the README](../README.md#a-query-you-can-run).

Records, owners and indexed fields: [schema.md](schema.md). Why Arkiv: [why-arkiv.md](why-arkiv.md).
