# 성적표를 한 번에 만드는 스크립트입니다.
# (선생님은 이 파일을 쓰지 않습니다. 만들어진 엑셀·PDF만 쓰시면 됩니다)
# -*- coding: utf-8 -*-
"""보라! 국어전문학원 성적표 자동 만들기

   앱에 들어온 기록(수파베이스에서 그대로 꺼낸 것)을 넣으면
   엑셀 · 전체 PDF · 개인별 PDF 압축까지 한 번에 만듭니다.

   쓰는 법:
       python3.13 성적표-자동.py 기록.json 만들폴더 [--시행일 2026-10-25]

   기록.json 은 수파베이스에서 꺼낸 그대로입니다. 한 줄이 한 번의 제출입니다.
       [ {"id":768, "student_name":"박성원", "school":"배화여자고등학교",
          "round_title":"[모의고사] 고2 · 심화모의고사 10월 · 화작",
          "percent":85, "taken_at":"2026-10-25 10:27:35+00",
          "ans":"414455541334122452241425235143455253524213314"}, ... ]

   스스로 이렇게 정리합니다 (아래 '정해 둔 규칙' 과 같습니다).
     · 한 학생이 두 번 넣었으면 → 나중에 넣은 것만 씁니다
     · 한 문항도 누르지 않은 줄 → 버립니다
     · 일부만 푼 줄 → 그대로 넣고, 못 푼 문항 수를 알려 줍니다
     · 학교 이름 → 명단에서 쓰는 짧은 이름으로 맞춥니다 (배화여자고등학교 → 배화여고)
     · 점수 → 앱에 저장된 점수와 다시 계산한 점수가 같은지 반드시 검산합니다
   검산이 틀리면 성적표를 만들지 않고 멈춥니다."""
import datetime, importlib.util, io, json, os, re, shutil, subprocess, sys, zipfile

여기 = os.path.dirname(os.path.abspath(__file__))
만들기경로 = os.path.join(여기, '성적표-만들기.py')
기본_EXAMS = os.path.join(여기, '..', 'exams.js')


def 만들기불러오기():
    """성적표-만들기.py 를 그대로 가져다 씁니다 (파일 이름에 한글이 있어 이렇게 불러옵니다)."""
    spec = importlib.util.spec_from_file_location('성적표만들기', 만들기경로)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def 학교이름(이름, 명단):
    """학교 이름을 명단에서 쓰는 짧은 이름으로 맞춥니다."""
    if 이름 in 명단:
        return 명단[이름]
    짧게 = (이름 or '').strip()
    짧게 = re.sub(r'여자고등학교$', '여고', 짧게)
    짧게 = re.sub(r'여자중학교$', '여중', 짧게)
    짧게 = re.sub(r'고등학교$', '고', 짧게)
    짧게 = re.sub(r'중학교$', '중', 짧게)
    return 짧게


def 회차와과목(round_title):
    """기록의 회차 이름에서 회차와 선택과목을 떼어 냅니다.
       '[모의고사] 고2 · 심화모의고사 10월 · 화작' → ('고2 · 심화모의고사 10월', '화법과 작문')"""
    t = re.sub(r'^\[모의고사\]\s*', '', round_title or '').strip()
    과목 = ''
    for 꼬리, 본이름 in (('· 화작', '화법과 작문'), ('· 언매', '언어와 매체')):
        if t.endswith(꼬리):
            t = t[:-len(꼬리)].strip().rstrip('·').strip()
            과목 = 본이름
    return t, 과목


def 날짜(줄):
    return str(줄.get('taken_at') or '')


def 정리(기록, 명단):
    """두 번 넣은 것·빈 줄을 정리해서 학생 목록을 만듭니다."""
    회차들 = set()
    for 줄 in 기록:
        회차들.add(회차와과목(줄['round_title'])[0])
    if len(회차들) != 1:
        raise SystemExit('기록에 회차가 %d 개 섞여 있습니다: %s\n한 회차씩 넣어 주세요.'
                         % (len(회차들), ' / '.join(sorted(회차들))))
    회차 = 회차들.pop()

    # 늦게 넣은 것이 뒤로 오게 줄을 세웁니다
    순서 = sorted(기록, key=lambda 줄: (날짜(줄), 줄.get('id') or 0))

    버린빈줄, 버린중복 = [], []
    골라낸 = {}
    for 줄 in 순서:
        답 = [int(c) for c in re.sub(r'[^0-9]', '', str(줄.get('ans') or ''))]
        if not any(답):
            버린빈줄.append(줄)
            continue
        칸 = (re.sub(r'\s', '', 줄['student_name']), 줄.get('school') or '')
        if 칸 in 골라낸:
            버린중복.append((골라낸[칸], 줄))
        골라낸[칸] = 줄

    학생들 = []
    for 줄 in 순서:
        칸 = (re.sub(r'\s', '', 줄['student_name']), 줄.get('school') or '')
        if 골라낸.get(칸) is not 줄:
            continue
        _, 과목 = 회차와과목(줄['round_title'])
        학생들.append({
            'name': re.sub(r'\s', '', 줄['student_name']),
            'school': 학교이름(줄.get('school'), 명단),
            'choice': 과목,
            'ans': [int(c) for c in re.sub(r'[^0-9]', '', str(줄.get('ans') or ''))],
            '앱점수': 줄.get('percent'),
            'id': 줄.get('id'),
            '넣은때': 날짜(줄),
        })
    return 회차, 학생들, 버린빈줄, 버린중복


def 시행일바꾼파일(exams경로, 회차, 시행일, 둘곳):
    """저장소 파일은 그대로 두고, 시행일만 바꾼 복사본을 만듭니다."""
    학년, _, 이름 = (회차.partition(' · ') if ' · ' in 회차 else ('', '', 회차))
    원본 = io.open(exams경로, encoding='utf-8').read()
    덧붙임 = (u'\n/* 성적표를 만들 때만 쓰는 시행일입니다 (저장소 파일은 그대로입니다) */\n'
              u'EXAMS.forEach(function (회차) {\n'
              u'  if (회차.title === %s && (%s === "" || 회차.grade === %s)) 회차.date = %s;\n'
              u'});\n' % (json.dumps(이름, ensure_ascii=False), json.dumps(학년, ensure_ascii=False),
                          json.dumps(학년, ensure_ascii=False), json.dumps(시행일)))
    새파일 = os.path.join(둘곳, 'exams-성적표용.js')
    io.open(새파일, 'w', encoding='utf-8').write(원본 + 덧붙임)
    return 새파일


def 쪽나누기(pdf, 이름들, 둘곳, 머리):
    """전체 PDF 를 학생마다 한 장씩 잘라 압축합니다."""
    import pymupdf
    책 = pymupdf.open(pdf)
    개인별 = os.path.join(둘곳, '개인별')
    os.makedirs(개인별, exist_ok=True)
    못찾음, 길들 = [], []
    for i, 이름 in enumerate(이름들):
        글 = 책[i].get_text()
        if 이름 not in 글:
            못찾음.append((i + 1, 이름))
        한장 = pymupdf.open()
        한장.insert_pdf(책, from_page=i, to_page=i)
        길 = os.path.join(개인별, '%s-%s.pdf' % (머리, 이름))
        한장.save(길); 한장.close(); 길들.append(길)
    압축 = os.path.join(둘곳, '%s-개인별성적표.zip' % 머리)
    with zipfile.ZipFile(압축, 'w', zipfile.ZIP_DEFLATED) as z:
        for 길 in 길들:
            z.write(길, os.path.basename(길))
    return 압축, 책.page_count, 못찾음


def main():
    인수 = [a for a in sys.argv[1:]]
    시행일 = None
    명단파일 = None
    exams경로 = 기본_EXAMS
    남은 = []
    i = 0
    while i < len(인수):
        if 인수[i] == '--시행일' and i + 1 < len(인수):
            시행일 = 인수[i + 1]; i += 2
        elif 인수[i] == '--명단' and i + 1 < len(인수):
            명단파일 = 인수[i + 1]; i += 2
        elif 인수[i] == '--exams' and i + 1 < len(인수):
            exams경로 = 인수[i + 1]; i += 2
        else:
            남은.append(인수[i]); i += 1
    if len(남은) < 2:
        raise SystemExit('쓰는 법: python3.13 성적표-자동.py 기록.json 만들폴더 '
                         '[--시행일 2026-10-25] [--명단 명단.json] [--exams exams.js]')
    기록파일, 둘곳 = 남은[0], 남은[1]
    os.makedirs(둘곳, exist_ok=True)

    기록 = json.load(io.open(기록파일, encoding='utf-8'))
    if not 기록:
        raise SystemExit('기록이 없습니다. 아직 아무도 답을 넣지 않았습니다.')
    명단 = {}
    if 명단파일:
        for 줄 in json.load(io.open(명단파일, encoding='utf-8')):
            명단[줄.get('school') or ''] = 줄.get('school') or ''
            명단[(줄.get('school') or '') + '등학교'] = 줄.get('school') or ''
        # 명단의 짧은 학교 이름을 긴 이름에서도 찾을 수 있게 합니다
        짧은것 = sorted({(줄.get('school') or '') for 줄 in
                        json.load(io.open(명단파일, encoding='utf-8')) if 줄.get('school')})
        for 짧게 in 짧은것:
            뿌리 = re.sub(r'(여고|여중|고|중)$', '', 짧게)
            for 긴것 in ('%s여자고등학교' % 뿌리, '%s고등학교' % 뿌리,
                        '%s여자중학교' % 뿌리, '%s중학교' % 뿌리):
                명단.setdefault(긴것, 짧게)

    회차, 학생들, 버린빈줄, 버린중복 = 정리(기록, 명단)
    if not 학생들:
        raise SystemExit('쓸 수 있는 답안이 없습니다. (모두 한 문항도 누르지 않은 줄입니다)')

    쓸exams = exams경로
    if 시행일:
        쓸exams = 시행일바꾼파일(exams경로, 회차, 시행일, 둘곳)

    # ---------- 점수 검산 ----------
    만들기 = 만들기불러오기()
    책 = 만들기.read_exams(쓸exams)
    def 이름표(e):
        g = e.get('grade') or ''
        return (g + ' · ' + e.get('title', '')) if g else e.get('title', '')
    맞는회차 = [e for e in (책['exams'] or []) if 이름표(e) == 회차] or \
             [e for e in (책['exams'] or []) if e.get('title') == 회차]
    if len(맞는회차) != 1:
        raise SystemExit('exams.js 에서 "%s" 회차를 하나로 찾지 못했습니다.' % 회차)
    묶음 = 만들기.Round(맞는회차[0], 책)
    틀린검산 = []
    for st in 학생들:
        과목 = st['choice'] or (묶음.choices[0] if 묶음.choices else '')
        정답 = 묶음.key(과목); 배점 = 묶음.point(과목)
        점수 = sum(p for g, p, m in zip(정답, 배점, st['ans']) if m == g)
        st['점수'] = 점수
        st['틀림'] = sum(1 for g, m in zip(정답, st['ans']) if m and m != g)
        st['못풂'] = sum(1 for m in st['ans'] if m == 0) + max(0, len(정답) - len(st['ans']))
        st['등급'] = 만들기.grade_of(점수, 묶음.cuts(과목))
        if st['앱점수'] is not None and 점수 != st['앱점수']:
            틀린검산.append((st['name'], st['앱점수'], 점수))
    if 틀린검산:
        print('앱 점수와 다시 계산한 점수가 다릅니다. 성적표를 만들지 않았습니다.')
        for 이름, 앱, 내 in 틀린검산:
            print('  %s — 앱 %d점 / 다시 계산 %d점' % (이름, 앱, 내))
        raise SystemExit(1)

    # ---------- 엑셀·PDF·압축 ----------
    머리 = re.sub(r'[ ·]+', '-', 회차).strip('-')
    엑셀 = os.path.join(둘곳, '%s-성적표.xlsx' % 머리)
    만들기.main(회차, [dict(st) for st in 학생들], 엑셀, 쓸exams)
    subprocess.check_call(['soffice', '--headless', '--convert-to', 'pdf',
                           '--outdir', 둘곳, 엑셀],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    pdf = os.path.splitext(엑셀)[0] + '.pdf'
    압축, 쪽수, 못찾음 = 쪽나누기(pdf, [st['name'] for st in 학생들], 둘곳, 머리)

    # ---------- 알려 주기 ----------
    평균 = sum(st['점수'] for st in 학생들) / float(len(학생들))
    print('회차   : %s' % 회차)
    print('시행일 : %s' % (시행일 or 맞는회차[0].get('date')))
    print('인원   : %d명 · 평균 %.1f점 · 최고 %d · 최저 %d'
          % (len(학생들), 평균, max(st['점수'] for st in 학생들),
             min(st['점수'] for st in 학생들)))
    print('')
    print('| 이름 | 학교 | 점수 | 등급 | 틀린 문항 | 못 푼 문항 |')
    print('|---|---|---|---|---|---|')
    for st in sorted(학생들, key=lambda s: -s['점수']):
        print('| %s | %s | %d | %s | %d | %s |'
              % (st['name'], st['school'], st['점수'],
                 st['등급'] if st['등급'] else '등급 외', st['틀림'],
                 st['못풂'] if st['못풂'] else '–'))
    print('')
    for 먼저, 나중 in 버린중복:
        print('두 번 넣음 : %s — 나중 것(%d점)으로 했습니다. 먼저 넣은 것은 %d점이었습니다.'
              % (re.sub(r'\s', '', 나중['student_name']), 나중.get('percent') or 0,
                 먼저.get('percent') or 0))
    for 줄 in 버린빈줄:
        print('버린 줄   : %s — 한 문항도 누르지 않아 뺐습니다.'
              % re.sub(r'\s', '', 줄['student_name']))
    for st in 학생들:
        if st['못풂']:
            print('못 푼 문항 : %s — %d문항이 비어 있습니다.' % (st['name'], st['못풂']))
    if 못찾음:
        print('!! PDF 쪽에서 이름을 못 찾았습니다: %s' % 못찾음)
    print('')
    print('엑셀     : %s' % 엑셀)
    print('전체 PDF : %s' % pdf)
    print('개인별   : %s' % 압축)
    print('PDF 쪽수 : %d (학생 %d쪽 + 분석 %d쪽)' % (쪽수, len(학생들), 쪽수 - len(학생들)))


if __name__ == '__main__':
    main()
