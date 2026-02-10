import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import crypto from 'node:crypto'

// https://vite.dev/config/

/* ── 开发者密钥验证用哈希 ── */
function deriveHash(secret: string, salt: string) {
    const dk = crypto.pbkdf2Sync(secret, salt, 100000, 32, 'sha256')
    return dk.toString('base64')
}

/* ── 内置 LLM API Key 加密 ── */
/**
 * 使用 AES-256-GCM + PBKDF2 对 LLM API Key 进行加密
 *
 * 安全策略:
 * - PBKDF2 (100k iterations, SHA-256) 从开发者密钥派生 256-bit AES 密钥
 * - AES-256-GCM 提供认证加密（密钥错误 → 解密直接失败，不会产生垃圾明文）
 * - 每次构建随机生成 salt(16B) + iv(12B)，防止预计算攻击
 * - 产物中只包含密文+salt+iv，开发者密钥从不出现在 bundle 中
 *
 * 运行时通过 Web Crypto API 使用相同参数解密
 */
function encryptApiKey(
    apiKey: string,
    devSecret: string
): { data: string; salt: string; iv: string } {
    const salt = crypto.randomBytes(16)
    const iv = crypto.randomBytes(12) // GCM 推荐 12 字节

    // 派生 256-bit AES 密钥
    const key = crypto.pbkdf2Sync(devSecret, salt, 100000, 32, 'sha256')

    // AES-256-GCM 加密
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const encrypted = Buffer.concat([
        cipher.update(apiKey, 'utf8'),
        cipher.final(),
    ])
    const tag = cipher.getAuthTag() // 16 字节认证标签

    // 密文 + tag 拼接（Web Crypto API 的 AES-GCM 解密期望此格式）
    const combined = Buffer.concat([encrypted, tag])

    return {
        data: combined.toString('base64'),
        salt: salt.toString('base64'),
        iv: iv.toString('base64'),
    }
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '')

    /* ── 开发者密钥哈希（用于身份验证） ── */
    const DEV_SECRET_PLAINTEXT = env.VITE_DEV_SECRET || ''
    const DEV_SECRET_SALT =
        env.VITE_DEV_SECRET_SALT || crypto.randomBytes(16).toString('hex')
    const DEV_SECRET_HASH = DEV_SECRET_PLAINTEXT
        ? deriveHash(DEV_SECRET_PLAINTEXT, DEV_SECRET_SALT)
        : ''

    /* ── 内置 API Key 加密（需同时设置 API Key 与 VITE_DEV_SECRET） ── */
    const LLM_API_KEY = env.VITE_LLM_API_KEY || ''
    const OPENROUTER_API_KEY = env.VITE_OPENROUTER_API_KEY || ''
    let encryptedKey = { data: '', salt: '', iv: '' }
    let encryptedOpenRouterKey = { data: '', salt: '', iv: '' }
    if (LLM_API_KEY && DEV_SECRET_PLAINTEXT) {
        encryptedKey = encryptApiKey(LLM_API_KEY, DEV_SECRET_PLAINTEXT)
    }
    if (OPENROUTER_API_KEY && DEV_SECRET_PLAINTEXT) {
        encryptedOpenRouterKey = encryptApiKey(
            OPENROUTER_API_KEY,
            DEV_SECRET_PLAINTEXT
        )
    }

    /* ── DEBUG 开关 ── */
    const DEBUG =
        env.VITE_DEBUG !== undefined
            ? env.VITE_DEBUG === 'true' || env.VITE_DEBUG === '1'
            : mode === 'development'

    return {
        // GitHub Pages 等子路径部署：使用相对路径，兼容所有环境
        base: './',
        plugins: [react(), tailwindcss()],
        define: {
            __DEV_SECRET_SALT__: JSON.stringify(DEV_SECRET_SALT),
            __DEV_SECRET_HASH__: JSON.stringify(DEV_SECRET_HASH),
            __DEBUG__: JSON.stringify(DEBUG),
            // 内置 LLM API Key（加密后的密文+salt+iv）
            __ENCRYPTED_LLM_KEY__: JSON.stringify(encryptedKey.data),
            __ENCRYPTED_LLM_KEY_SALT__: JSON.stringify(encryptedKey.salt),
            __ENCRYPTED_LLM_KEY_IV__: JSON.stringify(encryptedKey.iv),
            __ENCRYPTED_OPENROUTER_KEY__: JSON.stringify(
                encryptedOpenRouterKey.data
            ),
            __ENCRYPTED_OPENROUTER_KEY_SALT__: JSON.stringify(
                encryptedOpenRouterKey.salt
            ),
            __ENCRYPTED_OPENROUTER_KEY_IV__: JSON.stringify(
                encryptedOpenRouterKey.iv
            ),
        },
    }
})
