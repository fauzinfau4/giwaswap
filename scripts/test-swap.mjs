// Real swap test on GIWA Sepolia with the Tzero wallet (same calldata the
// GiwaSwap UI sends: NativeRouter.swapPoolExactInNative, quote from the pool).
// Reads ~/workspace/tzero/wallet.json transiently. NEVER prints the key.
// Usage: NODE_USE_ENV_PROXY=1 node scripts/test-swap.mjs [ethAmount]
// Default: 0.001 ETH -> $tAMM.
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseEther,
  formatEther,
  formatUnits,
  erc20Abi,
} = require('viem')
const { privateKeyToAccount } = require('viem/accounts')

const RPC = 'https://sepolia-rpc.giwa.io'
const POOL = '0x1ef92a6a9bb4bbed2b385dd5e688f88e7965bcf8'
const WETH = '0x4200000000000000000000000000000000000006'
const TAMM = '0x10B3Cc2fc981277Ada576891CF649D0ABA768B06'
const ROUTER = '0x4FC91b90087288520A7bB4aA7Ab5441bb4E9C496'
const ZERO = '0x0000000000000000000000000000000000000000'
const EXPLORER = 'https://sepolia-explorer.giwa.io'

const chain = {
  id: 91342,
  name: 'GIWA Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
}

const amountEth = process.argv[2] ?? '0.001'
const walletJson = JSON.parse(readFileSync('/home/hatch/workspace/tzero/wallet.json', 'utf8'))
const account = privateKeyToAccount(walletJson.privateKey)
const publicClient = createPublicClient({ chain, transport: http(RPC) })
const walletClient = createWalletClient({ account, chain, transport: http(RPC) })

const poolAbi = parseAbi([
  'function quoteExactIn(address tokenIn, uint256 amountIn) view returns (uint256 amountOut)',
])
const routerAbi = parseAbi([
  'function swapPoolExactInNative(address pool, uint256 minimumAmountOut, address recipient, uint256 deadline, address referrer) payable returns (uint256 amountOut)',
])

const amountIn = parseEther(amountEth)
const ethBefore = await publicClient.getBalance({ address: account.address })
const tammBefore = await publicClient.readContract({
  address: TAMM, abi: erc20Abi, functionName: 'balanceOf', args: [account.address],
})
console.log(`wallet: ${account.address}`)
console.log(`balance before: ETH ${formatEther(ethBefore)} | $tAMM ${formatUnits(tammBefore, 6)}`)

const quote = await publicClient.readContract({
  address: POOL, abi: poolAbi, functionName: 'quoteExactIn', args: [WETH, amountIn],
})
console.log(`quote ${amountEth} ETH -> ${formatUnits(quote, 6)} $tAMM`)
const minOut = (quote * 99n) / 100n
const deadline = BigInt(Math.floor(Date.now() / 1000) + 600)

const tx = {
  address: ROUTER,
  abi: routerAbi,
  functionName: 'swapPoolExactInNative',
  args: [POOL, minOut, account.address, deadline, ZERO],
  value: amountIn,
  account,
  chain,
}
await publicClient.call({ ...tx, from: account.address }) // simulation
const gas = await publicClient.estimateGas({ ...tx, from: account.address })
console.log(`simulation OK, gas ~${gas}`)

const hash = await walletClient.writeContract({ ...tx, gasLimit: (gas * 120n) / 100n })
console.log(`tx sent: ${hash}`)
console.log(`explorer: ${EXPLORER}/tx/${hash}`)
const receipt = await publicClient.waitForTransactionReceipt({ hash })
console.log(`confirmed: block ${receipt.blockNumber} status ${receipt.status}`)
const ethAfter = await publicClient.getBalance({ address: account.address })
const tammAfter = await publicClient.readContract({
  address: TAMM, abi: erc20Abi, functionName: 'balanceOf', args: [account.address],
})
console.log(`balance after: ETH ${formatEther(ethAfter)} | $tAMM ${formatUnits(tammAfter, 6)}`)
console.log(`received: ${formatUnits(tammAfter - tammBefore, 6)} $tAMM`)
if (receipt.status !== 'success') process.exit(1)
console.log('TEST SWAP OK')
