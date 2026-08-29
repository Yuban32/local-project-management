# -*- coding: utf-8 -*-
"""检查所有 t('key') 在两个语言包中是否都存在，以及语言包结构是否一致"""
import pathlib
import re
import json
import subprocess

ROOT = pathlib.Path(__file__).parent.parent
SRC = ROOT / 'src'

# 1. 收集代码引用的所有 key
used = set()
for pattern in ('**/*.tsx', '**/*.ts'):
    for f in SRC.glob(pattern):
        if 'locales' in str(f):
            continue
        text = f.read_text(encoding='utf-8')
        for m in re.finditer(r"""\bt\(\s*['"]([\w.]+)['"]""", text):
            used.add(m.group(1))

# 2. 用 TypeScript 编译器把语言包转成 JS 并加载
NODE_SCRIPT = r'''
const fs = require('fs');
const ts = require(process.env.PROJ + '/node_modules/typescript');
const js = ts.transpileModule(fs.readFileSync(process.argv[1], 'utf-8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const mod = { exports: {} };
new Function('module', 'exports', 'require', js)(mod, mod.exports, require);
const obj = mod.exports.default;
const flat = {};
(function walk(o, prefix) {
  for (const [k, v] of Object.entries(o)) {
    const key = prefix ? prefix + '.' + k : k;
    if (typeof v === 'string') flat[key] = v;
    else if (v && typeof v === 'object') walk(v, key);
  }
})(obj, '');
console.log(JSON.stringify(flat));
'''

def flat_keys(name):
    p = SRC / 'shared' / 'locales' / name
    env = {'PROJ': str(ROOT), **__import__('os').environ}
    out = subprocess.run(
        ['node', '-e', NODE_SCRIPT, str(p)],
        capture_output=True, text=True, encoding='utf-8', env=env
    )
    if out.returncode != 0:
        raise RuntimeError(f'{name} load failed: {out.stderr}')
    return json.loads(out.stdout)

zh = flat_keys('zh-CN.ts')
en = flat_keys('en-US.ts')

missing_used = sorted(k for k in used if k not in zh)
missing_in_en = sorted(k for k in zh if k not in en)
missing_in_zh = sorted(k for k in en if k not in zh)

print(f'代码引用 key 数: {len(used)}')
print(f'zh-CN 词条数: {len(zh)}  en-US 词条数: {len(en)}')
print('== 代码引用但语言包缺失 ==')
print('\n'.join(missing_used) or '(无)')
print('== en-US 缺失 ==')
print('\n'.join(missing_in_en) or '(无)')
print('== zh-CN 缺失（多余 key）==')
print('\n'.join(missing_in_zh) or '(无)')
