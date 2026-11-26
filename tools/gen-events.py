#!/usr/bin/env python3
"""Write extra event cards with a local ollama model (qwen3:8b), validate them, and emit content/events-gen.js.

  python3 tools/gen-events.py [rounds_per_theme=2]

Run it behind the shared lock: flock /tmp/claude-1000/.ollama.lock python3 tools/gen-events.py
Only cards that pass validation are kept; ids are made unique. Safe to re-run: it appends to tools/gen-events.json.
"""
import json, os, re, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STORE = os.path.join(ROOT, 'tools', 'gen-events.json')
OUT = os.path.join(ROOT, 'content', 'events-gen.js')
MODEL = 'qwen3:8b'
TRIGGERS = {'flight', 'arrive', 'survey', 'random'}
MATERIALS = {'minerals', 'volatiles', 'gas', 'silicates'}

THEMES = [
    ('flight', 'hazards and wonders met while flying between stars at a large fraction of light speed in an Astrophage-powered ship'),
    ('flight', 'ship systems failing or acting strangely during a long relativistic burn, and the human pilot and Rocky fixing them'),
    ('arrive', 'arriving at a red dwarf, orange dwarf or white star system for the first time and noticing something odd'),
    ('survey', 'scanning and sampling alien planets: oceans, ice moons, lava worlds, deserts, gas giants'),
    ('random', 'quiet moments aboard: the lab, the Taumoeba strains, Rocky building things from xenonite, messages from Earth arriving years late'),
    ('random', 'Astrophage behaving unexpectedly: blooms, migrations along the Petrova line, swarms near the ship'),
    ('arrive', 'traces of the Cartographers, a long-dead species whose relay buoys line the Astrophage lanes'),
    ('flight', 'trading or talking with strange alien travellers met in deep space (original species, invent them)'),
]

PROMPT = """You write event cards for a hard-science-fiction space game. The player flies the Hail Mary, an Astrophage-powered ship, with Rocky, an Eridian engineer (speaks in short sentences, ends questions with "question?", says "amaze" when happy, "bad bad bad" when alarmed).

Theme: {theme}.
Write {n} NEW, original event cards as a JSON object: {{"events": [ ... ]}}.
Each event:
{{"title": "2-4 words", "text": "1-3 vivid sentences", "choices": [
  {{"label": "short imperative, 2-5 words", "hint": "4-7 word trade-off summary", "effects": [ ... ]}}
]}}
Give 2 or 3 choices. Every choice is a trade-off (something gained, something risked or spent). Effects are objects, ONLY these forms:
{{"fuel": number}} kilograms, between -6000 and 6000
{{"hull": number}} between -0.15 and 0.1
{{"samples": integer}} between -2 and 3
{{"research": integer}} between -4 and 8
{{"material": "minerals"|"volatiles"|"gas"|"silicates", "n": integer between -2 and 3}}
{{"years": number}} ship time spent, between 0.01 and 0.3
{{"chance": 0.2-0.8, "then": [effects], "else": [effects]}}
Output JSON only."""


def ask(theme, n=8):
    body = json.dumps({'model': MODEL, 'stream': False, 'think': False, 'format': 'json',
                       'options': {'temperature': 0.8, 'num_ctx': 8192},
                       'messages': [{'role': 'user', 'content': PROMPT.format(theme=theme, n=n)}]}).encode()
    req = urllib.request.Request('http://127.0.0.1:11434/api/chat', body, {'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.loads(json.loads(r.read())['message']['content'])


def num(v, lo, hi, integer=False):
    if not isinstance(v, (int, float)) or isinstance(v, bool): return None
    v = max(lo, min(hi, v))
    return int(round(v)) if integer else round(float(v), 3)


def clean_effect(e, depth=0):
    if not isinstance(e, dict): return None
    if 'chance' in e and depth == 0:
        c = num(e.get('chance'), 0.1, 0.9)
        then = [x for x in (clean_effect(y, 1) for y in e.get('then') or []) if x]
        els = [x for x in (clean_effect(y, 1) for y in e.get('else') or []) if x]
        return {'chance': c, 'then': then, 'else': els} if c and (then or els) else None
    for k, lo, hi, it in (('fuel', -6000, 6000, True), ('hull', -0.15, 0.1, False), ('samples', -2, 3, True),
                          ('research', -4, 8, True), ('years', 0.01, 0.3, False)):
        if k in e:
            v = num(e[k], lo, hi, it)
            return {k: v} if v else None
    if e.get('material') in MATERIALS:
        v = num(e.get('n'), -2, 3, True)
        return {'material': e['material'], 'n': v} if v else None
    return None


def clean_event(ev, trigger):
    if not isinstance(ev, dict): return None
    title, text = str(ev.get('title', '')).strip(), str(ev.get('text', '')).strip()
    if not (2 <= len(title) <= 40 and 20 <= len(text) <= 400): return None
    choices = []
    for c in ev.get('choices') or []:
        if not isinstance(c, dict): continue
        label = str(c.get('label', '')).strip()
        fx = [x for x in (clean_effect(e) for e in c.get('effects') or []) if x]
        if 2 <= len(label) <= 40 and fx:
            ch = {'label': label, 'effects': fx}
            hint = str(c.get('hint', '')).strip()
            if hint: ch['hint'] = hint[:60]
            choices.append(ch)
    if not 2 <= len(choices) <= 3: return None
    return {'trigger': trigger, 'weight': 0.6, 'title': title, 'text': text, 'choices': choices}


def main():
    rounds = int(sys.argv[1]) if len(sys.argv) > 1 else 2
    kept = json.load(open(STORE)) if os.path.exists(STORE) else []
    seen = {e['title'].lower() for e in kept}
    for r in range(rounds):
        for trigger, theme in THEMES:
            try:
                data = ask(theme)
            except Exception as x:
                print('ask failed:', theme[:30], x, flush=True); continue
            good = 0
            for ev in (data.get('events') if isinstance(data, dict) else None) or []:
                c = clean_event(ev, trigger)
                if c and c['title'].lower() not in seen:
                    seen.add(c['title'].lower()); kept.append(c); good += 1
            print(f'round {r + 1} {trigger:7} +{good} (total {len(kept)})', flush=True)
            json.dump(kept, open(STORE, 'w'), indent=1)
    for i, e in enumerate(kept):
        e['id'] = 'gen-' + re.sub(r'[^a-z0-9]+', '-', e['title'].lower()).strip('-') + f'-{i}'
    with open(OUT, 'w') as f:
        f.write('// Generated by tools/gen-events.py (local qwen3:8b), validated and clamped. Edit freely.\n')
        f.write('export default ' + json.dumps({'id': 'events-gen', 'events': kept}, indent=1) + ';\n')
    print('wrote', OUT, len(kept), 'events')


if __name__ == '__main__':
    main()
