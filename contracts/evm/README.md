# Hisaab

Hisaab is the escrow contract behind Supercall. It holds the USDC fees that followers pay to copy a call, until the call ends. A trusted settler then posts the ending, and the contract pays out followers, the caller's payout wallet and the treasury in batches. The approved design, with the payout table and worked examples, is in [docs/SPEC.md](docs/SPEC.md).

Live on Arc Testnet: see [deployments/arc-testnet.json](deployments/arc-testnet.json) for the address, constructor arguments and the transactions of the live check.

## Layout

- `src/Hisaab.sol`: the contract.
- `src/interfaces/IPermit2.sol`: the part of Permit2 the contract uses.
- `test/`: unit tests. They use a mock USDC and a locally deployed copy of the real Uniswap Permit2 (built from upstream commit `cc56ad0` with solc 0.8.17 and stored as bytecode in `test/helpers/Permit2Deployer.sol`).
- `deployments/`: what is deployed where.

## Build and test

Prerequisite: [Foundry](https://book.getfoundry.sh).

```bash
cd contracts/evm
forge install OpenZeppelin/openzeppelin-contracts@v5.6.1 foundry-rs/forge-std
forge build
forge test
```

`lib/`, `out/` and `cache/` are git-ignored.

## Paying a fee

Followers pay with one signed Permit2 transfer. Each follower must approve Permit2 for USDC once before her first payment. Anyone, usually the backend, can submit the signed payment.

## Testing note

A Foundry fork cannot run Arc USDC's system contracts, so the real USDC transfer was checked live on Arc Testnet instead of in the unit tests. The proof transactions are listed in the deployments file.

## Security

The contract had a thorough automated security review and static analysis, and the unit tests pass. That is a best-effort check, not a substitute for a paid third-party audit. Do not deploy to mainnet before one.
