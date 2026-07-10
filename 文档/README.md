# LabMate - AI 实验数据分析助手

面向理工科大学生的实验数据分析工具。上传 Excel/CSV，AI 自动分析并生成 PDF 报告。

**在线体验：** https://gashen0.github.io/labmate/

## 项目结构

```
LabMate/
├── 页面/                 # HTML 页面
│   ├── index.html        # 首页（产品介绍 + 竞品对比）
│   ├── upload.html       # 上传页（文件上传 + 模板库 + 数据预览）
│   ├── analysis.html     # 分析页（统计引擎 + 图表 + AI 分析）
│   └── report.html       # 报告页（完整报告 + PDF 导出）
├── 脚本/                 # JavaScript 逻辑
│   ├── upload.js         # 文件解析、Sheet 切换、模板加载
│   ├── analysis.js       # 统计计算、AI 调用、图表渲染
│   └── report.js         # 数据组装、PDF 生成
├── 数据/                 # 示例数据与模板
│   ├── templates.json    # 实验模板数据
│   ├── 示例1_吸光度标准曲线.csv
│   ├── 示例2_温度反应速率.csv
│   └── 示例3_酶活性pH曲线.csv
├── 文档/                 # 文档与截图
│   ├── README.md
│   ├── 参赛帖子.md
│   └── screenshot_*.png
└── 部署/                 # 部署相关
    ├── deploy.sh
    └── .gitignore
```

## 快速开始

### 在线使用
直接访问 https://gashen0.github.io/labmate/ ，无需安装。

### 本地运行
```bash
# 克隆仓库
git clone https://github.com/Gashen0/labmate.git
cd labmate

# 任意静态服务器均可，例如：
python3 -m http.server 8080
# 然后打开 http://localhost:8080
```

> 注意：直接双击 `index.html` 打开也可以使用大部分功能（统计引擎、图表），但 AI 分析因浏览器 CORS 限制需要通过 HTTP 服务器访问。

## AI 分析配置

AI 深度分析功能使用豆包大模型 API。不配置也可使用全部统计和图表功能，AI 分析会自动降级为本地统计引擎。

### 配置方法

1. 登录 [火山引擎 ARK 平台](https://console.volcengine.com/ark)
2. 创建推理接入点，获取 API Key
3. 在浏览器控制台执行：
```javascript
localStorage.setItem('labmate_api_key', '你的API Key')
```

## 核心模块说明

### 统计引擎（analysis.js）

| 函数 | 功能 | 算法 |
|------|------|------|
| `computeStats(values)` | 描述性统计 | 均值、标准差、中位数、CV、最大最小值 |
| `pearsonCorrelation(x, y)` | 相关分析 | Pearson 相关系数 |
| `linearRegression(x, y)` | 回归分析 | 最小二乘法线性回归，返回斜率、截距、R² |
| `detectOutliers()` | 异常值检测 | 3σ 法则 |
| `detectExperimentType()` | 实验类型识别 | 列名关键词匹配 + 数据结构启发式 |

### AI 分析流程（analysis.js）

```
generateConclusions()
  → processData()           # 解析数据、计算统计
  → detectExperimentType()  # 本地实验类型识别
  → callDoubaoAI(context)   # 调用豆包 API
  → parseAIResponse(text)   # 解析结构化响应
  → renderStructuredSections()  # 渲染 5 段分析 + 打字机效果
  ↓ 失败时降级
  → generateLocalFallback() # 本地统计引擎生成结论
```

### 图表渲染（analysis.js）

| 类型 | 函数 | 说明 |
|------|------|------|
| 折线图 | `renderChart('line')` | 各数值列趋势 |
| 柱状图 | `renderChart('bar')` | 各数值列均值对比 |
| 散点图 | `renderChart('scatter')` | 最强相关变量对 + 回归线 |
| 箱线图 | `renderChart('box')` | 五数概括 + IQR 离群点标注 |

### 数据管道（upload.js）

```
handleFile(file)
  → parseAndUpload(file, ext)
    → SheetJS 读取 → 解析所有 Sheet → allSheets{}
  → renderSheetSelector()  # 多 Sheet 标签页
  → renderPreview()        # 数据预览表格
  → saveToStorage()        # 存入 localStorage
```

## 技术栈

- **前端框架：** 无框架，原生 HTML/CSS/JS
- **Excel 解析：** [SheetJS 0.18.5](https://sheetjs.com/)（CDN）
- **图表：** [ECharts 5.4.3](https://echarts.apache.org/)（CDN）
- **PDF 导出：** [html2pdf.js 0.10.1](https://github.com/eKoopmans/html2pdf.js)（CDN）
- **AI 模型：** 豆包 doubao-seed-2-0-lite（火山引擎 ARK API）
- **部署：** GitHub Pages

## 已知限制

- 数据通过 `localStorage` 在页面间传递，受浏览器 5MB 存储限制
- AI 分析依赖外部 API，离线时自动降级为本地统计引擎
- PDF 导出基于 html2canvas 截图，复杂布局可能有微小偏差

## License

MIT