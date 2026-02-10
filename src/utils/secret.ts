// __DEV_SECRET_HASH__ 和 __DEV_SECRET_SALT__ 声明位于 src/globals.d.ts
import type { LLMProvider } from '../store/LLMStore'

/**
 * 验证开发者密钥（用于解锁参考答案等功能）
 * 使用 PBKDF2 派生哈希与编译期注入的哈希对比
 */
export async function verifyDevSecret(input: string): Promise<boolean> {
    if (!__DEV_SECRET_HASH__ || !__DEV_SECRET_SALT__) return false
    const enc = new TextEncoder()
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(input),
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
    )
    const bits = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            hash: 'SHA-256',
            salt: enc.encode(__DEV_SECRET_SALT__),
            iterations: 100000,
        },
        keyMaterial,
        256
    )
    const hash = btoa(String.fromCharCode(...new Uint8Array(bits)))
    return hash === __DEV_SECRET_HASH__
}

/* ── 内置 LLM API Key 解密 ── */

/**
 * 判断当前构建是否内嵌了加密的 LLM API Key
 * 仅当 .env 中同时设置了对应 provider 的 API Key 与 VITE_DEV_SECRET 时才会内嵌
 */
function getEncryptedPayload(provider: LLMProvider): {
    key: string
    salt: string
    iv: string
} {
    if (provider === 'openrouter') {
        return {
            key: __ENCRYPTED_OPENROUTER_KEY__,
            salt: __ENCRYPTED_OPENROUTER_KEY_SALT__,
            iv: __ENCRYPTED_OPENROUTER_KEY_IV__,
        }
    }
    return {
        key: __ENCRYPTED_LLM_KEY__,
        salt: __ENCRYPTED_LLM_KEY_SALT__,
        iv: __ENCRYPTED_LLM_KEY_IV__,
    }
}

export function hasBuiltinApiKey(provider: LLMProvider = 'siliconflow'): boolean {
    const payload = getEncryptedPayload(provider)
    return Boolean(payload.key && payload.salt && payload.iv)
}

/**
 * 使用开发者密钥解密内置的 LLM API Key
 *
 * 安全流程:
 * 1. 从用户输入的 devSecret 通过 PBKDF2 (100k iterations, SHA-256) 派生 AES-256 密钥
 * 2. 使用 AES-256-GCM 解密编译期注入的密文
 * 3. GCM 的认证标签确保：密钥错误 → 直接抛出异常（不会产生错误明文）
 *
 * @returns 解密后的 API Key，若失败则返回 null
 */
export async function decryptBuiltinApiKey(
    devSecret: string,
    provider: LLMProvider = 'siliconflow'
): Promise<string | null> {
    if (!hasBuiltinApiKey(provider)) return null

    try {
        const payload = getEncryptedPayload(provider)
        // base64 → Uint8Array
        const salt = Uint8Array.from(atob(payload.salt), (c) =>
            c.charCodeAt(0)
        )
        const iv = Uint8Array.from(atob(payload.iv), (c) =>
            c.charCodeAt(0)
        )
        const ciphertext = Uint8Array.from(atob(payload.key), (c) =>
            c.charCodeAt(0)
        )

        // 1. 从 devSecret 派生 AES-256 密钥（与 vite.config.ts 中相同参数）
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(devSecret),
            { name: 'PBKDF2' },
            false,
            ['deriveKey']
        )

        const aesKey = await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt,
                iterations: 100000,
                hash: 'SHA-256',
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt']
        )

        // 2. AES-GCM 解密（ciphertext 中已包含 auth tag，Web Crypto 会自动处理）
        const plainBuffer = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            aesKey,
            ciphertext
        )

        return new TextDecoder().decode(plainBuffer)
    } catch {
        // 密钥错误 → GCM 认证失败 → 异常
        return null
    }
}
