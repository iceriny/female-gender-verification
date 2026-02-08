/** Vite define 注入的编译期常量 */

/** DEBUG 模式：开发环境默认 true，可通过 VITE_DEBUG 环境变量覆盖 */
declare const __DEBUG__: boolean

/** 开发者密钥 PBKDF2 哈希（编译期从 .env 计算注入） */
declare const __DEV_SECRET_HASH__: string

/** 开发者密钥盐值（编译期从 .env 注入） */
declare const __DEV_SECRET_SALT__: string

/** 内置 LLM API Key 的 AES-256-GCM 密文（base64，含 auth tag） */
declare const __ENCRYPTED_LLM_KEY__: string

/** 内置 LLM API Key 加密用 PBKDF2 盐（base64） */
declare const __ENCRYPTED_LLM_KEY_SALT__: string

/** 内置 LLM API Key 加密用 GCM IV（base64） */
declare const __ENCRYPTED_LLM_KEY_IV__: string
