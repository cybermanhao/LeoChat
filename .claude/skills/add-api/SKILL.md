# 添加 API 端点

在 Server 包中创建新的 API 端点。

## 路由位置

`packages/server/src/routes/index.ts`

## 添加步骤

### 1. 定义路由

在 `createRoutes` 函数中添加新端点：

```ts
// GET 请求
app.get("/api/your-endpoint", (c) => {
  return c.json({ data: "response" });
});

// POST 请求
app.post("/api/your-endpoint", async (c) => {
  const body = await c.req.json();
  // 处理逻辑
  return c.json({ success: true });
});
```

### 2. 添加 Service（如需要）

在 `packages/server/src/services/` 创建新服务：

```ts
// your-service.ts
export class YourService {
  async doSomething(params: Params): Promise<Result> {
    // 业务逻辑
  }
}
```

### 3. 定义类型

在 `packages/shared/src/types/` 添加共享类型：

```ts
export interface YourRequest {
  // 请求参数
}

export interface YourResponse {
  // 响应数据
}
```

## 前端调用

在 `apps/web/src/lib/api.ts` 添加 API 方法：

```ts
async yourMethod(params: YourRequest): Promise<YourResponse> {
  const response = await fetch(`${API_BASE}/your-endpoint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return response.json();
}
```

## 框架说明

- 使用 Hono 框架
- 支持 SSE 流式响应（参考 `/api/chat` 端点）
- CORS 已配置

## 检查清单

1. [ ] 添加路由处理
2. [ ] 创建 Service（如需要）
3. [ ] 定义共享类型
4. [ ] 添加前端 API 方法
5. [ ] 测试端点
