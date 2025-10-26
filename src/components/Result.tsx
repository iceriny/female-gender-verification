import { useState } from 'react'
import { verifyDevSecret } from '../utils/secret'

interface ResultProps {
    overallConfidence: number
    passed: boolean
    onRestart: () => void
    referenceQA?: { Q: string; A?: string; single_confidence?: number }[]
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
    const pct = Math.round(overallConfidence * 100)
    return (
        <div className="min-h-dvh flex items-center justify-center bg-linear-to-b from-rose-50 to-white">
            <div className="w-full max-w-xl mx-auto p-6 md:p-8 bg-white/90 backdrop-blur rounded-2xl shadow-lg border border-rose-100">
                <h2 className="text-2xl md:text-3xl font-semibold text-rose-900 tracking-tight">
                    验证结果
                </h2>
                <div className="mt-6 flex items-end gap-4">
                    <div className="text-5xl font-light text-rose-700">
                        {pct}
                        <span className="text-2xl">%</span>
                    </div>
                    <div className="text-rose-900/70">
                        综合判定为女性的置信度
                    </div>
                </div>
                <div className="mt-4">
                    <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${passed ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}
                    >
                        {passed ? '已通过' : '未通过'}
                    </span>
                </div>
                <div className="mt-6">
                    <h3 className="text-rose-900 font-medium">
                        参考答案（开发者密钥解锁）
                    </h3>
                    {unlocked ? (
                        <ul className="mt-3 space-y-3 max-h-72 overflow-auto pr-1">
                            {referenceQA.map((x, i) => (
                                <li
                                    key={i}
                                    className="p-3 rounded-lg border border-rose-100 bg-rose-50/40"
                                >
                                    <div className="text-rose-900/90">
                                        Q: {x.Q}
                                    </div>
                                    {x.A ? (
                                        <div className="mt-1 text-rose-800/80">
                                            参考: {x.A}
                                        </div>
                                    ) : null}
                                    {typeof x.single_confidence === 'number' ? (
                                        <div className="mt-1 text-rose-700/70 text-sm">
                                            该题置信度:{' '}
                                            {Math.round(
                                                x.single_confidence * 100
                                            )}
                                            %
                                        </div>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="mt-2 grid gap-2 sm:flex sm:items-center">
                            <input
                                className="w-full sm:w-auto flex-1 rounded-lg border border-rose-200 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-rose-300"
                                placeholder="输入开发者密钥"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                            />
                            <button
                                disabled={checking || !input.trim()}
                                onClick={tryUnlock}
                                className="inline-flex items-center justify-center rounded-full bg-rose-600 text-white px-4 py-2 font-medium shadow-sm hover:bg-rose-700 disabled:bg-rose-300 transition-colors"
                            >
                                {checking ? '校验中…' : '解锁查看'}
                            </button>
                            {error ? (
                                <span className="text-sm text-rose-600">
                                    {error}
                                </span>
                            ) : null}
                        </div>
                    )}
                </div>

                <div className="mt-8 flex items-center gap-3">
                    <button
                        onClick={onRestart}
                        className="inline-flex items-center justify-center rounded-full bg-rose-600 text-white px-5 py-2 font-medium shadow-sm hover:bg-rose-700 transition-colors"
                    >
                        重新开始
                    </button>
                </div>
            </div>
        </div>
    )
}
