# 文件系统 Hook 配置指南

## 概述

文件系统 Hook 功能可以透明地将应用程序的文件操作重定向到 S3 兼容存储，无需修改现有代码。

## 环境变量配置

### 基础配置

```bash
# 启用/禁用文件系统 Hook
ENABLE_FS_HOOK=true|false

# S3 存储配置（必需）
S3_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=polyfiller-storage
S3_ACCESS_KEY_ID=your-access-key-id
S3_SECRET_ACCESS_KEY=your-secret-access-key

# 本地缓存目录
LOCAL_CACHE_DIR=/tmp/@wessberg/polyfiller
MAX_CACHE_SIZE=500
```

### 高级配置

```bash
# 自定义 fs hook 挂载路径（可选，默认使用 LOCAL_CACHE_DIR）
FS_HOOK_MOUNT_PATH=/custom/mount/path

# 是否启用调试日志
FS_HOOK_DEBUG=true|false

# 同步操作超时时间（毫秒）
FS_HOOK_SYNC_TIMEOUT=5000

# 缓存条目数量限制
FS_HOOK_CACHE_SIZE=100
```

## 启用条件

文件系统 Hook 只有在满足以下条件时才会启用：

1. `ENABLE_FS_HOOK=true`
2. S3 存储配置完整（ACCESS_KEY_ID、SECRET_ACCESS_KEY、BUCKET）
3. 混合存储服务初始化成功

## 使用场景

### 本地开发环境
```bash
# 开发环境通常不启用 fs hook
ENABLE_FS_HOOK=false
FS_HOOK_DEBUG=false
```

### 测试环境
```bash
# 测试环境可以启用以验证功能
ENABLE_FS_HOOK=true
FS_HOOK_DEBUG=true
FS_HOOK_SYNC_TIMEOUT=10000
```

### 生产环境
```bash
# 生产环境启用但关闭调试
ENABLE_FS_HOOK=true
FS_HOOK_DEBUG=false
FS_HOOK_SYNC_TIMEOUT=5000
FS_HOOK_CACHE_SIZE=200
```

## 监控和调试

### 启用调试日志
设置 `FS_HOOK_DEBUG=true` 可以看到详细的文件操作日志：

```
[OptimizedFsHook] Intercepting readFileSync: /tmp/polyfiller/cache/file.js
[OptimizedFsHook] Intercepting writeFileSync: /tmp/polyfiller/cache/output.js
```

### 健康检查

访问以下端点检查 fs hook 状态：
- `/health` - 基础健康检查
- `/health/detailed` - 详细状态包含存储信息

### 性能指标

通过日志可以观察：
- 缓存命中率
- S3 操作延迟
- 同步操作成功/失败率

## 故障排除

### fs hook 未启用
1. 检查 `ENABLE_FS_HOOK=true`
2. 确认 S3 配置完整
3. 查看应用启动日志确认初始化状态

### 文件操作失败
1. 检查 S3 连接和权限
2. 增加 `FS_HOOK_SYNC_TIMEOUT` 值
3. 启用调试日志查看详细错误

### 性能问题
1. 调整 `FS_HOOK_CACHE_SIZE` 增加缓存
2. 优化 S3 endpoint 选择最近的区域
3. 监控网络延迟

## 最佳实践

1. **开发环境**: 关闭 fs hook，使用本地文件系统
2. **测试环境**: 启用 fs hook 和调试，验证功能正确性
3. **生产环境**: 启用 fs hook，关闭调试，优化缓存配置
4. **监控**: 定期检查健康状态和性能指标
5. **备份**: 确保 S3 存储的数据备份策略 