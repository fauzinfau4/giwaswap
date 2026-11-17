import { defineConfig } from 'vite'

// Default base assumes the GitHub Pages project site is served from
// https://<user>.github.io/giwaswap/ . The deploy workflow overrides this
// with --base=/<repo-name>/ so any repo name works (see DEPLOY.md).
export default defineConfig({
  base: '/giwaswap/',
})
