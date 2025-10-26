import { useState, useEffect } from 'react'
import { useLLMStoreHook } from '../store/LLMStore'

interface AgreementProps {
    onAgreed: () => void
}

export default function Agreement({ onAgreed }: AgreementProps) {
    const { apiKey, setApiKey, apiModel, setApiModel, llmModelList } =
        useLLMStoreHook()
    const [touched, setTouched] = useState(false)
    const [loadingModels, setLoadingModels] = useState(false)
    const [localKey, setLocalKey] = useState('')

    // 首次：从 localStorage 读取
    useEffect(() => {
        const saved =
            typeof window !== 'undefined'
                ? localStorage.getItem('sf_api_key')
                : ''
        /** 如果 localStorage 有值，并且 apiKey 为空，则设置 apiKey */
        if (saved && !apiKey) {
            setLocalKey(saved)
            setApiKey(saved)
            ;(async () => {
                await import('../store/LLMStore').then((m) =>
                    m.useLLMStore.getState().setLlmModelList()
                )
            })()
        } else if (apiKey) {
            /** 如果 apiKey 有值，则设置 localKey */
            setLocalKey(apiKey)
        }
    }, [apiKey, setApiKey])

    const commitApiKeyOnBlur = async () => {
        const value = localKey.trim()
        setTouched(true)
        if (!value) return
        if (value !== apiKey) setApiKey(value)
        try {
            localStorage.setItem('sf_api_key', value)
        } catch {
            // ignore persistence errors
        }
        setLoadingModels(true)
        try {
            await import('../store/LLMStore').then((m) =>
                m.useLLMStore.getState().setLlmModelList()
            )
        } finally {
            setLoadingModels(false)
        }
    }

    const canProceed = Boolean(apiKey) && Boolean(apiModel)

    return (
        <div className="min-h-dvh flex items-center justify-center bg-linear-to-b from-rose-50 to-white">
            <div className="w-full max-w-xl mx-auto p-6 md:p-8 bg-white/90 backdrop-blur rounded-2xl shadow-lg border border-rose-100 transition-all">
                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-rose-900">
                    女性社区真实性别验证
                </h1>
                <p className="mt-2 text-rose-700/80">
                    为了守护社区氛围，请先阅读并同意以下协议与提示。
                </p>

                <div className="mt-6 space-y-3 text-sm text-rose-900/80">
                    <p>
                        1. 不会收集你的任何信息, 你所有的答案只会与 LLM
                        供应商进行交互, 如果你有对 LLM 供应商的顾虑,
                        请参考对方的隐私策略。
                    </p>
                    <p>
                        2. 验证题目与判断由大模型自动生成与评估，可能存在偏差。
                    </p>
                    <p>3. 结果仅供参考，不作为法律或医疗依据。</p>
                    <p>4. 如遇不适内容，请立即停止并联系管理员。</p>
                </div>

                <div className="mt-6 grid gap-4">
                    <div className="grid gap-2">
                        <label className="text-sm text-rose-900/80">
                            API Key（硅基流动）
                        </label>
                        <input
                            value={localKey}
                            onChange={(e) => setLocalKey(e.target.value)}
                            onBlur={commitApiKeyOnBlur}
                            placeholder="输入 https://cloud.siliconflow.cn 个人中心获取的 API Key"
                            className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-rose-300"
                        />
                        {touched && !localKey.trim() ? (
                            <span className="text-xs text-rose-500">
                                请输入 API Key
                            </span>
                        ) : null}
                    </div>

                    <div className="grid gap-2">
                        <label className="text-sm text-rose-900/80">
                            选择模型
                        </label>
                        <div className="relative">
                            <select
                                value={apiModel}
                                onChange={(e) => setApiModel(e.target.value)}
                                className="w-full appearance-none rounded-lg border border-rose-200 bg-white px-3 py-2 pr-8 outline-none focus:ring-2 focus:ring-rose-300"
                            >
                                <option value="">
                                    {loadingModels
                                        ? '加载可用模型…'
                                        : '请先写入 API Key'}
                                </option>
                                {llmModelList.map((m) => (
                                    <option key={m} value={m}>
                                        {m}
                                    </option>
                                ))}
                            </select>
                            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-rose-400">
                                ▾
                            </div>
                        </div>
                        <div className="text-xs text-rose-500/80">
                            {loadingModels
                                ? '正在根据 API Key 拉取可用模型…'
                                : '未选择时将使用默认模型'}
                        </div>
                    </div>
                </div>

                <div className="mt-8 flex items-center gap-3">
                    <button
                        disabled={!canProceed}
                        onClick={onAgreed}
                        className="inline-flex items-center justify-center rounded-full bg-rose-600 text-white px-5 py-2 font-medium shadow-sm hover:bg-rose-700 disabled:bg-rose-300 transition-colors"
                    >
                        我已阅读并同意，开始
                    </button>
                    <span className="text-xs text-rose-900/60">
                        点击即表示你已同意上述内容
                    </span>
                </div>
            </div>
        </div>
    )
}
