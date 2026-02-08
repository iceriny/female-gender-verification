import { useState, useEffect } from 'react'
import { verifyDevSecret } from '../utils/secret'

interface ResultProps {
    overallConfidence: number
    passed: boolean
    onRestart: () => void
    referenceQA?: { Q: string; A?: string; single_confidence?: number }[]
}

/** SVG 环形进度条 */
function ConfidenceRing({
    value,
    passed,
}: {
    value: number
    passed: boolean
}) {
    const pct = Math.round(value * 100)
    const radius = 58
    const stroke = 6
    const circumference = 2 * Math.PI * radius
    const [offset, setOffset] = useState(circumference)

    useEffect(() => {
        // 触发动画
        const timer = setTimeout(() => {
            setOffset(circumference - (circumference * value))
        }, 100)
        return () => clearTimeout(timer)
    }, [value, circumference])

    const color = passed ? '#059669' : '#e11d48'
    const bgColor = passed ? '#d1fae5' : '#ffe4e6'

    return (
        <div className="relative inline-flex items-center justify-center">
            <svg
                width="140"
                height="140"
                className="-rotate-90"
                viewBox="0 0 140 140"
            >
                <circle
                    cx="70"
                    cy="70"
                    r={radius}
                    fill="none"
                    stroke={bgColor}
                    strokeWidth={stroke}
                />
                <circle
                    cx="70"
                    cy="70"
                    r={radius}
                    fill="none"
                    stroke={color}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    style={{ transition: 'stroke-dashoffset 1.2s ease-out' }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span
                    className="text-3xl font-light tabular-nums"
                    style={{ color }}
                >
                    {pct}
                    <span className="text-lg">%</span>
                </span>
                <span className="text-xs text-rose-900/50 mt-0.5">置信度</span>
            </div>
        </div>
    )
}

export default function Result({
    overallConfidence,
    passed,
    onRestart,
    referenceQA = [],
}: ResultProps) {
    const [unlocked, setUnlocked] = useState(false)
    const [input, setInput] = useState('')
    const [checking, setChecking] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const tryUnlock = async () => {
        if (!input.trim()) return
        setChecking(true)
        setError(null)
        try {
            const ok = await verifyDevSecret(input.trim())
            if (!ok) throw new Error('密钥错误')
            setUnlocked(true)
        } catch (e) {
            setError((e as Error)?.message || '验证失败')
        } finally {
            setChecking(false)
        }
    }

    return (
        <div className="min-h-dvh flex items-center justify-center bg-gradient-to-b from-rose-50 to-white px-4 py-8">
            <div className="w-full max-w-xl mx-auto bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-rose-100/80 overflow-hidden animate-resultIn">
                {/* 头部结果区 */}
                <div className="p-6 md:p-8 text-center">
                    <h2 className="text-xl md:text-2xl font-semibold text-rose-900 tracking-tight mb-6">
                        验证结果
                    </h2>

                    <ConfidenceRing
                        value={overallConfidence}
                        passed={passed}
                    />

                    <div className="mt-4">
                        <span
                            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium ${
                                passed
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                                    : 'bg-rose-50 text-rose-700 border border-rose-200/80'
                            }`}
                        >
                            {passed ? (
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
                                        d="M5 13l4 4L19 7"
                                    />
                                </svg>
                            ) : (
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
                                        d="M6 18L18 6M6 6l12 12"
                                    />
                                </svg>
                            )}
                            {passed ? '验证通过' : '未通过验证'}
                        </span>
                    </div>
                    <p className="mt-3 text-xs text-rose-900/40">
                        综合判定为女性的置信度 ·
                        结果由大模型生成，仅供参考
                    </p>
                </div>

                {/* 参考答案区 */}
                <div className="border-t border-rose-100/60 p-6 md:px-8">
                    <h3 className="text-sm font-medium text-rose-900/80 mb-3">
                        参考答案
                        {!unlocked && (
                            <span className="ml-1.5 text-xs font-normal text-rose-500/60">
                                需要开发者密钥解锁
                            </span>
                        )}
                    </h3>

                    {unlocked ? (
                        <ul className="space-y-3 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                            {referenceQA.map((x, i) => (
                                <li
                                    key={i}
                                    className="p-3.5 rounded-xl border border-rose-100/80 bg-rose-50/30 animate-fadeInUp"
                                    style={{
                                        animationDelay: `${i * 60}ms`,
                                    }}
                                >
                                    <div className="flex items-start gap-2">
                                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-200/60 text-rose-600 text-xs shrink-0 mt-0.5">
                                            {i + 1}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-rose-900/85">
                                                {x.Q}
                                            </p>
                                            {x.A && (
                                                <p className="mt-1.5 text-sm text-rose-800/70">
                                                    <span className="text-rose-500/80 font-medium">
                                                        参考：
                                                    </span>
                                                    {x.A}
                                                </p>
                                            )}
                                            {typeof x.single_confidence ===
                                                'number' && (
                                                <div className="mt-1.5 flex items-center gap-2">
                                                    <div className="w-16 h-1 rounded-full bg-rose-100 overflow-hidden">
                                                        <div
                                                            className="h-full rounded-full transition-all duration-700"
                                                            style={{
                                                                width: `${Math.round(x.single_confidence * 100)}%`,
                                                                backgroundColor:
                                                                    x.single_confidence >=
                                                                    0.6
                                                                        ? '#059669'
                                                                        : '#e11d48',
                                                            }}
                                                        />
                                                    </div>
                                                    <span className="text-xs text-rose-500/70 tabular-nums">
                                                        {Math.round(
                                                            x.single_confidence *
                                                                100
                                                        )}
                                                        %
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="flex items-center gap-2">
                            <input
                                type="password"
                                className="flex-1 rounded-xl border border-rose-200/80 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-300/60 focus:border-rose-300 transition-shadow"
                                placeholder="输入开发者密钥"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') void tryUnlock()
                                }}
                            />
                            <button
                                disabled={checking || !input.trim()}
                                onClick={() => void tryUnlock()}
                                className="shrink-0 inline-flex items-center justify-center rounded-full bg-rose-600 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-rose-700 disabled:bg-rose-300 disabled:cursor-not-allowed transition-colors"
                            >
                                {checking ? '校验中…' : '解锁'}
                            </button>
                        </div>
                    )}
                    {error && (
                        <p className="mt-2 text-xs text-rose-600">{error}</p>
                    )}
                </div>

                {/* 底部操作 */}
                <div className="border-t border-rose-100/60 px-6 md:px-8 py-4 flex items-center justify-between">
                    <button
                        onClick={onRestart}
                        className="inline-flex items-center gap-1.5 text-sm text-rose-600 hover:text-rose-700 transition-colors"
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
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                        </svg>
                        重新开始
                    </button>
                    <span className="text-xs text-rose-900/30">
                        Powered by LLM
                    </span>
                </div>
            </div>

            <style>{`
                @keyframes resultIn {
                    from { opacity: 0; transform: scale(0.96) translateY(16px); }
                    to   { opacity: 1; transform: scale(1) translateY(0); }
                }
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(8px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                .animate-resultIn  { animation: resultIn  0.5s ease-out both; }
                .animate-fadeInUp  { animation: fadeInUp  0.4s ease-out both; }
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #fecdd3; border-radius: 2px; }
            `}</style>
        </div>
    )
}
