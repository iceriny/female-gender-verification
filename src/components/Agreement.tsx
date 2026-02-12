import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  useLLMStoreHook,
  isThinkingSupported,
  type LLMProvider,
} from '../store/LLMStore'
import { useLLMStore } from '../store/LLMStore'
import { hasBuiltinApiKey, decryptBuiltinApiKey } from '../utils/secret'

interface AgreementProps {
  onAgreed: () => void
}

/* ── 协议弹窗 ── */

function AgreementModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      const timer = setTimeout(() => setVisible(true), 30)
      return () => clearTimeout(timer)
    } else {
      setVisible(false)
      const timer = setTimeout(() => setMounted(false), 650)
      return () => clearTimeout(timer)
    }
  }, [open])

  if (!mounted) return null

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 transition-all ease-out ${
        visible
          ? 'bg-black/20 backdrop-blur-[2px] duration-600'
          : 'bg-transparent backdrop-blur-0 duration-500'
      }`}
      onClick={onClose}
    >
      <div
        className={`relative w-full max-w-lg max-h-[85vh] overflow-y-auto bg-white rounded-2xl shadow-xl border border-rose-100/80 p-6 md:p-8 transition-all ease-out custom-modal-scroll ${
          visible
            ? 'opacity-100 scale-100 translate-y-0 duration-600'
            : 'opacity-0 scale-[0.96] translate-y-3 duration-500'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold text-rose-900 tracking-tight">
          协议与提示
        </h2>
        <p className="mt-1.5 text-sm text-rose-700/60">
          参与验证前，请了解以下信息
        </p>

        {/* 协议内容 */}
        <div className="mt-4 space-y-1.5 text-sm text-rose-900/70 bg-rose-50/50 rounded-xl p-4 border border-rose-100/60">
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

        {/* 评估标准 */}
        <p className="mt-4 text-rose-700/70 text-sm font-medium">
          评估标准：
        </p>
        <div className="mt-2 space-y-1.5 text-sm text-rose-900/70 bg-rose-50/50 rounded-xl p-4 border border-rose-100/60">
          <p>
            <span className="text-rose-600 font-medium">1.</span>{' '}
            请描述你
            <span className="text-rose-600 font-medium">真实的</span>
            身体感受，而非泛泛而谈，或网上搜索的答案。
          </p>
          <p>
            <span className="text-rose-600 font-medium">2.</span>{' '}
            用词自然，能描述出：
            <span className="text-rose-600 font-medium">
              "只有亲身经历过才知道的细节"
            </span>
            。
          </p>
          <p>
            <span className="text-rose-600 font-medium">3.</span>{' '}
            会提到一些
            <span className="text-rose-600 font-medium">
              "不太好意思说但确实如此"
            </span>
            的真实体验。
          </p>
          <p>
            <span className="text-rose-600 font-medium">4.</span>{' '}
            评估时考察的是回答的
            <span className="text-rose-600 font-medium">真实感</span>和
            <span className="text-rose-600 font-medium">细节丰富度</span>
            ，而非仅看对错。
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-full bg-rose-600 text-white px-5 py-2.5 text-sm font-medium shadow-sm hover:bg-rose-700 active:bg-rose-800 transition-colors duration-300"
        >
          我已了解
        </button>
      </div>
    </div>
  )
}

/* ── 主组件 ── */

export default function Agreement({ onAgreed }: AgreementProps) {
  const {
    provider,
    setProvider,
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

  /* ── 协议弹窗（首次进入自动弹出） ── */
  const [showModal, setShowModal] = useState(() => {
    return !localStorage.getItem('agreement_seen')
  })

  const closeModal = useCallback(() => {
    setShowModal(false)
    try {
      localStorage.setItem('agreement_seen', '1')
    } catch {
      /* ignore */
    }
  }, [])

  /* ── 内置密钥解锁相关 ── */
  const builtinAvailable = hasBuiltinApiKey(provider)
  const [showUnlock, setShowUnlock] = useState(false)
  const [devSecretInput, setDevSecretInput] = useState('')
  const [unlockStatus, setUnlockStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [isBuiltinKey, setIsBuiltinKey] = useState(false)

  const keyStorageKey = useCallback((p: LLMProvider) => {
    return p === 'openrouter' ? 'or_api_key' : 'sf_api_key'
  }, [])

  const modelStorageKey = useCallback((p: LLMProvider) => {
    return p === 'openrouter' ? 'or_api_model' : 'sf_api_model'
  }, [])

  // provider 切换：恢复该 provider 的 key/model 并拉取模型
  useEffect(() => {
    setIsBuiltinKey(false)
    setUnlockStatus('idle')
    setShowUnlock(false)
    setModelError(null)

    const savedKey = localStorage.getItem(keyStorageKey(provider)) ?? ''
    const savedModel = localStorage.getItem(modelStorageKey(provider)) ?? ''
    setLocalKey(savedKey)
    setApiKey(savedKey)

    if (savedModel) {
      setApiModel(savedModel)
    }

    if (!savedKey) {
      useLLMStore.setState({ llmModelList: [] })
      return
    }

    setLoadingModels(true)
    useLLMStore
      .getState()
      .setLlmModelList()
      .catch(() => setModelError('获取模型列表失败'))
      .finally(() => setLoadingModels(false))
  }, [provider, keyStorageKey, modelStorageKey, setApiKey, setApiModel])

  const providerLabel = provider === 'openrouter' ? 'OpenRouter' : '硅基流动'
  const keyGuideUrl =
    provider === 'openrouter'
      ? 'https://openrouter.ai/settings/keys'
      : 'https://cloud.siliconflow.cn/account/ak'

  /** 当前选中模型是否支持 thinking */
  const modelSupportsThinking = useMemo(() => {
    if (provider !== 'siliconflow') return false
    return isThinkingSupported(apiModel)
  }, [provider, apiModel])

  /** 自动开启 thinking（当模型支持时） */
  const autoEnabledRef = useRef(false)
  useEffect(() => {
    if (modelSupportsThinking && !autoEnabledRef.current) {
      setEnableThinking(true)
      autoEnabledRef.current = true
    }
    if (!modelSupportsThinking) {
      autoEnabledRef.current = false
    }
  }, [modelSupportsThinking, setEnableThinking])

  // 初始化：恢复 provider / key / model
  useEffect(() => {
    const savedProvider = localStorage.getItem('llm_provider')
    if (savedProvider === 'siliconflow' || savedProvider === 'openrouter') {
      if (savedProvider !== provider) {
        setProvider(savedProvider)
      }
      const savedModel = localStorage.getItem(modelStorageKey(savedProvider))
      if (savedModel) {
        useLLMStore.getState().setApiModel(savedModel)
      }
      const savedKey = localStorage.getItem(keyStorageKey(savedProvider)) ?? ''
      setLocalKey(savedKey)
      if (savedKey) {
        useLLMStore.getState().setApiKey(savedKey)
        setLoadingModels(true)
        useLLMStore
          .getState()
          .setLlmModelList()
          .finally(() => setLoadingModels(false))
      }
      return
    }

    const fallbackKey = localStorage.getItem(keyStorageKey(provider)) ?? ''
    if (fallbackKey) {
      setLocalKey(fallbackKey)
      setApiKey(fallbackKey)
      setLoadingModels(true)
      useLLMStore
        .getState()
        .setLlmModelList()
        .finally(() => setLoadingModels(false))
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
        localStorage.setItem(keyStorageKey(provider), value)
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
  }, [
    localKey,
    apiKey,
    setApiKey,
    llmModelList.length,
    isBuiltinKey,
    keyStorageKey,
    provider,
  ])

  /** 尝试解密内置 API Key */
  const handleUnlock = useCallback(async () => {
    const secret = devSecretInput.trim()
    if (!secret) return

    setUnlockStatus('loading')
    try {
      const decrypted = await decryptBuiltinApiKey(secret, provider)
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
  }, [devSecretInput, setApiKey, provider])

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

  const handleProviderChange = useCallback(
    (nextProvider: LLMProvider) => {
      if (nextProvider === provider) return
      localStorage.setItem('llm_provider', nextProvider)
      setProvider(nextProvider)
    },
    [provider, setProvider]
  )

  const handleModelChange = useCallback(
    (model: string) => {
      setApiModel(model)
      localStorage.setItem(modelStorageKey(provider), model)
    },
    [provider, setApiModel, modelStorageKey]
  )

  const canProceed = Boolean(apiKey) && Boolean(apiModel)

  return (
    <div className="min-h-dvh flex items-center justify-center bg-linear-to-b from-rose-50 to-white px-4">
      <div className="w-full max-w-xl mx-auto p-6 md:p-8 bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-rose-100/80 animate-fadeIn">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-rose-900">
          女性社区真实性别验证
        </h1>
        <p className="mt-2 text-rose-700/70 text-sm">
          为了守护社区氛围，请先配置 AI 提供商并阅读协议。
        </p>

        {/* 查看协议按钮 */}
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="mt-3 w-full flex items-center gap-2.5 rounded-xl border border-rose-200/80 bg-rose-50/40 px-4 py-3 text-sm text-rose-700/80 hover:bg-rose-50 hover:border-rose-300/60 transition-all duration-500 group"
        >
          <svg
            className="w-4 h-4 text-rose-500/70 group-hover:text-rose-600 transition-colors duration-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          </svg>
          <span>查看协议与评估标准</span>
          <svg
            className="w-3.5 h-3.5 ml-auto text-rose-400/60 group-hover:translate-x-0.5 transition-transform duration-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.25 4.5l7.5 7.5-7.5 7.5"
            />
          </svg>
        </button>

        {/* API 配置 */}
        <div className="mt-5 space-y-4">
          {/* AI 提供商 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-rose-900/80">
              AI 提供商
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleProviderChange('siliconflow')}
                className={`rounded-xl border px-3 py-2 text-sm transition-all duration-400 ${
                  provider === 'siliconflow'
                    ? 'border-rose-300 bg-rose-50 text-rose-700 shadow-sm'
                    : 'border-rose-200/80 bg-white text-rose-700/70 hover:bg-rose-50/40'
                }`}
              >
                硅基流动
              </button>
              <button
                type="button"
                onClick={() => handleProviderChange('openrouter')}
                className={`rounded-xl border px-3 py-2 text-sm transition-all duration-400 ${
                  provider === 'openrouter'
                    ? 'border-rose-300 bg-rose-50 text-rose-700 shadow-sm'
                    : 'border-rose-200/80 bg-white text-rose-700/70 hover:bg-rose-50/40'
                }`}
              >
                OpenRouter
              </button>
            </div>
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-rose-900/80">
              API Key
              <span className="ml-1.5 text-xs font-normal text-rose-500/70">
                {providerLabel}
              </span>
            </label>
            <input
              type="password"
              value={isBuiltinKey ? '••••••••' : localKey}
              onChange={(e) => {
                if (isBuiltinKey) {
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
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-all duration-400 ${
                isBuiltinKey
                  ? 'border-emerald-200 bg-emerald-50/50 text-emerald-700 cursor-default'
                  : 'border-rose-200/80 bg-white focus:ring-2 focus:ring-rose-300/60 focus:border-rose-300'
              }`}
            />
            {isBuiltinKey && (
              <p className="text-xs text-emerald-600 flex items-center gap-1 animate-fadeInSoft">
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
                  className="ml-1 text-emerald-500 hover:text-emerald-700 underline transition-colors duration-300"
                >
                  切换为手动输入
                </button>
              </p>
            )}
            {!isBuiltinKey && touched && !localKey.trim() ? (
              <p className="text-xs text-rose-500">
                请输入 API Key（
                <a
                  href={keyGuideUrl}
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
                    className="text-xs text-rose-500/70 hover:text-rose-700 transition-colors duration-300 flex items-center gap-1"
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
                          setDevSecretInput(e.target.value)
                          if (unlockStatus === 'error')
                            setUnlockStatus('idle')
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleUnlock()
                        }}
                        placeholder="开发者密钥"
                        className="flex-1 rounded-lg border border-rose-200/80 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-rose-300/60 transition-all duration-300"
                      />
                      <button
                        type="button"
                        onClick={handleUnlock}
                        disabled={unlockStatus === 'loading'}
                        className="rounded-lg bg-rose-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-rose-700 disabled:bg-rose-300 transition-colors duration-300 whitespace-nowrap"
                      >
                        {unlockStatus === 'loading' ? '解密中…' : '解锁'}
                      </button>
                    </div>
                    {unlockStatus === 'error' && (
                      <p className="text-xs text-red-500 animate-fadeInSoft">
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
                onChange={(e) => handleModelChange(e.target.value)}
                disabled={loadingModels}
                className="w-full appearance-none rounded-xl border border-rose-200/80 bg-white px-3.5 py-2.5 pr-9 text-sm outline-none focus:ring-2 focus:ring-rose-300/60 focus:border-rose-300 disabled:bg-rose-50 disabled:text-rose-400 transition-all duration-400"
              >
                {chatModels.length === 0 && !loadingModels && (
                  <option value="">
                    {apiKey ? '未获取到模型' : '请先输入 API Key'}
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
              <p className="text-xs text-rose-500">{modelError}</p>
            )}
            <p className="text-xs text-rose-500/60">
              {chatModels.length > 0
                ? `已加载 ${chatModels.length} 个对话模型`
                : provider === 'openrouter'
                  ? '未选择时将使用默认模型 openai/gpt-5-nano'
                  : '未选择时将使用默认模型 deepseek-ai/DeepSeek-V3.2-Exp'}
            </p>
          </div>

          {/* 深度思考设置 — 仅在使用开发者密钥且为硅基流动时显示 */}
          {isBuiltinKey && provider === 'siliconflow' && (
            <div className="space-y-1 rounded-xl border border-rose-100/60 bg-rose-50/30 p-4 animate-slideDown">
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
                  onClick={() => setEnableThinking(!enableThinking)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-400 ease-in-out focus:outline-none focus:ring-2 focus:ring-rose-300 focus:ring-offset-2 ${
                    enableThinking ? 'bg-rose-600' : 'bg-rose-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-400 ease-in-out ${
                      enableThinking ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {enableThinking && !modelSupportsThinking && (
                <p className="text-xs text-amber-600/80 bg-amber-50/60 rounded-lg px-2.5 py-1.5 animate-fadeInSoft">
                  当前模型可能不支持深度思考。已知支持的模型包括
                  DeepSeek-V3.2、Qwen3 系列、GLM-4.7
                  等，其他模型开启后 API
                  可能会忽略该参数或返回错误。
                </p>
              )}

              {enableThinking && (
                <div className="space-y-1.5 pt-1 animate-slideDown">
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
                      setThinkingBudget(Number(e.target.value))
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
          )}
        </div>

        {/* 开始按钮 */}
        <div className="mt-5">
          <button
            disabled={!canProceed}
            onClick={onAgreed}
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-full bg-rose-600 text-white px-6 py-2.5 text-sm font-medium shadow-sm hover:bg-rose-700 active:bg-rose-800 disabled:bg-rose-300 disabled:cursor-not-allowed transition-all duration-400"
          >
            我已阅读并同意，开始验证
          </button>
          <p className="mt-2 text-xs text-rose-900/40">
            点击即表示你已同意上述协议内容
          </p>
        </div>
      </div>

      {/* 协议弹窗 */}
      <AgreementModal open={showModal} onClose={closeModal} />

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn { animation: fadeIn 0.7s cubic-bezier(0.16, 1, 0.3, 1) both; }

        @keyframes fadeInSoft {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeInSoft { animation: fadeInSoft 0.6s ease-out both; }

        @keyframes slideDown {
          from { opacity: 0; max-height: 0; transform: translateY(-8px); }
          to   { opacity: 1; max-height: 500px; transform: translateY(0); }
        }
        .animate-slideDown { animation: slideDown 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }

        .custom-modal-scroll::-webkit-scrollbar { width: 4px; }
        .custom-modal-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-modal-scroll::-webkit-scrollbar-thumb { background: #fecdd3; border-radius: 2px; }
      `}</style>
    </div>
  )
}
