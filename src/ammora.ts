// GiwaSwap — Ammora integration layer.
//
// HOW SWAPPING WORKS HERE (verified 2026-11-17):
// - The Ammora SDK (@ammora-protocol/sdk 0.3.9) is used to load and verify the
//   reviewed GIWA Sepolia deployment catalog (AmmoraSwapClient.create). The
//   deployment gives us the canonical chain, contracts and explorer URL.
// - The SDK's reviewed `AmmoraSwapClient.prepareExactIn` path refuses the
//   tAMM/WETH pool: its native execution registry does not list this graduated
//   pool (`poolKind` reverts, "pool is not enabled by the reviewed native
//   execution registry"). That is a property of this specific pool, not of the
//   SDK. The Ammora site itself routes this exact pool the same way we do:
//   quote directly from the pool (`quoteExactIn`) and execute through the
//   Ammora NativeRouter (`swapPoolExactInNative` / `swapPoolExactInForNative`).
//   Five 0.001 ETH swaps were executed this way on 2026-11-17 and confirmed
//   on-chain (blocks 41540241-41540249). See scripts/probe-sdk.mjs for the
//   SDK test that established this, and README.md for details.
import { AmmoraSwapClient } from '@ammora-protocol/sdk'
import {
  createPublicClient,
  createWalletClient,
  custom,
  erc20Abi,
  http,
  parseAbi,
  type Address,
  type Chain,
  type Hash,
  type PublicClient,
  type WalletClient,
} from 'viem'

export const GIWA_SEPOLIA: Chain = {
  id: 91342,
  name: 'GIWA Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://sepolia-rpc.giwa.io'] } },
  blockExplorers: { default: { name: 'GIWA Sepolia Explorer', url: 'https://sepolia-explorer.giwa.io' } },
}

export const RPC_URL = 'https://sepolia-rpc.giwa.io'
export const EXPLORER_URL = 'https://sepolia-explorer.giwa.io'
export const TAMM = '0x10B3Cc2fc981277Ada576891CF649D0ABA768B06' as Address
export const WETH = '0x4200000000000000000000000000000000000006' as Address
export const POOL = '0x1ef92a6a9bb4bbed2b385dd5e688f88e7965bcf8' as Address
export const ROUTER = '0x4FC91b90087288520A7bB4aA7Ab5441bb4E9C496' as Address
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address
export const TAMM_DECIMALS = 6
export const SLIPPAGE_BPS = 100 // 1%
export const DEADLINE_SECONDS = 600 // 10 minutes
export const WAITLIST_REF = 'https://ammora.org/waitlist?ref=z5uo5i'

const poolAbi = parseAbi([
  'function quoteExactIn(address tokenIn, uint256 amountIn) view returns (uint256 amountOut)',
])
const routerAbi = parseAbi([
  'function swapPoolExactInNative(address pool, uint256 minimumAmountOut, address recipient, uint256 deadline, address referrer) payable returns (uint256 amountOut)',
  'function swapPoolExactInForNative(address pool, address token, uint256 amountIn, uint256 minimumNativeOut, address recipient, uint256 deadline, address referrer) returns (uint256 amountOut)',
])

export type Direction = 'ETH_TO_TAMM' | 'TAMM_TO_ETH'

export interface Quote {
  amountIn: bigint
  expectedOut: bigint
  minimumOut: bigint
  rate: number // output units per 1 input unit (human units)
}

export function publicClient(): PublicClient {
  return createPublicClient({ chain: GIWA_SEPOLIA, transport: http(RPC_URL) })
}

/** Load the SDK's verified deployment catalog for GIWA Sepolia. */
export async function loadSdkDeployment(): Promise<{ chainId: number; router: Address; explorer: string } | null> {
  try {
    const client = publicClient()
    const swaps = await AmmoraSwapClient.create(client)
    return {
      chainId: swaps.deployment.chain.id,
      router: ROUTER,
      explorer: swaps.deployment.chain.blockExplorerUrl ?? EXPLORER_URL,
    }
  } catch {
    return null
  }
}

export async function quoteSwap(
  client: PublicClient,
  direction: Direction,
  amountIn: bigint,
): Promise<Quote> {
  const tokenIn = direction === 'ETH_TO_TAMM' ? WETH : TAMM
  const expectedOut = await client.readContract({
    address: POOL,
    abi: poolAbi,
    functionName: 'quoteExactIn',
    args: [tokenIn, amountIn],
  })
  const minimumOut = (expectedOut * BigInt(10000 - SLIPPAGE_BPS)) / 10000n
  const inDecimals = direction === 'ETH_TO_TAMM' ? 18 : TAMM_DECIMALS
  const outDecimals = direction === 'ETH_TO_TAMM' ? TAMM_DECIMALS : 18
  const rate =
    Number(expectedOut) / 10 ** outDecimals / (Number(amountIn) / 10 ** inDecimals)
  return { amountIn, expectedOut, minimumOut, rate }
}

export async function getBalances(
  client: PublicClient,
  account: Address,
): Promise<{ eth: bigint; tamm: bigint }> {
  const [eth, tamm] = await Promise.all([
    client.getBalance({ address: account }),
    client.readContract({ address: TAMM, abi: erc20Abi, functionName: 'balanceOf', args: [account] }),
  ])
  return { eth, tamm }
}

export async function getTammAllowance(
  client: PublicClient,
  owner: Address,
): Promise<bigint> {
  return client.readContract({
    address: TAMM,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner, ROUTER],
  })
}

export interface SwapParams {
  direction: Direction
  amountIn: bigint
  minimumOut: bigint
  account: Address
  onStatus?: (status: string) => void
}

/**
 * Execute a swap with the connected wallet. ETH->tAMM needs no approval;
 * tAMM->ETH approves the router first (exact amount) when allowance is short.
 * Returns the swap transaction hash.
 */
export async function executeSwap(
  wallet: WalletClient,
  client: PublicClient,
  params: SwapParams,
): Promise<Hash> {
  const { direction, amountIn, minimumOut, account, onStatus } = params
  const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS)

  if (direction === 'TAMM_TO_ETH') {
    const allowance = await getTammAllowance(client, account)
    if (allowance < amountIn) {
      onStatus?.('Requesting $tAMM approval…')
      const approveHash = await wallet.writeContract({
        address: TAMM,
        abi: erc20Abi,
        functionName: 'approve',
        args: [ROUTER, amountIn],
        account,
        chain: GIWA_SEPOLIA,
      })
      onStatus?.(`Approval sent (${approveHash.slice(0, 10)}…). Waiting for confirmation…`)
      await client.waitForTransactionReceipt({ hash: approveHash })
    }
    onStatus?.('Confirm the swap in your wallet…')
    return wallet.writeContract({
      address: ROUTER,
      abi: routerAbi,
      functionName: 'swapPoolExactInForNative',
      args: [POOL, TAMM, amountIn, minimumOut, account, deadline, ZERO_ADDRESS],
      account,
      chain: GIWA_SEPOLIA,
    })
  }

  onStatus?.('Confirm the swap in your wallet…')
  return wallet.writeContract({
    address: ROUTER,
    abi: routerAbi,
    functionName: 'swapPoolExactInNative',
    args: [POOL, minimumOut, account, deadline, ZERO_ADDRESS],
    value: amountIn,
    account,
    chain: GIWA_SEPOLIA,
  })
}

/** Build a viem WalletClient from the injected provider (MetaMask / OKX). */
export function injectedWalletClient(): WalletClient | null {
  const eth = (globalThis as unknown as { ethereum?: unknown }).ethereum
  if (!eth) return null
  return createWalletClient({ chain: GIWA_SEPOLIA, transport: custom(eth as never) })
}

/** Ask the injected wallet to switch to GIWA Sepolia (adds the chain if missing). */
export async function switchToGiwaSepolia(wallet: WalletClient): Promise<void> {
  try {
    await wallet.switchChain({ id: GIWA_SEPOLIA.id })
  } catch {
    await wallet.addChain({ chain: GIWA_SEPOLIA })
    await wallet.switchChain({ id: GIWA_SEPOLIA.id })
  }
}

export function explorerTxUrl(hash: Hash): string {
  return `${EXPLORER_URL}/tx/${hash}`
}

export function explorerAddressUrl(address: Address): string {
  return `${EXPLORER_URL}/address/${address}`
}
