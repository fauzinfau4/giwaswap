import './style.css'
import { formatEther, formatUnits, parseEther, parseUnits, type Address } from 'viem'
import {
  DEADLINE_SECONDS,
  EXPLORER_URL,
  GIWA_SEPOLIA,
  POOL,
  ROUTER,
  SLIPPAGE_BPS,
  TAMM,
  TAMM_DECIMALS,
  WETH,
  executeSwap,
  explorerAddressUrl,
  explorerTxUrl,
  getBalances,
  injectedWalletClient,
  loadSdkDeployment,
  publicClient,
  quoteSwap,
  switchToGiwaSepolia,
  type Direction,
  type Quote,
} from './ammora'

const $ = (id: string) => document.getElementById(id) as HTMLElement
const amountInEl = $('amountIn') as HTMLInputElement
const amountOutEl = $('amountOut') as HTMLInputElement
const connectBtn = $('connectBtn') as HTMLButtonElement
const swapBtn = $('swapBtn') as HTMLButtonElement
const flipBtn = $('flipBtn') as HTMLButtonElement
const maxBtn = $('maxBtn') as HTMLButtonElement
const statusEl = $('statusLine')
const txBox = $('txBox')
const txLink = $('txLink') as HTMLAnchorElement
const chainBadge = $('chainBadge')

const client = publicClient()
let wallet = injectedWalletClient()
let account: Address | null = null
let chainId: number | null = null
let direction: Direction = 'ETH_TO_TAMM'
let quote: Quote | null = null
let balances: { eth: bigint; tamm: bigint } | null = null
let quoting = false
let quoteTimer: ReturnType<typeof setInterval> | null = null

const inDecimals = () => (direction === 'ETH_TO_TAMM' ? 18 : TAMM_DECIMALS)
const outDecimals = () => (direction === 'ETH_TO_TAMM' ? TAMM_DECIMALS : 18)
const inSymbol = () => (direction === 'ETH_TO_TAMM' ? 'ETH' : '$tAMM')
const outSymbol = () => (direction === 'ETH_TO_TAMM' ? '$tAMM' : 'ETH')

function setStatus(text: string, kind: '' | 'error' | 'ok' = '') {
  statusEl.textContent = text
  statusEl.className = `status ${kind}`
}

function shortAddr(a: Address): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

function parseAmount(text: string): bigint | null {
  const t = text.trim()
  if (!t || !/^\d*\.?\d*$/.test(t)) return null
  try {
    return inDecimals() === 18 ? parseEther(t) : parseUnits(t, TAMM_DECIMALS)
  } catch {
    return null
  }
}

function fmtAmount(raw: bigint, decimals: number): string {
  const s = decimals === 18 ? formatEther(raw) : formatUnits(raw, TAMM_DECIMALS)
  const [int, frac = ''] = s.split('.')
  return frac ? `${int}.${frac.slice(0, 6)}` : int
}

function renderDirection() {
  $('tokenInSymbol').textContent = inSymbol()
  $('tokenOutSymbol').textContent = outSymbol()
  amountOutEl.value = ''
  quote = null
  updateQuoteBox()
  refreshSwapButton()
}

function updateQuoteBox() {
  $('rateLine').textContent = quote
    ? `1 ${inSymbol()} ≈ ${quote.rate.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${outSymbol()}`
    : '—'
  $('minOutLine').textContent = quote
    ? `${fmtAmount(quote.minimumOut, outDecimals())} ${outSymbol()}`
    : '—'
  $('poolLine').textContent = `${POOL.slice(0, 6)}…${POOL.slice(-4)}`
}

function refreshSwapButton() {
  const amount = parseAmount(amountInEl.value)
  if (!account) {
    swapBtn.disabled = false
    swapBtn.textContent = 'Connect Wallet to Swap'
    swapBtn.classList.remove('warn')
    return
  }
  if (chainId !== GIWA_SEPOLIA.id) {
    swapBtn.disabled = false
    swapBtn.textContent = 'Switch to GIWA Sepolia'
    swapBtn.classList.add('warn')
    return
  }
  swapBtn.classList.remove('warn')
  if (!amount || amount <= 0n) {
    swapBtn.disabled = true
    swapBtn.textContent = 'Enter an amount'
    return
  }
  if (balances) {
    const bal = direction === 'ETH_TO_TAMM' ? balances.eth : balances.tamm
    if (amount > bal) {
      swapBtn.disabled = true
      swapBtn.textContent = `Insufficient ${inSymbol()} balance`
      return
    }
  }
  if (!quote || quote.amountIn !== amount) {
    swapBtn.disabled = true
    swapBtn.textContent = quoting ? 'Fetching quote…' : 'Enter an amount'
    return
  }
  if (quote.expectedOut <= 0n) {
    swapBtn.disabled = true
    swapBtn.textContent = 'No liquidity for this amount'
    return
  }
  swapBtn.disabled = false
  swapBtn.textContent = `Swap ${inSymbol()} → ${outSymbol()}`
}

async function refreshQuote() {
  const amount = parseAmount(amountInEl.value)
  if (!amount || amount <= 0n) {
    quote = null
    amountOutEl.value = ''
    updateQuoteBox()
    refreshSwapButton()
    return
  }
  quoting = true
  refreshSwapButton()
  try {
    const q = await quoteSwap(client, direction, amount)
    if (parseAmount(amountInEl.value) !== amount) return // input changed meanwhile
    quote = q
    amountOutEl.value = fmtAmount(q.expectedOut, outDecimals())
  } catch (e) {
    quote = null
    amountOutEl.value = ''
    setStatus(`Quote failed: ${e instanceof Error ? e.message.slice(0, 120) : 'unknown error'}`, 'error')
  } finally {
    quoting = false
    updateQuoteBox()
    refreshSwapButton()
  }
}

async function refreshBalances() {
  if (!account) return
  try {
    balances = await getBalances(client, account)
    $('balanceIn').textContent = `${fmtAmount(
      direction === 'ETH_TO_TAMM' ? balances.eth : balances.tamm,
      inDecimals(),
    )} ${inSymbol()}`
    $('balanceOut').textContent = `${fmtAmount(
      direction === 'ETH_TO_TAMM' ? balances.tamm : balances.eth,
      outDecimals(),
    )} ${outSymbol()}`
  } catch {
    // Balances refresh is best-effort; quote/swap still work.
  }
  refreshSwapButton()
}

function startQuoteTimer() {
  if (quoteTimer) return
  quoteTimer = setInterval(() => {
    if (parseAmount(amountInEl.value)) void refreshQuote()
  }, 10_000)
}

async function connect() {
  if (!wallet) {
    setStatus('No injected wallet found. Install MetaMask or OKX Wallet and reload.', 'error')
    return
  }
  try {
    setStatus('Requesting wallet connection…')
    const accounts = await wallet.requestAddresses()
    account = accounts[0]
    chainId = await wallet.getChainId()
    if (chainId !== GIWA_SEPOLIA.id) {
      setStatus('Switching to GIWA Sepolia…')
      await switchToGiwaSepolia(wallet)
      chainId = await wallet.getChainId()
    }
    connectBtn.textContent = shortAddr(account)
    setStatus(`Connected as ${shortAddr(account)} on GIWA Sepolia.`, 'ok')
    startQuoteTimer()
    await refreshBalances()
    await refreshQuote()
  } catch (e) {
    setStatus(`Connection failed: ${e instanceof Error ? e.message.slice(0, 140) : 'unknown error'}`, 'error')
  }
}

async function onSwapClick() {
  if (!account || !wallet) {
    await connect()
    return
  }
  if (chainId !== GIWA_SEPOLIA.id) {
    try {
      await switchToGiwaSepolia(wallet)
      chainId = await wallet.getChainId()
      setStatus('Switched to GIWA Sepolia.', 'ok')
      await refreshBalances()
    } catch (e) {
      setStatus(`Chain switch failed: ${e instanceof Error ? e.message.slice(0, 120) : 'unknown error'}`, 'error')
    }
    refreshSwapButton()
    return
  }
  const amount = parseAmount(amountInEl.value)
  if (!amount || amount <= 0n || !quote || quote.amountIn !== amount) return
  swapBtn.disabled = true
  txBox.classList.add('hidden')
  try {
    const hash = await executeSwap(wallet, client, {
      direction,
      amountIn: amount,
      minimumOut: quote.minimumOut,
      account,
      onStatus: (s) => setStatus(s),
    })
    setStatus('Transaction sent. Waiting for confirmation…')
    txLink.href = explorerTxUrl(hash)
    txLink.textContent = hash
    txBox.classList.remove('hidden')
    const receipt = await client.waitForTransactionReceipt({ hash })
    if (receipt.status === 'success') {
      setStatus(`Swap confirmed in block ${receipt.blockNumber}.`, 'ok')
    } else {
      setStatus('Transaction reverted on-chain.', 'error')
    }
    amountInEl.value = ''
    quote = null
    amountOutEl.value = ''
    updateQuoteBox()
    await refreshBalances()
  } catch (e) {
    setStatus(`Swap failed: ${e instanceof Error ? e.message.slice(0, 160) : 'unknown error'}`, 'error')
  } finally {
    refreshSwapButton()
  }
}

// ---- wiring ----
amountInEl.addEventListener('input', () => {
  setStatus('')
  txBox.classList.add('hidden')
  if (quoteDebounce) clearTimeout(quoteDebounce)
  quoteDebounce = setTimeout(() => void refreshQuote(), 350)
})
let quoteDebounce: ReturnType<typeof setTimeout> | null = null
flipBtn.addEventListener('click', () => {
  direction = direction === 'ETH_TO_TAMM' ? 'TAMM_TO_ETH' : 'ETH_TO_TAMM'
  amountInEl.value = ''
  renderDirection()
  void refreshBalances()
})
maxBtn.addEventListener('click', () => {
  if (!balances) return
  if (direction === 'ETH_TO_TAMM') {
    const reserve = parseEther('0.0005') // keep a little ETH for gas
    const max = balances.eth > reserve ? balances.eth - reserve : 0n
    amountInEl.value = formatEther(max)
  } else {
    amountInEl.value = formatUnits(balances.tamm, TAMM_DECIMALS)
  }
  void refreshQuote()
})
connectBtn.addEventListener('click', () => void connect())
swapBtn.addEventListener('click', () => void onSwapClick())

// Static links
;($('poolLink') as HTMLAnchorElement).href = explorerAddressUrl(POOL)
;($('routerLink') as HTMLAnchorElement).href = explorerAddressUrl(ROUTER)

// Wallet account / chain changes (MetaMask / OKX inject the same events)
const ethProvider = (globalThis as unknown as { ethereum?: { on?: (e: string, cb: (...a: unknown[]) => void) => void } }).ethereum
if (ethProvider?.on) {
  ethProvider.on('accountsChanged', () => void connect())
  ethProvider.on('chainChanged', () => void connect())
}

// ---- boot: reference price + SDK deployment check (no wallet needed) ----
async function boot() {
  try {
    const ref = await quoteSwap(client, 'ETH_TO_TAMM', parseEther('0.001'))
    $('rateLine').textContent = `1 ETH ≈ ${ref.rate.toLocaleString('en-US', { maximumFractionDigits: 2 })} $tAMM`
    $('poolLine').textContent = `${POOL.slice(0, 6)}…${POOL.slice(-4)}`
  } catch {
    $('rateLine').textContent = 'Quote unavailable — check RPC'
  }
  const dep = await loadSdkDeployment()
  $('deployLine').textContent = dep
    ? `Deployment verified with the Ammora SDK: GIWA Sepolia (chain ${dep.chainId}), explorer ${EXPLORER_URL}. Slippage ${SLIPPAGE_BPS / 100}% · deadline ${DEADLINE_SECONDS / 60} min.`
    : 'SDK deployment catalog unavailable — using the verified GIWA Sepolia contracts directly.'
  chainBadge.textContent = 'GIWA Sepolia · 91342'
  if (!wallet) {
    setStatus('No injected wallet detected — you can still see live quotes. Install MetaMask or OKX Wallet to swap.')
  }
  renderDirection()
}

void boot()
