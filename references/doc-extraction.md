# 老格式文档 (.doc) 提取

SIA 评估经常遇到 `.doc`（Word 97-2003）格式的项目书。`read_file` 只能处理 `.docx`，`.doc` 需要额外工具。

## 方案：antiword（最轻量）

```bash
antiword "<项目书.doc>"
```

安装：`winget install antiword`，或从所用系统的包管理器获取对应版本。

## 备选方案

| 工具 | 命令 | 适用场景 |
|------|------|---------|
| LibreOffice | `soffice --headless --convert-to txt file.doc` | antiword 失败时的后备 |
| python-docx | 不支持 .doc | 仅限 .docx |
| olefile + 手动解析 | 复杂 | 极端情况 |

## 常见问题

- 如果 antiword 输出乱码：检查系统编码，或改用 LibreOffice
- 如果 .doc 有表格/图片：antiword 只能提取文本，复杂格式会丢失
- 如果文件是 `.doc` 实为 `.docx`：改扩展名后直接用 read_file
