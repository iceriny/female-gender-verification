import { create } from 'zustand'

/** 问题接口 */
export interface Question {
    id: number
    question: string
    answer: string
    confidence: number
    /** 该题答题耗时（秒），隐性反作弊信号 */
    timeSpent?: number
}

/** 追问题目 */
export interface FollowUpQuestion {
    /** 原始题目序号（1-based） */
    originalIndex: number
    /** 原始题目文本 */
    originalQuestion: string
    /** 用户原始回答 */
    originalAnswer: string
    /** 追问内容 */
    followUpQuestion: string
    /** 追问回答 */
    followUpAnswer: string
    /** 追问答题耗时（秒） */
    timeSpent?: number
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
    /** 更新单个问题的答题耗时 */
    updateTimeSpent: (id: number, timeSpent: number) => void
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

    /* ── 页面切换检测（反作弊信号） ── */

    /** 答题期间页面离开次数 */
    tabSwitchCount: number
    /** 增加一次页面切换计数 */
    incrementTabSwitch: () => void

    /* ── 追问阶段 ── */

    /** 追问题目列表 */
    followUpQuestions: FollowUpQuestion[]
    /** 设置追问题目列表 */
    setFollowUpQuestions: (fqs: FollowUpQuestion[]) => void
    /** 更新追问回答 */
    updateFollowUpAnswer: (index: number, answer: string) => void
    /** 更新追问答题耗时 */
    updateFollowUpTimeSpent: (index: number, timeSpent: number) => void
    /** 当前追问题目索引 */
    followUpIndex: number
    /** 设置当前追问题目索引 */
    setFollowUpIndex: (index: number) => void
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
    updateTimeSpent: (id: number, timeSpent: number) =>
        set((state) => ({
            questions: state.questions.map((question) =>
                question.id === id ? { ...question, timeSpent } : question
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
    reset: () =>
        set({
            questions: [],
            confidence: 0,
            currentQuestionIndex: 0,
            tabSwitchCount: 0,
            followUpQuestions: [],
            followUpIndex: 0,
        }),
    isLoading: false,
    setIsLoading: (isLoading: boolean) => set({ isLoading }),
    passTheTest: false,
    setPassTheTest: (passTheTest: boolean) => set({ passTheTest }),

    /* ── 页面切换检测 ── */
    tabSwitchCount: 0,
    incrementTabSwitch: () =>
        set((state) => ({ tabSwitchCount: state.tabSwitchCount + 1 })),

    /* ── 追问阶段 ── */
    followUpQuestions: [],
    setFollowUpQuestions: (fqs: FollowUpQuestion[]) =>
        set({ followUpQuestions: fqs }),
    updateFollowUpAnswer: (index: number, answer: string) =>
        set((state) => ({
            followUpQuestions: state.followUpQuestions.map((fq, i) =>
                i === index ? { ...fq, followUpAnswer: answer } : fq
            ),
        })),
    updateFollowUpTimeSpent: (index: number, timeSpent: number) =>
        set((state) => ({
            followUpQuestions: state.followUpQuestions.map((fq, i) =>
                i === index ? { ...fq, timeSpent } : fq
            ),
        })),
    followUpIndex: 0,
    setFollowUpIndex: (index: number) => set({ followUpIndex: index }),
}))

/** 问题商店 Hook */
export const useQuestionStoreHook: () => QuestionStore = () => {
    const store = useQuestionStore()
    return store
}

export default useQuestionStoreHook
