import { useLLMStore } from '../store/LLMStore'
import type { Question, FollowUpQuestion } from '../store/questionStore'
import { useQuestionStore } from '../store/questionStore'
import {
    PROMPT_GENERATE,
    PROMPT_EVALUATE,
    PROMPT_FOLLOWUP,
} from '../const/prompt'
import {
    dbg,
    dbgGroup,
    dbgGroupEnd,
    dbgWarn,
    dbgTime,
    dbgTimeEnd,
} from './debug'

/* ── 类型定义 ── */

export interface LLMQaItem {
    Q: string
    A?: string
    single_confidence?: number
}

export interface LLMFollowUpItem {
    originalIndex: number
    originalQuestion: string
    originalAnswer: string
    followUpQuestion: string
}

export interface LLMStructuredResult {
    QA: LLMQaItem[]
    confidence?: number
    pass?: boolean
}

export interface LLMFollowUpResult {
    followUps: LLMFollowUpItem[]
}

export interface EvaluationResult {
    questions: Question[]
    overallConfidence: number
    passed: boolean
    referenceQA: { Q: string; A?: string; single_confidence?: number }[]
    reasoningContent?: string
}

/* ── JSON Schema（硅基流动 json_object 模式） ── */

const JSON_SCHEMA_DESCRIPTION = `你必须严格按照以下 JSON 结构输出，不要输出除 JSON 之外的任何文字：
{
  "QA": [
    {
      "Q": "题目文本",
      "A": "参考答案（生成题目时可省略）",
      "single_confidence": 0.0到1.0之间的数字（生成题目时可省略）
    }
  ],
  "confidence": 0.0到1.0之间的数字（生成题目时可省略）,
  "pass": true或false（生成题目时可省略）
}

字段说明:
- QA: 必填，题目数组
- QA[].Q: 必填，题目内容
- QA[].A: 参考答案，评估时必填
- QA[].single_confidence: 单题置信度(0-1)，评估时必填
- confidence: 综合置信度(0-1)，评估时必填
- pass: 是否通过验证，评估时必填`

const JSON_SCHEMA_FOLLOWUP = `你必须严格按照以下 JSON 结构输出，不要输出除 JSON 之外的任何文字：
{
  "followUps": [
    {
      "originalIndex": 题目序号(1-based),
      "originalQuestion": "原始题目",
      "originalAnswer": "用户原始回答",
      "followUpQuestion": "你的追问"
    }
  ]
}

字段说明:
- followUps: 必填，追问数组，包含 2-3 条追问
- originalIndex: 原始题目序号（从1开始）
- originalQuestion: 原始题目文本
- originalAnswer: 用户的原始回答
- followUpQuestion: 基于用户回答设计的追问`

/* ── 辅助函数 ── */

function jsonModePrefix(): string {
    return [
        '你是一个只输出 JSON 的助手。',
        '严格输出合法 JSON 对象。禁止输出任何解释、Markdown 格式、代码块围栏、注释或多余文字。',
        '禁止在 JSON 值中包含多余转义或尾随逗号。',
        '',
        JSON_SCHEMA_DESCRIPTION,
    ].join('\n')
}

function jsonModePrefixFollowUp(): string {
    return [
        '你是一个只输出 JSON 的助手。',
        '严格输出合法 JSON 对象。禁止输出任何解释、Markdown 格式、代码块围栏、注释或多余文字。',
        '禁止在 JSON 值中包含多余转义或尾随逗号。',
        '',
        JSON_SCHEMA_FOLLOWUP,
    ].join('\n')
}

function safeJsonParse(text: string): unknown {
    let cleaned = text.trim()
    const fenceMatch = cleaned.match(
        /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/
    )
    if (fenceMatch) {
        cleaned = fenceMatch[1].trim()
    }
    return JSON.parse(cleaned)
}

function ensureStructured(rawParsed: unknown): LLMStructuredResult | null {
    if (!rawParsed || typeof rawParsed !== 'object') return null
    const obj = rawParsed as Record<string, unknown>

    const qaRaw = Array.isArray(obj.QA) ? obj.QA : []
    const QA: LLMQaItem[] = qaRaw
        .map((x: unknown) => {
            if (!x || typeof x !== 'object') return null
            const item = x as Record<string, unknown>
            const Q = typeof item.Q === 'string' ? item.Q.trim() : ''
            if (!Q) return null
            return {
                Q,
                A: typeof item.A === 'string' ? item.A : undefined,
                single_confidence:
                    typeof item.single_confidence === 'number'
                        ? item.single_confidence
                        : undefined,
            }
        })
        .filter(Boolean) as LLMQaItem[]

    if (QA.length === 0) return null

    return {
        QA,
        confidence:
            typeof obj.confidence === 'number' ? obj.confidence : undefined,
        pass: typeof obj.pass === 'boolean' ? obj.pass : undefined,
    }
}

function ensureFollowUps(rawParsed: unknown): LLMFollowUpItem[] {
    if (!rawParsed || typeof rawParsed !== 'object') return []
    const obj = rawParsed as Record<string, unknown>

    const raw = Array.isArray(obj.followUps) ? obj.followUps : []
    return raw
        .map((x: unknown) => {
            if (!x || typeof x !== 'object') return null
            const item = x as Record<string, unknown>
            const followUpQuestion =
                typeof item.followUpQuestion === 'string'
                    ? item.followUpQuestion.trim()
                    : ''
            if (!followUpQuestion) return null
            return {
                originalIndex:
                    typeof item.originalIndex === 'number'
                        ? item.originalIndex
                        : 0,
                originalQuestion:
                    typeof item.originalQuestion === 'string'
                        ? item.originalQuestion
                        : '',
                originalAnswer:
                    typeof item.originalAnswer === 'string'
                        ? item.originalAnswer
                        : '',
                followUpQuestion,
            }
        })
        .filter(Boolean) as LLMFollowUpItem[]
}

/* ── 公开 API ── */

/**
 * 调用 LLM 生成验证题目
 */
export async function generateQuestionsViaLLM(
    count = 10
): Promise<Question[]> {
    const store = useLLMStore.getState()

    // 设置流式阶段标签
    useLLMStore.setState({ streamingPhase: '生成题目' })

    const systemContent = [
        jsonModePrefix(),
        '',
        '--- 以下是你的出题任务 ---',
        '',
        PROMPT_GENERATE,
        '',
        `请生成 ${count} 道题目。`,
        '只需返回 QA 数组，每个元素包含 Q 字段即可，无需 A、single_confidence、confidence、pass。',
    ].join('\n')

    const messages = [
        { role: 'system' as const, content: systemContent },
        {
            role: 'user' as const,
            content: `请生成 ${count} 道女性性别验证题目，严格按 JSON 格式返回。`,
        },
    ]

    dbgGroup('generateQuestionsViaLLM')
    dbg('题目数量:', count)
    dbg('system prompt 长度:', systemContent.length)
    dbgGroupEnd()

    dbgTime('生成题目')
    const res = await store.request(messages, {
        jsonMode: true,
        max_tokens: 3072,
        temperature: 0.85,
    })
    dbgTimeEnd('生成题目')

    let structured = ensureStructured(res.parsed)
    if (!structured && res.content) {
        dbgWarn('parsed 为空，尝试手动解析 content…')
        try {
            structured = ensureStructured(safeJsonParse(res.content))
        } catch {
            dbgWarn('手动解析也失败')
        }
    }

    if (!structured || structured.QA.length === 0) {
        dbgWarn('未获取到有效题目，content:', res.content.slice(0, 500))
        throw new Error('LLM 未返回有效题目，请重试')
    }

    const questions = structured.QA.map((item, idx) => ({
        id: idx + 1,
        question: item.Q,
        answer: '',
        confidence: 0,
    }))

    dbgGroup(`成功生成 ${questions.length} 道题目`)
    questions.forEach((q, i) => dbg(`  ${i + 1}. ${q.question}`))
    dbgGroupEnd()

    useLLMStore.setState({ streamingPhase: '' })
    return questions
}

/**
 * 调用 LLM 生成追问题目（基于用户第一轮回答）
 */
export async function generateFollowUpViaLLM(
    questions: Question[]
): Promise<FollowUpQuestion[]> {
    const store = useLLMStore.getState()

    useLLMStore.setState({ streamingPhase: '生成追问' })

    const qaForLLM = questions.map((q, idx) => ({
        index: idx + 1,
        Q: q.question,
        userAnswer: q.answer || '（未作答）',
    }))

    const systemContent = [
        jsonModePrefixFollowUp(),
        '',
        '--- 以下是你的追问任务 ---',
        '',
        PROMPT_FOLLOWUP,
    ].join('\n')

    const userContent = [
        '以下是用户第一轮的题目与回答，请选择 2-3 道进行追问：',
        '',
        JSON.stringify(qaForLLM, null, 2),
        '',
        '请严格按照 JSON 格式返回追问结果。',
    ].join('\n')

    const messages = [
        { role: 'system' as const, content: systemContent },
        { role: 'user' as const, content: userContent },
    ]

    dbgGroup('generateFollowUpViaLLM')
    dbg('原始题目数:', questions.length)
    dbgGroupEnd()

    dbgTime('生成追问')
    const res = await store.request(messages, {
        jsonMode: true,
        max_tokens: 2048,
        temperature: 0.7,
    })
    dbgTimeEnd('生成追问')

    let followUps: LLMFollowUpItem[] = []
    if (res.parsed) {
        followUps = ensureFollowUps(res.parsed)
    }
    if (followUps.length === 0 && res.content) {
        dbgWarn('parsed 为空，尝试手动解析追问 content…')
        try {
            followUps = ensureFollowUps(safeJsonParse(res.content))
        } catch {
            dbgWarn('追问手动解析也失败')
        }
    }

    if (followUps.length === 0) {
        dbgWarn('未获取到有效追问')
        useLLMStore.setState({ streamingPhase: '' })
        return []
    }

    const result: FollowUpQuestion[] = followUps.map((fu) => ({
        originalIndex: fu.originalIndex,
        originalQuestion: fu.originalQuestion,
        originalAnswer: fu.originalAnswer,
        followUpQuestion: fu.followUpQuestion,
        followUpAnswer: '',
    }))

    dbgGroup(`成功生成 ${result.length} 条追问`)
    result.forEach((fu, i) =>
        dbg(
            `  ${i + 1}. [原题${fu.originalIndex}] ${fu.followUpQuestion}`
        )
    )
    dbgGroupEnd()

    useLLMStore.setState({ streamingPhase: '' })
    return result
}

/**
 * 调用 LLM 评估用户的答案（含行为数据和追问数据）
 */
export async function evaluateAnswersViaLLM(
    questions: Question[]
): Promise<EvaluationResult | null> {
    const store = useLLMStore.getState()
    const qStore = useQuestionStore.getState()

    useLLMStore.setState({ streamingPhase: '评估答案' })

    // 构建包含行为数据的题目视图
    const qaUserView = questions.map((q) => ({
        Q: q.question,
        userAnswer: q.answer || '（未作答）',
        timeSpent: q.timeSpent ?? null,
    }))

    // 构建追问数据
    const followUps = qStore.followUpQuestions
    const followUpView =
        followUps.length > 0
            ? followUps.map((fu) => ({
                  originalIndex: fu.originalIndex,
                  originalQuestion: fu.originalQuestion,
                  originalAnswer: fu.originalAnswer,
                  followUpQuestion: fu.followUpQuestion,
                  followUpAnswer: fu.followUpAnswer || '（未作答）',
                  timeSpent: fu.timeSpent ?? null,
              }))
            : null

    const systemContent = [
        jsonModePrefix(),
        '',
        '--- 以下是你的评估任务 ---',
        '',
        PROMPT_EVALUATE,
        '',
        '请对以下用户回答逐题评估，并给出完整的 JSON 结果（包含 QA、confidence、pass）。',
    ].join('\n')

    const userParts = [
        '以下是用户的题目与回答，请逐题评估：',
        '',
        JSON.stringify(qaUserView, null, 2),
    ]

    // 附带行为数据
    userParts.push(
        '',
        `行为数据：答题期间页面切换次数 = ${qStore.tabSwitchCount}`
    )

    // 附带追问数据
    if (followUpView) {
        userParts.push(
            '',
            '以下是追问环节的题目与回答：',
            '',
            JSON.stringify(followUpView, null, 2)
        )
    }

    userParts.push('', '请严格按照 JSON Schema 返回评估结果。')

    const userContent = userParts.join('\n')

    const messages = [
        { role: 'system' as const, content: systemContent },
        { role: 'user' as const, content: userContent },
    ]

    dbgGroup('evaluateAnswersViaLLM')
    dbg('题目数:', questions.length)
    dbg('追问数:', followUps.length)
    dbg('页面切换:', qStore.tabSwitchCount)
    dbg('用户作答:', qaUserView)
    if (followUpView) dbg('追问作答:', followUpView)
    dbgGroupEnd()

    dbgTime('评估答案')
    const res = await store.request(messages, {
        jsonMode: true,
        max_tokens: 4096,
        temperature: 0.3,
    })
    dbgTimeEnd('评估答案')

    let structured = ensureStructured(res.parsed)
    if (!structured && res.content) {
        dbgWarn('parsed 为空，尝试手动解析…')
        try {
            structured = ensureStructured(safeJsonParse(res.content))
        } catch {
            dbgWarn('手动解析也失败')
        }
    }

    if (!structured) {
        dbgWarn('评估失败，无有效结构化数据')
        useLLMStore.setState({ streamingPhase: '' })
        return null
    }

    const merged: Question[] = questions.map((q, idx) => {
        const byIdx = structured!.QA[idx]
        const byText = structured!.QA.find(
            (x) =>
                x.Q.trim() === q.question.trim() ||
                x.Q.includes(q.question.slice(0, 15))
        )
        const matched = byIdx || byText
        return {
            ...q,
            confidence:
                typeof matched?.single_confidence === 'number'
                    ? matched.single_confidence
                    : q.confidence,
        }
    })

    const result: EvaluationResult = {
        questions: merged,
        overallConfidence:
            typeof structured.confidence === 'number'
                ? structured.confidence
                : 0,
        passed: typeof structured.pass === 'boolean' ? structured.pass : false,
        referenceQA: structured.QA,
        reasoningContent: res.reasoningContent,
    }

    dbgGroup('评估结果')
    dbg('总置信度:', result.overallConfidence)
    dbg('是否通过:', result.passed)
    result.referenceQA.forEach((qa, i) =>
        dbg(
            `  ${i + 1}. [${qa.single_confidence ?? '?'}] ${qa.Q} → ${qa.A ?? '(无参考)'}`
        )
    )
    dbgGroupEnd()

    useLLMStore.setState({ streamingPhase: '' })
    return result
}
