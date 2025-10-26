import './App.css'
import { useState } from 'react'
import Agreement from './components/Agreement'
import Quiz from './components/Quiz'
import Result from './components/Result'
import type { EvaluationResult } from './utils/llmHandlers'

function App() {
    const [step, setStep] = useState<'agreement' | 'quiz' | 'result'>(
        'agreement'
    )
    const [result, setResult] = useState<EvaluationResult | null>(null)

    return (
        <>
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
                    onRestart={() => {
                        setResult(null)
                        setStep('agreement')
                    }}
                />
            )}
        </>
    )
}

export default App
