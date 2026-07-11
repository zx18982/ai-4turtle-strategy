#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
海龟交易策略 — 股价数据自动更新脚本（akshare 版）
==================================================
使用 akshare 获取 A 股前复权日线数据，保存为 JSON 并生成 data.js。
适用于本地运行和 GitHub Actions CI 环境。

依赖: pip install akshare

用法:
  python update_data.py

股票列表:
  - 中芯国际 (sh688981)   半导体
  - 比亚迪   (sz002594)   新能源汽车
  - 长江电力 (sh600900)   电力
  - 兆威机电 (sz003021)   精密制造
"""

import json
import os
from pathlib import Path

try:
    import akshare as ak
except ImportError:
    print("[ERROR] 请先安装 akshare: pip install akshare")
    raise

# ============================================================
# 配置
# ============================================================
LIMIT_DAYS = 260  # 取约 1 年交易日
BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# 股票列表: (akshare 代码, 本地代码, 名称, 行业)
STOCKS = [
    ("688981", "sh688981", "中芯国际", "半导体"),
    ("002594", "sz002594", "比亚迪",   "新能源汽车"),
    ("600900", "sh600900", "长江电力", "电力"),
    ("003021", "sz003021", "兆威机电", "精密制造"),
]


def fetch_one(ak_code, local_code, name, industry):
    """通过 akshare 获取前复权日线数据"""
    print(f"  正在获取 {name}({ak_code}) ...")
    try:
        df = ak.stock_zh_a_hist(
            symbol=ak_code,
            period="daily",
            adjust="qfq",
            start_date="20250101",
            end_date="20261231",
        )
        if df is None or len(df) == 0:
            print(f"    [WARN] {name} 无数据返回")
            return 0

        # 只取最近 LIMIT_DAYS 条
        if len(df) > LIMIT_DAYS:
            df = df.tail(LIMIT_DAYS)

        data = []
        for _, row in df.iterrows():
            date_str = str(row["日期"])[:10] if "日期" in df.columns else str(row["date"])[:10]
            data.append({
                "date":   date_str,
                "open":   round(float(row["开盘"]), 2),
                "close":  round(float(row["收盘"]), 2),
                "high":   round(float(row["最高"]), 2),
                "low":    round(float(row["最低"]), 2),
                "volume": float(row["成交量"]),
                "amount": float(row["成交额"]),
            })

        data.sort(key=lambda x: x["date"])
        path = DATA_DIR / f"{local_code}_daily.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"    已保存 {len(data)} 条 -> {path}")
        return len(data)

    except Exception as e:
        print(f"    [ERROR] {name} 获取失败: {e}")
        return 0


def gen_data_js():
    """将 data/*.json 转换为 web_tool/js/data.js"""
    stocks_meta = [
        ("sh688981", "中芯国际", "半导体", "CNY"),
        ("sz002594", "比亚迪",   "新能源汽车", "CNY"),
        ("sh600900", "长江电力", "电力", "CNY"),
        ("sz003021", "兆威机电", "精密制造", "CNY"),
    ]
    lines = ["window.STOCK_DATA = {"]
    for code, name, ind, cur in stocks_meta:
        json_path = DATA_DIR / f"{code}_daily.json"
        if not json_path.exists():
            print(f"  [WARN] 跳过 {name}: {json_path} 不存在")
            continue
        with open(json_path, "r", encoding="utf-8") as f:
            d = json.load(f)
        arr = json.dumps(d, ensure_ascii=False, separators=(",", ":"))
        lines.append(f'  "{code}": {{name:"{name}",code:"{code}",industry:"{ind}",currency:"{cur}",data:{arr}}},')
    lines.append("};")

    out = "\n".join(lines)
    target = BASE_DIR / "web_tool" / "js" / "data.js"
    target.parent.mkdir(parents=True, exist_ok=True)
    with open(target, "w", encoding="utf-8") as f:
        f.write(out)
    print(f"  data.js 已生成: {target} ({os.path.getsize(target)} bytes)")


def main():
    print("=" * 50)
    print("海龟策略数据更新 (akshare)")
    print("=" * 50)

    summary = []
    for ak_code, local_code, name, industry in STOCKS:
        n = fetch_one(ak_code, local_code, name, industry)
        summary.append({"code": local_code, "name": name, "industry": industry, "count": n})

    # 写 stocks.json 元数据
    with open(DATA_DIR / "stocks.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print("\n生成 data.js ...")
    gen_data_js()

    print("\n" + "=" * 50)
    print("数据更新完成。汇总:")
    for s in summary:
        print(f"  {s['name']}({s['code']}) -> {s['count']} 条")
    print("=" * 50)


if __name__ == "__main__":
    main()
