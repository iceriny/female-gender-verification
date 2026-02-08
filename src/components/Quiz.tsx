import { useEffect, useCallback, useMemo, useRef, useState } from 'react'
import { useQuestionStoreHook } from '../store/questionStore'
import {
    generateQuestionsViaLLM,
    evaluateAnswersViaLLM,
} from '../utils/llmHandlers'
import type { EvaluationResult } from '../utils/llmHandlers'
import DebugStreamPanel from './DebugStreamPanel'

interface QuizProps {
    onDone: (result: {
        overallConfidence: number
        passed: boolean
        referenceQA?: EvaluationResult['referenceQA']
    }) => void
}

export default function Quiz({ onDone }: QuizProps) {
    const {
        questions,
        updateQuestions,
        currentQuestionIndex,
        setCurrentQuestionIndex,
        updateAnswer,
        isLoading,
        setIsLoading,
    } = useQuestionStoreHook()

    const [error, setError] = useState<string | null>(null)
    const [localAnswer, setLocalAnswer] = useState('')
    const [direction, setDirection] = useState<'next' | 'prev'>('next')
    const [animKey, setAnimKey] = useState(0)
    const [submitting, setSubmitting] = useState(false)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const generatedRef = useRef(false)

    const total = questions.length || 10
    const progress = useMemo(() => {
        if (questions.length === 0) return 0
        return Math.round(((currentQuestionIndex + 1) / total) * 100)
    }, [currentQuestionIndex, total, questions.length])

    // 生成题目（仅一次）
    useEffect(() => {
        if (questions.length > 0 || generatedRef.current) return
        generatedRef.current = true
        setIsLoading(true)
        ;(async () => {
            try {
                const qs = await generateQuestionsViaLLM(10)
                updateQuestions(qs)
            } catch (e) {
                setError((e as Error)?.message || '生成题目失败，请返回重试')
                generatedRef.current = false
            } finally {
                setIsLoading(false)
            }
        })()
    }, [questions.length, setIsLoading, updateQuestions])

    // 切换题目时同步本地答案 + 聚焦
    useEffect(() => {
        const current = questions[currentQuestionIndex]
        setLocalAnswer(current?.answer ?? '')
        // 延迟聚焦以配合动画
        const timer = setTimeout(() => textareaRef.current?.focus(), 350)
        return () => clearTimeout(timer)
    }, [currentQuestionIndex, questions])

    /** 保存当前答案到 store */
    const saveCurrentAnswer = useCallback(() => {
        const current = questions[currentQuestionIndex]
        if (current) {
            updateAnswer(current.id, localAnswer.trim())
        }
    }, [questions, currentQuestionIndex, localAnswer, updateAnswer])

    /** 下一题 */
    const handleNext = useCallback(() => {
        saveCurrentAnswer()
        if (currentQuestionIndex < questions.length - 1) {
            setDirection('next')
            setAnimKey((k) => k + 1)
            setCurrentQuestionIndex(currentQuestionIndex + 1)
        }
    }, [
        saveCurrentAnswer,
        currentQuestionIndex,
        questions.length,
        setCurrentQuestionIndex,
    ])

    /** 上一题 */
    const handlePrev = useCallback(() => {
        saveCurrentAnswer()
        if (currentQuestionIndex > 0) {
            setDirection('prev')
            setAnimKey((k) => k + 1)
            setCurrentQuestionIndex(currentQuestionIndex - 1)
        }
    }, [saveCurrentAnswer, currentQuestionIndex, setCurrentQuestionIndex])

    /** 提交所有答案 */
    const handleSubmit = useCallback(async () => {
        saveCurrentAnswer()
        setSubmitting(true)
        setIsLoading(true)
        setError(null)

        // 等一个 tick 让 store 写入完成
        await new Promise((r) => setTimeout(r, 50))

        try {
            // 从 store 重新获取最新的 questions（包含刚保存的答案）
            const { useQuestionStore } = await import('../store/questionStore')
            const latestQuestions = useQuestionStore.getState().questions
            const result = await evaluateAnswersViaLLM(latestQuestions)
            if (!result) throw new Error('评估失败，请重试')
            onDone({
                overallConfidence: result.overallConfidence,
                passed: result.passed,
                referenceQA: result.referenceQA,
            })
        } catch (e) {
            setError((e as Error)?.message || '评估失败')
        } finally {
            setSubmitting(false)
            setIsLoading(false)
        }
    }, [saveCurrentAnswer, setIsLoading, onDone])

    /** 键盘快捷键 */
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey && e.ctrlKey) {
                e.preventDefault()
                if (currentQuestionIndex < questions.length - 1) {
                    handleNext()
                } else {
                    void handleSubmit()
                }
            }
        },
        [currentQuestionIndex, questions.length, handleNext, handleSubmit]
    )

    const current = questions[currentQuestionIndex]
    const isLast = currentQuestionIndex === questions.length - 1
    const answeredCount = questions.filter((q) => q.answer.trim()).length

    /* ── 加载中状态 ── */
    if (isLoading && questions.length === 0) {
        return (
            <div className="min-h-dvh bg-gradient-to-b from-rose-50 to-white">
                <div className="max-w-2xl mx-auto px-4 py-16">
                    <div className="text-center space-y-4">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-rose-100">
                            <svg
                                className="w-6 h-6 text-rose-500 animate-spin"
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
                        </div>
                        <p className="text-rose-800/80 text-sm">
                            正在生成验证题目，请稍候…
                        </p>
                    </div>
                    <DebugStreamPanel />
                </div>
            </div>
        )
    }

    /* ── 错误状态 ── */
    if (error && questions.length === 0) {
        return (
            <div className="min-h-dvh flex items-center justify-center bg-gradient-to-b from-rose-50 to-white">
                <div className="text-center space-y-4 max-w-md px-6">
                    <div className="text-rose-600 text-sm">{error}</div>
                    <button
                        onClick={() => {
                            setError(null)
                            generatedRef.current = false
                            setIsLoading(true)
                            ;(async () => {
                                try {
                                    const qs =
                                        await generateQuestionsViaLLM(10)
                                    updateQuestions(qs)
                                } catch (e) {
                                    setError(
                                        (e as Error)?.message || '生成题目失败'
                                    )
                                } finally {
                                    setIsLoading(false)
                                }
                            })()
                        }}
                        className="inline-flex items-center justify-center rounded-full bg-rose-600 text-white px-5 py-2 text-sm font-medium shadow-sm hover:bg-rose-700 transition-colors"
                    >
                        重试
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-dvh bg-gradient-to-b from-rose-50 to-white">
            <div className="max-w-2xl mx-auto px-4 py-8">
                {/* ── 进度条 ── */}
                <div className="flex items-center justify-between mb-2">
                    <span className="text-rose-900/70 text-xs tabular-nums">
                        {currentQuestionIndex + 1} / {total}
                    </span>
                    <span className="text-rose-900/50 text-xs">
                        已答 {answeredCount} 题
                    </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-rose-100 overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-rose-400 to-rose-500 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${progress}%` }}
                    />
                </div>

                {/* ── 题目区域 ── */}
                <div className="mt-6">
                    {submitting ? (
                        <div>
                            <div className="bg-white/80 backdrop-blur rounded-2xl shadow-sm border border-rose-100 p-8 text-center">
                                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-rose-100 mb-3">
                                    <svg
                                        className="w-5 h-5 text-rose-500 animate-spin"
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
                                </div>
                                <p className="text-rose-800/80 text-sm">
                                    正在评估你的回答…
                                </p>
                            </div>
                            <DebugStreamPanel />
                        </div>
                    ) : current ? (
                        <div
                            key={animKey}
                            className={`bg-white/80 backdrop-blur rounded-2xl shadow-sm border border-rose-100 p-6 md:p-8 ${
                                direction === 'next'
                                    ? 'animate-slideInRight'
                                    : 'animate-slideInLeft'
                            }`}
                        >
                            <div className="flex items-baseline gap-3 mb-4">
                                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-rose-100 text-rose-600 text-sm font-medium shrink-0">
                                    {currentQuestionIndex + 1}
                                </span>
                                <p className="text-rose-900/90 leading-relaxed text-base md:text-lg">
                                    {current.question}
                                </p>
                            </div>

                            <textarea
                                ref={textareaRef}
                                className="w-full min-h-[7rem] rounded-xl border border-rose-200/80 bg-rose-50/30 p-3.5 text-sm text-rose-950 placeholder:text-rose-300 outline-none focus:ring-2 focus:ring-rose-300/60 focus:border-rose-300 resize-none transition-shadow"
                                placeholder="在此填写你的答案…"
                                value={localAnswer}
                                onChange={(e) => setLocalAnswer(e.target.value)}
                                onKeyDown={handleKeyDown}
                            />

                            <div className="mt-2 text-xs text-rose-400/80">
                                Ctrl + Enter{' '}
                                {isLast ? '提交' : '下一题'}
                            </div>

                            {error && (
                                <div className="mt-3 text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">
                                    {error}
                                </div>
                            )}

                            <div className="mt-5 flex items-center justify-between">
                                <button
                                    onClick={handlePrev}
                                    disabled={currentQuestionIndex === 0}
                                    className="inline-flex items-center gap-1.5 text-sm text-rose-600 hover:text-rose-700 disabled:text-rose-300 disabled:cursor-not-allowed transition-colors"
                                >
                                    <svg
                                        className="w-4 h-4"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth={2}
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M15 19l-7-7 7-7"
                                        />
                                    </svg>
                                    上一题
                                </button>

                                <button
                                    onClick={
                                        isLast
                                            ? () => void handleSubmit()
                                            : handleNext
                                    }
                                    disabled={!localAnswer.trim()}
                                    className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 text-white px-5 py-2 text-sm font-medium shadow-sm hover:bg-rose-700 disabled:bg-rose-300 disabled:cursor-not-allowed transition-colors"
                                >
                                    {isLast ? '提交验证' : '下一题'}
                                    {!isLast && (
                                        <svg
                                            className="w-4 h-4"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth={2}
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M9 5l7 7-7 7"
                                            />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>
                    ) : null}
                </div>

                {/* ── 题目导航圆点 ── */}
                {questions.length > 0 && !submitting && (
                    <div className="mt-6 flex items-center justify-center gap-1.5 flex-wrap">
                        {questions.map((q, idx) => {
                            const answered = q.answer.trim() !== ''
                            const active = idx === currentQuestionIndex
                            return (
                                <button
                                    key={q.id}
                                    onClick={() => {
                                        saveCurrentAnswer()
                                        setDirection(
                                            idx > currentQuestionIndex
                                                ? 'next'
                                                : 'prev'
                                        )
                                        setAnimKey((k) => k + 1)
                                        setCurrentQuestionIndex(idx)
                                    }}
                                    className={`w-7 h-7 rounded-full text-xs font-medium transition-all duration-200 ${
                                        active
                                            ? 'bg-rose-600 text-white scale-110 shadow-sm'
                                            : answered
                                              ? 'bg-rose-200 text-rose-700 hover:bg-rose-300'
                                              : 'bg-rose-100 text-rose-400 hover:bg-rose-200'
                                    }`}
                                    title={`第 ${idx + 1} 题${answered ? '（已答）' : ''}`}
                                >
                                    {idx + 1}
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>

            <style>{`
                @keyframes slideInRight {
                    from { opacity: 0; transform: translateX(24px); }
                    to   { opacity: 1; transform: translateX(0); }
                }
                @keyframes slideInLeft {
                    from { opacity: 0; transform: translateX(-24px); }
                    to   { opacity: 1; transform: translateX(0); }
                }
                .animate-slideInRight { animation: slideInRight 0.35s ease-out both; }
                .animate-slideInLeft  { animation: slideInLeft  0.35s ease-out both; }
            `}</style>
        </div>
    )
}
