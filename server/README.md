# SIA 服务端 · 可公开资产

> 本目录随 `insigoo-sia-open` v3.2.0 开放（MIT）。**不含任何生产凭据、内部网络地址、真实项目数据或绝对路径**。

## 1. 定位

SIA 技能包本身可完全离线独立运行，服务端是**选配件**：用于同类目对标、复用已有评估数据、以及让 AI 助手直接查库出报告。不接入不影响 L1 / L2 / D 线的评估完整性。

数据底座为 PostgreSQL，部署于 **insigoo 自有云服务器**；`www.insigoo.com.cn` 为本项目自有官网。技能包通过 SSH 隧道或本机直连访问只读实例，数据库不暴露公网。

## 2. 两种服务端形态

| 形态 | 技术栈 | 传输 |
|---|---|---|
| `sia-kb` MCP Server | TypeScript + `@modelcontextprotocol/sdk` + `zod` + `pg` | stdio（AI 助手直接拉起子进程，无需公网暴露） |
| REST API | FastAPI + 同步 `psycopg` + `run_in_threadpool` | 本机 HTTP（默认 `127.0.0.1:8787`），自带 `/docs` `/redoc` `/openapi.json` |

### MCP Server 的 7 个工具

| 工具 | 用途 |
|---|---|
| `list_projects` | 项目列表，按 `category` / `evidence_level` / `l2_grade` 过滤 |
| `get_project` | 单项目详情 + L2 四维评分 + 全部指标 |
| `get_indicators` | 指标明细，按 `project_id` / `indicator_code` / `layer` 过滤 |
| `search_kb` | 语义检索（自动拉取全库 sourceId 后检索） |
| `l3_signals` | L3 启动三信号实时水位 |
| `get_counterfactual` | 反事实四系数 + 净贡献率 + L3 轨道资格；未授权时走「系数输入计算模式」 |
| `generate_report` | 聚合项目 + L2 + 反事实资格 + L3 轨道建议，输出 JSON 与 Markdown 摘要 |

### REST API 的 7 个端点

`GET /health`、`/projects`、`/projects/{id}`、`/indicators`、`/l3/signals`、`/l3/counterfactual/{id}`、`/report/{id}`。

> 两种形态的能力**尚未完全对齐**：MCP 侧另有 `sroi_central` 口径判定、L3 章节与 Markdown 摘要；REST 侧的 `positive_value` 判据与 MCP 不同。以 `calc.ts` 的纯函数为准，接入时请勿混用两套判定结果。

## 3. 本目录内容

| 文件 | 说明 |
|---|---|
| `calc.ts` | 计算内核，从内部服务端**字节级复制**。含 `netContributionRate()` / `evaluateL3Signals()` / `classifySroiBasis()` / `sroiVerdict()` 四个纯函数，零依赖，可独立 `tsc --strict --noEmit` 编译 |
| `.env.example` | 环境变量占位符模板，复制为 `.env` 后自行填写，**不含任何真实值** |

`calc.ts` 实现的反双重扣减守卫值得单独说明：第三方按标准 SROI 方法论发布的数值绝大多数为「净」口径，已内含四系数调整，**严禁再乘自估净贡献率**；仅当口径明示为「毛」时才允许派生，口径不明按保守原则不派生。规则详见 `../references/l3/l3-redline-double-deduction.md`。

## 4. 接入

1. 自行准备一个 PostgreSQL 实例，按下列字段清单建表并导入**你自己的**数据。
2. 复制 `.env.example` 为 `.env`，填写连接信息；建议只读账号、仅授予 `SELECT`。
3. MCP 形态：在 AI 助手的 MCP 配置中增加 `sia-kb` 条目（stdio，指向编译产物）后重载。
4. REST 形态：`uvicorn main:app --host 127.0.0.1 --port 8787`。

### 已核实字段清单（列名，非 DDL）

```
project_id, project_name, org_name, category, category_path, platform,
evidence_level, l2_grade, l2_total, has_counterfactual, l1_gate, entered_l2,
d1, d2, d3, d4, fairness_flag
```

`category` 为单字符码（A/B/C/D/X），`l2_grade` 为 A–D，`evidence_level` 为 A–E。历史接入文档中的 `title` / `source_platform` 为错误列名，请勿沿用。

反事实表涉及 `deadweight` / `attribution` / `displacement` / `drop_off`（**注意 `drop_off` 带下划线**）、`sroi_low` / `sroi_high`（净贡献率区间，非货币化 SROI）、四系数依据、三法货币化锚点、`fairness_statement`、`confidence_interval` 等字段。

### 环境变量

| 变量 | 用途 |
|---|---|
| `SIA_PG_HOST` / `SIA_PG_PORT` | 数据库主机与端口 |
| `SIA_PG_DB` / `SIA_PG_USER` / `SIA_PG_PW` | 库名、只读账号、口令 |
| `SAG_BASE` | 语义检索服务地址（选配） |

## 5. 开放边界（诚实说明）

本目录**不是**完整生产服务端源码。生产代码中的数据层、工具注册层、语义检索桥接与 REST 主程序包含生产凭据与内部网络地址，在凭据清理完成前不宜公开；且工具注册层依赖数据层，单独抽出无法编译。因此本版先开放：

- 可独立编译、无凭据的**计算内核**（`calc.ts`）
- 完整的**接口约定**与**字段清单**（本文件）
- **环境变量模板**（`.env.example`）

待完成凭据清理（移除硬编码值、改为环境变量注入、补 `.gitignore`、检查 git 历史并按需轮换）后，再以独立提交开放剩余源码。在公开仓库泄露凭据的代价远大于晚几天放出，故不做"先推再修"。

## 6. 数据与许可边界

- 本目录代码适用仓库根目录 `LICENSE`（MIT）。
- **不包含** 223 个项目的原始采集数据：其来源与不分发口径见 `../NOTICE.md` §2。
- 使用本目录代码接入自有数据时，请自行确保数据来源与用途符合相应平台条款。
