import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig(({ mode }) => {
  const envDir = fileURLToPath(new URL('../../', import.meta.url))
  const env: Partial<Record<string, string>> = loadEnv(
    mode,
    envDir,
    'DATABASE_URL',
  )
  // Only copy server configuration that exists. Assigning undefined to process.env
  // would create the literal string "undefined" rather than leave it unset.
  if (
    process.env.DATABASE_URL === undefined &&
    env.DATABASE_URL !== undefined
  ) {
    process.env.DATABASE_URL = env.DATABASE_URL
  }
  return {
    envDir,
    resolve: { tsconfigPaths: true },
    plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact()],
  }
})

export default config
