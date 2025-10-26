import { create } from 'zustand'

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

/** LLM商店接口 */
export interface LLMStore {
    /** 是否正在生成 */
    isGenerating: boolean
    /** 设置是否正在生成 */
    setIsGenerating: (isGenerating: boolean) => void
    /** API Key */
    apiKey: string
    /** 设置API Key */
    setApiKey: (apiKey: string) => void
    /** API URL */
    apiUrl: string
    /** 设置API URL */
    setApiUrl: (apiUrl: string) => void
    /** API Model */
    apiModel: string
    /** 设置API Model */
    setApiModel: (apiModel: string) => void
    /** LLM Model List */
    llmModelList: string[]
    /** 设置LLM Model List */
    setLlmModelList: () => Promise<void>
    /** 发起聊天请求（支持 JSON 模式） */
    request: (
        messages: ChatMessage[],
        options?: {
            jsonMode?: boolean
            max_tokens?: number
            temperature?: number
            top_p?: number
        }
    ) => Promise<{
        content: string
        parsed?: unknown
        raw: unknown
    }>
}

/** LLM商店 */
export const useLLMStore = create<LLMStore>((set, get) => ({
    isGenerating: false,
    setIsGenerating: (isGenerating: boolean) => set({ isGenerating }),
    apiKey: '',
    setApiKey: (apiKey: string) => set({ apiKey }),
    /** 默认硅基流动 ChatCompletions URL */
    apiUrl: 'https://api.siliconflow.cn/v1/chat/completions',
    setApiUrl: (apiUrl: string) => set({ apiUrl }),
    /** 默认模型（可被用户切换） */
    apiModel: 'deepseek-ai/DeepSeek-V3.2-Exp',
    setApiModel: (apiModel: string) => set({ apiModel }),
    llmModelList: [],
    setLlmModelList: async () => {
        const apiKey = get().apiKey
        if (!apiKey) {
            set({ llmModelList: [] })
            return
        }
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

            set({ llmModelList: names })

            const currentModel = get().apiModel
            if (!currentModel && names.length > 0) {
                set({ apiModel: names[0] })
            }
        } catch {
            set({ llmModelList: [] })
        }
    },
    request: async (
        messages: ChatMessage[],
        options?: {
            jsonMode?: boolean
            max_tokens?: number
            temperature?: number
            top_p?: number
        }
    ) => {
        const { apiUrl, apiKey, apiModel } = get()
        set({ isGenerating: true })
        try {
            const body: ChatRequestBody = {
                model: apiModel || 'deepseek-ai/DeepSeek-V3.2-Exp',
                messages,
                stream: false,
            }
            if (options?.jsonMode) {
                body.response_format = { type: 'json_object' }
            }
            if (typeof options?.max_tokens === 'number')
                body.max_tokens = options.max_tokens
            if (typeof options?.temperature === 'number')
                body.temperature = options.temperature
            if (typeof options?.top_p === 'number') body.top_p = options.top_p

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

            const data = await resp.json()
            if (!resp.ok) {
                const message =
                    (data && (data.error?.message || data.message)) ||
                    'LLM 请求失败'
                throw new Error(message)
            }

            const content: string =
                (data?.choices?.[0]?.message?.content as string) || ''

            let parsed: unknown = undefined
            if (options?.jsonMode && content) {
                try {
                    parsed = JSON.parse(content)
                } catch {
                    parsed = undefined
                }
            }

            return { content, parsed, raw: data }
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
    } = useLLMStore()

    /** 请求 LLM API */
    // 统一从 store 暴露的 request 使用

    return {
        isGenerating,
        setIsGenerating,
        apiKey,
        setApiKey,
        apiModel,
        setApiModel,
        llmModelList,
    }
}

export default useLLMStoreHook
