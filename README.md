# Cursor Usage Monitor

一个完整的Cursor AI使用量监控解决方案，包含浏览器扩展和VSCode扩展，帮助开发者实时监控和管理Cursor AI的使用情况。

## 📋 项目概述

这个项目包含两个主要组件：

1. **Cursor Session Token Extractor** - 浏览器扩展
   - 自动从Cursor.com仪表板提取会话令牌
   - 一键复制到剪贴板
   - 支持Chrome和Microsoft Edge

2. **Cursor Usage Monitor** - VSCode扩展
   - 在VSCode状态栏实时显示Cursor AI使用量
   - 自动刷新使用数据
   - 详细的账单周期和使用统计信息

## ✨ 主要功能

### 🔄 自动化工作流程
- 浏览器扩展自动检测并提取会话令牌
- VSCode扩展自动读取剪贴板并更新配置
- 实时监控使用量和账单信息

### 📊 详细的使用统计
- 当前账单周期的使用情况
- 按模型分类的使用统计
- 输入/输出令牌计数
- 缓存读写统计
- 实时成本计算

### 🎯 用户友好的界面
- 简洁的状态栏显示
- 详细的工具提示信息
- 一键刷新功能
- 双击快速配置

## 🚀 快速开始

### 1. 安装浏览器扩展

#### Chrome Web Store
1. 访问 [Chrome Web Store](https://chromewebstore.google.com/detail/cursor-session-token-extr/pchppfhkjloedakahedjknknjppjpple)
2. 点击"添加到Chrome"
3. 确认安装

#### Microsoft Edge Add-ons
1. 访问 [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/hgabfbdfbpplaoakjkclmijoegfgcdli)
2. 点击"获取"
3. 确认安装

### 2. 安装VSCode扩展

1. 在VSCode中打开扩展面板 (Ctrl+Shift+X)
2. 搜索 "Cursor Usage"
3. 点击安装

### 3. 配置会话令牌

1. 访问 [Cursor Dashboard](https://cursor.com/dashboard)
2. 浏览器扩展会自动提取并复制会话令牌
3. 返回VSCode，扩展会自动检测剪贴板中的令牌并提示更新配置
4. 点击"Update"确认配置

## 📖 详细使用指南

### 浏览器扩展使用

1. **自动提取**：访问Cursor.com仪表板时，扩展会自动检测并复制会话令牌
2. **手动提取**：点击扩展图标，然后点击"Go to Cursor Dashboard"按钮
3. **通知确认**：成功复制后会显示确认通知

### VSCode扩展使用

#### 状态栏信息
- **单击**：刷新使用数据
- **双击**：打开配置对话框

#### 状态显示
- **未配置**：显示"⚡ Not Configured"
- **刷新中**：显示"⚡ Refreshing..."
- **已配置**：显示当前使用量和会员类型

#### 详细工具提示
悬停在状态栏项目上可查看：
- 账单周期信息
- 会员类型和状态
- 使用配额和剩余额度
- 按模型分类的使用统计
- 总成本和使用量

## ⚙️ 配置选项

### VSCode扩展设置

在VSCode设置中配置以下选项：

```json
{
  "cursorUsage.sessionToken": "your-session-token-here",
  "cursorUsage.refreshInterval": 300
}
```

- `sessionToken`: Cursor会话令牌（必需）
- `refreshInterval`: 自动刷新间隔（秒，默认300秒）

## 🔒 隐私和安全

### 数据保护
- ✅ 仅访问cursor.com域名
- ✅ 仅读取WorkosCursorSessionToken cookie
- ✅ 所有数据本地存储
- ✅ 不向外部服务器发送数据
- ✅ 不跟踪浏览活动

### 权限说明
- **activeTab**: 与当前标签页交互
- **storage**: 本地存储会话信息
- **tabs**: 监控标签页更新
- **cookies**: 读取cursor.com的会话令牌
- **clipboardWrite**: 复制令牌到剪贴板
- **host_permissions**: 仅访问cursor.com域名

## 🛠️ 技术架构

### 浏览器扩展
- **Manifest Version**: 3
- **背景脚本**: Service worker用于cookie监控
- **内容脚本**: 处理剪贴板操作和通知
- **弹出界面**: 简洁的用户界面

### VSCode扩展
- **TypeScript**: 类型安全的代码
- **Axios**: HTTP客户端
- **状态栏集成**: 实时显示使用信息
- **剪贴板监控**: 自动检测令牌

## 📁 项目结构

```
CursorUsage/
├── CursorUsage/                    # VSCode扩展
│   ├── src/
│   │   └── extension.ts           # 主要扩展逻辑
│   ├── package.json               # 扩展配置
│   └── README.md                  # VSCode扩展文档
├── CursorUsageTokenExtractor/     # 浏览器扩展
│   ├── background.js              # 背景脚本
│   ├── content.js                 # 内容脚本
│   ├── popup.html                 # 弹出界面
│   ├── manifest.json              # 扩展清单
│   └── README.md                  # 浏览器扩展文档
├── cursor_usage_logo.png          # 项目Logo
└── README.md                      # 项目总览（本文件）
```

## 🔧 开发指南

### 本地开发

#### 浏览器扩展
1. 克隆仓库
2. 打开Chrome/Edge扩展管理页面
3. 启用开发者模式
4. 点击"加载已解压的扩展程序"
5. 选择`CursorUsageTokenExtractor`文件夹

#### VSCode扩展
1. 克隆仓库
2. 在VSCode中打开`CursorUsage`文件夹
3. 按F5启动调试
4. 在新窗口中测试扩展

### 构建和打包

#### 浏览器扩展
```bash
cd CursorUsageTokenExtractor
# 创建ZIP文件用于发布
zip -r extension.zip . -x "*.git*" "*.DS_Store*"
```

#### VSCode扩展
```bash
cd CursorUsage
npm install
npm run compile
npm run package
```

## 🐛 故障排除

### 常见问题

**Q: 浏览器扩展没有检测到令牌？**
A: 确保已登录Cursor.com并访问仪表板页面，刷新页面可能有助于检测。

**Q: VSCode扩展显示"Not Configured"？**
A: 检查是否正确设置了会话令牌，或使用浏览器扩展重新提取令牌。

**Q: 使用数据不更新？**
A: 检查网络连接，或手动刷新状态栏项目。

**Q: 权限被拒绝？**
A: 确保扩展有必要的权限，特别是cookie和剪贴板权限。

### 获取帮助

- 📧 邮箱: [your-email@domain.com]
- 🐛 问题反馈: [GitHub Issues](https://github.com/whyuds/CursorUsage/issues)
- 📖 文档: [GitHub Wiki](https://github.com/whyuds/CursorUsage/wiki)

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🤝 贡献

欢迎贡献代码！请查看 [CONTRIBUTING.md](CONTRIBUTING.md) 了解贡献指南。

## 📈 版本历史

### v1.0.0
- 初始版本发布
- 浏览器扩展自动令牌提取
- VSCode扩展实时使用监控
- 支持Chrome和Microsoft Edge

## 🙏 致谢

感谢所有为这个项目做出贡献的开发者和用户！

---

**注意**: 此扩展仅用于个人使用量监控，请遵守Cursor.com的服务条款。
