# 类型检查

运行 TypeScript 类型检查，确保代码类型安全。

## 可用命令

- `pnpm typecheck` - 检查所有包的类型

## 默认操作

```bash
pnpm typecheck
```

## 常见类型错误

1. **类型不匹配** - 函数参数或返回值类型错误
2. **缺少属性** - 对象缺少必需的属性
3. **null/undefined** - 未处理可能为空的值
4. **隐式 any** - 缺少类型注解

## 修复策略

- 添加正确的类型注解
- 使用类型守卫处理 null/undefined
- 更新接口定义以匹配实际使用
- 使用 `as` 类型断言（谨慎使用）

## 项目类型定义位置

- `packages/shared/src/types/` - 共享类型定义
- 各包的 `src/types/` - 包内部类型
