import { create } from 'zustand'

/** 问题接口 */
export interface Question {
    id: number
    question: string
    answer: string
    confidence: number
}

/** 问题商店接口 */
export interface QuestionStore {
    /** 问题列表 */
    questions: Question[]
    /** 置信度 */
    confidence: number
    /** 当前问题索引 */
    currentQuestionIndex: number
    /** 设置当前问题索引 */
    setCurrentQuestionIndex: (currentQuestionIndex: number) => void
    /** 更新问题列表 */
    updateQuestions: (questions: Question[]) => void
    /** 更新单个问题答案 */
    updateAnswer: (id: number, answer: string) => void
    /** 更新单个问题置信度 */
    updateSingleConfidence: (id: number, confidence: number) => void
    /** 更新所有问题置信度 */
    updateAllConfidence: (confidence: number) => void
    /** 根据ID获取问题 */
    getQuestionById: (id: number) => Question | undefined
    /** 重置问题商店 */
    reset: () => void
    /** 是否加载中 */
    isLoading: boolean
    /** 设置是否加载中 */
    setIsLoading: (isLoading: boolean) => void
    /** 是否通过测试 */
    passTheTest: boolean
    /** 设置是否通过测试 */
    setPassTheTest: (passTheTest: boolean) => void
}

/** 问题商店 */
export const useQuestionStore = create<QuestionStore>((set, get) => ({
    questions: [],
    confidence: 0,
    currentQuestionIndex: 0,
    setCurrentQuestionIndex: (currentQuestionIndex: number) =>
        set({ currentQuestionIndex }),
    updateQuestions: (questions: Question[]) => set({ questions }),
    updateAnswer: (id: number, answer: string) =>
        set((state) => ({
            questions: state.questions.map((question) =>
                question.id === id ? { ...question, answer } : question
            ),
        })),
    updateSingleConfidence: (id: number, confidence: number) =>
        set((state) => ({
            questions: state.questions.map((question) =>
                question.id === id ? { ...question, confidence } : question
            ),
        })),
    updateAllConfidence: (confidence: number) => set({ confidence }),
    getQuestionById: (id: number) =>
        get().questions.find((question) => question.id === id),
    reset: () => set({ questions: [], confidence: 0, currentQuestionIndex: 0 }),
    isLoading: false,
    setIsLoading: (isLoading: boolean) => set({ isLoading }),
    passTheTest: false,
    setPassTheTest: (passTheTest: boolean) => set({ passTheTest }),
}))

/** 问题商店 Hook */
export const useQuestionStoreHook: () => QuestionStore = () => {
    const {
        questions,
        confidence,
        currentQuestionIndex,
        setCurrentQuestionIndex,
        updateQuestions,
        updateAnswer,
        updateSingleConfidence,
        updateAllConfidence,
        getQuestionById,
        reset,
        isLoading,
        setIsLoading,
        passTheTest,
        setPassTheTest,
    } = useQuestionStore()
    return {
        questions,
        confidence,
        currentQuestionIndex,
        setCurrentQuestionIndex,
        updateQuestions,
        updateAnswer,
        updateSingleConfidence,
        updateAllConfidence,
        getQuestionById,
        reset,
        isLoading,
        setIsLoading,
        passTheTest,
        setPassTheTest,
    }
}

export default useQuestionStoreHook
