import { useEffect, useRef, useState } from 'react'
import { useLLMStore } from '../store/LLMStore'

/**
 * Debug 面板 — 实时显示 LLM 流式输出
 *
 * 仅在 __DEBUG__ 为 true 时渲染，生产环境会被 tree-shake。
 */
export default function DebugStreamPanel() {
    if (!__DEBUG__) return null

    return <DebugStreamPanelInner />
}

function DebugStreamPanelInner() {
    const streamingText = useLLMStore((s) => s.streamingText)
    const streamingReasoning = useLLMStore((s) => s.streamingReasoning)
    const streamingPhase = useLLMStore((s) => s.streamingPhase)
    const isGenerating = useLLMStore((s) => s.isGenerating)

    const [collapsed, setCollapsed] = useState(false)
    const contentRef = useRef<HTMLPreElement>(null)
    const reasoningRef = useRef<HTMLPreElement>(null)

    const hasContent = streamingText.length > 0 || streamingReasoning.length > 0
    const visible = isGenerating || hasContent

    // 自动滚动到底部
    useEffect(() => {
        if (contentRef.current) {
            contentRef.current.scrollTop = contentRef.current.scrollHeight
        }
    }, [streamingText])

    useEffect(() => {
        if (reasoningRef.current) {
            reasoningRef.current.scrollTop = reasoningRef.current.scrollHeight
        }
    }, [streamingReasoning])

    if (!visible) return null

    return (
        <div className="mt-4 rounded-xl border border-amber-300/60 bg-amber-50/50 overflow-hidden text-xs">
            {/* 标题栏 */}
            <button
                onClick={() => setCollapsed((c) => !c)}
                className="w-full flex items-center justify-between px-3 py-2 bg-amber-100/60 hover:bg-amber-100 transition-colors text-left"
            >
                <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-amber-800 font-mono font-medium">
                        <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                            />
                        </svg>
                        DEBUG
                    </span>
                    {streamingPhase && (
                        <span className="text-amber-700/80">
                            {streamingPhase}
                        </span>
                    )}
                    {isGenerating && (
                        <span className="inline-flex items-center gap-1 text-amber-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            streaming
                        </span>
                    )}
                </div>
                <span className="text-amber-600/60">
                    {collapsed ? '▸' : '▾'}
                </span>
            </button>

            {/* 内容区 */}
            {!collapsed && (
                <div className="px-3 py-2 space-y-2">
                    {/* Reasoning 区域 */}
                    {streamingReasoning.length > 0 && (
                        <div>
                            <div className="text-amber-700/70 font-mono mb-1 flex items-center gap-1.5">
                                <span className="text-[10px] px-1 py-0.5 rounded bg-purple-100 text-purple-700">
                                    thinking
                                </span>
                                reasoning_content
                                <span className="text-amber-500/50 ml-auto tabular-nums">
                                    {streamingReasoning.length} chars
                                </span>
                            </div>
                            <pre
                                ref={reasoningRef}
                                className="max-h-32 overflow-auto rounded-lg bg-purple-950/5 border border-purple-200/40 p-2 text-purple-900/80 font-mono whitespace-pre-wrap break-words leading-relaxed custom-scrollbar"
                            >
                                {streamingReasoning}
                                {isGenerating && (
                                    <span className="animate-pulse">▊</span>
                                )}
                            </pre>
                        </div>
                    )}

                    {/* Content 区域 */}
                    <div>
                        <div className="text-amber-700/70 font-mono mb-1 flex items-center gap-1.5">
                            <span className="text-[10px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-700">
                                output
                            </span>
                            content
                            <span className="text-amber-500/50 ml-auto tabular-nums">
                                {streamingText.length} chars
                            </span>
                        </div>
                        <pre
                            ref={contentRef}
                            className="max-h-48 overflow-auto rounded-lg bg-gray-950/5 border border-gray-200/40 p-2 text-gray-900/80 font-mono whitespace-pre-wrap break-words leading-relaxed custom-scrollbar"
                        >
                            {streamingText || (
                                <span className="text-gray-400 italic">
                                    {isGenerating
                                        ? '等待输出…'
                                        : '(空)'}
                                </span>
                            )}
                            {isGenerating && streamingText && (
                                <span className="animate-pulse">▊</span>
                            )}
                        </pre>
                    </div>
                </div>
            )}

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #d4d4d4; border-radius: 2px; }
            `}</style>
        </div>
    )
}
