import { create } from 'zustand'
import { dbg, dbgGroup, dbgGroupEnd, dbgWarn, dbgTime, dbgTimeEnd } from '../utils/debug'

type ChatRole = 'system' | 'user' | 'assistant'

interface ChatMessage {
    role: ChatRole
    content: string
}

interface ChatRequestBody {
    model: string
    messages: ChatMessage[]
    stream?: boolean
    response_format?: { type: 'json_object' }
    max_tokens?: number
    temperature?: number
    top_p?: number
    enable_thinking?: boolean
    thinking_budget?: number
}

interface SiliconFlowModelItem {
    id?: string
    name?: string
    model?: string
}

type SiliconFlowModelsResponse =
    | SiliconFlowModelItem[]
    | { data?: SiliconFlowModelItem[] }
    | { models?: SiliconFlowModelItem[] }

/**
 * 支持 enable_thinking 的模型列表
 * @see https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions#body-one-of-0-enable-thinking
 */
export const THINKING_SUPPORTED_MODELS: string[] = [
    'Pro/zai-org/GLM-4.7',
    'deepseek-ai/DeepSeek-V3.2',
    'Pro/deepseek-ai/DeepSeek-V3.2',
    'zai-org/GLM-4.6',
    'Qwen/Qwen3-8B',
    'Qwen/Qwen3-14B',
    'Qwen/Qwen3-32B',
    'Qwen/Qwen3-30B-A3B',
    'tencent/Hunyuan-A13B-Instruct',
    'zai-org/GLM-4.5V',
    'deepseek-ai/DeepSeek-V3.1-Terminus',
    'Pro/deepseek-ai/DeepSeek-V3.1-Terminus',
]

/** 检查模型是否支持 enable_thinking */
export function isThinkingSupported(model: string): boolean {
    return THINKING_SUPPORTED_MODELS.some(
        (m) => m.toLowerCase() === model.toLowerCase()
    )
}

/* ── 类型守卫 ── */

function isString(value: unknown): value is string {
    return typeof value === 'string'
}

function isModelItemArray(value: unknown): value is SiliconFlowModelItem[] {
    return Array.isArray(value)
}

function hasDataArray(
    value: unknown
): value is { data: SiliconFlowModelItem[] } {
    return (
        typeof value === 'object' &&
        value !== null &&
        Array.isArray((value as { data?: unknown }).data)
    )
}

function hasModelsArray(
    value: unknown
): value is { models: SiliconFlowModelItem[] } {
    return (
        typeof value === 'object' &&
        value !== null &&
        Array.isArray((value as { models?: unknown }).models)
    )
}

/* ── SSE 流解析 ── */

interface SSEParseResult {
    content: string
    reasoningContent: string
}

/**
 * 解析 SiliconFlow SSE 流式响应
 *
 * 格式与 OpenAI 兼容:
 *   data: {"choices":[{"delta":{"content":"...","reasoning_content":"..."}}]}
 *   data: [DONE]
 */
async function parseSSEStream(
    response: Response,
    onDelta: (accumulated: { content: string; reasoning: string }) => void
): Promise<SSEParseResult> {
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let content = ''
    let reasoning = ''

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // 保留不完整行

        for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || !trimmed.startsWith('data: ')) continue
            const data = trimmed.slice(6)
            if (data === '[DONE]') continue

            try {
                const chunk = JSON.parse(data)
                const delta = chunk.choices?.[0]?.delta
                if (delta?.content) {
                    content += delta.content
                }
                if (delta?.reasoning_content) {
                    reasoning += delta.reasoning_content
                }
                // 每个 delta 都回调
                onDelta({ content, reasoning })
            } catch {
                // 部分 JSON 解析失败忽略
            }
        }
    }

    return { content, reasoningContent: reasoning }
}

/* ── 请求选项类型 ── */

export interface LLMRequestOptions {
    jsonMode?: boolean
    max_tokens?: number
    temperature?: number
    top_p?: number
    enableThinking?: boolean
    thinkingBudget?: number
}

export interface LLMRequestResult {
    content: string
    reasoningContent?: string
    parsed?: unknown
    raw: unknown
}

/** LLM商店接口 */
export interface LLMStore {
    isGenerating: boolean
    setIsGenerating: (isGenerating: boolean) => void
    apiKey: string
    setApiKey: (apiKey: string) => void
    apiUrl: string
    setApiUrl: (apiUrl: string) => void
    apiModel: string
    setApiModel: (apiModel: string) => void
    llmModelList: string[]
    setLlmModelList: () => Promise<void>
    enableThinking: boolean
    setEnableThinking: (enable: boolean) => void
    thinkingBudget: number
    setThinkingBudget: (budget: number) => void
    /** 流式输出：实时累积的 content 文本 */
    streamingText: string
    /** 流式输出：实时累积的 reasoning_content 文本 */
    streamingReasoning: string
    /** 当前流式阶段标签（用于 UI 显示） */
    streamingPhase: string
    request: (
        messages: ChatMessage[],
        options?: LLMRequestOptions
    ) => Promise<LLMRequestResult>
}

/** LLM商店 */
export const useLLMStore = create<LLMStore>((set, get) => ({
    isGenerating: false,
    setIsGenerating: (isGenerating: boolean) => set({ isGenerating }),
    apiKey: '',
    setApiKey: (apiKey: string) => set({ apiKey }),
    apiUrl: 'https://api.siliconflow.cn/v1/chat/completions',
    setApiUrl: (apiUrl: string) => set({ apiUrl }),
    apiModel: 'deepseek-ai/DeepSeek-V3.2-Exp',
    setApiModel: (apiModel: string) => set({ apiModel }),
    llmModelList: [],
    setLlmModelList: async () => {
        const apiKey = get().apiKey
        if (!apiKey) {
            set({ llmModelList: [] })
            return
        }
        dbg('拉取模型列表…')
        try {
            const resp = await fetch('https://api.siliconflow.cn/v1/models', {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                },
            })
            const json: SiliconFlowModelsResponse | unknown = await resp.json()

            const extractName = (
                item?: SiliconFlowModelItem
            ): string | undefined =>
                (item && (item.id || item.name || item.model)) || undefined

            let names: string[] = []
            if (isModelItemArray(json)) {
                names = json.map(extractName).filter(isString)
            } else if (hasDataArray(json)) {
                names = json.data.map(extractName).filter(isString)
            } else if (hasModelsArray(json)) {
                names = json.models.map(extractName).filter(isString)
            }

            dbg(`获取到 ${names.length} 个模型`)
            set({ llmModelList: names })

            const currentModel = get().apiModel
            if (!currentModel && names.length > 0) {
                set({ apiModel: names[0] })
            }
        } catch (e) {
            dbgWarn('拉取模型列表失败', e)
            set({ llmModelList: [] })
        }
    },

    enableThinking: false,
    setEnableThinking: (enable: boolean) => set({ enableThinking: enable }),
    thinkingBudget: 4096,
    setThinkingBudget: (budget: number) =>
        set({ thinkingBudget: Math.max(128, Math.min(32768, budget)) }),

    streamingText: '',
    streamingReasoning: '',
    streamingPhase: '',

    request: async (
        messages: ChatMessage[],
        options?: LLMRequestOptions
    ) => {
        const { apiUrl, apiKey, apiModel, enableThinking, thinkingBudget } =
            get()
        const useStreaming = __DEBUG__

        // 清空流式状态
        set({
            isGenerating: true,
            streamingText: '',
            streamingReasoning: '',
        })

        const model = apiModel || 'deepseek-ai/DeepSeek-V3.2-Exp'

        dbgGroup(`LLM 请求 → ${model}`)
        dbg('streaming:', useStreaming)
        dbg('jsonMode:', options?.jsonMode ?? false)
        dbg('enable_thinking:', options?.enableThinking ?? enableThinking)
        dbg('messages:', messages)
        dbgGroupEnd()

        dbgTime('LLM 请求耗时')

        try {
            const body: ChatRequestBody = {
                model,
                messages,
                stream: useStreaming,
            }

            if (options?.jsonMode) {
                body.response_format = { type: 'json_object' }
            }
            if (typeof options?.max_tokens === 'number')
                body.max_tokens = options.max_tokens
            if (typeof options?.temperature === 'number')
                body.temperature = options.temperature
            if (typeof options?.top_p === 'number') body.top_p = options.top_p

            const wantThinking =
                options?.enableThinking ?? enableThinking
            body.enable_thinking = wantThinking
            if (wantThinking) {
                const budget = options?.thinkingBudget ?? thinkingBudget
                body.thinking_budget = Math.max(128, Math.min(32768, budget))
            }

            dbg('请求体:', body)

            const resp = await fetch(
                apiUrl || 'https://api.siliconflow.cn/v1/chat/completions',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(apiKey
                            ? { Authorization: `Bearer ${apiKey}` }
                            : {}),
                    },
                    body: JSON.stringify(body),
                }
            )

            /* ── 流式响应 ── */
            if (useStreaming && resp.ok && resp.body) {
                const sseResult = await parseSSEStream(
                    resp,
                    ({ content, reasoning }) => {
                        set({
                            streamingText: content,
                            streamingReasoning: reasoning,
                        })
                    }
                )

                dbgTimeEnd('LLM 请求耗时')
                dbgGroup('LLM 流式响应完成')
                dbg('content 长度:', sseResult.content.length)
                dbg('reasoning 长度:', sseResult.reasoningContent.length)
                if (sseResult.content.length < 2000) {
                    dbg('content:', sseResult.content)
                }
                dbgGroupEnd()

                let parsed: unknown = undefined
                if (options?.jsonMode && sseResult.content) {
                    try {
                        parsed = JSON.parse(sseResult.content)
                    } catch {
                        dbgWarn('JSON 解析失败，尝试清理…')
                        // 尝试清理 code fence
                        const cleaned = sseResult.content
                            .trim()
                            .replace(/^```(?:json)?\s*\n?/, '')
                            .replace(/\n?\s*```$/, '')
                        try {
                            parsed = JSON.parse(cleaned)
                        } catch {
                            parsed = undefined
                        }
                    }
                    dbg('parsed:', parsed)
                }

                return {
                    content: sseResult.content,
                    reasoningContent: sseResult.reasoningContent || undefined,
                    parsed,
                    raw: { streaming: true },
                }
            }

            /* ── 非流式响应 / 回退 ── */
            const data = await resp.json()
            if (!resp.ok) {
                const message =
                    (data && (data.error?.message || data.message)) ||
                    'LLM 请求失败'
                dbgWarn('LLM 错误:', message, data)
                throw new Error(message)
            }

            dbgTimeEnd('LLM 请求耗时')

            const content: string =
                (data?.choices?.[0]?.message?.content as string) || ''
            const reasoningContent: string | undefined =
                (data?.choices?.[0]?.message?.reasoning_content as
                    | string
                    | undefined) || undefined

            dbgGroup('LLM 非流式响应')
            dbg('content 长度:', content.length)
            if (content.length < 2000) dbg('content:', content)
            if (reasoningContent) dbg('reasoning 长度:', reasoningContent.length)
            dbg('usage:', data?.usage)
            dbgGroupEnd()

            let parsed: unknown = undefined
            if (options?.jsonMode && content) {
                try {
                    parsed = JSON.parse(content)
                } catch {
                    parsed = undefined
                }
                dbg('parsed:', parsed)
            }

            return { content, reasoningContent, parsed, raw: data }
        } catch (e) {
            dbgTimeEnd('LLM 请求耗时')
            throw e
        } finally {
            set({ isGenerating: false })
        }
    },
}))

interface LLMStoreHook {
    isGenerating: boolean
    setIsGenerating: (isGenerating: boolean) => void
    apiKey: string
    setApiKey: (apiKey: string) => void
    apiModel: string
    setApiModel: (apiModel: string) => void
    llmModelList: string[]
    enableThinking: boolean
    setEnableThinking: (enable: boolean) => void
    thinkingBudget: number
    setThinkingBudget: (budget: number) => void
}

/** LLM商店 Hook */
export const useLLMStoreHook: () => LLMStoreHook = () => {
    const {
        isGenerating,
        setIsGenerating,
        apiKey,
        setApiKey,
        apiModel,
        setApiModel,
        llmModelList,
        enableThinking,
        setEnableThinking,
        thinkingBudget,
        setThinkingBudget,
    } = useLLMStore()

    return {
        isGenerating,
        setIsGenerating,
        apiKey,
        setApiKey,
        apiModel,
        setApiModel,
        llmModelList,
        enableThinking,
        setEnableThinking,
        thinkingBudget,
        setThinkingBudget,
    }
}

export default useLLMStoreHook
