#!/usr/bin/env python3
"""将 data/*.json 转换为 web_tool/js/data.js（script 标签可直接加载）"""
import json, os
from pathlib import Path

BASE = Path(__file__).parent
stocks = [
    ('sh688981', '中芯国际', '半导体', 'CNY'),
    ('sz002594', '比亚迪', '新能源汽车', 'CNY'),
    ('sh600900', '长江电力', '电力', 'CNY'),
    ('sz003021', '兆威机电', '精密制造', 'CNY'),
    ('sz300433', '蓝思科技', '电子制造', 'CNY'),
    ('sz300308', '中际旭创', '通信设备', 'CNY'),
    ('sh601200', '上海环境', '环保', 'CNY'),
    ('sh600649', '城投控股', '房地产', 'CNY'),
    ('sh600109', '国金证券', '证券', 'CNY'),
    ('sh601169', '北京银行', '银行', 'CNY'),
    ('sh600177', '雅戈尔', '纺织服装', 'CNY'),
    ('sh600021', '上海电力', '电力', 'CNY'),
]

lines = ['window.STOCK_DATA = {']
for code, name, ind, cur in stocks:
    with open(BASE / 'data' / f'{code}_daily.json', 'r', encoding='utf-8') as f:
        d = json.load(f)
    arr = json.dumps(d, ensure_ascii=False, separators=(',', ':'))
    lines.append(f'  "{code}": {{name:"{name}",code:"{code}",industry:"{ind}",currency:"{cur}",data:{arr}}},')
lines.append('};')

out = '\n'.join(lines)
target = BASE / 'web_tool' / 'js' / 'data.js'
target.parent.mkdir(parents=True, exist_ok=True)
with open(target, 'w', encoding='utf-8') as f:
    f.write(out)
print(f'data.js written: {target} ({os.path.getsize(target)} bytes, {len(stocks)} stocks)')
