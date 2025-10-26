import { useEffect, useMemo, useState } from 'react'
import { useQuestionStoreHook } from '../store/questionStore'
import {
    generateQuestionsViaLLM,
    evaluateAnswersViaLLM,
} from '../utils/llmHandlers'

import type { EvaluationResult } from '../utils/llmHandlers'

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

    const total = questions.length || 10
    const progress = useMemo(() => {
        const current = Math.min(currentQuestionIndex + 1, total)
        return Math.round((current / total) * 100)
    }, [currentQuestionIndex, total])

    useEffect(() => {
        if (questions.length > 0) return
        setIsLoading(true)
        ;(async () => {
            try {
                const qs = await generateQuestionsViaLLM(10)
                updateQuestions(qs)
            } catch (e) {
                setError((e as Error)?.message || '生成题目失败')
            } finally {
                setIsLoading(false)
            }
        })()
    }, [questions.length, setIsLoading, updateQuestions])

    useEffect(() => {
        const current = questions[currentQuestionIndex]
        setLocalAnswer(current?.answer ?? '')
    }, [currentQuestionIndex, questions])

    const handleNext = () => {
        const current = questions[currentQuestionIndex]
        if (!current) return
        updateAnswer(current.id, localAnswer.trim())
        if (currentQuestionIndex < questions.length - 1) {
            setCurrentQuestionIndex(currentQuestionIndex + 1)
        } else {
            void handleSubmit()
        }
    }

    const handleSubmit = async () => {
        setIsLoading(true)
        setError(null)
        try {
            const result = await evaluateAnswersViaLLM(questions)
            if (!result) throw new Error('评估失败')
            onDone({
                overallConfidence: result.overallConfidence,
                passed: result.passed,
                referenceQA: result.referenceQA,
            })
        } catch (e) {
            setError((e as Error)?.message || '评估失败')
        } finally {
            setIsLoading(false)
        }
    }

    const current = questions[currentQuestionIndex]

    return (
        <div className="min-h-dvh bg-linear-to-b from-rose-50 to-white">
            <div className="max-w-2xl mx-auto px-4 py-8">
                <div className="flex items-center justify-between">
                    <div className="text-rose-900/80 text-sm">
                        进度 {progress}%
                    </div>
                    <div className="w-40 h-2 rounded-full bg-rose-100 overflow-hidden">
                        <div
                            className="h-full bg-rose-500 transition-all duration-500"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>

                <div className="mt-8 bg-white/80 backdrop-blur rounded-2xl shadow border border-rose-100 p-6 md:p-8">
                    {isLoading ? (
                        <div className="text-center text-rose-700">
                            正在生成/提交中…
                        </div>
                    ) : error ? (
                        <div className="text-center text-rose-600">{error}</div>
                    ) : current ? (
                        <div className="animate-[fadeIn_0.4s_ease]">
                            <h2 className="text-xl md:text-2xl font-medium text-rose-900 tracking-tight">
                                第 {currentQuestionIndex + 1} 题
                            </h2>
                            <p className="mt-3 text-rose-900/90 leading-relaxed">
                                {current.question}
                            </p>
                            <textarea
                                className="mt-5 w-full min-h-28 rounded-lg border border-rose-200 bg-white p-3 outline-none focus:ring-2 focus:ring-rose-300"
                                placeholder="在此填写你的答案…"
                                value={localAnswer}
                                onChange={(e) => setLocalAnswer(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && e.shiftKey) {
                                        e.preventDefault()
                                        handleNext()
                                    }
                                }}
                            />

                            <div className="mt-6 flex justify-end">
                                <button
                                    onClick={handleNext}
                                    className="inline-flex items-center justify-center rounded-full bg-rose-600 text-white px-5 py-2 font-medium shadow-sm hover:bg-rose-700 transition-colors"
                                >
                                    {currentQuestionIndex < questions.length - 1
                                        ? '下一题'
                                        : '提交'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center text-rose-700">
                            暂无题目
                        </div>
                    )}
                </div>
            </div>

            <style>{`
            @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
        </div>
    )
}
