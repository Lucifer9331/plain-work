# 工程判断示例

以下均为构造示例。

```python
def parse_count(value: str) -> int:
    # Convert the value to an integer.
    return int(value)
```

注释没有补充信息，可以移除。函数若属于公开 API，仍需按项目约定保留文档和契约；不要看到短函数就内联。

```python
try:
    save_record(record)
except Exception:
    return True
```

这里可能把写入失败报告为成功。先检查调用者和错误约定，再选择传播异常、转换已知异常或返回明确错误。不能为了简洁把所有 try/except 一概删除。

单一调用点上的一层 `ManagerFactoryWrapper` 是检查线索。它如果维护插件接口或稳定边界，应保留；如果只是原样转发且没有契约价值，可提出简化建议。

“Retries must not exceed 3; the upstream service rate-limits this job.” 保留限制及原因。必要否定与工程约束不受语言风格偏好影响。

需要保留：输入校验、数据库事务、权限检查、资源清理。即使看起来冗长，也必须先理解其保证的行为。
