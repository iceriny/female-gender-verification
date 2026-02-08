import './App.css'
import { useState, useCallback } from 'react'
import Agreement from './components/Agreement'
import Quiz from './components/Quiz'
import Result from './components/Result'
import { useQuestionStore } from './store/questionStore'
import type { EvaluationResult } from './utils/llmHandlers'

type Step = 'agreement' | 'quiz' | 'result'

function App() {
    const [step, setStep] = useState<Step>('agreement')
    const [result, setResult] = useState<EvaluationResult | null>(null)

    const handleRestart = useCallback(() => {
        // 重置 question store
        useQuestionStore.getState().reset()
        setResult(null)
        setStep('agreement')
    }, [])

    return (
        <div className="min-h-dvh">
            {step === 'agreement' && (
                <Agreement onAgreed={() => setStep('quiz')} />
            )}
            {step === 'quiz' && (
                <Quiz
                    onDone={(r) => {
                        setResult(r as EvaluationResult)
                        setStep('result')
                    }}
                />
            )}
            {step === 'result' && result && (
                <Result
                    overallConfidence={result.overallConfidence}
                    passed={result.passed}
                    referenceQA={result.referenceQA}
                    onRestart={handleRestart}
                />
            )}
        </div>
    )
}

export default App
