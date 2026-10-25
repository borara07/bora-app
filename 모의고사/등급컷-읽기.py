# 교육청 학력평가·평가원 모의평가 등급컷 PDF 를 표로 바꾸는 스크립트입니다.
# (선생님은 이 파일을 쓰지 않습니다. 만들어진 등급컷/등급컷.csv·md 만 보시면 됩니다)
# -*- coding: utf-8 -*-
"""등급컷 PDF → 등급컷.csv · 등급컷.md

   쓰는 법:
       python3 등급컷-읽기.py 고3.pdf 고2.pdf 고1.pdf

   PDF 한 쪽이 시험 하나입니다. 쪽마다 아래를 읽습니다.
     · 시행일과 학년 — 쪽 아래 출처 주소에서 (ex20210414/go3)
     · 선택과목 — 국어통합(2021년까지) 또는 화법과 작문·언어와 매체(2022년부터)
     · 1~8등급의 표준점수·백분위·등급컷 원점수

   등급컷이 아닌 쪽(문항별 정답률 표)은 건너뛰고, 몇 쪽을 건너뛰었는지 알려 줍니다.
"""
import re, os, sys, csv, json
import pymupdf


def read_one(path):
    """PDF 한 개를 읽어 시험 목록과 건너뛴 쪽을 돌려줍니다."""
    doc = pymupdf.open(path)
    exams, skipped = [], []

    for i in range(doc.page_count):
        text = doc[i].get_text()

        where = re.search(r'/ex(\d{8})/go(\d)_resultCut', text)
        table = re.search(r'등급컷 원점수\n(.*?)\n등급\n1\n', text, re.S)
        rows = re.findall(r'등급\n([1-8])\n(\d+)\n(\d+)\n(\d+)(?:\n(\d+))?', text)

        if not where or not table or len(rows) != 8:
            skipped.append(i + 1)
            continue

        day = where.group(1)
        labels = [x for x in table.group(1).split('\n') if x.strip() and x.strip() not in '()']
        two = labels[:2] == ['화법과 작문', '언어와 매체']
        subjects = ['화법과 작문', '언어와 매체'] if two else [labels[0] if labels else '공통']

        grades = []
        for no, std, percent, first, second in rows:
            점수 = [int(first)] + ([int(second)] if two and second else [])
            if len(점수) != len(subjects):
                grades = []
                break
            grades.append({'등급': int(no), '표준점수': int(std),
                           '백분위': int(percent), '원점수': 점수})
        if not grades:
            skipped.append(i + 1)
            continue

        exams.append({
            '학년': '고' + where.group(2),
            '시행일': '%s-%s-%s' % (day[:4], day[4:6], day[6:]),
            '선택과목': subjects,
            '등급': grades,
        })

    return exams, skipped


def write_csv(exams, path):
    """한 줄에 '한 시험 · 한 선택과목 · 한 등급' 을 적습니다. 엑셀에서 걸러 보기 좋습니다."""
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(['학년', '시행일', '선택과목', '등급', '표준점수', '백분위', '등급컷 원점수'])
        for e in exams:
            for n, sub in enumerate(e['선택과목']):
                for g in e['등급']:
                    w.writerow([e['학년'], e['시행일'], sub, g['등급'],
                                g['표준점수'], g['백분위'], g['원점수'][n]])


def write_md(exams, path):
    """학년마다 표 하나. 한 줄이 한 시험(선택과목)이고 1~8등급 원점수를 늘어놓습니다."""
    lines = ['# 교육청 학력평가 · 평가원 모의평가 등급컷', '',
             '학년별로 **1~8등급 등급컷 원점수**만 모았습니다.',
             '표준점수·백분위까지 보시려면 `등급컷.csv` 를 여세요.', '',
             '## 시험지 표지의 연도를 읽는 법 (헷갈리기 쉽습니다)', '',
             '아래 표의 날짜는 모두 **시험을 본 날**입니다. 시험지 표지와 맞출 때 이렇게 봅니다.', '',
             '- **교육청 전국연합학력평가**(3·4·5·7·10월)는 표지에 **시험 본 해**를 적습니다.',
             '  `2024학년도 7월 고3 전국연합학력평가` → **2024년 7월** 시험',
             '- **평가원 모의평가**(6·9월)와 **수능**(11월)은 표지에 **다음 해**를 적습니다.',
             '  `2027학년도 6월 모의평가` → **2026년 6월** 시험', '',
             '`exams.js` 에 회차를 넣을 때 `cuts` 칸에 이 숫자를 `-` 로 이어 적으면 됩니다.',
             '(예: `93-85-77-72`. 고3은 보통 네 개만 씁니다)', '']
    for grade in ('고3', '고2', '고1'):
        mine = sorted([e for e in exams if e['학년'] == grade],
                      key=lambda e: e['시행일'], reverse=True)
        if not mine:
            continue
        lines += ['## %s (%d개 시험)' % (grade, len(mine)), '',
                  '| 시행일 | 선택과목 | 1등급 | 2등급 | 3등급 | 4등급 | 5등급 | 6등급 | 7등급 | 8등급 |',
                  '|---|---|---|---|---|---|---|---|---|---|']
        for e in mine:
            for n, sub in enumerate(e['선택과목']):
                cuts = ' | '.join(str(g['원점수'][n]) for g in e['등급'])
                lines.append('| %s | %s | %s |' % (e['시행일'], sub, cuts))
        lines.append('')
    open(path, 'w', encoding='utf-8').write('\n'.join(lines))


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    here = os.path.join(os.path.dirname(os.path.abspath(__file__)), '등급컷')
    os.makedirs(here, exist_ok=True)

    all_exams = []
    for p in sys.argv[1:]:
        exams, skipped = read_one(p)
        print('%s → 시험 %d개%s' % (os.path.basename(p), len(exams),
              (' · 등급컷이 아닌 쪽 %d개는 건너뜀' % len(skipped)) if skipped else ''))
        all_exams += exams

    all_exams.sort(key=lambda e: (e['학년'], e['시행일']))
    write_csv(all_exams, os.path.join(here, '등급컷.csv'))
    write_md(all_exams, os.path.join(here, '등급컷.md'))
    json.dump(all_exams, open(os.path.join(here, '등급컷.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print('만들었습니다: 등급컷/등급컷.csv · 등급컷.md · 등급컷.json (시험 %d개)' % len(all_exams))
