/* ============================================================
 * app.js — 海龟交易策略实验室 v2 主控制器
 * 负责：UI 初始化 / 标的切换 / 时段选择 / 参数调节 /
 *       回测运行 / 图表渲染 / 信号评估 / CSV导出 / 策略解读
 * ============================================================ */
(function () {
  'use strict';

  var STOCKS = window.STOCK_DATA;
  var stockCodes = Object.keys(STOCKS);
  var currentCode = stockCodes[0];
  var currentPeriod = '1y';
  var charts = {};
  var lastResult = null;
  var debounceTimer = null;

  /* ========== 初始化 ========== */
  function init() {
    buildStockTabs();
    buildStockList();
    buildPresets();
    bindParams();
    bindPeriod();
    bindButtons();
    updateDateRange();
    runBacktest();
    runComboComparison();
    window.addEventListener('resize', resizeAll);
  }

  /* ========== 顶部 Tabs ========== */
  function buildStockTabs() {
    var el = document.getElementById('stockTabs');
    el.innerHTML = stockCodes.map(function (c) {
      return '<button class="tab' + (c === currentCode ? ' active' : '') + '" data-code="' + c + '">' + STOCKS[c].name + '</button>';
    }).join('');
    el.querySelectorAll('.tab').forEach(function (t) {
      t.onclick = function () { switchStock(t.dataset.code); };
    });
  }

  /* ========== 标的搜索框 + 下拉列表 ========== */
  function buildStockList() {
    var input = document.getElementById('stockSearch');
    var box = document.getElementById('stockSearchBox');
    var dropdown = document.getElementById('stockDropdown');

    // 渲染下拉列表
    function renderDropdown(filter) {
      filter = (filter || '').trim().toLowerCase();
      var items = stockCodes.filter(function (c) {
        var s = STOCKS[c];
        if (!filter) return true;
        return s.name.toLowerCase().indexOf(filter) >= 0 || c.toLowerCase().indexOf(filter) >= 0;
      });
      if (!items.length) {
        dropdown.innerHTML = '<div class="dropdown-empty">未找到匹配的标的</div>';
        return;
      }
      dropdown.innerHTML = items.map(function (c) {
        var s = STOCKS[c];
        var d = s.data;
        var lastClose = d.length ? d[d.length - 1].close : 0;
        var lastDate = d.length ? d[d.length - 1].date : '';
        return '<div class="dropdown-item' + (c === currentCode ? ' active' : '') + '" data-code="' + c + '">' +
          '<div class="di-left"><span class="di-name">' + s.name + '</span>' +
          '<span class="di-ind">' + s.industry + ' · ' + lastClose.toFixed(2) + ' · ' + lastDate + '</span></div>' +
          '<div style="display:flex;align-items:center;gap:6px">' +
          '<span class="di-code">' + s.code + '</span>' +
          '<span class="di-check">\u2713</span></div></div>';
      }).join('');
      dropdown.querySelectorAll('.dropdown-item').forEach(function (it) {
        it.onclick = function () {
          switchStock(it.dataset.code);
          closeDropdown();
        };
      });
    }

    function openDropdown() {
      box.classList.add('open');
      dropdown.classList.add('show');
      box.classList.add('focus');
      input.select(); // 选中当前文字，方便用户直接输入覆盖
      renderDropdown(''); // 展开时显示全部标的
    }
    function closeDropdown() {
      box.classList.remove('open');
      dropdown.classList.remove('show');
      box.classList.remove('focus');
    }

    // 点击搜索框展开
    box.addEventListener('click', function (e) {
      if (e.target.tagName === 'INPUT') return;
      if (dropdown.classList.contains('show')) { closeDropdown(); } else { openDropdown(); }
    });
    input.addEventListener('focus', openDropdown);
    input.addEventListener('click', function (e) { e.stopPropagation(); openDropdown(); });

    // 输入过滤
    input.addEventListener('input', function () {
      openDropdown();
      renderDropdown(input.value);
    });

    // 键盘导航
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var first = dropdown.querySelector('.dropdown-item');
        if (first) { switchStock(first.dataset.code); closeDropdown(); }
      } else if (e.key === 'Escape') {
        closeDropdown();
        input.blur();
      }
    });

    // 点击外部关闭
    document.addEventListener('click', function (e) {
      if (!document.getElementById('stockSearchWrap').contains(e.target)) closeDropdown();
    });

    // 初始渲染选中标的信息
    updateSelectedInfo();
  }

  function updateSelectedInfo() {
    var s = STOCKS[currentCode];
    var d = s.data;
    var lastClose = d.length ? d[d.length - 1].close : 0;
    var lastDate = d.length ? d[d.length - 1].date : '';
    var prevClose = d.length > 1 ? d[d.length - 2].close : lastClose;
    var chg = lastClose - prevClose;
    var chgPct = prevClose ? (chg / prevClose * 100) : 0;
    var chgCls = chg >= 0 ? 'pos' : 'neg';
    var chgStr = (chg >= 0 ? '+' : '') + chg.toFixed(2) + ' (' + (chg >= 0 ? '+' : '') + chgPct.toFixed(2) + '%)';

    // 更新搜索框显示文字
    var input = document.getElementById('stockSearch');
    if (input) input.value = s.name;

    // 更新选中信息条
    var el = document.getElementById('stockSelectedInfo');
    if (el) {
      el.innerHTML =
        '<div><div class="ssi-name">' + s.name + '</div>' +
        '<div class="ssi-meta">' + s.code + ' · ' + s.industry + '</div></div>' +
        '<div class="ssi-price"><div class="ssi-price-val ' + chgCls + '">' + lastClose.toFixed(2) + '</div>' +
        '<div class="ssi-price-date ' + chgCls + '">' + chgStr + ' · ' + lastDate + '</div></div>';
    }
  }
  function switchStock(code) {
    if (code === currentCode) return;
    currentCode = code;
    document.querySelectorAll('#stockTabs .tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.code === code);
    });
    document.querySelectorAll('#stockDropdown .dropdown-item').forEach(function (it) {
      it.classList.toggle('active', it.dataset.code === code);
    });
    updateSelectedInfo();
    updateDateRange();
    runBacktest();
    runComboComparison();
  }

  /* ========== 参数预设 ========== */
  function buildPresets() {
    var el = document.getElementById('presetGrid');
    var keys = Object.keys(Turtle.PRESETS);
    el.innerHTML = keys.map(function (k) {
      var p = Turtle.PRESETS[k];
      return '<button class="preset-btn' + (k === 'classic' ? ' active' : '') + '" data-key="' + k + '">' +
        '<span class="pn">' + p.name + '</span>' +
        '<span class="pd">' + p.entryPeriod + '/' + p.exitPeriod + '/' + p.atrPeriod + '/' + p.stopMultiplier + '</span></button>';
    }).join('');
    el.querySelectorAll('.preset-btn').forEach(function (b) {
      b.onclick = function () { applyPreset(b.dataset.key); };
    });
  }
  function applyPreset(key) {
    var p = Turtle.PRESETS[key];
    document.getElementById('entryPeriod').value = p.entryPeriod;
    document.getElementById('exitPeriod').value = p.exitPeriod;
    document.getElementById('atrPeriod').value = p.atrPeriod;
    document.getElementById('stopMultiplier').value = p.stopMultiplier;
    updateParamDisplay();
    document.querySelectorAll('.preset-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.key === key);
    });
    runBacktest();
  }

  /* ========== 参数滑块 ========== */
  function bindParams() {
    var ids = ['entryPeriod', 'exitPeriod', 'atrPeriod', 'stopMultiplier', 'initialCapital', 'commissionRate'];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      el.oninput = function () {
        updateParamDisplay();
        document.querySelectorAll('.preset-btn').forEach(function (b) { b.classList.remove('active'); });
        // 防抖自动运行
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(runBacktest, 400);
      };
    });
    document.getElementById('runBtn').onclick = runBacktest;
    document.getElementById('resetBtn').onclick = function () { applyPreset('classic'); };
  }
  function updateParamDisplay() {
    document.getElementById('v-entry').textContent = val('entryPeriod');
    document.getElementById('v-exit').textContent = val('exitPeriod');
    document.getElementById('v-atr').textContent = val('atrPeriod');
    document.getElementById('v-stop').textContent = val('stopMultiplier');
    var cap = parseInt(val('initialCapital'));
    document.getElementById('v-cap').textContent = cap.toLocaleString();
    var fee = parseFloat(val('commissionRate'));
    document.getElementById('v-fee').textContent = (fee * 100).toFixed(2) + '%';
  }
  function val(id) { return document.getElementById(id).value; }

  /* ========== 时段选择 ========== */
  function bindPeriod() {
    document.querySelectorAll('#periodPresets .pp-btn').forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll('#periodPresets .pp-btn').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        currentPeriod = b.dataset.p;
        updateDateRange();
        runBacktest();
        runComboComparison();
      };
    });
    document.getElementById('startDate').onchange = function () {
      currentPeriod = 'custom';
      document.querySelectorAll('#periodPresets .pp-btn').forEach(function (x) { x.classList.remove('active'); });
      runBacktest();
      runComboComparison();
    };
    document.getElementById('endDate').onchange = function () {
      currentPeriod = 'custom';
      document.querySelectorAll('#periodPresets .pp-btn').forEach(function (x) { x.classList.remove('active'); });
      runBacktest();
      runComboComparison();
    };
  }
  function updateDateRange() {
    var data = STOCKS[currentCode].data;
    var first = data[0].date, last = data[data.length - 1].date;
    document.getElementById('startDate').min = first;
    document.getElementById('startDate').max = last;
    document.getElementById('endDate').min = first;
    document.getElementById('endDate').max = last;

    var endD = new Date(last);
    var startD;
    if (currentPeriod === '1m') { startD = new Date(endD); startD.setMonth(endD.getMonth() - 1); }
    else if (currentPeriod === '3m') { startD = new Date(endD); startD.setMonth(endD.getMonth() - 3); }
    else if (currentPeriod === '6m') { startD = new Date(endD); startD.setMonth(endD.getMonth() - 6); }
    else if (currentPeriod === '1y') { startD = new Date(endD); startD.setFullYear(endD.getFullYear() - 1); }
    else { startD = new Date(first); } // all

    // 确保不早于数据起点
    if (startD < new Date(first)) startD = new Date(first);

    document.getElementById('startDate').value = startD.toISOString().slice(0, 10);
    document.getElementById('endDate').value = last;
  }

  /* ========== 按钮绑定 ========== */
  function bindButtons() {
    document.getElementById('compareBtn').onclick = runComboComparison;
    document.getElementById('exportBtn').onclick = exportCSV;
  }

  /* ========== 获取参数 & 筛选数据 ========== */
  function getParams() {
    return {
      entryPeriod: parseInt(val('entryPeriod')),
      exitPeriod: parseInt(val('exitPeriod')),
      atrPeriod: parseInt(val('atrPeriod')),
      stopMultiplier: parseFloat(val('stopMultiplier')),
      initialCapital: parseInt(val('initialCapital')),
      commissionRate: parseFloat(val('commissionRate'))
    };
  }
  function getFilteredData() {
    var data = STOCKS[currentCode].data;
    var s = document.getElementById('startDate').value;
    var e = document.getElementById('endDate').value;
    return Turtle.filterByPeriod(data, s, e);
  }

  /* ========== 运行回测 ========== */
  function runBacktest() {
    updateParamDisplay();
    showLoading(true);
    // 用 requestAnimationFrame 确保 loading UI 先渲染
    requestAnimationFrame(function () {
      setTimeout(function () {
        var data = getFilteredData();
        var s = STOCKS[currentCode];
        if (data.length < 60) {
          document.getElementById('mainTitle').textContent = s.name + ' — 数据不足（' + data.length + ' 条），请扩大时段';
          showLoading(false);
          return;
        }
        var params = getParams();
        var result = Turtle.runBacktest(data, params);
        lastResult = result;

        // 更新标题
        document.getElementById('mainTitle').textContent = s.name + ' (' + s.code + ') — Donchian(' +
          params.entryPeriod + '/' + params.exitPeriod + ') ATR(' + params.atrPeriod + ') 止损' + params.stopMultiplier + 'N';
        document.getElementById('dataInfo').innerHTML =
          '<span class="dot"></span>' + s.name + ' · ' + data.length + ' 个交易日 · ' +
          data[0].date + ' ~ ' + data[data.length - 1].date;

        renderMainChart(data, result);
        renderMetrics(result.metrics);
        renderSummary(result, s, params);
        renderBacktestChart(result.equity);
        renderEvalPanel(result.signalEval);
        renderEquityChart(result.equity, result.metrics);
        renderReturnsChart(result.equity);
        renderDistChart(result.signalEval);
        renderTradeTable(result.trades);
        showLoading(false);
      }, 50);
    });
  }

  function showLoading(show) {
    var el = document.getElementById('loadingOverlay');
    el.classList.toggle('show', show);
  }

  /* ========== 主图渲染 ========== */
  function renderMainChart(data, result) {
    var ch = charts.main = charts.main || echarts.init(document.getElementById('mainChart'));
    var dates = data.map(function (d) { return d.date; });
    var stopData = result.equity.map(function (e) { return e.stop; });
    ch.setOption({
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross', crossStyle: { color: '#999' } } },
      legend: { show: false },
      grid: { left: 55, right: 60, top: 10, bottom: 50 },
      xAxis: { type: 'category', data: dates, axisLabel: { fontSize: 10, color: '#9ca3af' }, axisLine: { lineStyle: { color: '#e5e7eb' } } },
      yAxis: [
        { type: 'value', scale: true, name: '价格', nameTextStyle: { color: '#94a3b8', fontSize: 10 },
          axisLabel: { fontSize: 10, color: '#9ca3af' }, splitLine: { lineStyle: { color: '#f3f4f6' } }, axisLine: { show: false } },
        { type: 'value', scale: true, name: 'ATR', nameTextStyle: { color: '#f59e0b', fontSize: 10 },
          axisLabel: { fontSize: 10, color: '#f59e0b' }, splitLine: { show: false }, axisLine: { show: false } }
      ],
      dataZoom: [
        { type: 'inside', start: 0, end: 100 },
        { type: 'slider', start: 0, end: 100, height: 18, bottom: 8, borderColor: '#e5e7eb', fillerColor: 'rgba(37,99,235,.08)' }
      ],
      series: [
        { name: '收盘价', type: 'line', data: data.map(function (d) { return d.close; }), smooth: true, symbol: 'none',
          lineStyle: { color: '#1e293b', width: 1.5 } },
        { name: '上轨', type: 'line', data: result.channels.map(function (c) { return c.upper; }), symbol: 'none',
          connectNulls: false, lineStyle: { color: '#dc2626', width: 1, type: 'dashed' } },
        { name: '下轨', type: 'line', data: result.channels.map(function (c) { return c.lower; }), symbol: 'none',
          connectNulls: false, lineStyle: { color: '#16a34a', width: 1, type: 'dashed' } },
        { name: 'ATR', type: 'line', yAxisIndex: 1, data: result.atr.atr, symbol: 'none',
          lineStyle: { color: '#f59e0b', width: 1.2, opacity: 0.7 } },
        { name: '止损线', type: 'line', data: stopData, symbol: 'none', connectNulls: false,
          lineStyle: { color: '#94a3b8', width: 0.8, type: 'dotted', opacity: 0.5 } },
        { name: '买入', type: 'scatter', data: result.buyMarks.map(function (b) { return [b.date, b.price]; }),
          symbol: 'triangle', symbolSize: 12, itemStyle: { color: '#dc2626', borderColor: '#fff', borderWidth: 1 },
          label: { show: true, formatter: '买', position: 'bottom', fontSize: 10, color: '#dc2626', fontWeight: 'bold' } },
        { name: '卖出', type: 'scatter', data: result.sellMarks.map(function (b) { return [b.date, b.price]; }),
          symbol: 'triangle', symbolSize: 12, symbolRotate: 180, itemStyle: { color: '#16a34a', borderColor: '#fff', borderWidth: 1 },
          label: { show: true, formatter: '卖', position: 'top', fontSize: 10, color: '#16a34a', fontWeight: 'bold' } }
      ]
    }, true);
  }

  /* ========== 指标卡片 ========== */
  function renderMetrics(m) {
    var el = document.getElementById('metricsRow');
    var cards = [
      { label: '累计回报', val: fmtPct(m.cumRet), sub: '基准 ' + fmtPct(m.benchRet), cls: m.cumRet >= 0 ? 'pos' : 'neg' },
      { label: '最大回撤', val: fmtPct(m.mdd), sub: '回撤期 ' + (m.nDays > 0 ? Math.round((m.mddEndIdx - m.mddStartIdx)) + ' 天' : '—'), cls: 'neg' },
      { label: '夏普比率', val: m.sharpe.toFixed(2), sub: 'Sortino ' + m.sortino.toFixed(2), cls: 'neutral' },
      { label: '胜率', val: m.winRate.toFixed(1) + '%', sub: m.totalTrades + ' 笔 · 连胜' + m.maxWinStreak + '/连亏' + m.maxLossStreak, cls: 'neutral' },
      { label: '年化收益', val: fmtPct(m.annRet), sub: '超额 ' + fmtPct(m.excess), cls: m.annRet >= 0 ? 'pos' : 'neg' },
      { label: '盈亏比', val: m.profitFactor === Infinity ? '∞' : m.profitFactor.toFixed(2), sub: 'Calmar ' + m.calmar.toFixed(2), cls: 'neutral' }
    ];
    el.innerHTML = cards.map(function (c) {
      return '<div class="metric ' + c.cls + '"><div class="m-label">' + c.label + '</div><div class="m-val ' + c.cls + '">' + c.val + '</div><div class="m-sub">' + c.sub + '</div></div>';
    }).join('');
  }

  /* ========== 策略解读面板 ========== */
  function renderSummary(result, stock, params) {
    var m = result.metrics;
    var ev = result.signalEval;
    var el = document.getElementById('summaryPanel');

    var trend = '';
    if (m.excess > 0) {
      trend = '策略<span class="highlight">跑赢</span>买入持有基准 ' + fmtPct(m.excess) + '，';
    } else {
      trend = '策略<span class="highlight">跑输</span>买入持有基准 ' + fmtPct(Math.abs(m.excess)) + '，';
    }

    var risk = '最大回撤 ' + fmtPct(m.mdd) + '，夏普 ' + m.sharpe.toFixed(2) + '，波动率 ' + fmtPct(m.vol) + '。';
    var signal = '共产生 ' + ev.totalSignals + ' 个买入信号，信号胜率 ' + ev.winRate.toFixed(0) + '%，假突破率 ' + ev.falseBreakRate.toFixed(0) + '%。';
    var quality = '信号质量评分：<span class="highlight">' + ev.qualityScore + '/100</span>。';
    var advice = '';
    if (ev.qualityScore >= 60) {
      advice = '策略在当前参数下表现较好，信号质量较高。';
    } else if (ev.qualityScore >= 40) {
      advice = '策略表现一般，可尝试调整参数预设优化效果。';
    } else {
      advice = '策略在当前参数下表现不佳，建议尝试其他参数预设或扩大回测时段。';
    }

    el.innerHTML = '<b>' + stock.name + '</b>（' + stock.code + '）在 Donchian(' +
      params.entryPeriod + '/' + params.exitPeriod + ') 参数下，' +
      '累计回报 <span class="highlight">' + fmtPct(m.cumRet) + '</span>，' + trend +
      risk + signal + quality + advice;
  }

  /* ========== 回测对比图 ========== */
  function renderBacktestChart(equity) {
    var ch = charts.bt = charts.bt || echarts.init(document.getElementById('btChart'));
    var cap = equity.length ? equity[0].equity : 100000;
    var dates = equity.map(function (e) { return e.date; });
    var strat = equity.map(function (e) { return +((e.equity / cap - 1) * 100).toFixed(2); });
    var firstC = equity[0].close;
    var bench = equity.map(function (e) { return +((e.close / firstC - 1) * 100).toFixed(2); });
    ch.setOption({
      tooltip: { trigger: 'axis', valueFormatter: function (v) { return v + '%'; } },
      legend: { show: false },
      grid: { left: 55, right: 20, top: 10, bottom: 30 },
      xAxis: { type: 'category', data: dates, axisLabel: { fontSize: 10, color: '#9ca3af' }, axisLine: { lineStyle: { color: '#e5e7eb' } } },
      yAxis: { type: 'value', name: '%', nameTextStyle: { color: '#94a3b8', fontSize: 10 },
        axisLabel: { fontSize: 10, color: '#9ca3af', formatter: '{value}%' }, splitLine: { lineStyle: { color: '#f3f4f6' } }, axisLine: { show: false } },
      series: [
        { name: '策略', type: 'line', data: strat, smooth: true, symbol: 'none',
          lineStyle: { color: '#dc2626', width: 2 }, areaStyle: { color: new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'rgba(220,38,38,.15)'},{offset:1,color:'rgba(220,38,38,0)'}]) } },
        { name: '基准', type: 'line', data: bench, symbol: 'none',
          lineStyle: { color: '#94a3b8', width: 1.5, type: 'dashed' } }
      ]
    }, true);
  }

  /* ========== 信号评估面板 ========== */
  function renderEvalPanel(ev) {
    var el = document.getElementById('evalGrid');
    var qs = ev.qualityScore;
    var qsColor = qs >= 60 ? '#16a34a' : (qs >= 40 ? '#f59e0b' : '#dc2626');
    var items = [
      '<div class="eval-item"><span class="el">信号质量评分</span><span class="ev" style="color:' + qsColor + '">' + qs + '/100</span></div>',
      '<div class="eval-item"><span class="el">信号总数</span><span class="ev">' + ev.totalSignals + ' 次</span></div>',
      '<div class="eval-item"><span class="el">信号胜率</span><span class="ev ' + (ev.winRate >= 50 ? 'pos' : 'neg') + '">' + ev.winRate.toFixed(1) + '%</span></div>',
      '<div class="eval-item"><span class="el">假突破率</span><span class="ev ' + (ev.falseBreakRate < 30 ? 'pos' : 'neg') + '">' + ev.falseBreakRate.toFixed(1) + '%</span></div>',
      '<div class="eval-item"><span class="el">平均信号收益</span><span class="ev ' + (ev.avgRet >= 0 ? 'pos' : 'neg') + '">' + fmtPct(ev.avgRet) + '</span></div>',
      '<div class="eval-item"><span class="el">盈亏比</span><span class="ev">' + (ev.plRatio === 999 ? '∞' : ev.plRatio.toFixed(2)) + '</span></div>',
      '<div class="eval-item"><span class="el">平均盈利</span><span class="ev pos">' + fmtPct(ev.avgWinRet) + '</span></div>',
      '<div class="eval-item"><span class="el">平均亏损</span><span class="ev neg">' + fmtPct(-ev.avgLossRet) + '</span></div>',
      '<div class="eval-item"><span class="el">最大单笔盈利</span><span class="ev pos">' + fmtPct(ev.maxGain) + '</span></div>',
      '<div class="eval-item"><span class="el">最大单笔亏损</span><span class="ev neg">' + fmtPct(ev.maxLoss) + '</span></div>',
      '<div class="eval-item"><span class="el">突破强度</span><span class="ev">' + ev.avgBreakStrength.toFixed(2) + '%</span></div>',
      '<div class="eval-item"><span class="el">信号频率</span><span class="ev">' + ev.signalFreq.toFixed(1) + ' 次/月</span></div>',
      '<div class="eval-item"><span class="el">平均持仓</span><span class="ev">' + ev.avgHoldDays.toFixed(0) + ' 天</span></div>',
      '<div class="eval-item"><span class="el">通道/止损出场</span><span class="ev">' + ev.channelExits + ' / ' + ev.stopExits + '</span></div>'
    ];
    el.innerHTML = items.join('') +
      '<div style="grid-column:1/-1;margin-top:6px"><div class="quality-bar"><div class="quality-fill" style="width:' + qs + '%;background:' + qsColor + '"></div></div></div>';
  }

  /* ========== 权益曲线 + 回撤图 ========== */
  function renderEquityChart(equity, metrics) {
    var ch = charts.eq = charts.eq || echarts.init(document.getElementById('eqChart'));
    var dates = equity.map(function (e) { return e.date; });
    var eqVals = equity.map(function (e) { return Math.round(e.equity); });
    var peak = equity[0].equity;
    var dd = equity.map(function (e) {
      if (e.equity > peak) peak = e.equity;
      return +((e.equity / peak - 1) * 100).toFixed(2);
    });
    ch.setOption({
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' },
        formatter: function (params) {
          var s = params[0].axisValue + '<br/>';
          params.forEach(function (p) {
            s += p.marker + p.seriesName + ': ' + (p.seriesName === '回撤' ? p.value + '%' : '¥' + p.value.toLocaleString()) + '<br/>';
          });
          return s;
        }
      },
      legend: { show: false },
      grid: { left: 65, right: 55, top: 10, bottom: 30 },
      xAxis: { type: 'category', data: dates, axisLabel: { fontSize: 10, color: '#9ca3af' }, axisLine: { lineStyle: { color: '#e5e7eb' } } },
      yAxis: [
        { type: 'value', name: '权益(¥)', scale: true, nameTextStyle: { color: '#94a3b8', fontSize: 10 },
          axisLabel: { fontSize: 10, color: '#9ca3af', formatter: function (v) { return (v / 10000).toFixed(0) + '万'; } },
          splitLine: { lineStyle: { color: '#f3f4f6' } }, axisLine: { show: false } },
        { type: 'value', name: '回撤%', nameTextStyle: { color: '#dc2626', fontSize: 10 },
          axisLabel: { fontSize: 10, color: '#dc2626', formatter: '{value}%' }, splitLine: { show: false }, axisLine: { show: false } }
      ],
      series: [
        { name: '权益', type: 'line', data: eqVals, symbol: 'none', smooth: true,
          lineStyle: { color: '#2563eb', width: 2 },
          areaStyle: { color: new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'rgba(37,99,235,.12)'},{offset:1,color:'rgba(37,99,235,0)'}]) } },
        { name: '回撤', type: 'line', yAxisIndex: 1, data: dd, symbol: 'none',
          lineStyle: { color: '#dc2626', width: 1.2, opacity: 0.6 },
          areaStyle: { color: 'rgba(220,38,38,.06)' } }
      ]
    }, true);
  }

  /* ========== 收益率变化图 ========== */
  function renderReturnsChart(equity) {
    var ch = charts.ret = charts.ret || echarts.init(document.getElementById('retChart'));
    var dates = [], dailyRet = [], drawdown = [];
    var peak = equity.length ? equity[0].equity : 100000;
    for (var i = 0; i < equity.length; i++) {
      dates.push(equity[i].date);
      if (i > 0) {
        dailyRet.push(+((equity[i].equity / equity[i - 1].equity - 1) * 100).toFixed(3));
      } else { dailyRet.push(0); }
      if (equity[i].equity > peak) peak = equity[i].equity;
      drawdown.push(+((equity[i].equity / peak - 1) * 100).toFixed(2));
    }
    ch.setOption({
      tooltip: { trigger: 'axis', valueFormatter: function (v) { return v + '%'; } },
      legend: { show: false },
      grid: { left: 55, right: 55, top: 10, bottom: 30 },
      xAxis: { type: 'category', data: dates, axisLabel: { fontSize: 10, color: '#9ca3af' }, axisLine: { lineStyle: { color: '#e5e7eb' } } },
      yAxis: [
        { type: 'value', name: '日收益%', nameTextStyle: { color: '#94a3b8', fontSize: 10 },
          axisLabel: { fontSize: 10, color: '#9ca3af', formatter: '{value}%' }, splitLine: { lineStyle: { color: '#f3f4f6' } }, axisLine: { show: false } },
        { type: 'value', name: '回撤%', nameTextStyle: { color: '#2563eb', fontSize: 10 },
          axisLabel: { fontSize: 10, color: '#2563eb', formatter: '{value}%' }, splitLine: { show: false }, axisLine: { show: false } }
      ],
      dataZoom: [{ type: 'inside', start: 0, end: 100 }],
      series: [
        { name: '日收益率', type: 'bar', data: dailyRet.map(function (v) {
            return { value: v, itemStyle: { color: v >= 0 ? '#dc2626' : '#16a34a', opacity: 0.7 } };
          }) },
        { name: '回撤', type: 'line', yAxisIndex: 1, data: drawdown, symbol: 'none',
          lineStyle: { color: '#2563eb', width: 1.2 }, areaStyle: { color: 'rgba(37,99,235,.06)' } }
      ]
    }, true);
  }

  /* ========== 信号月度分布图 ========== */
  function renderDistChart(ev) {
    var ch = charts.dist = charts.dist || echarts.init(document.getElementById('distChart'));
    var dist = ev.distribution || [];
    ch.setOption({
      tooltip: { trigger: 'axis' },
      legend: { show: false },
      grid: { left: 40, right: 20, top: 10, bottom: 30 },
      xAxis: { type: 'category', data: dist.map(function (d) { return d.month; }),
        axisLabel: { fontSize: 10, color: '#9ca3af', rotate: 30 }, axisLine: { lineStyle: { color: '#e5e7eb' } } },
      yAxis: { type: 'value', minInterval: 1, axisLabel: { fontSize: 10, color: '#9ca3af' },
        splitLine: { lineStyle: { color: '#f3f4f6' } }, axisLine: { show: false } },
      series: [{
        type: 'bar', data: dist.map(function (d) { return d.count; }),
        itemStyle: { color: '#2563eb', borderRadius: [4, 4, 0, 0] },
        barWidth: '60%',
        label: { show: true, position: 'top', fontSize: 10, color: '#6b7280' }
      }]
    }, true);
  }

  /* ========== 交易记录表 ========== */
  function renderTradeTable(trades) {
    var el = document.getElementById('tradeTable');
    var sells = trades.filter(function (t) { return t.type === 'sell'; });
    document.getElementById('tradeSub').textContent = '共 ' + trades.length + ' 笔（' + sells.length + ' 次完整循环）';
    var html = '<thead><tr><th>#</th><th>日期</th><th>方向</th><th>价格</th><th>数量</th><th>金额</th><th>盈亏</th><th>收益率</th><th>持仓</th><th>类型</th></tr></thead><tbody>';
    trades.forEach(function (t, i) {
      var tagCls = t.type === 'buy' ? 'tag-buy' : (t.reason === '止损出场' ? 'tag-stop' : 'tag-sell');
      var pnl = t.pnl !== undefined ? (t.pnl >= 0 ? '<span class="pos">+' + t.pnl.toFixed(0) + '</span>' : '<span class="neg">' + t.pnl.toFixed(0) + '</span>') : '—';
      var ret = t.return !== undefined ? (t.return >= 0 ? '<span class="pos">+' + (t.return * 100).toFixed(2) + '%</span>' : '<span class="neg">' + (t.return * 100).toFixed(2) + '%</span>') : '—';
      var hold = t.holdDays !== undefined ? t.holdDays + '天' : '—';
      var reason = t.reason || (t.type === 'buy' ? '突破买入' : '—');
      html += '<tr><td>' + (i + 1) + '</td><td>' + t.date + '</td><td><span class="tag ' + tagCls + '">' + (t.type === 'buy' ? '买入' : '卖出') + '</span></td><td>' +
        t.price.toFixed(2) + '</td><td>' + t.shares + '</td><td>' + (t.amount / 10000).toFixed(2) + '万</td><td>' + pnl + '</td><td>' + ret + '</td><td>' + hold + '</td><td>' + reason + '</td></tr>';
    });
    html += '</tbody>';
    el.innerHTML = html;
  }

  /* ========== 参数组合对比 ========== */
  function runComboComparison() {
    var data = getFilteredData();
    if (data.length < 60) return;
    var keys = Object.keys(Turtle.PRESETS);
    var rows = [];
    var bestRet = -Infinity, bestKey = '';
    keys.forEach(function (k) {
      var p = Turtle.PRESETS[k];
      var params = {
        entryPeriod: p.entryPeriod, exitPeriod: p.exitPeriod, atrPeriod: p.atrPeriod,
        stopMultiplier: p.stopMultiplier, initialCapital: parseInt(val('initialCapital')),
        commissionRate: parseFloat(val('commissionRate'))
      };
      var r = Turtle.runBacktest(data, params);
      var m = r.metrics;
      rows.push({ key: k, name: p.name, cfg: p.entryPeriod + '/' + p.exitPeriod + '/' + p.atrPeriod + '/' + p.stopMultiplier, m: m });
      if (m.cumRet > bestRet) { bestRet = m.cumRet; bestKey = k; }
    });
    var html = '<thead><tr><th>方案</th><th>配置</th><th>回报</th><th>回撤</th><th>夏普</th><th>胜率</th><th>笔数</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      var best = r.key === bestKey ? ' class="combo-best"' : '';
      html += '<tr' + best + ' style="cursor:pointer" data-key="' + r.key + '"><td><b>' + r.name + '</b></td><td style="font-family:monospace;font-size:11px">' + r.cfg + '</td>' +
        '<td class="' + (r.m.cumRet >= 0 ? 'pos' : 'neg') + '">' + fmtPct(r.m.cumRet) + '</td>' +
        '<td class="neg">' + fmtPct(r.m.mdd) + '</td>' +
        '<td>' + r.m.sharpe.toFixed(2) + '</td>' +
        '<td>' + r.m.winRate.toFixed(0) + '%</td>' +
        '<td>' + r.m.totalTrades + '</td></tr>';
    });
    html += '</tbody>';
    var el = document.getElementById('comboTable');
    el.innerHTML = html;
    el.querySelectorAll('tbody tr').forEach(function (tr) {
      tr.onclick = function () { applyPreset(tr.dataset.key); };
    });
  }

  /* ========== CSV 导出 ========== */
  function exportCSV() {
    if (!lastResult || !lastResult.trades.length) return;
    var s = STOCKS[currentCode];
    var header = '标的,代码,日期,方向,价格,数量,金额,手续费,盈亏,收益率,持仓天数,类型\n';
    var rows = lastResult.trades.map(function (t) {
      return [
        s.name, s.code, t.date, t.type === 'buy' ? '买入' : '卖出',
        t.price.toFixed(2), t.shares, t.amount.toFixed(2),
        (t.commission || 0).toFixed(2),
        t.pnl !== undefined ? t.pnl.toFixed(2) : '',
        t.return !== undefined ? (t.return * 100).toFixed(2) + '%' : '',
        t.holdDays !== undefined ? t.holdDays : '',
        t.reason || (t.type === 'buy' ? '突破买入' : '')
      ].join(',');
    }).join('\n');
    var csv = '\uFEFF' + header + rows;
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = s.name + '_海龟策略交易记录_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ========== 工具函数 ========== */
  function fmtPct(v) { return (v >= 0 ? '+' : '') + v.toFixed(2) + '%'; }
  function resizeAll() { Object.keys(charts).forEach(function (k) { if (charts[k]) charts[k].resize(); }); }

  /* ========== 启动 ========== */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
