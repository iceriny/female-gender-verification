import { useState, useEffect, useCallback, useMemo } from 'react'
import { useLLMStoreHook, isThinkingSupported } from '../store/LLMStore'
import { useLLMStore } from '../store/LLMStore'
import { hasBuiltinApiKey, decryptBuiltinApiKey } from '../utils/secret'

interface AgreementProps {
    onAgreed: () => void
}

export default function Agreement({ onAgreed }: AgreementProps) {
    const {
        apiKey,
        setApiKey,
        apiModel,
        setApiModel,
        llmModelList,
        enableThinking,
        setEnableThinking,
        thinkingBudget,
        setThinkingBudget,
    } = useLLMStoreHook()

    const [localKey, setLocalKey] = useState('')
    const [loadingModels, setLoadingModels] = useState(false)
    const [touched, setTouched] = useState(false)
    const [modelError, setModelError] = useState<string | null>(null)

    /* ── 内置密钥解锁相关 ── */
    const builtinAvailable = hasBuiltinApiKey()
    const [showUnlock, setShowUnlock] = useState(false)
    const [devSecretInput, setDevSecretInput] = useState('')
    const [unlockStatus, setUnlockStatus] = useState<
        'idle' | 'loading' | 'success' | 'error'
    >('idle')
    const [isBuiltinKey, setIsBuiltinKey] = useState(false)

    /** 当前选中模型是否支持 thinking */
    const modelSupportsThinking = useMemo(
        () => isThinkingSupported(apiModel),
        [apiModel]
    )

    // 初始化：从 localStorage 恢复 API Key
    useEffect(() => {
        const saved = localStorage.getItem('sf_api_key') ?? ''
        if (saved) {
            setLocalKey(saved)
            if (!apiKey) {
                setApiKey(saved)
                setLoadingModels(true)
                useLLMStore
                    .getState()
                    .setLlmModelList()
                    .finally(() => setLoadingModels(false))
            }
        } else if (apiKey) {
            setLocalKey(apiKey)
        }
        // 仅在挂载时执行
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    /** 失去焦点时提交 API Key 并拉取模型列表 */
    const commitApiKey = useCallback(async () => {
        setTouched(true)
        const value = localKey.trim()
        if (!value) return

        if (value === apiKey && llmModelList.length > 0) return

        setApiKey(value)
        // 仅手动输入的 key 才持久化（内置密钥不存入 localStorage）
        if (!isBuiltinKey) {
            try {
                localStorage.setItem('sf_api_key', value)
            } catch {
                // 持久化失败不阻塞
            }
        }

        setLoadingModels(true)
        setModelError(null)
        try {
            await useLLMStore.getState().setLlmModelList()
            const list = useLLMStore.getState().llmModelList
            if (list.length === 0) {
                setModelError('未获取到可用模型，请检查 API Key 是否正确')
            }
        } catch {
            setModelError('获取模型列表失败')
        } finally {
            setLoadingModels(false)
        }
    }, [localKey, apiKey, setApiKey, llmModelList.length, isBuiltinKey])

    /** 尝试解密内置 API Key */
    const handleUnlock = useCallback(async () => {
        const secret = devSecretInput.trim()
        if (!secret) return

        setUnlockStatus('loading')
        try {
            const decrypted = await decryptBuiltinApiKey(secret)
            if (decrypted) {
                setUnlockStatus('success')
                setIsBuiltinKey(true)
                setLocalKey(decrypted)
                setApiKey(decrypted)

                // 自动拉取模型列表
                setLoadingModels(true)
                setModelError(null)
                try {
                    await useLLMStore.getState().setLlmModelList()
                    const list = useLLMStore.getState().llmModelList
                    if (list.length === 0) {
                        setModelError(
                            '未获取到可用模型，请检查内置 API Key 是否仍有效'
                        )
                    }
                } catch {
                    setModelError('获取模型列表失败')
                } finally {
                    setLoadingModels(false)
                }
            } else {
                setUnlockStatus('error')
            }
        } catch {
            setUnlockStatus('error')
        }
    }, [devSecretInput, setApiKey])

    // 过滤出 chat 类模型
    const chatModels = llmModelList.filter((m) => {
        const lower = m.toLowerCase()
        const excluded = [
            'stable-diffusion',
            'sdxl',
            'flux',
            'dall-e',
            'whisper',
            'tts',
            'speech',
            'audio',
            'embedding',
            'reranker',
            'bge-',
            'text-to-image',
            'image-to-',
            'video',
            'music',
            'ocr',
        ]
        return !excluded.some((ex) => lower.includes(ex))
    })

    const canProceed = Boolean(apiKey) && Boolean(apiModel)

    return (
        <div className="min-h-dvh flex items-center justify-center bg-gradient-to-b from-rose-50 to-white px-4">
            <div className="w-full max-w-xl mx-auto p-6 md:p-8 bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-rose-100/80 animate-fadeIn">
                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-rose-900">
                    女性社区真实性别验证
                </h1>
                <p className="mt-2 text-rose-700/70 text-sm">
                    为了守护社区氛围，请先阅读以下协议与提示。
                </p>

                {/* 协议内容 */}
                <div className="mt-5 space-y-2.5 text-sm text-rose-900/70 bg-rose-50/50 rounded-xl p-4 border border-rose-100/60">
                    <p>
                        <span className="text-rose-600 font-medium">1.</span>{' '}
                        不会收集你的任何信息。你所有的答案只会与 LLM
                        供应商进行交互，如有顾虑请参考对方的隐私策略。
                    </p>
                    <p>
                        <span className="text-rose-600 font-medium">2.</span>{' '}
                        验证题目与判断由大模型自动生成与评估，可能存在偏差。
                    </p>
                    <p>
                        <span className="text-rose-600 font-medium">3.</span>{' '}
                        结果仅供参考，不作为任何法律或医疗依据。
                    </p>
                    <p>
                        <span className="text-rose-600 font-medium">4.</span>{' '}
                        如遇不适内容，请立即停止。
                    </p>
                </div>

                {/* API 配置 */}
                <div className="mt-6 space-y-4">
                    {/* API Key */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-rose-900/80">
                            API Key
                            <span className="ml-1.5 text-xs font-normal text-rose-500/70">
                                硅基流动
                            </span>
                        </label>
                        <input
                            type="password"
                            value={isBuiltinKey ? '••••••••' : localKey}
                            onChange={(e) => {
                                if (isBuiltinKey) {
                                    // 用户开始手动输入 → 退出内置密钥模式
                                    setIsBuiltinKey(false)
                                    setLocalKey(e.target.value)
                                } else {
                                    setLocalKey(e.target.value)
                                }
                            }}
                            onBlur={isBuiltinKey ? undefined : commitApiKey}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.currentTarget.blur()
                                }
                            }}
                            readOnly={isBuiltinKey}
                            placeholder="输入 API Key 后点击其他区域加载模型"
                            className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-shadow ${
                                isBuiltinKey
                                    ? 'border-emerald-200 bg-emerald-50/50 text-emerald-700 cursor-default'
                                    : 'border-rose-200/80 bg-white focus:ring-2 focus:ring-rose-300/60 focus:border-rose-300'
                            }`}
                        />
                        {isBuiltinKey && (
                            <p className="text-xs text-emerald-600 flex items-center gap-1">
                                <svg
                                    className="w-3.5 h-3.5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                                    />
                                </svg>
                                已使用内置密钥
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsBuiltinKey(false)
                                        setLocalKey('')
                                        setApiKey('')
                                        setUnlockStatus('idle')
                                    }}
                                    className="ml-1 text-emerald-500 hover:text-emerald-700 underline"
                                >
                                    切换为手动输入
                                </button>
                            </p>
                        )}
                        {!isBuiltinKey && touched && !localKey.trim() ? (
                            <p className="text-xs text-rose-500">
                                请输入 API Key（
                                <a
                                    href="https://cloud.siliconflow.cn/account/ak"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="underline hover:text-rose-700"
                                >
                                    获取地址
                                </a>
                                ）
                            </p>
                        ) : null}

                        {/* 内置密钥解锁入口 */}
                        {builtinAvailable && !isBuiltinKey && (
                            <div className="mt-1">
                                {!showUnlock ? (
                                    <button
                                        type="button"
                                        onClick={() => setShowUnlock(true)}
                                        className="text-xs text-rose-500/70 hover:text-rose-700 transition-colors flex items-center gap-1"
                                    >
                                        <svg
                                            className="w-3 h-3"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth={2}
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                                            />
                                        </svg>
                                        有开发者密钥？点击解锁内置 API Key
                                    </button>
                                ) : (
                                    <div className="mt-2 p-3 rounded-xl border border-rose-100/60 bg-rose-50/30 space-y-2 animate-slideDown">
                                        <p className="text-xs text-rose-700/70">
                                            输入开发者密钥以解锁内置 API Key
                                        </p>
                                        <div className="flex gap-2">
                                            <input
                                                type="password"
                                                value={devSecretInput}
                                                onChange={(e) => {
                                                    setDevSecretInput(
                                                        e.target.value
                                                    )
                                                    if (
                                                        unlockStatus === 'error'
                                                    )
                                                        setUnlockStatus('idle')
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter')
                                                        handleUnlock()
                                                }}
                                                placeholder="开发者密钥"
                                                className="flex-1 rounded-lg border border-rose-200/80 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-rose-300/60"
                                            />
                                            <button
                                                type="button"
                                                onClick={handleUnlock}
                                                disabled={
                                                    unlockStatus === 'loading'
                                                }
                                                className="rounded-lg bg-rose-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-rose-700 disabled:bg-rose-300 transition-colors whitespace-nowrap"
                                            >
                                                {unlockStatus === 'loading'
                                                    ? '解密中…'
                                                    : '解锁'}
                                            </button>
                                        </div>
                                        {unlockStatus === 'error' && (
                                            <p className="text-xs text-red-500">
                                                密钥验证失败，请检查是否输入正确
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* 模型选择 */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-rose-900/80">
                            选择模型
                        </label>
                        <div className="relative">
                            <select
                                value={apiModel}
                                onChange={(e) => setApiModel(e.target.value)}
                                disabled={loadingModels}
                                className="w-full appearance-none rounded-xl border border-rose-200/80 bg-white px-3.5 py-2.5 pr-9 text-sm outline-none focus:ring-2 focus:ring-rose-300/60 focus:border-rose-300 disabled:bg-rose-50 disabled:text-rose-400 transition-shadow"
                            >
                                {chatModels.length === 0 && !loadingModels && (
                                    <option value="">
                                        {apiKey
                                            ? '未获取到模型'
                                            : '请先输入 API Key'}
                                    </option>
                                )}
                                {loadingModels && (
                                    <option value="">加载可用模型中…</option>
                                )}
                                {chatModels.map((m) => (
                                    <option key={m} value={m}>
                                        {m}
                                    </option>
                                ))}
                            </select>
                            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-rose-400 text-xs">
                                {loadingModels ? (
                                    <svg
                                        className="w-4 h-4 animate-spin"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                    >
                                        <circle
                                            className="opacity-25"
                                            cx="12"
                                            cy="12"
                                            r="10"
                                            stroke="currentColor"
                                            strokeWidth="4"
                                        />
                                        <path
                                            className="opacity-75"
                                            fill="currentColor"
                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                        />
                                    </svg>
                                ) : (
                                    '▾'
                                )}
                            </div>
                        </div>
                        {modelError && (
                            <p className="text-xs text-rose-500">
                                {modelError}
                            </p>
                        )}
                        <p className="text-xs text-rose-500/60">
                            {chatModels.length > 0
                                ? `已加载 ${chatModels.length} 个对话模型`
                                : '未选择时将使用默认模型 deepseek-ai/DeepSeek-V3.2-Exp'}
                        </p>
                    </div>

                    {/* 思维链设置 */}
                    <div className="space-y-2.5 rounded-xl border border-rose-100/60 bg-rose-50/30 p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <span className="text-sm font-medium text-rose-900/80">
                                    深度思考
                                </span>
                                <span className="ml-1.5 text-xs text-rose-500/60">
                                    enable_thinking
                                </span>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={enableThinking}
                                onClick={() =>
                                    setEnableThinking(!enableThinking)
                                }
                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-rose-300 focus:ring-offset-2 ${
                                    enableThinking
                                        ? 'bg-rose-600'
                                        : 'bg-rose-200'
                                }`}
                            >
                                <span
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                        enableThinking
                                            ? 'translate-x-5'
                                            : 'translate-x-0'
                                    }`}
                                />
                            </button>
                        </div>

                        {enableThinking && !modelSupportsThinking && (
                            <p className="text-xs text-amber-600/80 bg-amber-50/60 rounded-lg px-2.5 py-1.5">
                                当前模型可能不支持深度思考。已知支持的模型包括
                                DeepSeek-V3.2、Qwen3 系列、GLM-4.7
                                等，其他模型开启后 API
                                可能会忽略该参数或返回错误。
                            </p>
                        )}

                        {enableThinking && (
                            <div className="space-y-1.5 pt-1">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs text-rose-900/70">
                                        思考预算
                                        <span className="ml-1 text-rose-500/50">
                                            thinking_budget
                                        </span>
                                    </label>
                                    <span className="text-xs text-rose-700 tabular-nums font-medium">
                                        {thinkingBudget.toLocaleString()} tokens
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min={128}
                                    max={32768}
                                    step={128}
                                    value={thinkingBudget}
                                    onChange={(e) =>
                                        setThinkingBudget(
                                            Number(e.target.value)
                                        )
                                    }
                                    className="w-full h-1.5 bg-rose-200 rounded-full appearance-none cursor-pointer accent-rose-600 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-rose-600 [&::-webkit-slider-thumb]:shadow-sm"
                                />
                                <div className="flex justify-between text-[10px] text-rose-400/70">
                                    <span>128</span>
                                    <span>4096</span>
                                    <span>16384</span>
                                    <span>32768</span>
                                </div>
                                <p className="text-xs text-rose-500/50">
                                    开启后模型会先进行推理思考再回答，可能提升题目质量，但会增加响应时间和
                                    token 消耗
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* 开始按钮 */}
                <div className="mt-8">
                    <button
                        disabled={!canProceed}
                        onClick={onAgreed}
                        className="w-full sm:w-auto inline-flex items-center justify-center rounded-full bg-rose-600 text-white px-6 py-2.5 text-sm font-medium shadow-sm hover:bg-rose-700 active:bg-rose-800 disabled:bg-rose-300 disabled:cursor-not-allowed transition-colors"
                    >
                        我已阅读并同意，开始验证
                    </button>
                    <p className="mt-2 text-xs text-rose-900/40">
                        点击即表示你已同意上述内容
                    </p>
                </div>
            </div>

            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(12px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                .animate-fadeIn { animation: fadeIn 0.5s ease-out both; }
                @keyframes slideDown {
                    from { opacity: 0; transform: translateY(-8px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                .animate-slideDown { animation: slideDown 0.3s ease-out both; }
            `}</style>
        </div>
    )
}
