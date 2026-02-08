import { useEffect, useCallback, useMemo, useRef, useState } from 'react'
import { useQuestionStoreHook, useQuestionStore } from '../store/questionStore'
import type { Question } from '../store/questionStore'
import {
  generateQuestionsViaLLM,
  evaluateAnswersViaLLM,
  generateFollowUpViaLLM,
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

/** 答题阶段 */
type QuizPhase = 'main' | 'followup-loading' | 'followup' | 'submitting'

export default function Quiz({ onDone }: QuizProps) {
  const {
    questions,
    updateQuestions,
    currentQuestionIndex,
    setCurrentQuestionIndex,
    updateAnswer,
    updateTimeSpent,
    isLoading,
    setIsLoading,
    incrementTabSwitch,
    followUpQuestions,
    setFollowUpQuestions,
    updateFollowUpAnswer,
    updateFollowUpTimeSpent,
    followUpIndex,
    setFollowUpIndex,
  } = useQuestionStoreHook()

  const [error, setError] = useState<string | null>(null)
  const [localAnswer, setLocalAnswer] = useState('')
  const [direction, setDirection] = useState<'next' | 'prev'>('next')
  const [animKey, setAnimKey] = useState(0)
  const [phase, setPhase] = useState<QuizPhase>('main')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const generatedRef = useRef(false)

  /* ── 计时器：记录当前题目开始答题的时间 ── */
  const questionStartTime = useRef<number>(Date.now())

  // 每次切换题目时重置计时
  const resetTimer = useCallback(() => {
    questionStartTime.current = Date.now()
  }, [])

  // 获取当前题目已用时间（秒）
  const getElapsedSeconds = useCallback(() => {
    return Math.round((Date.now() - questionStartTime.current) / 1000)
  }, [])

  const total = questions.length || 10
  const progress = useMemo(() => {
    if (questions.length === 0) return 0
    if (phase === 'main') {
      return Math.round(((currentQuestionIndex + 1) / total) * 100)
    }
    // 追问阶段进度
    return 100
  }, [currentQuestionIndex, total, questions.length, phase])

  /* ── visibilitychange 监听 ── */
  useEffect(() => {
    const handler = () => {
      if (document.hidden) {
        incrementTabSwitch()
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [incrementTabSwitch])

  // 生成题目（仅一次）
  useEffect(() => {
    if (questions.length > 0 || generatedRef.current) return
    generatedRef.current = true
    setIsLoading(true)
      ; (async () => {
        try {
          const qs = await generateQuestionsViaLLM(10)
          updateQuestions(qs)
          resetTimer()
        } catch (e) {
          setError((e as Error)?.message || '生成题目失败，请返回重试')
          generatedRef.current = false
        } finally {
          setIsLoading(false)
        }
      })()
  }, [questions.length, setIsLoading, updateQuestions, resetTimer])

  // 切换题目时同步本地答案 + 聚焦 + 重置计时
  useEffect(() => {
    if (phase === 'main') {
      const current = questions[currentQuestionIndex]
      setLocalAnswer(current?.answer ?? '')
    } else if (phase === 'followup') {
      const current = followUpQuestions[followUpIndex]
      setLocalAnswer(current?.followUpAnswer ?? '')
    }
    resetTimer()
    const timer = setTimeout(() => textareaRef.current?.focus(), 350)
    return () => clearTimeout(timer)
  }, [
    currentQuestionIndex,
    questions,
    phase,
    followUpIndex,
    followUpQuestions,
    resetTimer,
  ])

  /** 保存当前答案到 store（主题目阶段） */
  const saveCurrentAnswer = useCallback(() => {
    if (phase === 'main') {
      const current = questions[currentQuestionIndex]
      if (current) {
        updateAnswer(current.id, localAnswer.trim())
        updateTimeSpent(current.id, getElapsedSeconds())
      }
    } else if (phase === 'followup') {
      updateFollowUpAnswer(followUpIndex, localAnswer.trim())
      updateFollowUpTimeSpent(followUpIndex, getElapsedSeconds())
    }
  }, [
    phase,
    questions,
    currentQuestionIndex,
    localAnswer,
    updateAnswer,
    updateTimeSpent,
    getElapsedSeconds,
    followUpIndex,
    updateFollowUpAnswer,
    updateFollowUpTimeSpent,
  ])

  /** 下一题 */
  const handleNext = useCallback(() => {
    saveCurrentAnswer()
    if (phase === 'main') {
      if (currentQuestionIndex < questions.length - 1) {
        setDirection('next')
        setAnimKey((k) => k + 1)
        setCurrentQuestionIndex(currentQuestionIndex + 1)
      }
    } else if (phase === 'followup') {
      if (followUpIndex < followUpQuestions.length - 1) {
        setDirection('next')
        setAnimKey((k) => k + 1)
        setFollowUpIndex(followUpIndex + 1)
      }
    }
  }, [
    saveCurrentAnswer,
    phase,
    currentQuestionIndex,
    questions.length,
    setCurrentQuestionIndex,
    followUpIndex,
    followUpQuestions.length,
    setFollowUpIndex,
  ])

  /** 上一题 */
  const handlePrev = useCallback(() => {
    saveCurrentAnswer()
    if (phase === 'main') {
      if (currentQuestionIndex > 0) {
        setDirection('prev')
        setAnimKey((k) => k + 1)
        setCurrentQuestionIndex(currentQuestionIndex - 1)
      }
    } else if (phase === 'followup') {
      if (followUpIndex > 0) {
        setDirection('prev')
        setAnimKey((k) => k + 1)
        setFollowUpIndex(followUpIndex - 1)
      }
    }
  }, [
    saveCurrentAnswer,
    phase,
    currentQuestionIndex,
    setCurrentQuestionIndex,
    followUpIndex,
    setFollowUpIndex,
  ])

  /** 最终评估 */
  const doFinalEvaluation = useCallback(async () => {
    setPhase('submitting')
    setIsLoading(true)
    setError(null)

    await new Promise((r) => setTimeout(r, 50))

    try {
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
      setPhase('main')
    } finally {
      setIsLoading(false)
    }
  }, [setIsLoading, onDone])

  /** 第一轮答完 → 生成追问 */
  const handleFirstRoundDone = useCallback(async () => {
    saveCurrentAnswer()
    setPhase('followup-loading')
    setIsLoading(true)
    setError(null)

    await new Promise((r) => setTimeout(r, 50))

    try {
      const latestQuestions = useQuestionStore.getState().questions
      const followUps = await generateFollowUpViaLLM(latestQuestions)

      if (followUps.length > 0) {
        setFollowUpQuestions(followUps)
        setFollowUpIndex(0)
        setPhase('followup')
        resetTimer()
      } else {
        // 追问生成失败或为空，直接进入评估
        await doFinalEvaluation()
      }
    } catch (e) {
      setError(
        (e as Error)?.message || '生成追问失败，将直接进入评估…'
      )
      // 追问失败不阻塞，延迟后直接评估
      setTimeout(() => {
        void doFinalEvaluation()
      }, 1500)
    } finally {
      setIsLoading(false)
    }
  }, [saveCurrentAnswer, setIsLoading, setFollowUpQuestions, setFollowUpIndex, resetTimer, doFinalEvaluation])

  /** 追问答完 → 最终提交 */
  const handleFollowUpDone = useCallback(async () => {
    saveCurrentAnswer()
    await doFinalEvaluation()
  }, [saveCurrentAnswer, doFinalEvaluation])

  /** 键盘快捷键 */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && e.ctrlKey) {
        e.preventDefault()
        if (phase === 'main') {
          if (currentQuestionIndex < questions.length - 1) {
            handleNext()
          } else {
            void handleFirstRoundDone()
          }
        } else if (phase === 'followup') {
          if (followUpIndex < followUpQuestions.length - 1) {
            handleNext()
          } else {
            void handleFollowUpDone()
          }
        }
      }
    },
    [
      phase,
      currentQuestionIndex,
      questions.length,
      handleNext,
      handleFirstRoundDone,
      followUpIndex,
      followUpQuestions.length,
      handleFollowUpDone,
    ]
  )

  // 当前题目状态
  const current =
    phase === 'followup'
      ? followUpQuestions[followUpIndex]
      : questions[currentQuestionIndex]

  const isLast =
    phase === 'main'
      ? currentQuestionIndex === questions.length - 1
      : followUpIndex === followUpQuestions.length - 1

  const answeredCount =
    phase === 'main'
      ? questions.filter((q) => q.answer.trim()).length
      : followUpQuestions.filter((fq) => fq.followUpAnswer.trim()).length

  const currentTotal =
    phase === 'main' ? questions.length : followUpQuestions.length
  const currentIdx =
    phase === 'main' ? currentQuestionIndex : followUpIndex

  /* ── 加载中状态（生成题目） ── */
  if (isLoading && questions.length === 0) {
    return (
      <div className="min-h-dvh bg-linear-to-b from-rose-50 to-white">
        <div className="max-w-2xl mx-auto px-4 py-16">
          <div className="text-center space-y-4">
            <Spinner />
            <p className="text-rose-800/80 text-sm">
              正在生成验证题目，请稍候…
            </p>
          </div>
          <DebugStreamPanel />
        </div>
      </div>
    )
  }

  /* ── 错误状态（生成题目失败） ── */
  if (error && questions.length === 0) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-linear-to-b from-rose-50 to-white">
        <div className="text-center space-y-4 max-w-md px-6">
          <div className="text-rose-600 text-sm">{error}</div>
          <button
            onClick={() => {
              setError(null)
              generatedRef.current = false
              setIsLoading(true)
                ; (async () => {
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

  /* ── 追问加载中 ── */
  if (phase === 'followup-loading') {
    return (
      <div className="min-h-dvh bg-linear-to-b from-rose-50 to-white">
        <div className="max-w-2xl mx-auto px-4 py-16">
          <div className="text-center space-y-4">
            <Spinner />
            <p className="text-rose-800/80 text-sm">
              正在根据你的回答生成追问…
            </p>
            <p className="text-rose-500/60 text-xs">
              追问是为了进一步验证回答的真实性
            </p>
          </div>
          <DebugStreamPanel />
        </div>
      </div>
    )
  }

  /* ── 提交评估中 ── */
  if (phase === 'submitting') {
    return (
      <div className="min-h-dvh bg-linear-to-b from-rose-50 to-white">
        <div className="max-w-2xl mx-auto px-4 py-16">
          <div className="text-center space-y-4">
            <Spinner />
            <p className="text-rose-800/80 text-sm">
              正在评估你的回答…
            </p>
          </div>
          <DebugStreamPanel />
          {error && (
            <div className="mt-4 text-center text-sm text-rose-600">
              {error}
            </div>
          )}
        </div>
      </div>
    )
  }

  /* ── 获取当前显示的题目文本 ── */
  const questionText =
    phase === 'followup' && current && 'followUpQuestion' in current
      ? (current as (typeof followUpQuestions)[number]).followUpQuestion
      : current && 'question' in current
        ? (current as Question).question
        : ''

  return (
    <div className="min-h-dvh bg-linear-to-b from-rose-50 to-white">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* ── 阶段标识 ── */}
        {phase === 'followup' && (
          <div className="mb-4 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200/60 px-3 py-1 text-xs text-amber-700">
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
                  d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              追问环节 — 基于你的回答进一步确认
            </span>
          </div>
        )}

        {/* ── 进度条 ── */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-rose-900/70 text-xs tabular-nums">
            {currentIdx + 1} / {currentTotal}
            {phase === 'followup' && ' (追问)'}
          </span>
          <span className="text-rose-900/50 text-xs">
            已答 {answeredCount} 题
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-rose-100 overflow-hidden">
          <div
            className="h-full bg-linear-to-r from-rose-400 to-rose-500 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* ── 题目区域 ── */}
        <div className="mt-6">
          {current ? (
            <div
              key={animKey}
              className={`bg-white/80 backdrop-blur rounded-2xl shadow-sm border border-rose-100 p-6 md:p-8 ${direction === 'next'
                  ? 'animate-slideInRight'
                  : 'animate-slideInLeft'
                }`}
            >
              {/* 追问时显示原题上下文 */}
              {phase === 'followup' &&
                'originalQuestion' in current && (
                  <div className="mb-4 p-3 rounded-xl bg-rose-50/60 border border-rose-100/40 text-xs text-rose-700/70 space-y-1">
                    <p className="font-medium text-rose-800/70">
                      原题：
                      {
                        (
                          current as (typeof followUpQuestions)[number]
                        ).originalQuestion
                      }
                    </p>
                    <p>
                      你的回答：
                      {
                        (
                          current as (typeof followUpQuestions)[number]
                        ).originalAnswer
                      }
                    </p>
                  </div>
                )}

              <div className="flex items-baseline gap-3 mb-4">
                <span
                  className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium shrink-0 ${phase === 'followup'
                      ? 'bg-amber-100 text-amber-600'
                      : 'bg-rose-100 text-rose-600'
                    }`}
                >
                  {currentIdx + 1}
                </span>
                <p className="text-rose-900/90 leading-relaxed text-base md:text-lg">
                  {questionText}
                </p>
              </div>

              <textarea
                ref={textareaRef}
                className="w-full min-h-28 rounded-xl border border-rose-200/80 bg-rose-50/30 p-3.5 text-sm text-rose-950 placeholder:text-rose-300 outline-none focus:ring-2 focus:ring-rose-300/60 focus:border-rose-300 resize-none transition-shadow"
                placeholder="用自己的话描述真实感受就好，不用写得很正式…"
                value={localAnswer}
                onChange={(e) => setLocalAnswer(e.target.value)}
                onKeyDown={handleKeyDown}
              />

              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-rose-400/80">
                  Ctrl + Enter{' '}
                  {isLast
                    ? phase === 'main'
                      ? '进入追问'
                      : '提交验证'
                    : '下一题'}
                </span>
                <span className="text-xs text-rose-400/60">
                  像和朋友聊天一样回答就好
                </span>
              </div>

              {error && (
                <div className="mt-3 text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <div className="mt-5 flex items-center justify-between">
                <button
                  onClick={handlePrev}
                  disabled={currentIdx === 0}
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
                      ? phase === 'main'
                        ? () =>
                          void handleFirstRoundDone()
                        : () =>
                          void handleFollowUpDone()
                      : handleNext
                  }
                  disabled={!localAnswer.trim()}
                  className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 text-white px-5 py-2 text-sm font-medium shadow-sm hover:bg-rose-700 disabled:bg-rose-300 disabled:cursor-not-allowed transition-colors"
                >
                  {isLast
                    ? phase === 'main'
                      ? '完成，进入追问'
                      : '提交验证'
                    : '下一题'}
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

        {/* ── 题目导航圆点（主题目阶段） ── */}
        {phase === 'main' && questions.length > 0 && (
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
                  className={`w-7 h-7 rounded-full text-xs font-medium transition-all duration-200 ${active
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

        {/* ── 追问导航圆点 ── */}
        {phase === 'followup' && followUpQuestions.length > 0 && (
          <div className="mt-6 flex items-center justify-center gap-1.5 flex-wrap">
            {followUpQuestions.map((fq, idx) => {
              const answered = fq.followUpAnswer.trim() !== ''
              const active = idx === followUpIndex
              return (
                <button
                  key={idx}
                  onClick={() => {
                    saveCurrentAnswer()
                    setDirection(
                      idx > followUpIndex
                        ? 'next'
                        : 'prev'
                    )
                    setAnimKey((k) => k + 1)
                    setFollowUpIndex(idx)
                  }}
                  className={`w-7 h-7 rounded-full text-xs font-medium transition-all duration-200 ${active
                      ? 'bg-amber-500 text-white scale-110 shadow-sm'
                      : answered
                        ? 'bg-amber-200 text-amber-700 hover:bg-amber-300'
                        : 'bg-amber-100 text-amber-400 hover:bg-amber-200'
                    }`}
                  title={`追问 ${idx + 1}${answered ? '（已答）' : ''}`}
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

/* ── 小组件 ── */

function Spinner() {
  return (
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
  )
}
