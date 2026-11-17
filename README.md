# GiwaSwap

Single-page exchange on **GIWA Sepolia** (chain 91342) built with the
**Ammora SDK**. Swap GIWA ETH ⇄ **$tAMM** on the Ammora V3 pool — live
quotes from the pool, real on-chain swaps through the Ammora NativeRouter.

- **Live site** (after deploy): `https://<user>.github.io/giwaswap/`
- **Pool:** [`0x1ef92a6a9bb4bbed2b385dd5e688f88e7965bcf8`](https://sepolia-explorer.giwa.io/address/0x1ef92a6a9bb4bbed2b385dd5e688f88e7965bcf8) (tAMM/WETH, graduated)
- **Router:** [`0x4FC91b90087288520A7bB4aA7Ab5441bb4E9C496`](https://sepolia-explorer.giwa.io/address/0x4FC91b90087288520A7bB4aA7Ab5441bb4E9C496)
- **$tAMM:** [`0x10B3Cc2fc981277Ada576891CF649D0ABA768B06`](https://sepolia-explorer.giwa.io/address/0x10B3Cc2fc981277Ada576891CF649D0ABA768B06) (6 decimals)
- **Slippage:** 1% · **Deadline:** 10 minutes · **Network:** GIWA Sepolia testnet (test funds only)

## How swapping works

The app uses the Ammora SDK (`@ammora-protocol/sdk@0.3.9`) to load and
verify the reviewed GIWA Sepolia deployment catalog
(`AmmoraSwapClient.create`) — chain, contracts and explorer come from the
SDK, not from hardcoded guesses.

One honest limitation, found while building: the SDK's reviewed
`AmmoraSwapClient.prepareExactIn` path **refuses this specific pool** — its
native execution registry does not list the graduated tAMM/WETH pool
(`poolKind` reverts: *"the selected Factory or pool is not enabled by the
reviewed native execution registry"*). This is a property of this pool, not
of the SDK. The Ammora site itself routes this exact pool the same way
GiwaSwap does: quote directly from the pool (`quoteExactIn`, selector
`0xfc521e91`) and execute through the Ammora NativeRouter
(`swapPoolExactInNative` `0xdb73c039` / `swapPoolExactInForNative`
`0xdfecc67d`). See `scripts/probe-sdk.mjs` for the SDK test that
established this. The swap path is therefore identical to the one the
Ammora waitlist's own Swap tab uses for this pool.

## Features

- Connect wallet (injected MetaMask / OKX) + auto-switch to GIWA Sepolia (91342)
- Live GIWA ETH + $tAMM balances
- Swap ETH → $tAMM and $tAMM → ETH, live quote, 1% slippage, 10-min deadline
- Swap sends a real transaction via the user's wallet; hash + explorer link shown
- "Built with the Ammora SDK" badge with links to the docs and npm package
- Link to the Ammora waitlist (`?ref=z5uo5i`)

## Verified end-to-end (2026-11-17)

Test swap on GIWA Sepolia with the exact calldata the UI sends
(`scripts/test-swap.mjs`, 0.001 ETH → $tAMM):

- **Tx:** [`0x5af832c69438fdb37a86831d2445ad3082ebcec4fb69ac01754ba0bd418b9aea`](https://sepolia-explorer.giwa.io/tx/0x5af832c69438fdb37a86831d2445ad3082ebcec4fb69ac01754ba0bd418b9aea)
- **Block:** 41542569, status success, gas 252,673
- **Quote:** 3.203988 $tAMM · **received:** 3.199668 $tAMM (min-out 3.171948) — verified from the receipt's $tAMM `Transfer` log, pool → wallet
- Note: `balanceOf` reads through the public RPC can lag a block or two
  right after a swap; the receipt logs are the authoritative proof.

## Local development

```bash
npm ci
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build -> dist/
npm run preview  # serve dist/ on http://localhost:4173/giwaswap/
```

## Deploy

See [DEPLOY.md](DEPLOY.md). In short: push to a public GitHub repo, enable
Pages with source "GitHub Actions" — the workflow in
`.github/workflows/pages.yml` builds and deploys on every push to `main`.
