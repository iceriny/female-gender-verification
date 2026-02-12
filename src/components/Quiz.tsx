import { useEffect, useCallback, useMemo, useRef, useState } from 'react'
import { useQuestionStoreHook, useQuestionStore } from '../store/questionStore'
import type { Question } from '../store/questionStore'
import {
  generateQuestionsViaLLM,
  evaluateAnswersViaLLM,
  generateFollowUpViaLLM,
} from '../utils/llmHandlers'
import type { EvaluationResult } from '../utils/llmHandlers'
import { useLLMStore } from '../store/LLMStore'
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

/* ── 从流式 JSON 中提取完整字符串值 ── */

function extractStringValues(text: string, key: string): string[] {
  const results: string[] = []
  const pattern = `"${key}"`
  let i = 0

  while (i < text.length) {
    const keyPos = text.indexOf(pattern, i)
    if (keyPos < 0) break

    let cursor = keyPos + pattern.length
    while (cursor < text.length && /\s/.test(text[cursor])) cursor++
    if (cursor >= text.length || text[cursor] !== ':') {
      i = keyPos + pattern.length
      continue
    }
    cursor++
    while (cursor < text.length && /\s/.test(text[cursor])) cursor++
    if (cursor >= text.length || text[cursor] !== '"') {
      i = cursor
      continue
    }
    cursor++

    let escaped = false
    let value = ''
    let complete = false

    while (cursor < text.length) {
      const ch = text[cursor]
      if (escaped) {
        if (ch === 'n') value += '\n'
        else if (ch === 't') value += '\t'
        else if (ch === '"') value += '"'
        else if (ch === '\\') value += '\\'
        else value += ch
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        complete = true
        break
      } else {
        value += ch
      }
      cursor++
    }

    if (complete && value.trim()) {
      results.push(value.trim())
    }

    i = cursor + 1
  }

  return results
}

/* ── 思考计时器组件 ── */

function ThinkingTimer({ active, label }: { active: boolean; label?: string }) {
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    if (active && startRef.current === null) {
      startRef.current = Date.now()
    }
    if (!active) {
      startRef.current = null
      setElapsed(0)
    }
  }, [active])

  useEffect(() => {
    if (!active) return
    const interval = setInterval(() => {
      if (startRef.current) {
        setElapsed((Date.now() - startRef.current) / 1000)
      }
    }, 100)
    return () => clearInterval(interval)
  }, [active])

  if (!active && elapsed === 0) return null

  return (
    <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-purple-50/80 border border-purple-100/60 animate-fadeInSoft">
      <div className="w-5 h-5 text-purple-500 animate-thinkingPulse">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"
          />
        </svg>
      </div>
      <span className="text-sm text-purple-700 font-medium">
        {label || '深度思考中'}
      </span>
      <span className="text-sm tabular-nums text-purple-500/80 font-mono">
        {elapsed.toFixed(1)}s
      </span>
      <span className="flex gap-0.5">
        <span className="w-1 h-1 rounded-full bg-purple-400 animate-thinkingDot1" />
        <span className="w-1 h-1 rounded-full bg-purple-400 animate-thinkingDot2" />
        <span className="w-1 h-1 rounded-full bg-purple-400 animate-thinkingDot3" />
      </span>
    </div>
  )
}

/* ── 评估进度条 ── */

function EvaluationProgressBar({
  evaluated,
  total,
}: {
  evaluated: number
  total: number
}) {
  const clamped = Math.min(evaluated, total)
  const pct = total > 0 ? (clamped / total) * 100 : 0

  return (
    <div className="max-w-xs mx-auto space-y-2.5 animate-fadeInSoft">
      <div className="w-full h-2 rounded-full bg-rose-100 overflow-hidden">
        <div
          className="h-full bg-linear-to-r from-rose-400 to-rose-500 rounded-full transition-all duration-800 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-rose-500/70 tabular-nums text-center">
        已评估 {clamped} / {total} 题
      </p>
    </div>
  )
}

/* ── 主组件 ── */

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

  /* ── 流式状态 ── */
  const [isStreamingQuestions, setIsStreamingQuestions] = useState(false)
  const [isStreamingFollowUps, setIsStreamingFollowUps] = useState(false)
  const lastExtractedQCount = useRef(0)
  const lastExtractedFUCount = useRef(0)
  const followUpTransitionedRef = useRef(false)

  /* ── 思考计时器 ── */
  const [thinkingActive, setThinkingActive] = useState(false)

  /* ── 评估进度 ── */
  const [evalProgress, setEvalProgress] = useState(0)

  const totalExpected = 10

  /* ── 计时器：记录当前题目开始答题的时间 ── */
  const questionStartTime = useRef<number>(Date.now())

  const resetTimer = useCallback(() => {
    questionStartTime.current = Date.now()
  }, [])

  const getElapsedSeconds = useCallback(() => {
    return Math.round((Date.now() - questionStartTime.current) / 1000)
  }, [])

  const total = questions.length || 10
  const progress = useMemo(() => {
    if (questions.length === 0) return 0
    if (phase === 'main') {
      return Math.round(((currentQuestionIndex + 1) / total) * 100)
    }
    return 100
  }, [currentQuestionIndex, total, questions.length, phase])

  /* ── 思考状态订阅（高效，不触发重渲染） ── */
  useEffect(() => {
    const unsub = useLLMStore.subscribe((state, prevState) => {
      // 检测思考开始
      if (
        state.isGenerating &&
        state.streamingReasoning.length > 0 &&
        state.streamingText.length === 0 &&
        !prevState?.isGenerating
      ) {
        setThinkingActive(true)
      }
      // 思考结束（内容开始流入或停止生成）
      if (
        state.streamingText.length > 0 &&
        prevState?.streamingText.length === 0
      ) {
        setThinkingActive(false)
      }
      if (!state.isGenerating && prevState?.isGenerating) {
        setThinkingActive(false)
      }
    })
    return unsub
  }, [])

  /* ── 渐进式题目提取 ── */
  useEffect(() => {
    if (!isStreamingQuestions) return
    const unsub = useLLMStore.subscribe((state) => {
      const text = state.streamingText
      if (!text) return
      const qs = extractStringValues(text, 'Q')
      if (qs.length > lastExtractedQCount.current) {
        lastExtractedQCount.current = qs.length
        const current = useQuestionStore.getState().questions
        const newQs = qs.map((q, idx) => ({
          id: idx + 1,
          question: q,
          answer: current[idx]?.answer ?? '',
          confidence: current[idx]?.confidence ?? 0,
          timeSpent: current[idx]?.timeSpent,
        }))
        useQuestionStore.getState().updateQuestions(newQs)
      }
    })
    return unsub
  }, [isStreamingQuestions])

  /* ── 渐进式追问提取 ── */
  useEffect(() => {
    if (!isStreamingFollowUps) return
    const unsub = useLLMStore.subscribe((state) => {
      const text = state.streamingText
      if (!text) return
      const fqs = extractStringValues(text, 'followUpQuestion')
      if (fqs.length > lastExtractedFUCount.current) {
        lastExtractedFUCount.current = fqs.length
        const currentFqs = useQuestionStore.getState().followUpQuestions
        const newFqs = fqs.map((fq, idx) => ({
          originalIndex: currentFqs[idx]?.originalIndex ?? 0,
          originalQuestion: currentFqs[idx]?.originalQuestion ?? '',
          originalAnswer: currentFqs[idx]?.originalAnswer ?? '',
          followUpQuestion: fq,
          followUpAnswer: currentFqs[idx]?.followUpAnswer ?? '',
          timeSpent: currentFqs[idx]?.timeSpent,
        }))
        useQuestionStore.getState().setFollowUpQuestions(newFqs)

        if (fqs.length > 0 && !followUpTransitionedRef.current) {
          followUpTransitionedRef.current = true
          useQuestionStore.getState().setFollowUpIndex(0)
          setPhase('followup')
        }
      }
    })
    return unsub
  }, [isStreamingFollowUps])

  /* ── 评估进度追踪 ── */
  useEffect(() => {
    if (phase !== 'submitting') {
      setEvalProgress(0)
      return
    }
    const unsub = useLLMStore.subscribe((state) => {
      const text = state.streamingText
      const count = (text.match(/"single_confidence"/g) || []).length
      setEvalProgress(count)
    })
    return unsub
  }, [phase])

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

  // 生成题目（仅一次）— 渐进式加载
  useEffect(() => {
    if (questions.length > 0 || generatedRef.current) return
    generatedRef.current = true
    setIsLoading(true)
    setIsStreamingQuestions(true)
    lastExtractedQCount.current = 0
    ;(async () => {
      try {
        const qs = await generateQuestionsViaLLM(10)
        // 合并已有回答（用户可能已开始作答）
        const current = useQuestionStore.getState().questions
        const merged = qs.map((q, idx) => ({
          ...q,
          answer: current[idx]?.answer ?? '',
          timeSpent: current[idx]?.timeSpent,
        }))
        updateQuestions(merged)
        resetTimer()
      } catch (e) {
        setError((e as Error)?.message || '生成题目失败，请返回重试')
        generatedRef.current = false
      } finally {
        setIsLoading(false)
        setIsStreamingQuestions(false)
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
    const timer = setTimeout(() => textareaRef.current?.focus(), 400)
    return () => clearTimeout(timer)
  }, [
    currentQuestionIndex,
    questions,
    phase,
    followUpIndex,
    followUpQuestions,
    resetTimer,
  ])

  /** 保存当前答案到 store */
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
    setEvalProgress(0)

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
    setIsStreamingFollowUps(true)
    lastExtractedFUCount.current = 0
    followUpTransitionedRef.current = false

    await new Promise((r) => setTimeout(r, 50))

    try {
      const latestQuestions = useQuestionStore.getState().questions
      const followUps = await generateFollowUpViaLLM(latestQuestions)

      if (followUps.length > 0) {
        // 合并已有回答（渐进式加载期间用户可能已开始作答）
        const currentFqs = useQuestionStore.getState().followUpQuestions
        const merged = followUps.map((fu, idx) => ({
          ...fu,
          followUpAnswer: currentFqs[idx]?.followUpAnswer ?? '',
          timeSpent: currentFqs[idx]?.timeSpent,
        }))
        setFollowUpQuestions(merged)
        if (!followUpTransitionedRef.current) {
          setFollowUpIndex(0)
          setPhase('followup')
          resetTimer()
        }
      } else {
        await doFinalEvaluation()
      }
    } catch (e) {
      setError((e as Error)?.message || '生成追问失败，将直接进入评估…')
      setTimeout(() => {
        void doFinalEvaluation()
      }, 1500)
    } finally {
      setIsLoading(false)
      setIsStreamingFollowUps(false)
    }
  }, [
    saveCurrentAnswer,
    setIsLoading,
    setFollowUpQuestions,
    setFollowUpIndex,
    resetTimer,
    doFinalEvaluation,
  ])

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

  // 当前题目
  const current =
    phase === 'followup'
      ? followUpQuestions[followUpIndex]
      : questions[currentQuestionIndex]

  const isLast =
    phase === 'main'
      ? currentQuestionIndex === questions.length - 1 && !isLoading
      : followUpIndex === followUpQuestions.length - 1

  const answeredCount =
    phase === 'main'
      ? questions.filter((q) => q.answer.trim()).length
      : followUpQuestions.filter((fq) => fq.followUpAnswer.trim()).length

  const currentTotal =
    phase === 'main' ? questions.length : followUpQuestions.length
  const currentIdx = phase === 'main' ? currentQuestionIndex : followUpIndex

  // 题目导航圆点数量（加载中时显示预期总数）
  const dotsCount =
    phase === 'main'
      ? isLoading
        ? totalExpected
        : questions.length
      : followUpQuestions.length

  /* ── 加载中状态（尚无题目） ── */
  if (isLoading && questions.length === 0) {
    return (
      <div className="min-h-dvh bg-linear-to-b from-rose-50 to-white">
        <div className="max-w-2xl mx-auto px-4 py-16">
          <div className="text-center space-y-5">
            <Spinner />

            {/* 思考计时器 */}
            {thinkingActive && (
              <div className="flex justify-center">
                <ThinkingTimer
                  active={thinkingActive}
                  label="正在深度思考题目设计"
                />
              </div>
            )}

            {!thinkingActive && (
              <p className="text-rose-800/80 text-sm animate-fadeInSoft">
                使用人工智能生成验证题目，页面没有卡住，请稍候…
              </p>
            )}

            {/* 预期题目占位圆点 */}
            <div className="flex items-center justify-center gap-1.5 flex-wrap pt-2">
              {Array.from({ length: totalExpected }, (_, idx) => (
                <div
                  key={idx}
                  className="w-7 h-7 rounded-full bg-rose-50 text-rose-200 text-xs font-medium flex items-center justify-center animate-dotAppear"
                  style={{ animationDelay: `${idx * 60}ms` }}
                >
                  {idx + 1}
                </div>
              ))}
            </div>
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
              setIsStreamingQuestions(true)
              lastExtractedQCount.current = 0
              ;(async () => {
                try {
                  const qs = await generateQuestionsViaLLM(10)
                  const current = useQuestionStore.getState().questions
                  const merged = qs.map((q, idx) => ({
                    ...q,
                    answer: current[idx]?.answer ?? '',
                    timeSpent: current[idx]?.timeSpent,
                  }))
                  updateQuestions(merged)
                } catch (e) {
                  setError((e as Error)?.message || '生成题目失败')
                } finally {
                  setIsLoading(false)
                  setIsStreamingQuestions(false)
                }
              })()
            }}
            className="inline-flex items-center justify-center rounded-full bg-rose-600 text-white px-5 py-2 text-sm font-medium shadow-sm hover:bg-rose-700 transition-colors duration-300"
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  /* ── 追问加载中（尚无追问） ── */
  if (phase === 'followup-loading') {
    return (
      <div className="min-h-dvh bg-linear-to-b from-rose-50 to-white">
        <div className="max-w-2xl mx-auto px-4 py-16">
          <div className="text-center space-y-5">
            <Spinner />

            {thinkingActive && (
              <div className="flex justify-center">
                <ThinkingTimer
                  active={thinkingActive}
                  label="正在思考追问策略"
                />
              </div>
            )}

            {!thinkingActive && (
              <>
                <p className="text-rose-800/80 text-sm animate-fadeInSoft">
                  正在根据你的回答生成追问…
                </p>
                <p className="text-rose-500/60 text-xs">
                  追问是为了进一步验证回答的真实性
                </p>
              </>
            )}
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
          <div className="text-center space-y-5">
            <Spinner />

            {thinkingActive && (
              <div className="flex justify-center">
                <ThinkingTimer
                  active={thinkingActive}
                  label="正在深度分析回答"
                />
              </div>
            )}

            {!thinkingActive && (
              <p className="text-rose-800/80 text-sm animate-fadeInSoft">
                正在评估你的回答…
              </p>
            )}

            {/* 评估进度条 */}
            {evalProgress > 0 && (
              <EvaluationProgressBar
                evaluated={evalProgress}
                total={questions.length}
              />
            )}
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
          <div className="mb-4 text-center animate-fadeInSoft">
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

        {/* ── 流式加载指示器 ── */}
        {isLoading && questions.length > 0 && phase === 'main' && (
          <div className="mb-3 flex items-center justify-center gap-2 animate-fadeInSoft">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
            <span className="text-xs text-rose-500/70">
              题目生成中 {questions.length}/{totalExpected}
            </span>
          </div>
        )}

        {isStreamingFollowUps && phase === 'followup' && (
          <div className="mb-3 flex items-center justify-center gap-2 animate-fadeInSoft">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs text-amber-500/70">追问生成中…</span>
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
            className="h-full bg-linear-to-r from-rose-400 to-rose-500 rounded-full transition-all duration-800 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* ── 题目区域 ── */}
        <div className="mt-6">
          {current ? (
            <div
              key={animKey}
              className={`bg-white/80 backdrop-blur rounded-2xl shadow-sm border border-rose-100 p-6 md:p-8 ${
                direction === 'next'
                  ? 'animate-slideInRight'
                  : 'animate-slideInLeft'
              }`}
            >
              {/* 追问时显示原题上下文 */}
              {phase === 'followup' && 'originalQuestion' in current && (
                <div className="mb-4 p-3 rounded-xl bg-rose-50/60 border border-rose-100/40 text-xs text-rose-700/70 space-y-1">
                  <p className="font-medium text-rose-800/70">
                    原题：
                    {
                      (current as (typeof followUpQuestions)[number])
                        .originalQuestion
                    }
                  </p>
                  <p>
                    你的回答：
                    {
                      (current as (typeof followUpQuestions)[number])
                        .originalAnswer
                    }
                  </p>
                </div>
              )}

              <div className="flex items-baseline gap-3 mb-4">
                <span
                  className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium shrink-0 transition-colors duration-500 ${
                    phase === 'followup'
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
                className="w-full min-h-28 rounded-xl border border-rose-200/80 bg-rose-50/30 p-3.5 text-sm text-rose-950 placeholder:text-rose-300 outline-none focus:ring-2 focus:ring-rose-300/60 focus:border-rose-300 resize-none transition-all duration-400"
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
                <div className="mt-3 text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2 animate-fadeInSoft">
                  {error}
                </div>
              )}

              <div className="mt-5 flex items-center justify-between">
                <button
                  onClick={handlePrev}
                  disabled={currentIdx === 0}
                  className="inline-flex items-center gap-1.5 text-sm text-rose-600 hover:text-rose-700 disabled:text-rose-300 disabled:cursor-not-allowed transition-colors duration-300"
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
                        ? () => void handleFirstRoundDone()
                        : () => void handleFollowUpDone()
                      : handleNext
                  }
                  disabled={!localAnswer.trim()}
                  className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 text-white px-5 py-2 text-sm font-medium shadow-sm hover:bg-rose-700 disabled:bg-rose-300 disabled:cursor-not-allowed transition-all duration-300"
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
        {phase === 'main' && (
          <div className="mt-6 flex items-center justify-center gap-1.5 flex-wrap">
            {Array.from({ length: dotsCount }, (_, idx) => {
              if (idx < questions.length) {
                const q = questions[idx]
                const answered = q.answer.trim() !== ''
                const active = idx === currentQuestionIndex
                return (
                  <button
                    key={q.id}
                    onClick={() => {
                      saveCurrentAnswer()
                      setDirection(idx > currentQuestionIndex ? 'next' : 'prev')
                      setAnimKey((k) => k + 1)
                      setCurrentQuestionIndex(idx)
                    }}
                    className={`w-7 h-7 rounded-full text-xs font-medium transition-all duration-500 ${
                      active
                        ? 'bg-rose-600 text-white scale-110 shadow-sm'
                        : answered
                          ? 'bg-rose-200 text-rose-700 hover:bg-rose-300'
                          : 'bg-rose-100 text-rose-400 hover:bg-rose-200'
                    }`}
                    style={{
                      animationDelay: isLoading ? `${idx * 60}ms` : undefined,
                    }}
                    title={`第 ${idx + 1} 题${answered ? '（已答）' : ''}`}
                  >
                    {idx + 1}
                  </button>
                )
              } else {
                // 尚未生成的题目——非激活样式
                return (
                  <div
                    key={`pending-${idx}`}
                    className="w-7 h-7 rounded-full bg-rose-50 text-rose-200 text-xs font-medium flex items-center justify-center cursor-default animate-dotAppear"
                    style={{
                      animationDelay: `${idx * 60}ms`,
                    }}
                    title={`第 ${idx + 1} 题（生成中…）`}
                  >
                    {idx + 1}
                  </div>
                )
              }
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
                    setDirection(idx > followUpIndex ? 'next' : 'prev')
                    setAnimKey((k) => k + 1)
                    setFollowUpIndex(idx)
                  }}
                  className={`w-7 h-7 rounded-full text-xs font-medium transition-all duration-500 ${
                    active
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
            {isStreamingFollowUps && (
              <div className="w-7 h-7 rounded-full bg-amber-50 flex items-center justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-300 animate-pulse" />
              </div>
            )}
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
        .animate-slideInRight { animation: slideInRight 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .animate-slideInLeft  { animation: slideInLeft  0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }

        @keyframes fadeInSoft {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeInSoft { animation: fadeInSoft 0.6s ease-out both; }

        @keyframes thinkingPulse {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          50% { transform: scale(1.18); opacity: 1; }
        }
        .animate-thinkingPulse { animation: thinkingPulse 2.2s ease-in-out infinite; }

        @keyframes thinkingDot {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.2); }
        }
        .animate-thinkingDot1 { animation: thinkingDot 1.4s ease-in-out 0s infinite; }
        .animate-thinkingDot2 { animation: thinkingDot 1.4s ease-in-out 0.2s infinite; }
        .animate-thinkingDot3 { animation: thinkingDot 1.4s ease-in-out 0.4s infinite; }

        @keyframes dotAppear {
          from { opacity: 0; transform: scale(0.5); }
          to   { opacity: 0.6; transform: scale(1); }
        }
        .animate-dotAppear { animation: dotAppear 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }
      `}</style>
    </div>
  )
}

/* ── 小组件 ── */

function Spinner() {
  return (
    <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-rose-100/80 animate-spinnerPulse">
      <svg
        className="w-7 h-7 text-rose-500 animate-spin"
        style={{ animationDuration: '1.2s' }}
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
      <style>{`
        @keyframes spinnerPulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(244, 63, 94, 0.15); }
          50% { transform: scale(1.06); box-shadow: 0 0 0 8px rgba(244, 63, 94, 0); }
        }
        .animate-spinnerPulse { animation: spinnerPulse 2.5s ease-in-out infinite; }
      `}</style>
    </div>
  )
}
