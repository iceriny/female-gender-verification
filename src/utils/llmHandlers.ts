import { useLLMStore } from '../store/LLMStore'
import type { Question } from '../store/questionStore'
import { PROMPT_SYSTEM } from '../const/prompt'

export interface LLMQaItem {
    Q: string
    A?: string
    single_confidence?: number
}

export interface LLMStructuredResult {
    QA: LLMQaItem[]
    confidence?: number
    pass?: boolean
}

const JSON_SCHEMA_TEXT = `{
  "type": "object",
  "properties": {
    "QA": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "Q": { "type": "string" },
          "A": { "type": "string" },
          "single_confidence": { "type": "number" }
        },
        "required": ["Q"],
        "propertyOrdering": ["Q", "A", "single_confidence"]
      }
    },
    "confidence": { "type": "number" },
    "pass": { "type": "boolean" }
  },
  "required": ["QA"],
  "propertyOrdering": ["QA", "confidence", "pass"]
}`

function buildJsonModeSystemPrompt(): string {
    return [
        'You are a helpful assistant designed to output JSON only.',
        '严格输出合法 JSON。不要返回除 JSON 之外的任何文字、解释、Markdown、代码块围栏或注释。',
        '输出必须是一个完整的 JSON 对象，且字段与类型需遵循下列 JSON Schema。',
        '字段顺序尽量遵循 propertyOrdering 的顺序（若模型不保证顺序也必须可被机器解析）。',
        '请勿在值中包含多余的转义或尾随逗号。',
        'Schema: ```json',
        JSON_SCHEMA_TEXT,
        '```',
    ].join('\n')
}

function ensureStructured(result: unknown): LLMStructuredResult | null {
    if (!result || typeof result !== 'object') return null
    const obj = result as { [k: string]: unknown }
    const qa = Array.isArray(obj.QA) ? (obj.QA as unknown[]) : []
    const QA: LLMQaItem[] = qa
        .map((x) => {
            if (!x || typeof x !== 'object') return null
            const item = x as { [k: string]: unknown }
            const Q = typeof item.Q === 'string' ? item.Q.trim() : ''
            const A = typeof item.A === 'string' ? item.A : undefined
            const sc =
                typeof item.single_confidence === 'number'
                    ? item.single_confidence
                    : undefined
            if (!Q) return null
            return { Q, A, single_confidence: sc }
        })
        .filter(Boolean) as LLMQaItem[]

    const confidence =
        typeof (obj as { confidence?: unknown }).confidence === 'number'
            ? (obj as { confidence: number }).confidence
            : undefined
    const pass =
        typeof (obj as { pass?: unknown }).pass === 'boolean'
            ? (obj as { pass: boolean }).pass
            : undefined

    if (QA.length === 0) return null
    return { QA, confidence, pass }
}

export async function generateQuestionsViaLLM(count = 10): Promise<Question[]> {
    const { request } = useLLMStore.getState()
    const system = [
        buildJsonModeSystemPrompt(),
        '以下是场景与出题要求：',
        PROMPT_SYSTEM,
        `只返回 JSON，不要任何额外文本。题目数量：${count}。`,
        'QA 中每个元素至少包含字段 Q（问题文案）。初次生成时可不返回 A 与 single_confidence。',
    ].join('\n\n')

    const res = await request(
        [
            { role: 'system', content: system },
            { role: 'user', content: '请生成题目，严格以 JSON 返回。' },
        ],
        { jsonMode: true, max_tokens: 2048 }
    )

    const structured = ensureStructured(res.parsed)
    if (!structured) return []
    return structured.QA.map((item, idx) => ({
        id: idx + 1,
        question: item.Q,
        answer: '',
        confidence: 0,
    }))
}

export interface EvaluationResult {
    questions: Question[]
    overallConfidence: number
    passed: boolean
    referenceQA: { Q: string; A?: string; single_confidence?: number }[]
}

export async function evaluateAnswersViaLLM(
    questions: Question[]
): Promise<EvaluationResult | null> {
    const { request } = useLLMStore.getState()
    const qaUserView = questions.map((q) => ({
        Q: q.question,
        userA: q.answer,
    }))

    const system = [
        buildJsonModeSystemPrompt(),
        '对用户回答进行核验：',
        '对于每个 QA，返回：',
        '- Q: 原题目',
        '- A: 标准或参考答案（如为开放题，请给出合理的女性视角参考答案或答案要点）',
        '- single_confidence: 针对该题回答判断为女性的置信度（0~1）',
        '并在顶层给出 overall：',
        '- confidence: 综合判断为女性的置信度（0~1）',
        '- pass: 是否通过验证（布尔值）',
        '严格仅输出 JSON 对象。',
    ].join('\n')

    const user = [
        '请根据用户的作答进行判断，以下是用户的回答：',
        JSON.stringify(qaUserView, null, 2),
        '仅返回符合 Schema 的 JSON。',
    ].join('\n\n')

    const res = await request(
        [
            { role: 'system', content: system },
            { role: 'user', content: user },
        ],
        { jsonMode: true, max_tokens: 2048 }
    )

    const structured = ensureStructured(res.parsed)
    if (!structured) return null

    const merged: Question[] = questions.map((q) => {
        const matched = structured.QA.find(
            (x) => x.Q.trim() === q.question.trim()
        )
        return {
            ...q,
            confidence:
                typeof matched?.single_confidence === 'number'
                    ? matched.single_confidence
                    : q.confidence,
            // 若需要展示参考答案，可在 UI 中使用 structured.QA
        }
    })

    return {
        questions: merged,
        overallConfidence:
            typeof structured.confidence === 'number'
                ? structured.confidence
                : 0,
        passed: typeof structured.pass === 'boolean' ? structured.pass : false,
        referenceQA: structured.QA,
    }
}
