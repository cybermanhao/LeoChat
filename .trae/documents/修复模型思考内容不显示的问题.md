## 问题分析

当使用后端代理模式时，模型返回的思考内容（reasoning）没有显示在前端。经过代码分析，发现问题出在`processBackendSSEResponse`方法中，该方法只处理了`content`字段，没有处理`reasoning`字段。

## 修复方案

1. **修改`packages/mcp-core/src/task-loop.ts`文件中的`processBackendSSEResponse`方法**：
   - 添加`reasoning_content`变量来存储思考内容
   - 在处理chunk事件时，检查并处理`parsed.reasoning`字段
   - 在构建`assistantMessage`时，包含`reasoning_content`字段
   - 当有思考内容时，通过`update`事件发送给前端

2. **修改内容**：
   ```typescript
   // 在processBackendSSEResponse方法中添加reasoning_content变量
   let content = "";
   let reasoning_content = ""; // 添加这行
   const toolCalls: ToolCall[] = [];
   let hasEmittedThinking = false;
   
   // 在处理chunk事件时，添加对reasoning的处理
   if (parsed.content !== undefined || parsed.reasoning !== undefined) {
     // chunk事件
     if (!hasEmittedThinking) {
       this.setStatus("generating", "generating");
       hasEmittedThinking = true;
     }
     
     // 处理content
     if (parsed.content) {
       content += parsed.content;
     }
     
     // 处理reasoning
     if (parsed.reasoning) {
       reasoning_content += parsed.reasoning;
     }
     
     this.emit({
       type: "update",
       messageId: uiMessageId,
       delta: {
         content_delta: parsed.content,
         reasoning_delta: parsed.reasoning
       },
     });
   }
   
   // 在构建assistantMessage时，包含reasoning_content
   const assistantMessage: ChatMessage = {
     id: uiMessageId,
     role: "assistant",
     content,
     ...(reasoning_content ? { reasoning_content } : {}), // 添加这行
     timestamp: Date.now(),
     ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
     metadata: {
       model: this.llmConfig.model,
     },
   };
   ```

## 预期效果

修复后，当模型返回思考内容时，无论是直接调用LLM还是使用后端代理模式，思考内容都会正确显示在前端。