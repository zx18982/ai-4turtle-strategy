# 海龟交易策略（Turtle Trading Strategy）— 任务规范文档 (spec.md)

> 版本: 1.0.0 ｜ 创建日期: 2026-07-11 ｜ 作者: WorkBuddy
> 任务目录: `task04_turtle_strategy/`
> 配套数据: `task04_turtle_strategy/data/`（已于 2026-07-11 更新至最新交易日 2026-07-10）

---

## 一、任务概述

本任务是量化交易实习的进阶环节，目标是**深入理解并实践海龟交易策略（Turtle Trading Strategy）的核心要素**：

- **高低价格通道（Donchian Channel）**：用 N 日最高价/最低价构成突破通道，捕捉趋势启动。
- **平均真实波幅（ATR, Average True Range）**：衡量波动幅度，用于**仓位管理**与**止损幅度**设定。
- **止损条件（2N 止损）**：以 2 倍 ATR 作为跟踪止损，严格控制单笔风险。
- **交易信号**：基于通道突破产生买入/卖出信号，并配合金字塔加仓。

最终通过**模拟交易与回测**，用核心量化指标（最大回撤 MDD、夏普比率 Sharpe Ratio、累计回报 Cumulative Return 等）全面评估策略性能，为后续策略开发积累经验。

### 标的与数据（本任务共 4 支 A 股）

| 公司 | 代码 | 行业 | 数据条数 | 区间 | 最新收盘 |
|------|------|------|---------|------|---------|
| 中芯国际 | sh688981 | 半导体 | 260 | 2025-06-09 ~ 2026-07-10 | 163.02 |
| 比亚迪 | sz002594 | 新能源汽车 | 260 | 2025-06-17 ~ 2026-07-10 | 90.00 |
| 长江电力 | sh600900 | 电力 | 260 | 2025-06-17 ~ 2026-07-10 | 28.03 |
| 兆威机电 | sz003021 | 精密制造 | 260 | 2025-06-17 ~ 2026-07-10 | 86.73 |

> **关于「智谱」**：用户原计划新增「智谱（Zhipu AI）」，但该公司目前未在 A 股/港股上市、无股票代码，无法获取股价数据，已与用户确认**本轮暂跳过**。后续若需补充，可在 `fetch_data.py` 的 `STOCKS` 列表中加入任一已上市 AI/科技股（如寒武纪 688256）后重新运行脚本。

---

## 二、海龟交易策略核心原理

海龟策略由 Richard Dennis 与 William Eckhardt 在 1983 年提出，是一套**机械化的趋势跟踪系统**。本任务采用其经典「系统一」（短周期）：

| 要素 | 定义 | 本任务默认参数 |
|------|------|---------------|
| 入场通道（Entry Channel） | N 日最高价的最大值 | `entry_period = 20` |
| 出场通道（Exit Channel） | M 日最低价的最小值 | `exit_period = 10` |
| ATR 周期 | 真实波幅的 N 日均值 | `atr_period = 20` |
| 止损幅度 | 2 倍 ATR（2N 止损） | `stop_multiplier = 2` |
| 加仓步长 | 每上涨 0.5 倍 ATR 加 1 单位 | `add_step = 0.5` |
| 单笔风险 | 每单位风险 ≤ 1% 账户权益 | `risk_per_unit = 1%` |

### 2.1 高低价格通道（Donchian Channel）
```
上轨 upper_t = max(High_{t-N+1}, ..., High_t)      # N 日最高价
下轨 lower_t = min(Low_{t-M+1},  ..., Low_t)       # M 日最低价
```
- 价格**向上突破上轨** → 趋势可能启动（买入信号）；
- 价格**向下跌破下轨** → 趋势可能结束（卖出信号）。

### 2.2 平均真实波幅（ATR）
```
真实波幅 TR_t = max( High_t - Low_t,
                      |High_t - Close_{t-1}|,
                      |Low_t  - Close_{t-1}| )

ATR_t = SMA(TR, n)_t = (TR_t + TR_{t-1} + ... + TR_{t-n+1}) / n
```
ATR 反映市场波动剧烈程度，是海龟系统中**仓位与止损的唯一尺度**。

### 2.3 止损条件（2N 止损）
- 建仓后止损价 = 入场价 − 2 × ATR（多头）。
- 随价格上涨，止损价**只上移不下移**（跟踪止损），保护利润。

### 2.4 交易信号逻辑
```
买入信号: Close_t > upper_t (突破 N 日高点)，且当前无持仓（或按金字塔加仓）
卖出信号: Close_t < lower_t (跌破 M 日低点) 或 Close_t <= 止损价 (触发 2N 止损)
```
> 信号在**收盘后确认，次日开盘价执行**（回测默认 `next_open`）。

---

## 三、任务工作步骤规划

将整个任务拆解为 7 个阶段，按序推进，前一个阶段产出是后一个阶段的输入：

| 阶段 | 名称 | 主要产出 | 状态 |
|------|------|---------|------|
| Phase 0 | 数据准备 | 4 支股票 260 日 JSON 数据 + `fetch_data.py` | ✅ 已完成 |
| Phase 1 | 数据加载模块 | 统一的数据读取/校验函数 | ⬜ 待实现 |
| Phase 2 | 价格通道计算 | 上/下轨通道曲线 | ⬜ 待实现 |
| Phase 3 | ATR 计算 | ATR 序列 | ⬜ 待实现 |
| Phase 4 | 信号生成 | 买卖信号序列 + 止损价序列 | ⬜ 待实现 |
| Phase 5 | 可视化 | 价格/通道/信号/买卖标记交互图 | ⬜ 待实现 |
| Phase 6 | 回测与指标 | 模拟交易记录 + MDD/Sharpe/CumRet 等 | ⬜ 待实现 |
| Phase 7 | 整合与报告 | Web 工具 + 汇总报告 HTML | ⬜ 待实现 |

> 实现建议：Phase 1~4 可在一个 `strategy.py`（或 Python 脚本）中完成计算；Phase 5~6 的结果导出为 JSON/CSV 供前端可视化；Phase 7 用纯前端（ECharts）整合。

---

## 四、功能设计（六大模块）

> 对应需求中的 6 个功能点，每个模块给出**输入 / 输出 / 核心函数 / 关键公式**。

### 模块 1：加载已存储的股价数据
- **输入**：`task04_turtle_strategy/data/{code}_daily.json`
- **输出**：标准化 DataFrame / JS 对象数组（按日期升序）
- **字段映射**：`date, open, close, high, low, volume, amount`
- **函数**：
  - `load_stock_data(code)` — 读取单只股票
  - `load_all_stocks()` — 读取全部股票
  - `get_stock_list()` — 读取 `stocks.json` 元数据
- **数据校验（data checks）**：
  - 记录数 ≥ 60（保证 20 日通道 + 20 日 ATR 有足够窗口）
  - `close/high/low` 无 NaN
  - 日期升序、基本连续（节假日除外）
  - 字段类型正确（价格为 float）

### 模块 2：设定通道周期并计算高低价格通道
- **输入**：日线数据 `(date, high, low, close, ...)`
- **参数**（可配置）：
  - `entry_period` 默认 **20**（入场通道：N 日高点）
  - `exit_period`  默认 **10**（出场通道：M 日低点）
- **输出**：新增 `upper_channel`（上轨）、`lower_channel`（下轨）列
- **函数**：
  - `calculate_donchian(data, entry_period=20, exit_period=10)`
- **公式**：
  ```
  upper_channel_t = max(High[t-entry_period+1 .. t])
  lower_channel_t = min(Low [t-exit_period +1 .. t])
  ```
- **约束**：前 `entry_period-1` 个交易日 `upper_channel` 为 null；前 `exit_period-1` 个交易日 `lower_channel` 为 null。

### 模块 3：计算 ATR 数值
- **输入**：日线数据 `(high, low, close)`
- **参数**：`atr_period` 默认 **20**
- **输出**：新增 `tr`（真实波幅）、`atr` 列
- **函数**：
  - `calculate_atr(data, atr_period=20, method="SMA")`
    - `method="SMA"`：简单移动平均（本任务默认，贴合原始海龟）
    - `method="Wilder"`：Wilder 平滑（可选）
- **公式**：
  ```
  TR_t      = max(High_t - Low_t, |High_t - Close_{t-1}|, |Low_t - Close_{t-1}|)
  ATR_t     = mean(TR[t-atr_period+1 .. t])          # SMA 法
  ```
- **约束**：前 `atr_period` 个交易日 `atr` 为 null（需至少 `atr_period` 个 TR 值）。

### 模块 4：计算买入/卖出交易信号
- **输入**：含 `upper_channel`、`lower_channel`、`atr`、`close` 的数据
- **输出**：新增 `signal`（1=买入, -1=卖出, 0=无）、`stop_price`（跟踪止损价）列
- **函数**：
  - `generate_signals(data, entry_period=20, exit_period=10, stop_multiplier=2)`
  - `get_buy_signals(data)` / `get_sell_signals(data)`
- **逻辑（伪代码）**：
  ```
  position = 0          # 0=空仓, 1=持多
  stop_price = NaN
  for t in range(1, len(data)):
      if position == 0:
          if close[t] > upper_channel[t]:        # 突破 N 日高点
              signal[t] = 1                       # 买入
              position = 1
              stop_price = close[t] - 2 * atr[t]  # 2N 止损
      else:  # position == 1
          # 跟踪止损只上移
          new_stop = close[t] - 2 * atr[t]
          stop_price = max(stop_price, new_stop)
          if close[t] < lower_channel[t] or close[t] <= stop_price:
              signal[t] = -1                      # 卖出（跌破出场通道 或 触发止损）
              position = 0
              stop_price = NaN
  ```
- **说明**：
  - 买入信号 = 红 ↑；卖出信号 = 绿 ↓（遵循中国股市涨红跌绿惯例）。
  - 卖出信号包含两类来源：**通道出场**（跌破 M 日低点）与**2N 止损**。
  - 可选增强：金字塔加仓（每上涨 0.5×ATR 加 1 单位），本任务先实现基础版，加仓作为可选扩展。

### 模块 5：可视化图形
- **引擎**：ECharts 5.5（与前期任务一致，CDN 引入）
- **主图图层**：
  1. 收盘价折线（`close`，深灰蓝）
  2. 上轨通道折线（`upper_channel`，红色虚线）
  3. 下轨通道折线（`lower_channel`，绿色虚线）
  4. ATR 折线（次级 Y 轴，橙色）
  5. 买入信号标记（红色向上三角 ▲，label「买」）
  6. 卖出信号标记（绿色向下三角 ▼，label「卖」）
  7. （可选）止损价折线（浅红，跟踪止损轨迹）
- **交互**：tooltip 悬停、wheel 缩放、legend 切换、股票切换下拉框。
- **回测对比图**：策略累计回报曲线（红，含面积填充）vs 买入持有基准（灰色虚线）。

### 模块 6：模拟交易与回测，计算量化指标
- **输入**：含 `signal`、`stop_price` 的数据
- **输出**：每日权益（daily equity）+ 交易记录（trades）+ 指标汇总（metrics）
- **回测参数**：
  - `initial_capital = 100000`（人民币）
  - `commission_rate = 0.0003`（万三手续费）
  - `trade_execution = "next_open"`（信号次日开盘执行）
  - `position_sizing = "ATR_unit"`：单位仓位 = 1% 权益 / ATR（海龟经典，可选；基础版可先用全仓）
- **模拟流程**：
  1. 加载数据，按日期升序。
  2. 遍历每日信号：买入→建仓并记录成本与 2N 止损；卖出→平仓并记录盈亏。
  3. 每日更新总权益 = 现金 + 持仓市值，并记录 `cumulative_return`。
- **核心量化指标**：
  - **最大回撤 MDD**：`MDD = min((Equity_t - Peak_t)/Peak_t) × 100%`
  - **夏普比率 Sharpe**：`Sharpe_annual = mean(r)/std(r) × sqrt(252)`（日收益 r_t，无风险利率取 0）
  - **累计回报 CumRet**：`(Final_Equity - Initial_Capital)/Initial_Capital × 100%`
  - **附加**：胜率 WinRate、总交易次数、平均持仓天数、年化收益、年化波动率、基准（买入持有）回报、超额收益。

---

## 五、数据方案

- **数据来源**：`westock-data` CLI（前复权 qfq 日线）。
- **更新状态**：已于 2026-07-11 重新拉取，覆盖至最新交易日 **2026-07-10**（共 260 个交易日）。
- **字段**：`date, open, close, high, low, volume, amount`。
- **再更新方式**：修改 `fetch_data.py` 的 `STOCKS` 列表（如新增标的）后运行 `python fetch_data.py`。

---

## 六、可视化与回测设计要点

- **配色规范**（涨红跌绿）：买入 ▲ 红、卖出 ▼ 绿；上轨红虚线、下轨绿虚线；收盘价深灰蓝；ATR 橙；策略回报红、基准灰虚线。
- **精度**：价格与指标保留 2 位小数。
- **禁止项**：不使用第三方回测框架（如 backtrader），所有均线/通道/ATR/信号/回测逻辑手动实现，过程可追溯。

---

## 七、文件结构（规划交付物）

```
task04_turtle_strategy/
├── spec.md                  # 本规范文件
├── fetch_data.py            # 数据获取脚本（已完成）
├── data/                    # 股价数据目录（已完成）
│   ├── stocks.json
│   ├── sh688981_daily.json  # 中芯国际
│   ├── sz002594_daily.json  # 比亚迪
│   ├── sh600900_daily.json  # 长江电力
│   └── sz003021_daily.json  # 兆威机电
├── strategy.py              # 策略计算引擎（通道+ATR+信号+回测）【待实现】
├── web_tool/                # 交互式可视化工具【待实现】
│   ├── index.html
│   ├── css/style.css
│   └── js/{app.js, strategy.js, charts.js}
├── output/                  # 回测输出（CSV/JSON）【待实现】
└── turtle_report.html       # 汇总报告【待实现】
```

---

## 八、验收标准

- **数据**：4 支股票数据更新至 2026-07-10，每支 ≥ 200 条，字段完整。
- **通道**：上/下轨 Donchian 通道按设定周期（默认 20/10）正确计算。
- **ATR**：TR 与 ATR(20) 计算正确，前 20 日无值。
- **信号**：突破上轨买入（红▲）、跌破下轨或触发 2N 止损卖出（绿▼），信号交替合理。
- **可视化**：主图显示价格、上下通道、ATR、买卖标记；支持股票切换与缩放。
- **回测**：模拟交易完整执行；MDD（≤0）、Sharpe（已年化）、Cumulative Return 计算正确；与买入持有基准可对比。
- **整体**：浏览器直接打开 `index.html` 即可使用，默认展示第一支股票策略图。

---

## 九、后续扩展方向

1. 金字塔加仓（每 0.5×ATR 加 1 单位）与多单位持仓。
2. 长周期系统（55/20）与短周期系统对比。
3. 参数寻优：自动搜索最优 entry/exit/ATR 周期组合。
4. 加入「智谱」替代标的（如寒武纪 688256）扩展为 5 支。
5. 多标的组合回测与相关性分析。
6. 蒙特卡洛模拟评估策略稳健性。
