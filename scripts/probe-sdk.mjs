// Probe: AmmoraSwapClient quote on GIWA Sepolia (read-only, no wallet, no tx).
import { createPublicClient, http, parseEther } from 'viem'
import { AmmoraSwapClient } from '@ammora-protocol/sdk'

const RPC = 'https://sepolia-rpc.giwa.io'
const POOL = '0x1ef92a6a9bb4bbed2b385dd5e688f88e7965bcf8'
const WETH = '0x4200000000000000000000000000000000000006'
const TAMM = '0x10B3Cc2fc981277Ada576891CF649D0ABA768B06'
const PAYER = '0xE07ffA0FcF0396b6C75F8D23690001D2412c07D9'

const publicClient = createPublicClient({
  chain: {
    id: 91342,
    name: 'GIWA Sepolia',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC] } },
  },
  transport: http(RPC),
})

const swaps = await AmmoraSwapClient.create(publicClient)
console.log('SDK client created, deployment chain:', swaps.deployment.chainId ?? swaps.deployment)

// ETH -> tAMM, 0.001 ETH
const prepared = await swaps.prepareExactIn({
  model: 'concentrated',
  pool: POOL,
  tokenIn: WETH,
  inputAsset: 'native',
  outputAsset: 'erc20',
  amountIn: parseEther('0.001'),
  payer: PAYER,
  slippageBps: 100,
  deadlineSeconds: 600,
})
console.log('quote expectedOut (tAMM raw):', prepared.quote.expectedAmountOut.toString())
console.log('quote minimumOut (tAMM raw):', prepared.quote.minimumAmountOut.toString())
console.log('quote tokenOut:', prepared.quote.tokenOut)
console.log('quote priceImpactBps:', prepared.quote.priceImpactBps?.toString())
console.log('tx to:', prepared.transaction.to)
console.log('tx value:', prepared.transaction.value?.toString())
console.log('tx data prefix:', prepared.transaction.data.slice(0, 18))
console.log('approvals:', JSON.stringify(prepared.approvalRequirements))

// tAMM -> ETH, 1 tAMM (quote only)
const prepared2 = await swaps.prepareExactIn({
  model: 'concentrated',
  pool: POOL,
  tokenIn: TAMM,
  inputAsset: 'erc20',
  outputAsset: 'native',
  amountIn: 1_000_000n,
  payer: PAYER,
  slippageBps: 100,
  deadlineSeconds: 600,
})
console.log('reverse quote expectedOut (ETH wei):', prepared2.quote.expectedAmountOut.toString())
console.log('reverse tx to:', prepared2.transaction.to)
console.log('reverse approvals:', JSON.stringify(prepared2.approvalRequirements))
console.log('PROBE OK')
