# 女性性别验证项目开发文档

本文档详细记录了 `female-gender-verification` 项目的代码架构、组件交互逻辑、核心算法实现以及状态管理机制。

## 📂 文档目录

1. **[核心架构与流程](./architecture_flow.md)**
   - 包含系统交互时序图
   - 核心反作弊流程说明
2. **[UI 组件详解](./components/index.md)**
   - [Quiz 组件 (核心答题逻辑)](./components/Quiz.md)
   - [Agreement 组件 (入口与鉴权)](./components/Agreement.md)
   - [Result 组件 (结果展示)](./components/Result.md)
   - DebugStreamPanel (调试工具)
3. **[核心逻辑 (Utils & Handlers)](./core_logic.md)**
   - LLM 调用与 Prompt 组装
   - 追问生成机制
   - 密钥安全加密实现
4. **[状态管理 (Zustand Stores)](./state_management.md)**
   - QuestionStore (题目与行为数据)
   - LLMStore (SiliconFlow/OpenRouter 连接与流式处理)

## 🏗️ 顶层目录结构

```text
src/
├── components/     # UI 组件
├── const/          # 常量 (Prompts)
├── store/          # Zustand 状态管理
├── utils/          # 工具函数 (LLM 适配器, 加密, Debug)
├── App.tsx         # 路由与顶层状态控制
└── main.tsx        # 入口
```
