# Deploy GiwaSwap

GiwaSwap is a static site (Vite build output in `dist/`). Deployment is via
**GitHub Pages + GitHub Actions** — no server, no secrets, no extra accounts.

## Steps (parent / repo owner)

1. **Create the repo** (public) on GitHub, e.g. `fauzinfau4/giwaswap`
   (any name works — the workflow computes the base path from the repo name).
2. **Push this directory** to the repo's `main` branch, e.g.:
   ```bash
   cd ~/workspace/ammora/builder-exchange
   git init
   git add -A
   git commit -m "GiwaSwap: single-page Ammora SDK exchange (GIWA Sepolia)"
   git branch -M main
   git remote add origin https://github.com/fauzinfau4/giwaswap.git
   git push -u origin main
   ```
3. **Enable Pages:** repo → Settings → Pages → Build and deployment →
   Source: **Deploy from a branch** → branch `gh-pages`, folder `/ (root)`.
   (Catatan: workflow `.github/workflows/pages.yml` TIDAK bisa dibuat lewat
   GitHub API karena token tidak punya scope `workflow` — API menolak path
   `.github/workflows/*` dengan 404. Karena itu deploy memakai branch
   `gh-pages` berisi hasil build `dist/`, bukan GitHub Actions. Kalau suatu
   saat ada token dengan scope workflow, workflow bisa ditambahkan manual
   dan Pages bisa dipindah ke GitHub Actions.)
4. **Perbarui situs setelah ada perubahan kode:** jalankan `npm run build`
   di repo lokal, lalu push isi `dist/` ke branch `gh-pages`
   (commit baru di branch itu saja — `main` tidak ikut berubah).
5. **Wait for Pages to publish.** The site will be at:
   `https://fauzinfau4.github.io/giwaswap/` (replace `giwaswap` with the
   actual repo name if different).
5. **Verify in a clean browser:**
   - Page loads, header shows "GIWA Sepolia · 91342", rate line shows a live
     quote (e.g. `1 ETH ≈ 3,2xx $tAMM`) — no wallet needed for quotes.
   - Connect wallet (MetaMask/OKX, GIWA Sepolia testnet) → balances show.
   - Swap a small amount (0.001 ETH) → confirm in wallet → tx hash links to
     `sepolia-explorer.giwa.io` and the $tAMM balance increases.

## Notes

- The Vite `base` defaults to `/giwaswap/`; the workflow overrides it with
  `--base=/<repo-name>/`, so the site works under any project-site path.
- No environment variables or secrets are needed: the app talks to the
  public GIWA Sepolia RPC (`https://sepolia-rpc.giwa.io`) directly.
- After deploy, the remaining builder-mission steps are **user-only**:
  1. Post on X from **@Jayyidinn** showing the exchange (screenshot/video +
     the live site link).
  2. Open the Ammora waitlist in the user's own browser → "Submit your
     build" → Project name `GiwaSwap`, Website link = the Pages URL,
     X post link = the post URL → "Submit for review".
  3. Watch submission status via the waitlist state API
     (`submissions[].kind === "builder"`): pending → approved/rejected.
     Rejected can be resubmitted; approved enters the 100-builder draw.
