# 房源爬虫和数据库系统

## 概述
本目录包含房源数据采集、处理和管理的完整系统。

## 目录结构

### house-scraper/
房源列表和详情页爬虫核心代码

- **run.js** - 主爬虫程序，使用Playwright自动化浏览器采集房源数据
  - 采集列表页：房源ID、价格、位置、基本信息
  - 采集详情页：详细信息、图片、平面图、可用性状态
  - 支持增量更新和断点续爬

- **detail-scraper.js** - 详情页专用爬虫
  - 采集房间具体信息：状态、可用性、选项等
  - 处理图片和平面图下载

- **auto-login.js** - 自动登录模块
  - 处理Itandi网站的登录流程
  - 定时刷新session

- **human-like.js** - 反爬虫规避
  - 模拟人工操作：随机延迟、滚动等
  - 避免被网站检测为爬虫

- **list-only.js** - 列表专用爬虫
  - 仅采集列表页信息
  - 快速扫描更新

- **config.js** - 配置文件
  - API端点、登录凭证、采集参数

- **package.json** - 依赖管理

### 其他脚本

- **refetch-bad-details.js** - 补充采集
  - 重新采集失败或数据不完整的房源
  - 修复数据缺陷

- **backfill-floorplans.js** - 平面图补充
  - 为缺少平面图的房源补充采集
  - 优化数据完整性

## 使用方法

### 环境要求
- Node.js >= 14
- npm/yarn
- Playwright浏览器驱动

### 安装依赖
```bash
cd house-scraper
npm install
```

### 运行爬虫
```bash
# 启动完整采集
node run.js

# 采集列表页
node list-only.js

# 详情页采集
node detail-scraper.js

# 补充采集失败数据
node refetch-bad-details.js

# 补充平面图
node backfill-floorplans.js
```

## 数据输出

采集数据存储在 Volumes/NewVolume1/mimap-scraper-out/ 目录：

```
houses/
├── {room_id}/
│   ├── detail.json          # 房源详情
│   ├── thumb.jpg            # 缩略图
│   ├── images/              # 高清图片目录
│   │   ├── {id}.jpg
│   │   └── ...
│   └── floorplan/           # 平面图目录
│       ├── {id}.jpg
│       └── ...
├── page_1.json              # 列表页数据
├── page_2.json
└── ...
```

## API数据格式

### 房源详情 (detail.json)
```json
{
  "data": {
    "id": 72535412,
    "name": "房间名称",
    "status_type": "active|inactive|unavailable",
    "creating_estimate_availability": "可用性状态",
    "all_options": ["选项1", "选项2"],
    "price": 50000,
    "latitude": 35.123,
    "longitude": 139.456,
    "images": [{"src": "image_url"}],
    ...
  }
}
```

## 特殊说明

- 爬虫遵守网站robots.txt和服务条款
- 采集频率受控，避免服务器压力
- 数据仅供研究使用

## 后续计划

- [ ] 数据库集成（PostgreSQL）
- [ ] 实时更新流程
- [ ] 数据验证和清洗
- [ ] API服务暴露
- [ ] 定时任务配置
