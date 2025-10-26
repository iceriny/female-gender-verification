import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import crypto from 'node:crypto'

// https://vite.dev/config/
function deriveHash(secret: string, salt: string) {
    // Align with Web Crypto PBKDF2 in browser: 100000 iters, SHA-256, 32 bytes
    const dk = crypto.pbkdf2Sync(secret, salt, 100000, 32, 'sha256')
    return dk.toString('base64')
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '')

    const DEV_SECRET_PLAINTEXT = env.VITE_DEV_SECRET || ''
    const DEV_SECRET_SALT =
        env.VITE_DEV_SECRET_SALT || crypto.randomBytes(16).toString('hex')
    const DEV_SECRET_HASH = DEV_SECRET_PLAINTEXT
        ? deriveHash(DEV_SECRET_PLAINTEXT, DEV_SECRET_SALT)
        : ''

    return {
        plugins: [react(), tailwindcss()],
        define: {
            __DEV_SECRET_SALT__: JSON.stringify(DEV_SECRET_SALT),
            __DEV_SECRET_HASH__: JSON.stringify(DEV_SECRET_HASH),
        },
    }
})
