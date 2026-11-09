# PDF 报告输出指引

> **适用范围（v3.2.1 并入说明）**：`templates/sia-report.html` 是 **L1 完整体检报告**的 HTML 版式模板，对应七板块基础结构。v2.2 起 L1 报告新增「SDG 贡献对齐」「非预期结果」两节，使用时需手动追加对应板块；**L2 指标量化报告与 D 线尽调报告请继续使用 Markdown 模板**（`l2-report-template.md`），不要套用本 HTML 模板。
> PDF 输出是**可选增强**：核心评估（L1 / L2 / L3 草案 / D 线）纯离线、不写文件、不执行命令；仅在用户明确要求 HTML / PDF 交付物时走本流程，需本机已安装 Playwright + Chromium（首次安装需联网，之后离线可用）。依赖缺失或转换失败时降级为 Markdown 输出，不得阻塞评估结论。

## 工作流

```
评估完成 → 读取 templates/sia-report.html 模板 → 填入评估数据 → 保存 HTML
         → python scripts/sia-to-pdf.py <报告.html> → 交付 PDF
```

## 步骤

### 1. 读取 HTML 模板

加载 `templates/sia-report.html`，将评估结果填入模板中的 `{变量}` 占位符。

### 2. CSS 类变量映射

| 变量 | 可选值 |
|------|--------|
| `{健康度CSS类}` | `health-green` / `health-yellow` / `health-orange` / `health-red` |
| `{健康度文字}` | 健康 / 亚健康 / 需调理 / 需重构 |
| `{健康度图标}` | 🟢 / 🟡 / 🟠 / 🔴 |
| `{成熟度CSS类}` | `badge-info`(萌芽期) / `badge-warn`(基础期) / `badge-gold`(进阶期) / `badge-pass`(成熟期) |
| `{逻辑链badge}` 等 | `badge-pass`(通过) / `badge-warn`(部分通过) / `badge-fail`(未通过) |

### 3. 表格行填充

假设清单行格式：
```html
<tr><td>假设内容</td><td>显式/隐式</td><td>🟢/🟡/🔴</td><td>失效后果描述</td></tr>
```

问题清单行格式：
```html
<tr><td>P01</td><td>位置</td><td>问题描述</td><td>断链/跳跃/伪因果</td><td><span class="badge badge-fail">P0</span></td></tr>
```

处方卡片格式：
```html
<div class="prescription p0">
  <strong>P0 问题：...</strong><br>
  怎么改：...<br>
  预期效果：...
</div>
```

### 4. 转换为 PDF

```bash
python scripts/sia-to-pdf.py "<报告.html>"
```

前提：已安装 Playwright + Chromium（`pip install playwright && python -m playwright install chromium`）

### 5. 批量报告

批量评审模式下，每份项目独立生成一份报告。另生成一份横向对比汇总报告，核心是评分卡对比表（最高分行加 `class="best"`，分档列用 `tier-a`/`tier-b`/`tier-c`）。

### 6. 交付

PDF 生成后告知用户文件路径。
