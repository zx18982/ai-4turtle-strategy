/* ============================================================
 * strategy.js — 海龟交易策略引擎 v2
 * 功能：Donchian通道 / ATR / 信号生成(含2N止损) / 回测 / 量化指标 / 信号评估
 * 纯前端手写，无第三方依赖，过程可追溯
 * ============================================================ */
(function (global) {
  'use strict';

  /* ---------- 工具函数 ---------- */
  function max(a, b) { return a > b ? a : b; }
  function min(a, b) { return a < b ? a : b; }
  function mean(arr) { return arr.length ? arr.reduce(function (s, v) { return s + v; }, 0) / arr.length : 0; }
  function std(arr) {
    if (arr.length < 2) return 0;
    var m = mean(arr);
    var v = arr.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / (arr.length - 1);
    return Math.sqrt(v);
  }

  /* ---------- 1. Donchian 通道 ----------
   * 上轨 = 前 N 日最高价的最大值（不含当日，避免前视）
   * 下轨 = 前 M 日最低价的最小值
   */
  function donchian(data, entryN, exitN) {
    var n = data.length;
    var out = [];
    for (var i = 0; i < n; i++) {
      var up = null, lo = null;
      if (i >= entryN) {
        up = -Infinity;
        for (var j = i - entryN; j < i; j++) { if (data[j].high > up) up = data[j].high; }
      }
      if (i >= exitN) {
        lo = Infinity;
        for (var k = i - exitN; k < i; k++) { if (data[k].low < lo) lo = data[k].low; }
      }
      out.push({ upper: up, lower: lo });
    }
    return out;
  }

  /* ---------- 2. ATR (Average True Range) ---------- */
  function calcATR(data, n) {
    var len = data.length;
    var tr = [], atr = [];
    for (var i = 0; i < len; i++) {
      if (i === 0) {
        tr.push(data[i].high - data[i].low);
        atr.push(null);
      } else {
        var r = Math.max(
          data[i].high - data[i].low,
          Math.abs(data[i].high - data[i - 1].close),
          Math.abs(data[i].low - data[i - 1].close)
        );
        tr.push(r);
        if (i >= n - 1) {
          var s = 0;
          for (var j = i - n + 1; j <= i; j++) s += tr[j];
          atr.push(s / n);
        } else {
          atr.push(null);
        }
      }
    }
    return { tr: tr, atr: atr };
  }

  /* ---------- 3. 信号生成 + 4. 回测 ----------
   * 信号在收盘确认，次日开盘执行（next_open）
   * 买入：close > 上轨（突破前N日高点）
   * 卖出：close < 下轨（跌破前M日低点）或 close <= 止损价（2N止损）
   * 止损跟踪：只上移不下移
   */
  function runBacktest(data, params) {
    var entryN = params.entryPeriod;
    var exitN = params.exitPeriod;
    var atrN = params.atrPeriod;
    var stopK = params.stopMultiplier;
    var capital = params.initialCapital;
    var commission = params.commissionRate;

    var ch = donchian(data, entryN, exitN);
    var atrRes = calcATR(data, atrN);

    var position = 0;       // 0=空仓 1=持多
    var shares = 0;
    var cash = capital;
    var entryPrice = 0;
    var stop = NaN;
    var pending = 0;        // 1=待买 -1=待卖
    var sellReason = '';
    var buyDataIdx = -1;    // 记录买入日在 data 中的索引

    var trades = [];        // 交易记录
    var equity = [];        // 每日权益
    var signals = [];       // 信号点（用于图表标记）
    var buyMarks = [];
    var sellMarks = [];

    var n = data.length;
    for (var i = 0; i < n; i++) {
      var d = data[i];

      /* --- 执行昨日挂起的信号（今日开盘） --- */
      if (pending === 1 && position === 0 && i > 0) {
        var price = d.open;
        shares = Math.floor(cash / price / 100) * 100;
        if (shares > 0) {
          var cost = shares * price * (1 + commission);
          cash -= cost;
          position = 1;
          entryPrice = price;
          buyDataIdx = i;
          var a = atrRes.atr[i - 1] || atrRes.atr[i] || 0;
          stop = entryPrice - stopK * a;
          var unit = Math.floor((capital * 0.01) / (stopK * a)); // 海龟单元
          trades.push({
            type: 'buy', date: d.date, price: price, shares: shares,
            amount: shares * price, commission: shares * price * commission,
            atr: a, stop: stop, unit: unit
          });
          buyMarks.push({ date: d.date, price: price, idx: i });
          signals.push({ date: d.date, type: 'buy', price: price });
        }
      } else if (pending === -1 && position === 1 && i > 0) {
        var sprice = d.open;
        var proceeds = shares * sprice * (1 - commission);
        var pnl = (sprice - entryPrice) * shares - shares * sprice * commission - entryPrice * shares * commission;
        var ret = (sprice - entryPrice) / entryPrice;
        cash += proceeds;
        var holdDays = i - buyDataIdx;
        trades.push({
          type: 'sell', date: d.date, price: sprice, shares: shares,
          amount: shares * sprice, commission: shares * sprice * commission,
          pnl: pnl, return: ret, reason: sellReason,
          holdDays: holdDays,
          entryPrice: entryPrice, entryDate: data[buyDataIdx].date
        });
        sellMarks.push({ date: d.date, price: sprice, idx: i, reason: sellReason });
        signals.push({ date: d.date, type: 'sell', price: sprice, reason: sellReason });
        position = 0;
        shares = 0;
        buyDataIdx = -1;
      }
      pending = 0;

      /* --- 记录每日权益（按当日收盘价盯市） --- */
      var mv = shares * d.close;
      var totalEquity = cash + mv;
      equity.push({
        date: d.date, close: d.close, equity: totalEquity,
        cash: cash, shares: shares, mv: mv, position: position,
        upper: ch[i].upper, lower: ch[i].lower, atr: atrRes.atr[i],
        stop: position === 1 ? stop : null,
        dailyRet: i > 0 ? (totalEquity / equity[i - 1].equity - 1) : 0
      });

      /* --- 检测明日信号（用今日收盘 vs 今日通道） --- */
      if (i < n - 1 && ch[i].upper !== null && atrRes.atr[i] !== null) {
        if (position === 0) {
          if (d.close > ch[i].upper) {
            pending = 1;
          }
        } else {
          // 跟踪止损（只上移）
          var newStop = d.close - stopK * atrRes.atr[i];
          if (newStop > stop) stop = newStop;
          if (d.close < ch[i].lower) {
            pending = -1; sellReason = '通道出场';
          } else if (d.close <= stop) {
            pending = -1; sellReason = '止损出场';
          }
        }
      }
    }

    /* --- 5. 量化指标 --- */
    var metrics = calcMetrics(equity, capital, data, trades);

    /* --- 6. 信号评估 --- */
    var evalRes = evalSignals(trades, data, ch, buyMarks);

    return {
      equity: equity,
      trades: trades,
      signals: signals,
      buyMarks: buyMarks,
      sellMarks: sellMarks,
      channels: ch,
      atr: atrRes,
      metrics: metrics,
      signalEval: evalRes,
      params: { entryN: entryN, exitN: exitN, atrN: atrN, stopK: stopK }
    };
  }

  /* ---------- 5. 量化指标 ---------- */
  function calcMetrics(equity, capital, data, trades) {
    if (!equity.length) return {};
    var eq = equity.map(function (e) { return e.equity; });
    var closes = equity.map(function (e) { return e.close; });

    // 日收益率
    var dailyRet = [];
    for (var i = 1; i < eq.length; i++) {
      dailyRet.push(eq[i] / eq[i - 1] - 1);
    }

    // 累计回报
    var finalEq = eq[eq.length - 1];
    var cumRet = (finalEq / capital - 1) * 100;

    // 基准（买入持有）
    var firstC = closes[0], lastC = closes[closes.length - 1];
    var benchRet = (lastC / firstC - 1) * 100;
    var excess = cumRet - benchRet;

    // 最大回撤
    var peak = eq[0], mdd = 0, mddStartIdx = 0, mddEndIdx = 0, curPeakIdx = 0;
    for (var j = 0; j < eq.length; j++) {
      if (eq[j] > peak) { peak = eq[j]; curPeakIdx = j; }
      var dd = (eq[j] - peak) / peak;
      if (dd < mdd) { mdd = dd; mddStartIdx = curPeakIdx; mddEndIdx = j; }
    }
    mdd *= 100;

    // 夏普比率（年化，无风险利率=0）
    var sharpe = 0;
    if (std(dailyRet) > 0) sharpe = (mean(dailyRet) / std(dailyRet)) * Math.sqrt(252);

    // Sortino 比率（仅用负收益的标准差）
    var downside = dailyRet.filter(function (r) { return r < 0; });
    var downsideStd = downside.length > 1 ? Math.sqrt(downside.reduce(function (s, x) { return s + x * x; }, 0) / downside.length) : 0;
    var sortino = downsideStd > 0 ? (mean(dailyRet) / downsideStd) * Math.sqrt(252) : 0;

    // Calmar 比率（年化收益 / 最大回撤）
    var nDays = eq.length;
    var annRet = nDays > 0 ? (Math.pow(finalEq / capital, 252 / nDays) - 1) * 100 : 0;
    var vol = std(dailyRet) * Math.sqrt(252) * 100;
    var calmar = mdd !== 0 ? annRet / Math.abs(mdd) : 0;

    // 交易统计
    var completeTrades = trades.filter(function (t) { return t.type === 'sell'; });
    var wins = completeTrades.filter(function (t) { return t.return > 0; });
    var winRate = completeTrades.length ? (wins.length / completeTrades.length * 100) : 0;
    var totalTrades = completeTrades.length;

    // 盈亏比
    var avgWin = wins.length ? mean(wins.map(function (t) { return t.return; })) : 0;
    var losses = completeTrades.filter(function (t) { return t.return <= 0; });
    var avgLoss = losses.length ? Math.abs(mean(losses.map(function (t) { return t.return; }))) : 0;
    var pf = avgLoss > 0 ? avgWin / avgLoss : (avgWin > 0 ? Infinity : 0);

    // 平均持仓天数
    var holdDays = completeTrades.map(function (t) { return t.holdDays || 0; });
    var avgHold = holdDays.length ? mean(holdDays) : 0;

    // 最大连胜/连亏
    var streak = 0, maxWinStreak = 0, maxLossStreak = 0;
    completeTrades.forEach(function (t) {
      if (t.return > 0) {
        streak = streak >= 0 ? streak + 1 : 1;
        if (streak > maxWinStreak) maxWinStreak = streak;
      } else {
        streak = streak <= 0 ? streak - 1 : -1;
        if (Math.abs(streak) > maxLossStreak) maxLossStreak = Math.abs(streak);
      }
    });

    return {
      cumRet: cumRet, benchRet: benchRet, excess: excess,
      mdd: mdd, mddStartIdx: mddStartIdx, mddEndIdx: mddEndIdx,
      sharpe: sharpe, sortino: sortino, calmar: calmar,
      annRet: annRet, vol: vol,
      winRate: winRate, totalTrades: totalTrades, avgHold: avgHold,
      avgWin: avgWin * 100, avgLoss: avgLoss * 100, profitFactor: pf,
      maxWinStreak: maxWinStreak, maxLossStreak: maxLossStreak,
      finalEquity: finalEq, nDays: nDays
    };
  }

  /* ---------- 6. 交易信号评估体系 ---------- */
  function evalSignals(trades, data, channels, buyMarks) {
    var sells = trades.filter(function (t) { return t.type === 'sell'; });
    var buys = trades.filter(function (t) { return t.type === 'buy'; });
    var total = sells.length;

    var wins = sells.filter(function (t) { return t.return > 0; });
    var losses = sells.filter(function (t) { return t.return <= 0; });

    // 信号胜率
    var winRate = total ? wins.length / total * 100 : 0;

    // 假突破率：买入后触发止损亏损的比例
    var stoppedOut = sells.filter(function (t) { return t.reason === '止损出场' && t.return <= 0; });
    var falseBreakRate = total ? stoppedOut.length / total * 100 : 0;

    // 平均信号收益
    var avgRet = total ? mean(sells.map(function (t) { return t.return * 100; })) : 0;

    // 盈亏比
    var avgWinRet = wins.length ? mean(wins.map(function (t) { return t.return * 100; })) : 0;
    var avgLossRet = losses.length ? Math.abs(mean(losses.map(function (t) { return t.return * 100; }))) : 0;
    var plRatio = avgLossRet > 0 ? avgWinRet / avgLossRet : (avgWinRet > 0 ? 999 : 0);

    // 最大单笔盈亏
    var rets = sells.map(function (t) { return t.return * 100; });
    var maxGain = rets.length ? Math.max.apply(null, rets) : 0;
    var maxLoss = rets.length ? Math.min.apply(null, rets) : 0;

    // 突破强度：(信号日收盘 - 上轨) / 上轨
    var breakStrengths = [];
    buyMarks.forEach(function (b) {
      var sigIdx = b.idx - 1;  // 信号触发日（执行日前一日）
      if (sigIdx >= 0 && channels[sigIdx] && channels[sigIdx].upper !== null && data[sigIdx]) {
        breakStrengths.push((data[sigIdx].close - channels[sigIdx].upper) / channels[sigIdx].upper * 100);
      }
    });
    var avgBreakStrength = breakStrengths.length ? mean(breakStrengths) : 0;

    // 信号频率（每月信号数）
    var months = {};
    buys.forEach(function (b) {
      var m = b.date.slice(0, 7);
      months[m] = (months[m] || 0) + 1;
    });
    var monthKeys = Object.keys(months).sort();
    var signalFreq = monthKeys.length ? buys.length / monthKeys.length : 0;

    // 信号月度分布
    var distribution = monthKeys.map(function (m) { return { month: m, count: months[m] }; });

    // 按卖出原因分类
    var channelExits = sells.filter(function (t) { return t.reason === '通道出场'; }).length;
    var stopExits = sells.filter(function (t) { return t.reason === '止损出场'; }).length;

    // 平均持仓天数
    var avgHoldDays = total ? mean(sells.map(function (t) { return t.holdDays || 0; })) : 0;

    // 信号质量评分（0-100）：综合胜率、盈亏比、假突破率
    var qualityScore = 0;
    if (total > 0) {
      var winScore = Math.min(winRate, 100);
      var plScore = Math.min(plRatio * 20, 40);
      var falsePenalty = Math.min(falseBreakRate * 0.5, 30);
      qualityScore = Math.max(0, Math.round(winScore * 0.4 + plScore * 0.4 - falsePenalty + 10));
      qualityScore = Math.min(100, qualityScore);
    }

    return {
      totalSignals: buys.length,
      winRate: winRate,
      falseBreakRate: falseBreakRate,
      avgRet: avgRet,
      avgWinRet: avgWinRet,
      avgLossRet: avgLossRet,
      plRatio: plRatio,
      maxGain: maxGain,
      maxLoss: maxLoss,
      avgBreakStrength: avgBreakStrength,
      signalFreq: signalFreq,
      channelExits: channelExits,
      stopExits: stopExits,
      avgHoldDays: avgHoldDays,
      qualityScore: qualityScore,
      distribution: distribution
    };
  }

  /* ---------- 参数预设 ---------- */
  var PRESETS = {
    classic: { name: '经典海龟', entryPeriod: 20, exitPeriod: 10, atrPeriod: 20, stopMultiplier: 2, desc: '原版海龟系统一' },
    longterm: { name: '长周期', entryPeriod: 55, exitPeriod: 20, atrPeriod: 20, stopMultiplier: 2, desc: '海龟系统二，捕捉大趋势' },
    shortterm: { name: '短周期', entryPeriod: 10, exitPeriod: 5, atrPeriod: 10, stopMultiplier: 1.5, desc: '灵敏度高，交易频繁' },
    conservative: { name: '保守型', entryPeriod: 25, exitPeriod: 15, atrPeriod: 20, stopMultiplier: 1.5, desc: '止损更紧，回撤控制优先' },
    aggressive: { name: '激进型', entryPeriod: 15, exitPeriod: 5, atrPeriod: 15, stopMultiplier: 2.5, desc: '放宽止损，博取大趋势' }
  };

  /* ---------- 时段筛选 ---------- */
  function filterByPeriod(data, startDate, endDate) {
    if (!startDate && !endDate) return data;
    return data.filter(function (d) {
      if (startDate && d.date < startDate) return false;
      if (endDate && d.date > endDate) return false;
      return true;
    });
  }

  /* ---------- 导出 ---------- */
  global.Turtle = {
    donchian: donchian,
    calcATR: calcATR,
    runBacktest: runBacktest,
    calcMetrics: calcMetrics,
    evalSignals: evalSignals,
    filterByPeriod: filterByPeriod,
    PRESETS: PRESETS,
    _util: { mean: mean, std: std }
  };
})(window);
