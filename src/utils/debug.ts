/**
 * Debug 日志工具
 *
 * 只有 __DEBUG__ 为 true 时才输出，生产环境零开销（编译期常量被 tree-shake）。
 */

const TAG = '%c[FGV]'
const TAG_STYLE = 'color:#e11d48;font-weight:bold'

/** 普通 debug 日志 */
export function dbg(...args: unknown[]): void {
    if (__DEBUG__) {
        console.log(TAG, TAG_STYLE, ...args)
    }
}

/** 带分组标题的 debug 日志 */
export function dbgGroup(label: string, ...args: unknown[]): void {
    if (__DEBUG__) {
        console.groupCollapsed(TAG, TAG_STYLE, label)
        if (args.length > 0) console.log(...args)
    }
}

/** 关闭分组 */
export function dbgGroupEnd(): void {
    if (__DEBUG__) {
        console.groupEnd()
    }
}

/** 警告级别 debug 日志 */
export function dbgWarn(...args: unknown[]): void {
    if (__DEBUG__) {
        console.warn(TAG, TAG_STYLE, ...args)
    }
}

/** 错误级别 debug 日志 */
export function dbgError(...args: unknown[]): void {
    if (__DEBUG__) {
        console.error(TAG, TAG_STYLE, ...args)
    }
}

/** 计时器 */
export function dbgTime(label: string): void {
    if (__DEBUG__) {
        console.time(`[FGV] ${label}`)
    }
}

export function dbgTimeEnd(label: string): void {
    if (__DEBUG__) {
        console.timeEnd(`[FGV] ${label}`)
    }
}
