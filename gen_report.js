/**
 * gen_report.js — 生成海龟策略多标的对比分析报告
 * 运行方式：node gen_report.js
 * 输出：turtle_report.html
 */
var fs = require('fs');
var path = require('path');

// 加载数据和策略引擎（在沙箱中执行，模拟浏览器 window 对象）
var vm = require('vm');
var window = {};
var sandbox = { window: window, Math: Math, Date: Date, JSON: JSON, console: console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'web_tool/js/data.js'), 'utf-8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'web_tool/js/strategy.js'), 'utf-8'), sandbox);
var T = window.Turtle;
var STOCKS = window.STOCK_DATA;

// 参数预设
var PRESETS = T.PRESETS;
var presetKeys = Object.keys(PRESETS);

// 基础回测参数
var baseParams = {
  initialCapital: 100000,
  commissionRate: 0.0003
};

// ========== 1. 多标的横向对比（经典海龟参数） ==========
var crossStockResults = {};
var stockNames = [];
var stockCodes = [];

Object.keys(STOCKS).forEach(function(code) {
  var s = STOCKS[code];
  stockNames.push(s.name);
  stockCodes.push(code);
  var data = s.data;
  var params = Object.assign({ entryPeriod: 20, exitPeriod: 10, atrPeriod: 20, stopMultiplier: 2 }, baseParams);
  var r = T.runBacktest(data, params);
  crossStockResults[code] = {
    name: s.name,
    code: code,
    industry: s.industry,
    metrics: r.metrics,
    signalEval: r.signalEval,
    equity: r.equity.map(function(e) { return { date: e.date, equity: e.equity, close: e.close }; }),
    trades: r.trades.filter(function(t) { return t.type === 'sell'; })
  };
});

// ========== 2. 每标的多参数组合对比 ==========
var paramComboResults = {};

Object.keys(STOCKS).forEach(function(code) {
  var s = STOCKS[code];
  var data = s.data;
  paramComboResults[code] = {
    name: s.name,
    code: code,
    industry: s.industry,
    presets: {}
  };

  presetKeys.forEach(function(pk) {
    var preset = PRESETS[pk];
    var params = Object.assign({
      entryPeriod: preset.entryPeriod,
      exitPeriod: preset.exitPeriod,
      atrPeriod: preset.atrPeriod,
      stopMultiplier: preset.stopMultiplier
    }, baseParams);
    var r = T.runBacktest(data, params);
    paramComboResults[code].presets[pk] = {
      presetName: preset.name,
      presetKey: pk,
      desc: preset.desc,
      metrics: r.metrics,
      signalEval: r.signalEval,
      equity: r.equity.map(function(e) { return { date: e.date, equity: e.equity }; }),
      trades: r.trades.filter(function(t) { return t.type === 'sell'; })
    };
  });
});

// ========== 3. 找每标的最优参数 ==========
var bestParams = {};
Object.keys(paramComboResults).forEach(function(code) {
  var presets = paramComboResults[code].presets;
  var best = null;
  var bestScore = -Infinity;
  presetKeys.forEach(function(pk) {
    var p = presets[pk];
    // 综合评分：累计回报 + 夏普*10 - 最大回撤*0.3 + 胜率*0.2
    var m = p.metrics;
    var score = (m.cumRet || 0) + (m.sharpe || 0) * 10 - Math.abs(m.mdd || 0) * 0.3 + (m.winRate || 0) * 0.2;
    if (score > bestScore) {
      bestScore = score;
      best = { presetKey: pk, presetName: p.presetName, score: score, metrics: m };
    }
  });
  bestParams[code] = best;
});

// ========== 4. 计算各标的的特征指标 ==========
var stockCharacteristics = {};
Object.keys(STOCKS).forEach(function(code) {
  var s = STOCKS[code];
  var data = s.data;
  var closes = data.map(function(d) { return d.close; });
  var highs = data.map(function(d) { return d.high; });
  var lows = data.map(function(d) { return d.low; });

  // 日收益率
  var dailyRets = [];
  for (var i = 1; i < closes.length; i++) {
    dailyRets.push(closes[i] / closes[i - 1] - 1);
  }

  // 年化波动率
  var avgRet = dailyRets.reduce(function(a, b) { return a + b; }, 0) / dailyRets.length;
  var variance = dailyRets.reduce(function(s, r) { return s + (r - avgRet) * (r - avgRet); }, 0) / (dailyRets.length - 1);
  var vol = Math.sqrt(variance) * Math.sqrt(252) * 100;

  // 趋势性指标：价格变化的标准差与收益率的比值
  var totalReturn = (closes[closes.length - 1] / closes[0] - 1) * 100;

  // 最大涨幅和最大跌幅
  var maxPrice = Math.max.apply(null, highs);
  var minPrice = Math.min.apply(null, lows);
  var priceRange = (maxPrice / minPrice - 1) * 100;

  // 趋势强度：线性回归斜率
  var n = closes.length;
  var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (var j = 0; j < n; j++) {
    sumX += j; sumY += closes[j]; sumXY += j * closes[j]; sumX2 += j * j;
  }
  var slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  var trendStrength = slope * n / closes[0] * 100; // 归一化趋势强度

  // 平均ATR占比
  var atrRes = T.calcATR(data, 20);
  var atrPcts = [];
  for (var k = 20; k < data.length; k++) {
    if (atrRes.atr[k] && data[k].close) {
      atrPcts.push(atrRes.atr[k] / data[k].close * 100);
    }
  }
  var avgAtrPct = atrPcts.reduce(function(a, b) { return a + b; }, 0) / atrPcts.length;

  stockCharacteristics[code] = {
    name: s.name,
    code: code,
    industry: s.industry,
    totalReturn: totalReturn,
    annualVol: vol,
    priceRange: priceRange,
    trendStrength: trendStrength,
    avgAtrPct: avgAtrPct,
    firstDate: data[0].date,
    lastDate: data[data.length - 1].date,
    lastClose: closes[closes.length - 1]
  };
});

// ========== 4.5 参数热力图扫描（入场×ATR） ==========
// 固定止损=2N、出场=入场/2，扫描 (entry, atr) 网格
var HEATMAP_ENTRY = [10, 20, 30, 55];
var HEATMAP_ATR = [10, 20, 30];
var heatmapResults = {};

Object.keys(STOCKS).forEach(function(code) {
  var s = STOCKS[code];
  var data = s.data;
  var matrix = [];
  HEATMAP_ENTRY.forEach(function(entryP) {
    var row = [];
    HEATMAP_ATR.forEach(function(atrP) {
      var params = Object.assign({
        entryPeriod: entryP,
        exitPeriod: Math.max(5, Math.round(entryP / 2)),
        atrPeriod: atrP,
        stopMultiplier: 2
      }, baseParams);
      var r = T.runBacktest(data, params);
      var m = r.metrics;
      row.push(+fmt(m.sharpe));
    });
    matrix.push(row);
  });
  heatmapResults[code] = matrix;
});

// ========== 5. 生成 HTML 报告 ==========
function fmt(v, decimals) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  decimals = decimals || 2;
  return v.toFixed(decimals);
}

function fmtSign(v, decimals) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  decimals = decimals || 2;
  var s = v.toFixed(decimals);
  return v >= 0 ? '+' + s : s;
}

function colorClass(v, threshold) {
  threshold = threshold || 0;
  if (v > threshold) return 'pos';
  if (v < threshold) return 'neg';
  return 'neutral';
}

// 准备图表数据
var equityDates = crossStockResults[stockCodes[0]].equity.map(function(e) { return e.date; });

// 各标的累计收益率曲线（归一化为百分比）
var equitySeries = stockCodes.map(function(code) {
  var r = crossStockResults[code];
  var cap = 100000;
  return {
    name: r.name,
    type: 'line',
    data: r.equity.map(function(e) { return +((e.equity / cap - 1) * 100).toFixed(2); }),
    smooth: false,
    symbol: 'none',
    lineStyle: { width: 2 }
  };
});

// 买入持有基准
var benchSeries = stockCodes.map(function(code) {
  var r = crossStockResults[code];
  var firstC = r.equity[0].close;
  return {
    name: r.name + '(买入持有)',
    type: 'line',
    data: r.equity.map(function(e) { return +((e.close / firstC - 1) * 100).toFixed(2); }),
    smooth: false,
    symbol: 'none',
    lineStyle: { width: 1, type: 'dashed', opacity: 0.5 }
  };
});

// 各标的参数组合对比数据
var paramComboCharts = {};
stockCodes.forEach(function(code) {
  var r = paramComboResults[code];
  var dates = r.presets.classic.equity.map(function(e) { return e.date; });
  var series = presetKeys.map(function(pk) {
    var p = r.presets[pk];
    return {
      name: p.presetName,
      type: 'line',
      data: p.equity.map(function(e) { return +((e.equity / 100000 - 1) * 100).toFixed(2); }),
      smooth: false,
      symbol: 'none',
      lineStyle: { width: 2 }
    };
  });
  paramComboCharts[code] = { dates: dates, series: series };
});

// 构建 HTML
var html = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n';
html += '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n';
html += '<title>海龟交易策略多标的对比分析报告</title>\n';
html += '<script src="https://cdn.jsdelivr.net/npm/echarts@5.5/dist/echarts.min.js"></script>\n';
html += '<style>\n';
html += '* { margin: 0; padding: 0; box-sizing: border-box; }\n';
html += 'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.6; }\n';
html += '.container { max-width: 1200px; margin: 0 auto; padding: 24px; }\n';
html += 'h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; color: #0f172a; }\n';
html += 'h2 { font-size: 22px; font-weight: 600; margin: 32px 0 16px; color: #1e293b; border-left: 4px solid #2563eb; padding-left: 12px; }\n';
html += 'h3 { font-size: 18px; font-weight: 600; margin: 24px 0 12px; color: #334155; }\n';
html += '.subtitle { color: #64748b; font-size: 14px; margin-bottom: 24px; }\n';
html += '.card { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); margin-bottom: 20px; }\n';
html += 'table { width: 100%; border-collapse: collapse; font-size: 13px; }\n';
html += 'th { background: #f1f5f9; padding: 10px 12px; text-align: right; font-weight: 600; color: #475569; white-space: nowrap; border-bottom: 2px solid #e2e8f0; }\n';
html += 'th:first-child, td:first-child { text-align: left; }\n';
html += 'td { padding: 8px 12px; text-align: right; border-bottom: 1px solid #f1f5f9; }\n';
html += 'tr:hover td { background: #f8fafc; }\n';
html += '.pos { color: #dc2626; font-weight: 600; }\n';
html += '.neg { color: #16a34a; font-weight: 600; }\n';
html += '.neutral { color: #64748b; }\n';
html += '.best { background: #fef3c7 !important; }\n';
html += '.best-tag { display: inline-block; background: #f59e0b; color: #fff; font-size: 11px; padding: 2px 6px; border-radius: 4px; margin-left: 6px; }\n';
html += '.chart { width: 100%; height: 400px; }\n';
html += '.chart-small { width: 100%; height: 320px; }\n';
html += '.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }\n';
html += '@media (max-width: 768px) { .grid-2 { grid-template-columns: 1fr; } }\n';
html += '.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 20px; }\n';
html += '.stat-card { background: #fff; border-radius: 8px; padding: 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.06); border-left: 3px solid #2563eb; }\n';
html += '.stat-card .label { font-size: 12px; color: #64748b; margin-bottom: 4px; }\n';
html += '.stat-card .value { font-size: 20px; font-weight: 700; color: #1e293b; }\n';
html += '.stat-card .desc { font-size: 11px; color: #94a3b8; margin-top: 2px; }\n';
html += '.summary-box { background: linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%); border: 1px solid #bfdbfe; border-radius: 12px; padding: 20px; margin: 16px 0; }\n';
html += '.summary-box h4 { color: #1e40af; margin-bottom: 8px; font-size: 16px; }\n';
html += '.summary-box p { color: #334155; font-size: 14px; }\n';
html += '.summary-box ul { margin-left: 20px; margin-top: 8px; }\n';
html += '.summary-box li { color: #334155; font-size: 14px; margin-bottom: 4px; }\n';
html += '.footer { text-align: center; color: #94a3b8; font-size: 12px; padding: 24px 0; border-top: 1px solid #e2e8f0; margin-top: 32px; }\n';
html += '.stock-badge { display: inline-block; background: #f1f5f9; color: #475569; font-size: 12px; padding: 2px 8px; border-radius: 4px; margin-left: 6px; }\n';
html += '.recommendation { display: flex; align-items: center; gap: 8px; padding: 12px 16px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; margin: 8px 0; }\n';
html += '.recommendation.bad { background: #fef2f2; border-color: #fecaca; }\n';
html += '.recommendation.neutral { background: #fffbeb; border-color: #fde68a; }\n';
html += '</style>\n</head>\n<body>\n<div class="container">\n';

// === 标题 ===
html += '<h1>🐢 海龟交易策略多标的对比分析报告</h1>\n';
html += '<p class="subtitle">数据区间：' + stockCharacteristics[stockCodes[0]].firstDate + ' ~ ' + stockCharacteristics[stockCodes[0]].lastDate;
html += ' · 初始资金：¥100,000 · 手续费：万三 · 信号次日开盘执行</p>\n';

// === 0.5 经典参数多标的指标对比柱状图（2x2） ===
html += '<h2>零、经典海龟参数下五只股票指标对比</h2>\n';
html += '<div class="card">\n<div id="chartStockBarCompare" class="chart"></div>\n</div>\n';

// === 第一部分：标的特征概览 ===
html += '<h2>一、标的特征概览</h2>\n';
html += '<div class="card">\n';
html += '<table>\n<thead>\n<tr><th>标的</th><th>行业</th><th>区间收益率</th><th>年化波动率</th><th>价格振幅</th><th>趋势强度</th><th>平均ATR占比</th><th>最新收盘</th></tr>\n</thead>\n<tbody>\n';
stockCodes.forEach(function(code) {
  var c = stockCharacteristics[code];
  html += '<tr>';
  html += '<td><strong>' + c.name + '</strong> <span class="stock-badge">' + c.code + '</span></td>';
  html += '<td>' + c.industry + '</td>';
  html += '<td class="' + colorClass(c.totalReturn) + '">' + fmtSign(c.totalReturn) + '%</td>';
  html += '<td>' + fmt(c.annualVol) + '%</td>';
  html += '<td>' + fmt(c.priceRange) + '%</td>';
  html += '<td class="' + colorClass(c.trendStrength) + '">' + fmtSign(c.trendStrength) + '%</td>';
  html += '<td>' + fmt(c.avgAtrPct) + '%</td>';
  html += '<td>¥' + fmt(c.lastClose) + '</td>';
  html += '</tr>\n';
});
html += '</tbody>\n</table>\n';
html += '</div>\n';

// 标的特征分析
html += '<div class="summary-box">\n';
html += '<h4>📊 标的特征分析</h4>\n';
html += '<ul>\n';
stockCodes.forEach(function(code) {
  var c = stockCharacteristics[code];
  var trend = c.trendStrength > 5 ? '强上涨趋势' : (c.trendStrength < -5 ? '下跌趋势' : '震荡');
  var vol = c.annualVol > 40 ? '高波动' : (c.annualVol > 20 ? '中波动' : '低波动');
  html += '<li><strong>' + c.name + '</strong>：' + trend + '（趋势强度' + fmtSign(c.trendStrength) + '%），' + vol + '（年化' + fmt(c.annualVol) + '%），区间收益' + fmtSign(c.totalReturn) + '%</li>\n';
});
html += '</ul>\n';
html += '</div>\n';

// === 第二部分：经典海龟参数下多标的横向对比 ===
html += '<h2>二、经典海龟参数（20/10/20/2）多标的横向对比</h2>\n';

// 核心指标卡片
html += '<div class="stat-grid">\n';
stockCodes.forEach(function(code) {
  var r = crossStockResults[code];
  var m = r.metrics;
  html += '<div class="stat-card" style="border-left-color: ' + (m.cumRet >= 0 ? '#dc2626' : '#16a34a') + '">\n';
  html += '<div class="label">' + r.name + ' 累计回报</div>\n';
  html += '<div class="value ' + colorClass(m.cumRet) + '">' + fmtSign(m.cumRet) + '%</div>\n';
  html += '<div class="desc">基准' + fmtSign(m.benchRet) + '% · 超额' + fmtSign(m.excess) + '%</div>\n';
  html += '</div>\n';
});
html += '</div>\n';

// 详细对比表
html += '<div class="card">\n';
html += '<table>\n<thead>\n<tr>';
html += '<th>指标</th>';
stockNames.forEach(function(n) { html += '<th>' + n + '</th>'; });
html += '</tr>\n</thead>\n<tbody>\n';

var metricRows = [
  { label: '累计回报', key: 'cumRet', suffix: '%', sign: true },
  { label: '基准(买入持有)', key: 'benchRet', suffix: '%', sign: true },
  { label: '超额收益', key: 'excess', suffix: '%', sign: true },
  { label: '最大回撤', key: 'mdd', suffix: '%', sign: false, neg: true },
  { label: '夏普比率', key: 'sharpe', suffix: '', sign: false },
  { label: 'Sortino比率', key: 'sortino', suffix: '', sign: false },
  { label: 'Calmar比率', key: 'calmar', suffix: '', sign: false },
  { label: '年化收益', key: 'annRet', suffix: '%', sign: true },
  { label: '年化波动率', key: 'vol', suffix: '%', sign: false },
  { label: '胜率', key: 'winRate', suffix: '%', sign: false },
  { label: '交易次数', key: 'totalTrades', suffix: '', sign: false, int: true },
  { label: '盈亏比', key: 'profitFactor', suffix: '', sign: false },
  { label: '平均持仓(天)', key: 'avgHold', suffix: '', sign: false, int: true },
  { label: '最大连胜', key: 'maxWinStreak', suffix: '', sign: false, int: true },
  { label: '最大连亏', key: 'maxLossStreak', suffix: '', sign: false, int: true }
];

metricRows.forEach(function(row) {
  html += '<tr><td><strong>' + row.label + '</strong></td>';
  stockCodes.forEach(function(code) {
    var m = crossStockResults[code].metrics;
    var v = m[row.key];
    var cls = '';
    if (row.sign) cls = colorClass(v);
    else if (row.neg && v < 0) cls = 'neg';
    var val = row.int ? Math.round(v) : fmt(v);
    html += '<td class="' + cls + '">' + (row.sign && v >= 0 ? '+' : '') + val + row.suffix + '</td>';
  });
  html += '</tr>\n';
});

// 信号评估指标
html += '<tr style="border-top: 2px solid #e2e8f0;"><td colspan="' + (stockCodes.length + 1) + '" style="text-align:center; background:#f8fafc; font-weight:600; color:#475569;">交易信号评估</td></tr>\n';
var signalRows = [
  { label: '信号总数', key: 'totalSignals', int: true },
  { label: '信号胜率', key: 'winRate', suffix: '%' },
  { label: '假突破率', key: 'falseBreakRate', suffix: '%' },
  { label: '平均信号收益', key: 'avgRet', suffix: '%', sign: true },
  { label: '盈亏比', key: 'plRatio', suffix: '' },
  { label: '突破强度', key: 'avgBreakStrength', suffix: '%' },
  { label: '信号质量评分', key: 'qualityScore', suffix: '/100' },
  { label: '通道出场', key: 'channelExits', int: true },
  { label: '止损出场', key: 'stopExits', int: true }
];
signalRows.forEach(function(row) {
  html += '<tr><td>' + row.label + '</td>';
  stockCodes.forEach(function(code) {
    var ev = crossStockResults[code].signalEval;
    var v = ev[row.key];
    var val = row.int ? Math.round(v) : fmt(v);
    html += '<td>' + val + (row.suffix || '') + '</td>';
  });
  html += '</tr>\n';
});

html += '</tbody>\n</table>\n';
html += '</div>\n';

// 累计收益率对比图
html += '<h3>📈 策略累计收益率对比（含买入持有基准）</h3>\n';
html += '<div class="card">\n<div id="chartEquityCompare" class="chart"></div>\n</div>\n';

// === 第三部分：策略适合性分析 ===
html += '<h2>三、海龟策略适合什么类型的股票？</h2>\n';
html += '<div class="summary-box">\n';
html += '<h4>🎯 核心发现</h4>\n';

// 分析每个标的
var suitableStocks = [];
var unsuitableStocks = [];
stockCodes.forEach(function(code) {
  var c = stockCharacteristics[code];
  var r = crossStockResults[code];
  var m = r.metrics;
  if (m.excess > 0 || (m.mdd > -10 && m.winRate >= 40)) {
    suitableStocks.push(code);
  } else {
    unsuitableStocks.push(code);
  }
});

html += '<p>海龟策略作为<strong>趋势跟踪型策略</strong>，其核心逻辑是"突破入场+通道/止损出场"。策略的盈利能力高度依赖于标的的价格行为特征：</p>\n';
html += '<ul>\n';
html += '<li><strong>强趋势标的最适合</strong>：当标的存在持续性单边上涨趋势时，突破信号能捕捉大波段利润，少数几笔大盈交易即可覆盖多次小亏止损</li>\n';
html += '<li><strong>震荡标的容易亏损</strong>：在横盘震荡行情中，频繁的假突破会导致连续止损，侵蚀资本</li>\n';
html += '<li><strong>高波动+趋势 = 最佳组合</strong>：高ATR意味着止损幅度更大，但一旦趋势确立，利润空间也更可观</li>\n';
html += '<li><strong>低波动+震荡 = 最差组合</strong>：信号稀少且假突破率高，手续费和滑点进一步侵蚀收益</li>\n';
html += '</ul>\n';
html += '</div>\n';

// 各标的适合性
stockCodes.forEach(function(code) {
  var c = stockCharacteristics[code];
  var r = crossStockResults[code];
  var m = r.metrics;
  var ev = r.signalEval;
  var suitable = m.excess > 0 || (m.mdd > -10 && m.winRate >= 40);
  var cls = suitable ? '' : (m.excess > -10 ? 'neutral' : 'bad');
  var icon = suitable ? '✅' : (cls === 'bad' ? '❌' : '⚠️');
  var verdict = suitable ? '适合' : (cls === 'bad' ? '不适合' : '一般');

  html += '<div class="recommendation ' + cls + '">\n';
  html += '<span style="font-size:24px">' + icon + '</span>\n';
  html += '<div>\n';
  html += '<strong style="font-size:15px">' + c.name + '（' + c.industry + '）—— ' + verdict + '</strong><br>\n';
  var trend = c.trendStrength > 5 ? '强上涨趋势' : (c.trendStrength < -5 ? '下跌趋势' : '横盘震荡');
  var vol = c.annualVol > 40 ? '高波动' : (c.annualVol > 20 ? '中波动' : '低波动');
  html += '<span style="font-size:13px; color:#64748b;">' + trend + ' · ' + vol + ' · 策略收益' + fmtSign(m.cumRet) + '% vs 基准' + fmtSign(m.benchRet) + '% · 超额' + fmtSign(m.excess) + '% · 信号评分' + ev.qualityScore + '/100</span>\n';
  html += '</div>\n';
  html += '</div>\n';
});
html += '</div>\n';

// === 3.5 各标的参数热力图 ===
html += '<h2>三·五、各标的参数热力图（入场周期 × ATR周期）</h2>\n';
html += '<p class="subtitle">固定止损=2N、出场=入场/2；单元格颜色=夏普比率（红=低/绿=高）。鼠标悬停查看具体数值</p>\n';
html += '<div class="grid-2">\n';
stockCodes.forEach(function(code, idx) {
  var s = STOCKS[code];
  html += '<div class="card">\n';
  html += '<h3 style="margin-top:0; font-size:15px;">' + s.name + ' (' + code + ')</h3>\n';
  html += '<div id="chartHeat_' + idx + '" style="width:100%; height:280px;"></div>\n';
  html += '</div>\n';
});
html += '</div>\n';

// === 第四部分：各标的参数组合对比 ===
html += '<h2>四、各标的参数组合对比</h2>\n';
html += '<p class="subtitle">对每支标的分别测试 5 套参数预设，寻找最优参数组合</p>\n';

// 参数预设说明
html += '<div class="card">\n';
html += '<table>\n<thead>\n<tr><th>预设</th><th>入场周期</th><th>出场周期</th><th>ATR周期</th><th>止损倍数</th><th>特点</th></tr>\n</thead>\n<tbody>\n';
presetKeys.forEach(function(pk) {
  var p = PRESETS[pk];
  html += '<tr><td><strong>' + p.name + '</strong></td><td>' + p.entryPeriod + '</td><td>' + p.exitPeriod + '</td><td>' + p.atrPeriod + '</td><td>' + p.stopMultiplier + '</td><td>' + p.desc + '</td></tr>\n';
});
html += '</tbody>\n</table>\n';
html += '</div>\n';

// 每标的的参数对比
stockCodes.forEach(function(code, idx) {
  var r = paramComboResults[code];
  var best = bestParams[code];
  var c = stockCharacteristics[code];

  html += '<h3>' + r.name + '（' + r.code + '）—— 参数组合对比</h3>\n';

  // 对比表
  html += '<div class="card">\n';
  html += '<table>\n<thead>\n<tr>';
  html += '<th>参数预设</th><th>累计回报</th><th>基准</th><th>超额</th><th>最大回撤</th><th>夏普</th><th>Sortino</th><th>Calmar</th><th>胜率</th><th>交易</th><th>盈亏比</th><th>信号评分</th><th>持仓(天)</th>';
  html += '</tr>\n</thead>\n<tbody>\n';

  presetKeys.forEach(function(pk) {
    var p = r.presets[pk];
    var m = p.metrics;
    var ev = p.signalEval;
    var isBest = pk === best.presetKey;
    html += '<tr' + (isBest ? ' class="best"' : '') + '>';
    html += '<td><strong>' + p.presetName + '</strong>' + (isBest ? '<span class="best-tag">最优</span>' : '') + '</td>';
    html += '<td class="' + colorClass(m.cumRet) + '">' + fmtSign(m.cumRet) + '%</td>';
    html += '<td class="' + colorClass(m.benchRet) + '">' + fmtSign(m.benchRet) + '%</td>';
    html += '<td class="' + colorClass(m.excess) + '">' + fmtSign(m.excess) + '%</td>';
    html += '<td class="neg">' + fmt(m.mdd) + '%</td>';
    html += '<td>' + fmt(m.sharpe) + '</td>';
    html += '<td>' + fmt(m.sortino) + '</td>';
    html += '<td>' + fmt(m.calmar) + '</td>';
    html += '<td>' + fmt(m.winRate, 0) + '%</td>';
    html += '<td>' + m.totalTrades + '</td>';
    html += '<td>' + fmt(m.profitFactor) + '</td>';
    html += '<td>' + ev.qualityScore + '/100</td>';
    html += '<td>' + Math.round(m.avgHold) + '</td>';
    html += '</tr>\n';
  });
  html += '</tbody>\n</table>\n';
  html += '</div>\n';

  // 参数组合收益率曲线
  html += '<div class="card">\n<div id="chartParam_' + idx + '" class="chart-small"></div>\n</div>\n';

  // 最优参数分析
  var bm = best.metrics;
  html += '<div class="summary-box">\n';
  html += '<h4>🏆 ' + r.name + ' 最优参数：' + best.presetName + '</h4>\n';
  html += '<p>累计回报 <strong class="' + colorClass(bm.cumRet) + '">' + fmtSign(bm.cumRet) + '%</strong>，';
  html += '最大回撤 <strong class="neg">' + fmt(bm.mdd) + '%</strong>，';
  html += '夏普 <strong>' + fmt(bm.sharpe) + '</strong>，';
  html += '胜率 <strong>' + fmt(bm.winRate, 0) + '%</strong>，';
  html += '交易次数 <strong>' + bm.totalTrades + '</strong> 笔</p>\n';
  var preset = PRESETS[best.presetKey];
  html += '<p style="margin-top:8px; font-size:13px; color:#64748b;">参数：入场' + preset.entryPeriod + ' / 出场' + preset.exitPeriod + ' / ATR' + preset.atrPeriod + ' / 止损' + preset.stopMultiplier + 'N · ' + preset.desc + '</p>\n';
  html += '</div>\n';
});

// === 第五部分：综合结论 ===
html += '<h2>五、综合结论与建议</h2>\n';
html += '<div class="summary-box">\n';
html += '<h4>📋 策略适用性总结</h4>\n';

// 找全局最优和最差
var globalBest = null, globalWorst = null;
stockCodes.forEach(function(code) {
  var r = crossStockResults[code];
  if (!globalBest || r.metrics.cumRet > globalBest.metrics.cumRet) globalBest = r;
  if (!globalWorst || r.metrics.cumRet < globalWorst.metrics.cumRet) globalWorst = r;
});

html += '<ul>\n';
html += '<li><strong>最佳标的</strong>：' + globalBest.name + '（累计回报' + fmtSign(globalBest.metrics.cumRet) + '%），';
html += '其' + (stockCharacteristics[globalBest.code].trendStrength > 0 ? '强上涨趋势' : '波动特征') + '为趋势跟踪策略提供了有利环境</li>\n';
html += '<li><strong>最差标的</strong>：' + globalWorst.name + '（累计回报' + fmtSign(globalWorst.metrics.cumRet) + '%），';
html += '其' + (stockCharacteristics[globalWorst.code].annualVol > 30 ? '高波动但缺乏趋势' : '低波动震荡') + '导致频繁假突破</li>\n';
html += '<li><strong>参数选择</strong>：不同标的的最优参数组合不同，说明参数优化具有标的特异性，不可一概而论</li>\n';
html += '<li><strong>风险控制</strong>：海龟策略的2N止损机制有效控制了单笔亏损，但在震荡市中连续止损会累积损失</li>\n';
html += '<li><strong>使用建议</strong>：建议在趋势明确的标的上使用长周期参数（如55/20），在波动较大的标的上使用保守型参数（止损1.5N）</li>\n';
html += '</ul>\n';
html += '</div>\n';

// 各标的最优参数汇总
html += '<div class="card">\n';
html += '<h3>各标的最优参数汇总</h3>\n';
html += '<table>\n<thead>\n<tr><th>标的</th><th>最优参数</th><th>累计回报</th><th>最大回撤</th><th>夏普</th><th>胜率</th><th>信号评分</th></tr>\n</thead>\n<tbody>\n';
stockCodes.forEach(function(code) {
  var best = bestParams[code];
  var m = best.metrics;
  var preset = PRESETS[best.presetKey];
  html += '<tr class="best">';
  html += '<td><strong>' + paramComboResults[code].name + '</strong></td>';
  html += '<td>' + best.presetName + '（' + preset.entryPeriod + '/' + preset.exitPeriod + '/' + preset.atrPeriod + '/' + preset.stopMultiplier + '）</td>';
  html += '<td class="' + colorClass(m.cumRet) + '">' + fmtSign(m.cumRet) + '%</td>';
  html += '<td class="neg">' + fmt(m.mdd) + '%</td>';
  html += '<td>' + fmt(m.sharpe) + '</td>';
  html += '<td>' + fmt(m.winRate, 0) + '%</td>';
  html += '<td>' + (paramComboResults[code].presets[best.presetKey].signalEval.qualityScore) + '/100</td>';
  html += '</tr>\n';
});
html += '</tbody>\n</table>\n';
html += '</div>\n';

// Footer
html += '<div class="footer">\n';
html += '海龟交易策略多标的对比分析报告 · 数据截至 ' + stockCharacteristics[stockCodes[0]].lastDate + ' · 纯前端实现 · 信号次日开盘执行\n';
html += '</div>\n';

html += '</div>\n';

// === JavaScript 图表初始化 ===
html += '<script>\n';
html += 'var HEATMAP_ENTRY = ' + JSON.stringify(HEATMAP_ENTRY) + ';\n';
html += 'var HEATMAP_ATR = ' + JSON.stringify(HEATMAP_ATR) + ';\n';

// 图表0：多标的经典参数 2x2 柱状图（年化收益 / 夏普 / 最大回撤 / 平均持仓）
var stockBarSeries = {
  annRet: stockCodes.map(function(c){ return +(crossStockResults[c].metrics.annRet || 0).toFixed(4); }),
  sharpe: stockCodes.map(function(c){ return +(crossStockResults[c].metrics.sharpe || 0).toFixed(4); }),
  mdd:    stockCodes.map(function(c){ return +(crossStockResults[c].metrics.mdd || 0).toFixed(4); }),
  avgHold:stockCodes.map(function(c){ return +(crossStockResults[c].metrics.avgHold || 0).toFixed(1); })
};
html += 'var chart0 = echarts.init(document.getElementById("chartStockBarCompare"));\n';
html += 'chart0.setOption({\n';
html += '  title: { text: "五只股票海龟策略指标对比", left: "center", textStyle: { fontSize: 15 } },\n';
html += '  tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },\n';
html += '  legend: { data: ["年化收益率","夏普比率","最大回撤","平均持仓天数"], top: 30, textStyle: { fontSize: 11 } },\n';
html += '  grid: [{ left: "5%", right: "52%", top: "18%", bottom: "55%", containLabel: true },\n';
html += '         { left: "52%", right: "5%", top: "18%", bottom: "55%", containLabel: true },\n';
html += '         { left: "5%", right: "52%", top: "50%", bottom: "8%", containLabel: true },\n';
html += '         { left: "52%", right: "5%", top: "50%", bottom: "8%", containLabel: true }],\n';
html += '  xAxis: [{ type: "category", data: ' + JSON.stringify(stockCodes) + ', gridIndex: 0 },\n';
html += '           { type: "category", data: ' + JSON.stringify(stockCodes) + ', gridIndex: 1 },\n';
html += '           { type: "category", data: ' + JSON.stringify(stockCodes) + ', gridIndex: 2 },\n';
html += '           { type: "category", data: ' + JSON.stringify(stockCodes) + ', gridIndex: 3 }],\n';
html += '  yAxis: [{ type: "value", name: "年化收益率", gridIndex: 0, nameTextStyle: { fontSize: 10 } },\n';
html += '           { type: "value", name: "夏普比率", gridIndex: 1, nameTextStyle: { fontSize: 10 } },\n';
html += '           { type: "value", name: "最大回撤", gridIndex: 2, nameTextStyle: { fontSize: 10 } },\n';
html += '           { type: "value", name: "持仓天数", gridIndex: 3, nameTextStyle: { fontSize: 10 } }],\n';
html += '  series: [\n';
html += '    { name: "年化收益率", type: "bar", data: ' + JSON.stringify(stockBarSeries.annRet) + ', xAxisIndex: 0, yAxisIndex: 0, itemStyle: { color: "#dc2626" } },\n';
html += '    { name: "夏普比率",   type: "bar", data: ' + JSON.stringify(stockBarSeries.sharpe) + ', xAxisIndex: 1, yAxisIndex: 1, itemStyle: { color: "#2563eb" } },\n';
html += '    { name: "最大回撤",   type: "bar", data: ' + JSON.stringify(stockBarSeries.mdd) + ', xAxisIndex: 2, yAxisIndex: 2, itemStyle: { color: "#7c2d12" } },\n';
html += '    { name: "平均持仓天数", type: "bar", data: ' + JSON.stringify(stockBarSeries.avgHold) + ', xAxisIndex: 3, yAxisIndex: 3, itemStyle: { color: "#7c3aed" } }\n';
html += '  ]\n';
html += '});\n';

// 热力图：每个标的
stockCodes.forEach(function(code, idx) {
  var s = STOCKS[code];
  var matrix = heatmapResults[code];
  var heatData = [];
  var minS = Infinity, maxS = -Infinity;
  for (var i = 0; i < HEATMAP_ENTRY.length; i++) {
    for (var j = 0; j < HEATMAP_ATR.length; j++) {
      var v = matrix[i][j];
      heatData.push([j, i, v]);
      if (v < minS) minS = v;
      if (v > maxS) maxS = v;
    }
  }
  html += 'var chartH' + idx + ' = echarts.init(document.getElementById("chartHeat_' + idx + '"));\n';
  html += 'chartH' + idx + '.setOption({\n';
  html += '  title: { text: "' + s.code + ' 参数热力图 — 夏普比率（ATR=20）", left: "center", textStyle: { fontSize: 12 } },\n';
  html += '  tooltip: { position: "top", formatter: function(p){ return "入场=" + HEATMAP_ENTRY[p.data[1]] + " / ATR=" + HEATMAP_ATR[p.data[0]] + "<br/>夏普比率: " + p.data[2].toFixed(3); } },\n';
  html += '  grid: { left: 60, right: 20, top: 35, bottom: 35 },\n';
  html += '  xAxis: { type: "category", data: ' + JSON.stringify(HEATMAP_ATR.map(function(v){return "ATR="+v;})) + ', splitArea: { show: true } },\n';
  html += '  yAxis: { type: "category", data: ' + JSON.stringify(HEATMAP_ENTRY.map(function(v){return "入场="+v;})) + ', splitArea: { show: true } },\n';
  html += '  visualMap: { min: ' + minS.toFixed(3) + ', max: ' + maxS.toFixed(3) + ', calculable: true, orient: "horizontal", left: "center", bottom: 0, textStyle: { fontSize: 9 }, inRange: { color: ["#dc2626", "#f59e0b", "#fde047", "#86efac", "#16a34a"] } },\n';
  html += '  series: [{ name: "夏普", type: "heatmap", data: ' + JSON.stringify(heatData) + ', label: { show: true, fontSize: 11, formatter: function(p){ return p.data[2].toFixed(3); } } }]\n';
  html += '});\n';
});

// 图表1：累计收益率对比
html += 'var chart1 = echarts.init(document.getElementById("chartEquityCompare"));\n';
html += 'chart1.setOption({\n';
html += '  tooltip: { trigger: "axis", formatter: function(p){ return p[0].axisValue + "<br/>" + p.map(function(i){ return i.marker + i.seriesName + ": " + i.value + "%"; }).join("<br/>"); } },\n';
html += '  legend: { data: ' + JSON.stringify(stockNames.concat(stockNames.map(function(n) { return n + '(买入持有)'; }))) + ', top: 0, textStyle: { fontSize: 11 } },\n';
html += '  grid: { left: 50, right: 30, top: 40, bottom: 60 },\n';
html += '  xAxis: { type: "category", data: ' + JSON.stringify(equityDates) + ', axisLabel: { fontSize: 10 } },\n';
html += '  yAxis: { type: "value", name: "累计收益率(%)", axisLabel: { formatter: "{value}%" } },\n';
html += '  dataZoom: [{ type: "inside" }, { type: "slider", height: 20, bottom: 10 }],\n';
html += '  series: ' + JSON.stringify(equitySeries.concat(benchSeries)) + '\n';
html += '});\n';

// 各标的参数组合图
stockCodes.forEach(function(code, idx) {
  var pc = paramComboCharts[code];
  html += 'var chartP' + idx + ' = echarts.init(document.getElementById("chartParam_' + idx + '"));\n';
  html += 'chartP' + idx + '.setOption({\n';
  html += '  title: { text: "' + paramComboResults[code].name + ' — 5套参数预设累计收益率对比", left: "center", textStyle: { fontSize: 14 } },\n';
  html += '  tooltip: { trigger: "axis", formatter: function(p){ return p[0].axisValue + "<br/>" + p.map(function(i){ return i.marker + i.seriesName + ": " + i.value + "%"; }).join("<br/>"); } },\n';
  html += '  legend: { data: ' + JSON.stringify(presetKeys.map(function(pk) { return PRESETS[pk].name; })) + ', top: 25, textStyle: { fontSize: 11 } },\n';
  html += '  grid: { left: 50, right: 30, top: 60, bottom: 50 },\n';
  html += '  xAxis: { type: "category", data: ' + JSON.stringify(pc.dates) + ', axisLabel: { fontSize: 10 } },\n';
  html += '  yAxis: { type: "value", name: "累计收益率(%)", axisLabel: { formatter: "{value}%" } },\n';
  html += '  dataZoom: [{ type: "inside" }, { type: "slider", height: 18, bottom: 5 }],\n';
  html += '  series: ' + JSON.stringify(pc.series) + '\n';
  html += '});\n';
});

html += 'window.addEventListener("resize", function(){\n';
html += '  chart0.resize(); chart1.resize();\n';
stockCodes.forEach(function(code, idx) {
  html += '  chartH' + idx + '.resize(); chartP' + idx + '.resize();\n';
});
html += '});\n';
html += '</script>\n';

html += '</body>\n</html>';

// 写入文件
var outPath = path.join(__dirname, 'turtle_report.html');
fs.writeFileSync(outPath, html, 'utf-8');
console.log('Report generated: ' + outPath);
console.log('File size: ' + (fs.statSync(outPath).size / 1024).toFixed(1) + ' KB');

// 打印摘要
console.log('\n=== 摘要 ===');
console.log('标的数:', stockCodes.length);
console.log('参数预设数:', presetKeys.length);
console.log('总回测次数:', stockCodes.length * (presetKeys.length + 1));

console.log('\n=== 经典参数横向对比 ===');
stockCodes.forEach(function(code) {
  var r = crossStockResults[code];
  var m = r.metrics;
  console.log(r.name + ': cumRet=' + fmtSign(m.cumRet) + '% bench=' + fmtSign(m.benchRet) + '% excess=' + fmtSign(m.excess) + '% MDD=' + fmt(m.mdd) + '% sharpe=' + fmt(m.sharpe) + ' winRate=' + fmt(m.winRate, 0) + '% qualityScore=' + r.signalEval.qualityScore);
});

console.log('\n=== 各标的最优参数 ===');
stockCodes.forEach(function(code) {
  var best = bestParams[code];
  console.log(paramComboResults[code].name + ': ' + best.presetName + ' (score=' + best.score.toFixed(1) + ') cumRet=' + fmtSign(best.metrics.cumRet) + '%');
});
