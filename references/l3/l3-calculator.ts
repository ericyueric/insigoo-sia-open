/**
 * insigoo SIA · L3 价值评估层 —— 参考实现（Reference Implementation）
 *
 * 许可：MIT ｜ 归属：因思阁 insigoo ｜ 仓库：github.com/ericyueric/insigoo-sia-open
 *
 * 本文件是 L3 三个算子的可执行定义，对应《l3-design-draft.md》v0.3：
 *   1. netContributionRate —— 反事实四系数净贡献率
 *   2. evaluateL3Signals   —— L3 启动三信号水位判定
 *   3. sroiVerdict         —— 货币化 SROI 裁决（含反双重扣减守卫）
 *
 * 本实现对一处历史错误做了显式防御并保留其说明（见 sroiVerdict 的「反双重扣减红线」段落）：
 * 早期实现无条件执行「中枢值 × 净贡献率」，并以并非毛口径的第三方净值做过乘法，
 * 产出与被判定为重复扣减而撤销的数值同源的错误结果。保留说明而非删去，是为了让复用者知道坑在哪里。
 * 详见《l3-redline-double-deduction.md》与《case-study-rural-water.md》§3。
 *
 * 本文件为纯函数实现，无任何外部依赖，可直接复制使用。
 */

// 反事实净贡献率与 L3 信号计算工具（纯函数，便于单测与复用）

/**
 * 净贡献率 = (1 - Deadweight) × (1 - Attribution) × (1 - Displacement) × (1 - Drop-off)
 * 系数范围 0~1（已按"比例"归一，例如 50% 传 0.5）
 */
export function netContributionRate(
  deadweight: number,
  attribution: number,
  displacement: number,
  dropoff: number
): number {
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  return (
    (1 - clamp(deadweight)) *
    (1 - clamp(attribution)) *
    (1 - clamp(displacement)) *
    (1 - clamp(dropoff))
  );
}

/**
 * L3 启动信号②「反事实通过率」= 已评 L2 且带反事实的项目数 / 已评 L2 项目总数
 * 分母钉死为「已评 L2 项目池」（2026-08-23 决策），全库 223 仅作长期成熟度参照。
 */
export interface L3SignalsInput {
  l2GradedCount: number; // 已评 L2 项目数
  cfAndGradedCount: number; // 已评 L2 且带反事实
  benchmarkCount: number; // 带反事实的 L2-B 及以上标杆数
  l2ACount: number; // L2-A 总数
  l2AGradedCount: number; // L2-A 且带反事实
  totalProjects: number; // 全库总数（仅监控参照）
}

export interface L3SignalStatus {
  signal: string;
  threshold: string;
  current: string;
  met: boolean;
  note: string;
}

export function evaluateL3Signals(s: L3SignalsInput): {
  signals: L3SignalStatus[];
  summary: string;
} {
  const cfRate = s.l2GradedCount > 0 ? s.cfAndGradedCount / s.l2GradedCount : 0;
  const cfRatePct = (cfRate * 100).toFixed(1) + '%';

  const sig1: L3SignalStatus = {
    signal: '① L2 跑通 50+ 项目（体系成熟度监控项）',
    threshold: '≥50（非硬阻塞）',
    current: `${s.l2GradedCount}`,
    met: s.l2GradedCount >= 50,
    note: '当前未达，但方法已跑通；随采集规模化提升',
  };
  const sig2: L3SignalStatus = {
    signal: '② 反事实通过率 ≥10%（分母=已评 L2 池）',
    threshold: '≥10%（已评 L2 池口径，钉死）',
    current: `${s.cfAndGradedCount}/${s.l2GradedCount} = ${cfRatePct}`,
    met: cfRate >= 0.1,
    note: `全库参照 ${s.cfAndGradedCount}/${s.totalProjects} = ${((s.cfAndGradedCount / s.totalProjects) * 100).toFixed(1)}%（仅监控，不参与启动判定）`,
  };
  const sig3: L3SignalStatus = {
    signal: '③ 3+ 全量数据公开标杆（L2-B 及以上 + 反事实）',
    threshold: '≥3',
    current: `${s.benchmarkCount}`,
    met: s.benchmarkCount >= 3,
    note: `L2-A 总数 ${s.l2ACount}，其中带反事实 ${s.l2AGradedCount}`,
  };

  const allMet = sig1.met && sig2.met && sig3.met;
  const coreMet = sig2.met && sig3.met;
  const summary = coreMet
    ? 'L3 方法体系启动信号（②+③）已达；①作体系成熟度监控。L3 进入「方法演示完成·双轨开放」阶段。'
    : 'L3 启动核心信号（②反事实通过率 + ③标杆）尚未全部达成，继续采集反事实数据。';

  return { signals: [sig1, sig2, sig3], summary };
}

/**
 * 货币化轨道 SROI 校验（2026-08-23 COZE 澄清后口径·方案A）。
 *
 * 字段语义（已与 COZE 对齐）：
 * - sroi_low/high = **净贡献率区间**（非货币化 SROI），由反事实四系数 (1-d)(1-a)(1-disp)(1-drop)
 *   的保守/乐观两端推导；已与库内回填值核对一致（三项目 net 均落在区间内）。
 * - sroi_central（COZE 待 ALTER 建列）= **货币化 SROI 点估计**（X:1 回报比，第三方/权威口径），
 *   仅在有明确来源时填，否则 NULL；与净贡献率是两种量纲，结构上分离根治混存 bug。
 *
 * 价值判定：positive_value 以净贡献率 netRate 为准（≥0.1 价值稳健为正），不以 sroi_low/high 直接判 SROI>1。
 *
 * ⚠️ **反双重扣减红线（2026-08-22 实例验证确立 · 2026-10-01 修正代码实现）**：
 * - 第三方按**标准 SROI 方法论**发布的 SROI 值，绝大多数为「**净**」口径——报告数值本身**已内含**
 *   死重/归因/替代/衰减四系数调整。此类值 **严禁**再 × 本项目自估净贡献率，否则构成**重复扣减**。
 *   教训案例：某项目第三方净 SROI 中枢值为 5.6，曾被误按「社会价值总额 × 0.52 ≈ 2.9」对外发布，
 *   该数值已被判定为重复扣减错误并撤销；正确中枢为 **5.6**，四系数 0.52 只能作独立敏感性参数。
 * - 仅当 basis 明示为「**毛**」口径（确认未做四系数调整）时，才允许派生：净值 = central × netRate。
 * - basis 缺失或无法判定时，按「净」口径处理，**不派生**。
 *   保守原则：**宁可少给一个派生数字，不可对外给一个错的、会被审计质疑的数字。**
 * - 历史实现缺陷：本函数早期无条件执行 central × netRate，并用 5.6 × 0.515 ≈ 2.88 作为示例，
 *   该结果与被撤销的 2.9 同源，属复活已作废结论。2026-10-01 起按 basis 毛/净分情况处理。
 */

/** 第三方 SROI 中枢值的口径类别 */
export type SroiBasisKind = 'net' | 'gross' | 'unknown';

/**
 * 判定第三方 SROI 中枢值属「毛」还是「净」口径。
 * - 先匹配 gross 关键词（明确写"毛/未扣/未调整"是最强信号，且"未扣净贡献率"这类文本同时含"净"字，故必须优先）
 * - 再匹配 net 关键词
 * - 命中"标准 SROI / standard SROI"按净口径处理（标准方法论必然内含四系数）
 * - 其余返回 unknown（调用方按保守原则不派生）
 */
export function classifySroiBasis(basis: string | null | undefined): SroiBasisKind {
  if (!basis) return 'unknown';
  const b = basis.toLowerCase().replace(/\s+/g, '');
  if (!b) return 'unknown';

  const grossHints = ['毛', 'gross', '未扣', '未经四系数', '未做四系数', '未含四系数',
    '未调整', '未净扣', '尚未调整', 'beforedeadweight', '未扣除'];
  if (grossHints.some((h) => b.includes(h.toLowerCase()))) return 'gross';

  const netHints = ['净', 'net', '已含', '已内含', '已扣', '含四系数', 'standard_sroi'];
  if (netHints.some((h) => b.includes(h.toLowerCase()))) return 'net';

  if (b.includes('标准sroi') || b.includes('standardsroi') || b.includes('标准方法论')) return 'net';

  return 'unknown';
}

export interface SroiVerdict {
  sroi_range: [number | null, number | null];
  sroi_basis_note: string;
  positive_value: boolean | null;
  sensitivity_note: string;
  sroi_central_value: number | null;
  sroi_central_basis: string | null;
  /** 中枢值口径判定：net=已内含四系数（不得再乘）/ gross=未调整（可派生）/ unknown=无法判定 */
  sroi_central_basis_kind: SroiBasisKind;
  /** 派生净值：仅 gross 口径时 = central × netRate；net/unknown 时恒为 null */
  sroi_central_net_derived: number | null;
  /** 派生或禁止派生的原因说明（对外披露，保证可复算） */
  sroi_central_derivation_note: string;
}

export function sroiVerdict(
  sroiLow: number | null,
  sroiHigh: number | null,
  netRate: number | null,
  sroiCentral?: number | null,
  sroiCentralBasis?: string | null
): SroiVerdict | null {
  const low = sroiLow ?? sroiHigh;
  const high = sroiHigh ?? sroiLow;
  const range: [number | null, number | null] = [low ?? null, high ?? null];
  const basisNote =
    'sroi_low/high = 净贡献率区间（方案A口径·非货币化SROI），由反事实四系数 (1-d)(1-a)(1-disp)(1-drop) 保守/乐观两端推导，已与库内回填值核对一致。';
  let positive: boolean | null = null;
  if (netRate !== null && netRate !== undefined && !Number.isNaN(netRate)) {
    positive = netRate >= 0.1;
  }
  let sensitivity = '无法做敏感性佐证（缺自估净贡献率）';
  if (positive !== null) {
    sensitivity =
      positive
        ? `自估净贡献率 ${netRate!.toFixed(2)} ≥ 0.1，价值稳健为正（净贡献率口径）；货币化 SROI 需另见 sroi_central`
        : `自估净贡献率 ${netRate!.toFixed(2)} < 0.1，价值折损偏高，需复核四系数`;
  }
  // ── 中枢值口径判定 + 反双重扣减守卫 ──────────────────────────────
  let centralVal: number | null = null;
  let centralBasis: string | null = sroiCentralBasis ?? null;
  let netDerived: number | null = null;
  const basisKind = classifySroiBasis(centralBasis);
  let derivationNote: string;

  if (sroiCentral === undefined || sroiCentral === null || Number.isNaN(sroiCentral)) {
    derivationNote = '无第三方 SROI 中枢值（sroi_central 为 NULL），不产生派生净值。';
  } else {
    centralVal = sroiCentral;
    const netOk = netRate !== null && netRate !== undefined && !Number.isNaN(netRate);

    if (basisKind === 'gross') {
      // 唯一允许派生的情形：basis 明示为毛口径（未做四系数调整）
      if (netOk) {
        netDerived = Number((sroiCentral * netRate!).toFixed(3));
        derivationNote =
          `中枢值 ${sroiCentral} 判定为【毛】口径（未做四系数调整），允许派生：` +
          `净SROI ≈ ${sroiCentral} × 净贡献率 ${netRate!.toFixed(4)} = ${netDerived}。` +
          `依据：${centralBasis ?? '（basis 未提供）'}。`;
      } else {
        derivationNote =
          `中枢值 ${sroiCentral} 为【毛】口径但缺有效净贡献率，无法派生净值；` +
          `在未取得净贡献率前不得直接引用该毛值作为净 SROI 结论。`;
      }
    } else {
      // net / unknown 一律不派生 —— 保守原则，防止重复扣减
      const kindLabel = basisKind === 'net' ? '【净】' : '【口径未明示，按净处理】';
      derivationNote =
        `中枢值 ${sroiCentral} 判定为${kindLabel}口径。` +
        (basisKind === 'net'
          ? '标准 SROI 方法论的净值已内含死重/归因/替代/衰减四系数调整，'
          : '未取得明确毛口径声明，按保守原则视为已内含四系数调整，') +
        '**严禁再 × 本项目自估净贡献率**（重复扣减）。' +
        (netOk
          ? `自估净贡献率 ${netRate!.toFixed(4)} 仅作独立敏感性参数使用，不参与货币化数值推导。`
          : '（无有效净贡献率，也不作敏感性佐证。）') +
        (centralBasis ? `依据：${centralBasis}。` : '建议向第三方索取并回填口径说明后再复用此值。');
    }
  }

  return {
    sroi_range: range,
    sroi_basis_note: basisNote,
    positive_value: positive,
    sensitivity_note: sensitivity,
    sroi_central_value: centralVal,
    sroi_central_basis: centralBasis,
    sroi_central_basis_kind: basisKind,
    sroi_central_net_derived: netDerived,
    sroi_central_derivation_note: derivationNote,
  };
}
