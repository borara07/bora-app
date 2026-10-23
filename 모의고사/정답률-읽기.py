# 수능·모의평가 '문항별 정답률' PDF 를 표로 바꾸는 스크립트입니다.
# (선생님은 이 파일을 쓰지 않습니다. 만들어진 정답률/정답률.md·csv 만 보시면 됩니다)
# -*- coding: utf-8 -*-
"""문항별 정답률 PDF → 정답률.csv · 정답률.md

   쓰는 법:
       python3 정답률-읽기.py 고3.pdf

   PDF 한 쪽이 '시험 하나 + 선택과목 하나' 입니다. 쪽마다 아래를 읽습니다.
     · 연도·월·학년
     · 선택과목 — 화법과 작문 / 언어와 매체 (2021년부터), 그 전에는 국어통합
     · 1~45번의 정답·배점·난이도·정답률·선지별 선택비율

   정답률 표가 아닌 쪽(등급컷 표)은 건너뜁니다.
   시행일은 같은 폴더의 '등급컷/등급컷.json' 에서 연도·월이 같은 시험을 찾아 붙입니다.

   ▶ 읽은 값이 맞는지 스스로 검사합니다.
     · 한 쪽에 문항이 45개인지, 배점 합이 100점인지
     · 화법과 작문·언어와 매체 두 쪽의 1~34번(공통)이 똑같은지
"""
import re, os, sys, csv, json
import pymupdf

# 글씨체가 통째로 들어 있지 않아 제목이 깨져 보입니다.
# 깨진 글자 그대로를 과목 이름으로 알아봅니다.
화작표시 = '\u452a\u2b6b\u1bd2 \u3667\u2a0e'   # 깨져 보이는 '화법과 작문'
언매표시 = '\u348e\u348a\u3516 \u28ba\u3b8a'   # 깨져 보이는 '언어와 매체'


def read_one(path):
    doc = pymupdf.open(path)
    sheets, skipped = [], []

    for i in range(doc.page_count):
        text = doc[i].get_text()
        if '문항 정답률' not in text:
            skipped.append(i + 1)
            continue

        when = re.search(r'\n(20\d\d)\n(\d{1,2})\n(\d) \n', text)
        rows = re.findall(
            r'(?m)^(\d{1,2})\n(-|[OX])\n([1-5])\n(-|[1-5])\n(최상|상|중상|중|중하|하)\n([23])\n(\d+)%'
            r'(?:\n(-|\d+%)\n(-|\d+%)\n(-|\d+%)\n(-|\d+%)\n(-|\d+%))?', text)
        if not when or len(rows) != 45:
            skipped.append(i + 1)
            continue

        subject = ('화법과 작문' if 화작표시 in text else
                   '언어와 매체' if 언매표시 in text else '국어통합')

        items = []
        for no, _ox, answer, _mine, level, point, rate, *shares in rows:
            items.append({
                '번호': int(no), '정답': int(answer), '배점': int(point),
                '난이도': level, '정답률': int(rate),
                '선지별': [s for s in shares] if shares and shares[0] else [],
            })
        items.sort(key=lambda x: x['번호'])

        sheets.append({
            '학년': '고' + when.group(3),
            '연도': int(when.group(1)), '월': int(when.group(2)),
            '선택과목': subject, '문항': items,
        })

    return sheets, skipped


def add_dates(sheets, cuts_path):
    """등급컷 자료에서 연도·월이 같은 시험을 찾아 시행일을 붙입니다."""
    try:
        cuts = json.load(open(cuts_path, encoding='utf-8'))
    except (IOError, ValueError):
        return
    for s in sheets:
        같은달 = [c['시행일'] for c in cuts
                if c['학년'] == s['학년'] and int(c['시행일'][:4]) == s['연도']
                and int(c['시행일'][5:7]) == s['월']]
        s['시행일'] = 같은달[0] if 같은달 else '%d-%02d' % (s['연도'], s['월'])


def check(sheets):
    """스스로 검사합니다. 이상한 곳을 글로 돌려줍니다."""
    말 = []
    for s in sheets:
        합 = sum(x['배점'] for x in s['문항'])
        if 합 != 100:
            말.append('%s %s 배점 합이 %d점입니다' % (s['시행일'], s['선택과목'], 합))
    짝 = {}
    for s in sheets:
        짝.setdefault((s['시행일'], s['학년']), []).append(s)
    for key, 둘 in 짝.items():
        if len(둘) != 2:
            continue
        a, b = [''.join(str(x['정답']) for x in t['문항'][:34]) for t in 둘]
        if a != b:
            말.append('%s 화작·언매의 1~34번 정답이 다릅니다' % (key[0],))
    return 말


def write_csv(sheets, path):
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(['학년', '시행일', '선택과목', '번호', '정답', '배점', '난이도', '정답률%',
                    '①', '②', '③', '④', '⑤'])
        for s in sheets:
            for x in s['문항']:
                w.writerow([s['학년'], s['시행일'], s['선택과목'], x['번호'], x['정답'],
                            x['배점'], x['난이도'], x['정답률']] + (x['선지별'] or ['', '', '', '', '']))


def write_md(sheets, path):
    lines = ['# 수능 · 모의평가 문항별 정답률', '',
             '시험마다 **정답 45자 · 배점 45자**를 그대로 적어 두었습니다.',
             '`exams.js` 에 회차를 넣을 때 `answers` · `points` 칸에 그대로 옮기면 됩니다.',
             '(`answers` 는 1~34번을 "공통", 35~45번을 선택과목 칸에 나눠 적습니다)', '',
             '정답률·선지별 선택비율까지 보시려면 `정답률.csv` 를 여세요.', '']
    for s in sorted(sheets, key=lambda s: (s['시행일'], s['선택과목']), reverse=True):
        정답 = ''.join(str(x['정답']) for x in s['문항'])
        배점 = ''.join(str(x['배점']) for x in s['문항'])
        어려움 = [x for x in s['문항'] if x['정답률'] < 50]
        lines += ['## %s %s · %s' % (s['시행일'], s['학년'], s['선택과목']), '',
                  '```', '정답  1~34  ' + 정답[:34], '정답 35~45  ' + 정답[34:],
                  '배점  1~34  ' + 배점[:34], '배점 35~45  ' + 배점[34:], '```', '']
        if 어려움:
            lines.append('어려웠던 문항(정답률 50% 미만): ' +
                         ' · '.join('%d번 %d%%' % (x['번호'], x['정답률']) for x in 어려움))
            lines.append('')
    open(path, 'w', encoding='utf-8').write('\n'.join(lines))


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, '정답률')
    os.makedirs(out, exist_ok=True)

    모두 = []
    for p in sys.argv[1:]:
        sheets, skipped = read_one(p)
        print('%s → 표 %d개%s' % (os.path.basename(p), len(sheets),
              (' · 정답률 표가 아닌 쪽 %d개는 건너뜀' % len(skipped)) if skipped else ''))
        모두 += sheets

    add_dates(모두, os.path.join(here, '등급컷', '등급컷.json'))
    모두.sort(key=lambda s: (s['시행일'], s['선택과목']))

    말 = check(모두)
    for m in 말:
        print('  !! ' + m)
    if not 말:
        print('  검사 통과 — 모두 45문항, 배점 합 100점, 화작·언매 공통 부분이 같습니다')

    write_csv(모두, os.path.join(out, '정답률.csv'))
    write_md(모두, os.path.join(out, '정답률.md'))
    json.dump(모두, open(os.path.join(out, '정답률.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print('만들었습니다: 정답률/정답률.csv · 정답률.md · 정답률.json (표 %d개)' % len(모두))
