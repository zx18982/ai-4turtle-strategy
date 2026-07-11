#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
海龟交易策略 — 股价数据获取脚本
================================
使用 westock-data CLI 获取 A 股日线数据（前复权），保存为 JSON。
JSON 字段: date, open, close, high, low, volume, amount

股票列表（A 股）:
  - 中芯国际 (sh688981)   —— 来自前期任务
  - 比亚迪   (sz002594)   —— 来自前期任务
  - 长江电力 (sh600900)   —— 来自前期任务
  - 兆威机电 (sz003021)   —— 本次新增
  - 智谱替代 (待定)        —— 由用户确认后填入 STOCKS 列表

用法:
  python fetch_data.py
"""

import subprocess
import json
import os
from pathlib import Path

# westock-data 脚本（与 fetch_stock_data.py 一致）
NODE = "/Users/zhangxiao/.workbuddy/binaries/node/versions/22.22.2/bin/node"
SCRIPT = "/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/resources/builtin-skills/westock-data/scripts/index.js"

# 取约 1 年交易日，足够支撑海龟 20 日通道 + ATR(20) 计算
LIMIT = 260

# 数据目录（与脚本同级的 data/）
DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# ============================================================
# 股票列表  (code, name, industry)
# 注: 智谱(Zhipu AI)未上市，无股票代码，待用户确认替代标的后加入
# ============================================================
STOCKS = [
    ("sh688981", "中芯国际", "半导体"),
    ("sz002594", "比亚迪",   "新能源汽车"),
    ("sh600900", "长江电力", "电力"),
    ("sz003021", "兆威机电", "精密制造"),
    # ("shXXXXXX", "智谱替代", "AI"),   # TODO: 用户确认后取消注释并填入
]


def run(cmd_args, timeout=60):
    """运行 westock-data 命令，返回 stdout 字符串"""
    try:
        r = subprocess.run(
            [NODE, SCRIPT] + cmd_args,
            capture_output=True, text=True, timeout=timeout,
        )
        return r.stdout
    except Exception as e:
        print(f"  [ERROR] 命令执行失败: {e}")
        return ""


def parse_kline_table(out):
    """解析 westock kline 输出的 Markdown 表格 -> 字典列表"""
    if not out:
        return []
    lines = [l for l in out.strip().split("\n") if l.strip().startswith("|")]
    if len(lines) < 3:
        return []
    headers = [h.strip() for h in lines[0].split("|")[1:-1]]
    rows = []
    for line in lines[2:]:  # 跳过表头与分隔线
        vals = [v.strip() for v in line.split("|")[1:-1]]
        if len(vals) != len(headers):
            continue
        rows.append(dict(zip(headers, vals)))
    return rows


def fetch_one(code, name):
    print(f"正在获取 {name}({code}) 的日线数据 ...")
    out = run(["kline", code, "--period", "day", "--fq", "qfq", "--limit", str(LIMIT)])
    rows = parse_kline_table(out)
    data = []
    for r in rows:
        try:
            data.append({
                "date":   r["date"],
                "open":   float(r["open"]),
                "close":  float(r["last"]),   # westock 用 last 表示收盘价
                "high":   float(r["high"]),
                "low":    float(r["low"]),
                "volume": float(r["volume"]),
                "amount": float(r["amount"]),
            })
        except (KeyError, ValueError) as e:
            print(f"  [WARN] 跳过异常行: {e} -> {r}")
            continue
    # 按日期升序排列
    data.sort(key=lambda x: x["date"])
    path = DATA_DIR / f"{code}_daily.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  已保存 {len(data)} 条 -> {path}")
    return len(data)


def main():
    summary = []
    for code, name, industry in STOCKS:
        n = fetch_one(code, name)
        summary.append({"code": code, "name": name, "industry": industry, "count": n})
    # 写 stocks.json 元数据
    with open(DATA_DIR / "stocks.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print("\n数据获取完成。汇总:")
    for s in summary:
        print(f"  {s['name']}({s['code']}) -> {s['count']} 条")


if __name__ == "__main__":
    main()
