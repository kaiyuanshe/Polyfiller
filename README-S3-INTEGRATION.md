# S3 存储集成指南

本指南说明如何将 Polyfiller 项目迁移到 Render.com 并使用 S3 兼容的对象存储。

## 🏗️ 技术架构

### 核心方案：应用层缓存 + S3 API

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   应用程序      │────│   文件系统Hook    │────│   混合存储服务   │
│ (Polyfiller)   │    │  (fs 拦截器)     │    │ (本地+S3缓存)  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                         │
                                               ┌─────────┴─────────┐
                                               │                   │
                                         ┌──────────┐    ┌─────────────┐
                                         │ 本地缓存  │    │ S3 对象存储  │
                                         │ (临时)   │    │  (持久化)   │
                                         └──────────┘    └─────────────┘
```

## 🚀 部署到 Render.com

### 1. 准备 S3 存储

#### 选项 A: 使用 AWS S3
```bash
# 创建 S3 存储桶
aws s3 mb s3://your-polyfill-cache --region us-east-1

# 配置 CORS (如需要)
aws s3api put-bucket-cors --bucket your-polyfill-cache --cors-configuration file://cors.json
```

#### 选项 B: 使用其他 S3 兼容服务
- **MinIO**: 自托管对象存储
- **DigitalOcean Spaces**: 托管 S3 兼容服务
- **Cloudflare R2**: 无出口费用的对象存储
- **Backblaze B2**: 经济实惠的对象存储

### 2. 配置环境变量

在 Render.com 控制台设置以下环境变量：

```bash
# S3 配置
S3_ENDPOINT=https://s3.amazonaws.com  # 或其他 S3 兼容服务地址
S3_REGION=us-east-1
S3_BUCKET=your-polyfill-cache
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key

# 缓存配置
LOCAL_CACHE_DIR=/tmp/polyfill-cache
MAX_CACHE_SIZE=200  # Render Starter 计划建议限制为 200MB

# 应用配置
NODE_ENV=production
PORT=10000
```

### 3. 部署配置

使用 `render.yaml` 文件进行部署：

```yaml
services:
  - type: web
    name: polyfiller-api
    runtime: node
    plan: starter
    buildCommand: npm ci && npm run build
    startCommand: npm start
    healthCheckPath: /
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000
      # ... 其他环境变量
```

## 🔧 代码集成

### 方式一：自动文件系统 Hook（推荐）

```typescript
import {setupStorageServices} from "./service/storage/storage-integration-example.js";

// 在应用启动时调用
await setupStorageServices(logger);

// 现有代码无需修改，所有文件操作将自动重定向到 S3
fs.readFileSync('/tmp/@wessberg/polyfiller/some-file.js');
fs.writeFileSync('/tmp/@wessberg/polyfiller/new-file.js', data);
```

### 方式二：直接使用存储服务

```typescript
import {HybridStorageService} from "./service/storage/hybrid-storage-service.js";

const storage = new HybridStorageService(config, logger);

// 直接使用存储 API
const data = await storage.readFile('polyfills/core-js.min.js');
await storage.writeFile('polyfills/new-polyfill.js', buffer);
```

### 方式三：渐进式迁移

```typescript
import {installAdvancedFsHook} from "./service/storage/advanced-fs-hook.js";

// 只对特定路径启用 S3 存储
installAdvancedFsHook({
  storageService: hybridStorage,
  logger,
  mountPath: '/tmp/@wessberg/polyfiller',
  enableDebug: false
});
```

## 🛠️ 功能特性

### ✅ 支持的操作
- `fs.readFile()` / `fs.readFileSync()`
- `fs.writeFile()` / `fs.writeFileSync()`
- `fs.exists()` / `fs.existsSync()`
- `fs.stat()` / `fs.statSync()`
- `fs.access()` / `fs.accessSync()`
- `fs.open()` / `fs.openSync()`
- `fs.read()` / `fs.readSync()`
- `fs.write()` / `fs.writeSync()`
- `fs.close()` / `fs.closeSync()`
- `fs.promises.*` 所有方法

### 🚀 性能优化
- **本地缓存**: 首次读取后缓存到本地，后续访问极快
- **异步上传**: 写操作立即返回，后台异步同步到 S3
- **预热缓存**: 应用启动时预加载常用文件
- **LRU 淘汰**: 自动清理旧文件，控制缓存大小
- **批量操作**: 支持批量上传和下载

### 🔒 可靠性保证
- **故障恢复**: S3 不可用时回退到本地存储
- **数据一致性**: 确保本地缓存与 S3 数据同步
- **错误处理**: 优雅处理网络错误和权限问题
- **监控指标**: 提供缓存命中率、错误率等指标

## 📊 监控和调试

### 启用调试日志

```typescript
const hookConfig: AdvancedFsHookConfig = {
  // ...
  enableDebug: true,  // 启用详细日志
  syncTimeout: 10000  // 同步操作超时时间
};
```

### 查看存储统计

```typescript
const stats = await integration.getStorageStats();
console.log(`
总文件数: ${stats.totalFiles}
缓存命中率: ${stats.cacheHitRate}%
总大小: ${stats.totalSize}
`);
```

### 手动缓存管理

```typescript
// 清理本地缓存
await integration.cleanupCache();

// 手动同步到 S3
await integration.syncCache();
```

## 🔍 故障排除

### 常见问题

1. **S3 连接失败**
   ```bash
   # 检查网络连接
   curl -I https://your-s3-endpoint
   
   # 验证凭证
   aws s3 ls s3://your-bucket --endpoint-url=https://your-s3-endpoint
   ```

2. **权限错误**
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
         "Resource": "arn:aws:s3:::your-bucket/*"
       }
     ]
   }
   ```

3. **缓存未命中率高**
   - 检查预热文件列表是否包含常用文件
   - 增加缓存大小限制
   - 检查文件路径是否正确

### 日志分析

```bash
# 查看 S3 操作日志
grep "S3" /var/log/app.log

# 查看文件系统 hook 日志
grep "FsHook" /var/log/app.log

# 监控缓存命中率
grep "Cache hit" /var/log/app.log | wc -l
```

## 📈 性能调优

### Render.com 平台优化

```yaml
# render.yaml
services:
  - type: web
    plan: starter  # 或 standard/pro
    autoDeploy: false
    healthCheckPath: /health
    envVars:
      - key: MAX_CACHE_SIZE
        value: "200"  # Starter: 200MB, Standard: 500MB
      - key: NODE_OPTIONS
        value: "--max-old-space-size=512"
```

### 缓存策略优化

```typescript
const storageConfig: HybridStorageConfig = {
  maxCacheSize: 200,  // MB
  warmupKeys: [
    'polyfills/core-js.min.js',
    'polyfills/fetch.min.js',
    // 添加最常用的文件
  ]
};
```

## 🎯 最佳实践

1. **渐进式迁移**: 先在开发环境测试，然后逐步迁移到生产环境
2. **监控指标**: 设置缓存命中率和错误率监控
3. **备份策略**: 定期备份 S3 数据，防止意外删除
4. **成本优化**: 使用 S3 生命周期策略自动清理旧文件
5. **安全配置**: 使用 IAM 角色和最小权限原则

## 📚 相关资源

- [AWS S3 文档](https://docs.aws.amazon.com/s3/)
- [MinIO 文档](https://docs.min.io/)
- [Render.com 部署指南](https://render.com/docs)
- [Node.js fs 模块文档](https://nodejs.org/api/fs.html)

---

如有问题，请查看项目的 GitHub Issues 或联系维护者。 