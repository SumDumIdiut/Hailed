#!/usr/bin/env python3
"""Run one local-ollama job: spec (+ pasted context files) -> one output file, verified, with retries.

  python3 tools/oll.py --kind code    --spec task.md --out src/sim/economy.js --ctx src/sim/rng.js --verify "node --test tests/economy.test.js"
  python3 tools/oll.py --kind content --spec task.md --out content/factions.js --verify "node tools/check-content.mjs content/factions.js"

kind=code    -> qwen-coder-local (qwen2.5-coder 7B, 16k ctx, temp 0.1); the reply's first fenced code block is the file.
kind=content -> qwen3:8b (thinking off); same extraction.
Every request holds /tmp/claude-1000/.ollama.lock (shared with other sessions) and sends keep_alive=0, so only one
model is ever resident on the GPU (the user is noise/heat sensitive). Verify failures are fed back for another try.
Exit 0 when the verify command passes (or there is none), 1 otherwise. A log goes to <out>.oll.log beside nothing in
the repo: it is written to $OLL_LOGDIR (default /tmp/claude-1000/oll-logs).
"""
import argparse, fcntl, json, os, re, subprocess, sys, time, urllib.request

LOCK = '/tmp/claude-1000/.ollama.lock'
MODELS = {'code': ('qwen-coder-local:latest', {'temperature': 0.1, 'num_ctx': 16384}),
          'content': ('qwen3:8b', {'temperature': 0.7, 'num_ctx': 12288}),
          'think': ('qwen3:8b', {'temperature': 0.3, 'num_ctx': 16384})}   # code with reasoning on: slower, fewer silly bugs
SYSTEM = ('You are a careful senior JavaScript engineer working on a browser game written in plain ES modules '
          '(no packages, no build step). Follow the spec exactly. Reply with the COMPLETE file in ONE fenced code '
          'block and nothing else after it. Never leave TODOs or placeholders.')


def chat(model, opts, messages, timeout=1800, think=False):
    body = json.dumps({'model': model, 'stream': False, 'think': think, 'keep_alive': 0,
                       'options': opts, 'messages': messages}).encode()
    req = urllib.request.Request('http://127.0.0.1:11434/api/chat', body, {'Content-Type': 'application/json'})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read())['message']['content']
        except Exception as e:   # 500s happen while a model loads; back off and retry
            if attempt == 3: raise
            time.sleep(5 * (attempt + 1))


def extract(text):
    m = re.search(r'```[a-zA-Z0-9]*\n(.*?)```', text, re.S)
    if m: return m.group(1)
    m = re.search(r'```[a-zA-Z0-9]*\n(.*)$', text, re.S)   # unterminated block (ran out of tokens)
    return m.group(1) if m else text


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--kind', choices=MODELS, default='code')
    ap.add_argument('--spec', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--ctx', action='append', default=[], help='file whose contents are pasted as context')
    ap.add_argument('--verify', default='', help='shell command run from the repo root; nonzero exit = retry')
    ap.add_argument('--tries', type=int, default=3)
    a = ap.parse_args()

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    model, opts = MODELS[a.kind]
    spec = open(a.spec).read()
    ctx = ''.join(f'\n\n--- {p} ---\n```js\n{open(os.path.join(root, p)).read()}\n```' for p in a.ctx)
    user = spec + '\n\nOutput file: ' + a.out
    if ctx: user += '\n\nContext files (read-only, for reference):' + ctx
    messages = [{'role': 'system', 'content': SYSTEM}, {'role': 'user', 'content': user}]
    logdir = os.environ.get('OLL_LOGDIR', '/tmp/claude-1000/oll-logs'); os.makedirs(logdir, exist_ok=True)
    log = open(os.path.join(logdir, os.path.basename(a.out) + '.log'), 'a')
    out = os.path.join(root, a.out); os.makedirs(os.path.dirname(out), exist_ok=True)

    for t in range(1, a.tries + 1):
        os.makedirs(os.path.dirname(LOCK), exist_ok=True)
        with open(LOCK, 'w') as lk:
            fcntl.flock(lk, fcntl.LOCK_EX)   # one GPU job at a time across all sessions
            t0 = time.time(); reply = chat(model, opts, messages, think=(a.kind == 'think'))
        code = extract(reply)
        open(out, 'w').write(code if code.endswith('\n') else code + '\n')
        log.write(f'\n=== try {t} ({time.time() - t0:.0f}s, {len(code)} chars)\n')
        if not a.verify:
            print(f'wrote {a.out} (try {t}, no verify)'); return 0
        r = subprocess.run(a.verify, shell=True, cwd=root, capture_output=True, text=True, timeout=600)
        tail = (r.stdout + r.stderr)[-3000:]
        log.write(tail)
        if r.returncode == 0:
            print(f'OK {a.out} (try {t})'); return 0
        print(f'try {t} failed verify for {a.out}', flush=True)
        messages += [{'role': 'assistant', 'content': reply},
                     {'role': 'user', 'content': f'The verify command `{a.verify}` failed:\n```\n{tail}\n```\n'
                                                 'Fix the file. Reply with the COMPLETE corrected file in one code block.'}]
    print(f'FAILED {a.out} after {a.tries} tries'); return 1


if __name__ == '__main__':
    sys.exit(main())
