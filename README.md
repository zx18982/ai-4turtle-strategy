# 海龟交易策略实验室

基于海龟交易法则的 A 股量化策略回测工具，纯前端实现，支持多标的、多参数组合对比。

## 功能

- **Donchian 通道**：可配置入场/出场通道周期（默认 20/10）
- **ATR 止损**：基于平均真实波幅的 2N 止损
- **完整回测引擎**：信号次日开盘执行，含手续费
- **量化指标**：累计回报、最大回撤、夏普比率、Sortino、Calmar、胜率、盈亏比等
- **交易信号评估**：信号胜率、假突破率、突破强度、信号质量评分（0-100）
- **可视化**：策略主图、权益曲线、回撤、收益率变化、信号分布、交易记录
- **参数组合对比**：5 套预设方案一键对比
- **CSV 导出**：交易记录一键导出

## 标的

| 名称 | 代码 | 行业 |
|------|------|------|
| 中芯国际 | sh688981 | 半导体 |
| 比亚迪 | sz002594 | 新能源汽车 |
| 长江电力 | sh600900 | 电力 |
| 兆威机电 | sz003021 | 精密制造 |

## 目录结构

```
task04_turtle_strategy/
  web_tool/              # 前端应用
    index.html           # 入口页面
    css/style.css        # 样式
    js/
      data.js            # 股价数据（自动生成）
      strategy.js        # 策略引擎（通道/ATR/信号/回测/指标）
      app.js             # UI 控制器
  data/                  # 原始股价 JSON
  update_data.py         # 数据更新脚本（akshare，CI/本地通用）
  fetch_data.py          # 数据获取脚本（westock-data，本地用）
  gen_data_js.py         # data.js 生成脚本
  spec.md                # 任务规范文档
  design.md              # 产品设计文档
  .github/workflows/
    daily-update.yml     # GitHub Action：每日自动更新数据
```

## 本地运行

```bash
# 1. 启动本地服务器
cd web_tool
python3 -m http.server 8090

# 2. 浏览器打开
open http://localhost:8090
```

## 数据更新

### 手动更新

```bash
pip install akshare
python update_data.py
```

### 自动更新

GitHub Action 会在每个交易日（周一至周五）北京时间 16:30 自动拉取最新数据并推送。

也可在 GitHub 仓库 → Actions → Daily Data Update → Run workflow 手动触发。

## 技术栈

- 纯 HTML + CSS + JavaScript（无构建步骤）
- ECharts 5.5（图表渲染）
- akshare（A 股数据源）
- GitHub Actions（CI/CD）

## 策略参数

| 参数 | 默认 | 说明 |
|------|------|------|
| 入场通道周期 | 20 | Donchian 上轨突破买入 |
| 出场通道周期 | 10 | Donchian 下轨突破卖出 |
| ATR 周期 | 20 | 平均真实波幅计算窗口 |
| 止损倍数 | 2 | 2×ATR 止损 |
| 初始资金 | 100,000 | 回测起始资金 |
| 手续费率 | 0.03% | 单边交易费率 |
