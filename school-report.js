/* =========================================================
   내신(정기고사) 성적표 — 계산과 그리기
   학생 화면(school.js)과 선생님 화면(teacher.js)이 함께 씁니다.
   그래서 학생이 받는 성적표와 선생님이 검토하는 성적표가 똑같이 보입니다.

   '체크(marks)' 는 학생이 누른 것입니다.
     wrong   { 문항번호: true }        틀린 문항
     hard    { 문항번호: true }        맞았지만 헤맨 문항
     reasons { 문항번호: ['개념', …] } 틀린 이유
     reflect [ … ]  wish [ … ]  memo ''  돌아보기
   ========================================================= */

var SchoolReport = (function () {
  'use strict';

  /* ---------- 틀린 이유 ----------
     설문지의 예시를 그대로 옮겼습니다. 글자(code)는 기록에 남는 이름이라 바꾸지 않습니다. */
  var REASONS = [
    { code: '지문', label: '지문이 어려웠다',
      fix: '지문을 문단마다 한 줄로 요약하며 읽는 연습을 합니다.' },
    { code: '외부', label: '외부 작품·<보기> 해석이 어려웠다',
      fix: '처음 보는 작품은 화자·상황·정서부터 찾고, <보기>는 핵심 문장에 밑줄을 긋고 지문과 짝지어 봅니다.' },
    { code: '물음', label: '문제를 잘못 이해했다',
      fix: "물음의 '적절하지 않은 것'·조건에 동그라미를 치고 풉니다." },
    { code: '선지', label: '선택지 분석이 안 됐다',
      fix: '선지를 끊어 읽고, 끊은 부분마다 지문에서 근거를 찾아 표시합니다.' },
    { code: '개념', label: '개념을 몰랐다',
      fix: '틀린 문항의 개념을 노트에 정리하고, 같은 개념 문제를 더 풀어 봅니다.' },
    { code: '고민', label: '고민 시간이 길었다',
      fix: '시간을 재고 푸는 연습을 합니다. 오래 걸리는 문항은 표시하고 넘어갔다가 돌아옵니다.' },
    { code: '시간', label: '시간이 부족해 못 읽었다',
      fix: '쉬운 문항부터 푸는 순서를 정하고, 실전처럼 시간 배분 연습을 합니다.' },
    { code: '찍음', label: '찍었다',
      fix: '찍은 문항은 맞았어도 틀린 문항처럼 다시 공부합니다.' }
  ];

  /* ---------- 기출 파일에서 값 꺼내기 ---------- */

  function allExams() {
    return (typeof SCHOOL_EXAMS !== 'undefined' && Array.isArray(SCHOOL_EXAMS)) ? SCHOOL_EXAMS : [];
  }
  function listOf(name, fallback) {
    var v = (typeof window[name] !== 'undefined') ? window[name] : null;
    return Array.isArray(v) ? v : fallback;
  }
  function mapOf(name) {
    var v = (typeof window[name] !== 'undefined') ? window[name] : null;
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : null;
  }
  function areas() { return listOf('SCHOOL_AREAS', ['문학', '독서', '문법', '화법', '작문', '매체', '어휘']); }
  /* 유형 — 영역마다 나뉜 목록 (예전처럼 한 줄 목록이어도 읽습니다) */
  function typesOf(area) {
    var m = mapOf('SCHOOL_TYPES');
    if (m) { return Array.isArray(m[area]) ? m[area] : []; }
    return listOf('SCHOOL_TYPES', []);
  }
  function types() {
    var m = mapOf('SCHOOL_TYPES');
    if (!m) { return listOf('SCHOOL_TYPES', []); }
    var all = [];
    areas().forEach(function (a) { (m[a] || []).forEach(function (t) { if (all.indexOf(t) < 0) { all.push(t); } }); });
    return all;
  }
  function genresOf(area) { var m = mapOf('SCHOOL_GENRES'); return (m && Array.isArray(m[area])) ? m[area] : null; }
  function sources() { return listOf('SCHOOL_SOURCES', ['교과서', '학교 프린트', '부교재', '모의고사(학평)', '외부 지문']); }
  function forms() { return listOf('SCHOOL_FORMS', ['객관식', '모두 고르기', '서답형(찾아 쓰기)', '서답형(서술)']); }
  function formOf(q) { return q.form || '객관식'; }
  function isEssay(q) { return /^서답형/.test(formOf(q)) || /^서답형/.test(String(q.no)); }
  function sourceOf(q) { return q.source || (/교과서 밖/.test(q.range || '') ? '외부 지문' : '교과서'); }

  /* 번호를 화면에 쓰는 법: 1 → "1번", "서답형 1" → "서답형 1" */
  function noLabel(q) { return typeof q.no === 'number' ? q.no + '번' : String(q.no); }
  /* 번호 칸에 들어갈 짧은 글자: 1 → "1", "서답형 1" → "서1" */
  function noShort(q) { return typeof q.no === 'number' ? String(q.no) : String(q.no).replace(/^서답형\s*/, '서'); }

  function round1(n) { return Math.round(n * 10) / 10; }

  /* 시험 이름 ("고1 · 경동고 26-1 중간") — 선생님이 시험을 열 때 쓰는 이름과 같습니다 */
  function examTitle(exam) { return exam.school + ' ' + exam.term; }
  function examLabel(exam) { return exam.grade + ' · ' + examTitle(exam); }
  function findExam(label) { return allExams().filter(function (e) { return examLabel(e) === label; })[0] || null; }

  /* 분석이 끝나 선생님 검토까지 마친 시험인지 (status 를 안 적었으면 검토 완료로 봅니다) */
  function isReviewed(exam) { return !!exam && (exam.status || '검토 완료') === '검토 완료'; }

  /* 정기고사 일정표에서 과목·시험일·범위를 찾습니다 (없으면 null) */
  function scheduleOf(exam) {
    if (typeof findSchoolSchedule !== 'function') { return null; }
    try { return findSchoolSchedule(exam.school, exam.grade, exam.term); } catch (e) { return null; }
  }

  /* 난도 — 배점으로 정합니다 (school-exams.js 의 schoolLevels) */
  var levelCache = { exam: null, map: {} };
  function levelOf(exam, q) {
    if (levelCache.exam !== exam) {
      levelCache = { exam: exam, map: (typeof schoolLevels === 'function') ? schoolLevels(exam) : {} };
    }
    return levelCache.map[q.no] || q.level || '중';
  }

  /* ---------- 기출 파일 검사 ----------
     형식이 틀려도 앱이 멈추지 않고, 어느 시험 몇 번 문항이 잘못됐는지 알려 줍니다. */
  function validate() {
    var problems = [];
    var seen = {};
    allExams().forEach(function (exam, i) {
      var where = (exam && exam.school ? examLabel(exam) : (i + 1) + '번째 시험');
      if (!exam || !exam.school || !exam.grade || !exam.term) {
        problems.push(where + ': school(학교) · grade(학년) · term(시험) 을 모두 적어 주세요.');
        return;
      }
      if (seen[examLabel(exam)]) { problems.push(where + ': 같은 시험이 두 번 적혀 있습니다.'); }
      seen[examLabel(exam)] = true;
      if (String(examLabel(exam)).indexOf('|') >= 0) { problems.push(where + ": 이름에 '|' 를 쓰지 않습니다."); }
      if (exam.status && ['분석 중', '검토 완료'].indexOf(exam.status) < 0) {
        problems.push(where + ": 상태(status)는 '분석 중' 또는 '검토 완료' 입니다.");
      }

      var qs = Array.isArray(exam.questions) ? exam.questions : [];
      /* 분석 중인 시험은 문항이 아직 없어도 됩니다 */
      if (qs.length === 0) {
        if (isReviewed(exam)) { problems.push(where + ': 문항이 없습니다.'); }
        return;
      }
      /* 번호: 객관식은 1, 2, 3 … 차례로, 서답형은 "서답형 1", "서답형 2" … 차례로 */
      var nextObj = 1, nextEssay = 1, nos = {};
      qs.forEach(function (q, k) {
        var at = where + ' ' + (k + 1) + '번째 문항';
        if (!q) { problems.push(at + ': 비어 있습니다.'); return; }
        if (typeof q.no === 'number') {
          if (q.no !== nextObj) { problems.push(at + ': 번호(no)가 ' + nextObj + ' 이어야 합니다.'); }
          nextObj = q.no + 1;
        } else if (/^서답형 \d+$/.test(String(q.no))) {
          var n = Number(String(q.no).replace('서답형 ', ''));
          if (n !== nextEssay) { problems.push(at + ": 번호(no)가 '서답형 " + nextEssay + "' 이어야 합니다."); }
          nextEssay = n + 1;
        } else {
          problems.push(at + ": 번호(no)는 숫자이거나 '서답형 1' 처럼 적습니다."); return;
        }
        if (nos[q.no]) { problems.push(at + ': 번호 ' + q.no + ' 이(가) 두 번 나옵니다.'); }
        nos[q.no] = true;
        at = where + ' ' + noLabel(q);
        if (!(typeof q.point === 'number' && q.point > 0)) { problems.push(at + ': 배점(point)을 숫자로 적어 주세요.'); }
        if (areas().indexOf(q.area) < 0) { problems.push(at + ": 영역 '" + q.area + "' 이 목록에 없습니다."); return; }
        var g = genresOf(q.area);
        if (g && q.genre && g.indexOf(q.genre) < 0) { problems.push(at + ": 갈래 '" + q.genre + "' 은(는) " + q.area + ' 갈래 목록에 없습니다.'); }
        var t = typesOf(q.area);
        if (t.length && t.indexOf(q.type) < 0) { problems.push(at + ": 유형 '" + q.type + "' 은(는) " + q.area + ' 유형 목록에 없습니다.'); }
        if (q.source && sources().indexOf(q.source) < 0) { problems.push(at + ": 출처 '" + q.source + "' 이 목록에 없습니다."); }
        if (q.form && forms().indexOf(q.form) < 0) { problems.push(at + ": 형식 '" + q.form + "' 이 목록에 없습니다."); }
        if (q.tags && !Array.isArray(q.tags)) { problems.push(at + ': 꼬리표(tags)는 ["#…", "#…"] 처럼 적습니다.'); }
        if (!q.range) { problems.push(at + ': 해당 범위(range)가 비어 있습니다.'); }
        if (!q.tip) { problems.push(at + ': 보완 포인트(tip)가 비어 있습니다.'); }
      });
      var sum = round1(qs.reduce(function (a, q) { return a + (Number(q.point) || 0); }, 0));
      if (exam.full != null && Math.abs(sum - exam.full) > 0.05) {
        problems.push(where + ': 배점을 모두 더하면 ' + sum + '점인데 만점(full)은 ' + exam.full + '점입니다.');
      }
      ['best', 'hardest'].forEach(function (key) {
        if (exam[key] != null && !nos[exam[key]]) {
          problems.push(where + ': ' + (key === 'best' ? '대표 유형(best)' : '고난도 유형(hardest)') + ' ' + exam[key] + ' 번 문항이 없습니다.');
        }
      });
    });
    return problems;
  }

  /* ---------- 계산 ---------- */

  function emptyMarks() { return { wrong: {}, hard: {}, reasons: {}, reflect: [], wish: [], memo: '' }; }

  function questionsOf(exam) { return (exam && Array.isArray(exam.questions)) ? exam.questions : []; }

  function fullPoints(exam) {
    return round1(questionsOf(exam).reduce(function (a, q) { return a + q.point; }, 0));
  }
  function scoreOf(exam, marks) {
    return round1(questionsOf(exam).reduce(function (a, q) { return a + (marks.wrong[q.no] ? 0 : q.point); }, 0));
  }
  /* 이유를 물을 문항: 틀린 문항 + 헤맨 문항 (번호 순서) */
  function asked(exam, marks) {
    return questionsOf(exam).filter(function (q) { return marks.wrong[q.no] || marks.hard[q.no]; });
  }

  /* 묶음(영역·유형·난도·출처)마다 걸린 점수와 내 점수 */
  function scoreBy(exam, marks, key, order) {
    var map = {};
    questionsOf(exam).forEach(function (q) {
      var k = key(q);
      if (!map[k]) { map[k] = { name: k, full: 0, got: 0, count: 0, right: 0 }; }
      map[k].full += q.point;
      map[k].count += 1;
      if (!marks.wrong[q.no]) { map[k].got += q.point; map[k].right += 1; }
    });
    var names = order.filter(function (n) { return map[n]; });
    Object.keys(map).forEach(function (n) { if (names.indexOf(n) < 0) { names.push(n); } });
    return names.map(function (n) {
      var m = map[n];
      m.full = round1(m.full);
      m.got = round1(m.got);
      m.lost = round1(m.full - m.got);
      m.percent = m.full ? Math.round((m.got / m.full) * 1000) / 10 : 0;
      return m;
    });
  }

  function reasonOf(code) { return REASONS.filter(function (x) { return x.code === code; })[0] || null; }

  /* 틀린 이유를 고른 횟수 (많은 순서) */
  function reasonCounts(exam, marks) {
    var count = {};
    asked(exam, marks).forEach(function (q) {
      (marks.reasons[q.no] || []).forEach(function (code) { count[code] = (count[code] || 0) + 1; });
    });
    return REASONS.filter(function (r) { return count[r.code]; })
      .map(function (r) { return { code: r.code, label: r.label, fix: r.fix, n: count[r.code] }; })
      .sort(function (a, b) { return b.n - a.n; });
  }

  function compute(exam, marks) {
    var qs = questionsOf(exam);
    var wrong = qs.filter(function (q) { return marks.wrong[q.no]; }).length;
    return {
      score: scoreOf(exam, marks),
      full: fullPoints(exam),
      total: qs.length,
      correct: qs.length - wrong,
      wrong: wrong,
      hard: qs.filter(function (q) { return marks.hard[q.no]; }).length,
      areas: scoreBy(exam, marks, function (q) { return q.area; }, areas()),
      types: scoreBy(exam, marks, function (q) { return q.type; }, types()),
      levels: scoreBy(exam, marks, function (q) { return levelOf(exam, q); }, ['하', '중', '상']),
      sources: scoreBy(exam, marks, sourceOf, sources()),
      reasons: reasonCounts(exam, marks)
    };
  }

  /* 기록(items)으로 옮기기 — 문항마다 한 칸 + 맨 끝 '돌아보기' 한 칸 */
  function toItems(exam, marks) {
    var r = compute(exam, marks);
    var items = questionsOf(exam).map(function (q) {
      return {
        word: noLabel(q),
        no: q.no,
        correct: !marks.wrong[q.no],
        hard: !!marks.hard[q.no],
        reasons: marks.reasons[q.no] || [],
        points: q.point,
        area: q.area,
        genre: q.genre || '',
        type: q.type,
        source: sourceOf(q),
        form: formOf(q),
        level: levelOf(exam, q)
      };
    });
    items.push({
      word: '돌아보기',
      survey: true,
      score: r.score,
      full: r.full,
      reflect: marks.reflect || [],
      wish: marks.wish || [],
      memo: marks.memo || ''
    });
    return items;
  }

  /* 기록(items)에서 체크 되살리기 */
  function marksFrom(items) {
    var m = emptyMarks();
    (items || []).forEach(function (it) {
      if (!it) { return; }
      if (it.survey) {
        m.reflect = it.reflect || [];
        m.wish = it.wish || [];
        m.memo = it.memo || '';
        return;
      }
      if (it.no == null) { return; }
      if (it.correct === false) { m.wrong[it.no] = true; }
      if (it.hard) { m.hard[it.no] = true; }
      if (it.reasons && it.reasons.length) { m.reasons[it.no] = it.reasons.slice(); }
    });
    return m;
  }

  /* 기록의 점수 — 소수점 점수를 담아 둔 '돌아보기' 칸이 있으면 그것을 씁니다 */
  function recordScore(r) {
    var s = (r.items || []).filter(function (it) { return it && it.survey; })[0];
    return (s && typeof s.score === 'number') ? s.score : r.percent;
  }

  /* ---------- 그리기 ---------- */

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text != null) { e.textContent = text; }
    return e;
  }

  var WEEK = ['일', '월', '화', '수', '목', '금', '토'];
  function md(iso) {
    if (!iso) { return ''; }
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) { return iso; }
    return (d.getMonth() + 1) + '/' + d.getDate() + '(' + WEEK[d.getDay()] + ')';
  }

  function section(box, title, note) {
    var s = el('section');
    s.appendChild(el('h2', 'section-title', title));
    if (note) { s.appendChild(el('p', 'report-note', note)); }
    box.appendChild(s);
    return s;
  }

  /* 성적표 전체를 box 안에 그립니다.
     o = { exam, student, marks, edits: { weak: [], fix: [] }, comment, preview } */
  function render(box, o) {
    var exam = o.exam;
    var marks = o.marks;
    var r = compute(exam, marks);
    var edits = o.edits || {};
    box.innerHTML = '';

    /* 점수 */
    var top = el('div', 'card result-card');
    top.appendChild(el('p', 'result-round is-stacked', exam.school + '\n' + exam.grade + ' · ' + exam.term));
    if (o.student) { top.appendChild(el('p', 'result-name', o.student.name + ' 학생')); }
    var sc = el('p', 'result-score');
    sc.appendChild(el('span', null, String(r.score)));
    sc.appendChild(el('span', 'result-total', '점'));
    top.appendChild(sc);
    top.appendChild(el('p', 'result-grade', r.full + '점 만점 · ' + r.total + '문항 중 ' + r.correct + '문항 맞음'));
    box.appendChild(top);

    /* 선생님 한마디 — 맨 위에 둡니다 */
    if (o.comment) {
      var cm = section(box, '선생님 한마디');
      cm.appendChild(el('div', 'card report-card teacher-comment', o.comment));
    }

    renderExamInfo(section(box, '이번 시험 분석'), exam, marks);
    renderBars(section(box, '영역별 점수'), r.areas);
    renderBars(section(box, '유형별 점수', "막대 옆 글씨는 '내 점수 / 이 유형에 걸린 점수' 입니다."), r.types);
    renderLevels(section(box, '난도별로 보면', '난도는 배점으로 정했습니다. 그 시험에서 배점이 가장 낮은 문항이 하, 가장 높은 문항이 상입니다.'), r.levels);
    renderWeak(section(box, '부족한 점'), exam, marks, r, edits.weak || []);
    renderFix(section(box, '보완할 점'), exam, marks, r, edits.fix || []);
    renderReflectBox(box, marks);
    return r;
  }

  /* 학교 시험 분석 — 일정표(과목·시험일·범위) + 세 줄 총평 + 출제 구성 */
  function renderExamInfo(sec, exam, marks) {
    var box = el('div', 'card report-card');
    sec.appendChild(box);
    var s = scheduleOf(exam);

    var facts = el('dl', 'report-facts');
    [['과목', s && s.subject], ['국어 시험일', s && md(s.date)], ['교과서', s && s.book]].forEach(function (f) {
      if (!f[1]) { return; }
      var d = el('div');
      d.appendChild(el('dt', null, f[0]));
      d.appendChild(el('dd', null, f[1]));
      facts.appendChild(d);
    });
    if (facts.children.length) { box.appendChild(facts); }

    if (s && s.range && s.range.length) {
      box.appendChild(el('p', 'report-sub', '시험 범위'));
      var ul = el('ul', 'report-bullets is-quiet');
      s.range.forEach(function (line) { ul.appendChild(el('li', null, line)); });
      box.appendChild(ul);
    }

    /* 교과서 쪽수를 차례와 맞춰 본 단원·작품 (school-range.js) */
    var rg = (typeof findSchoolRange === 'function') ? findSchoolRange(exam.school, exam.grade, exam.term) : null;
    if (rg && rg.pieces && rg.pieces.length) {
      box.appendChild(el('p', 'report-sub', '교과서로 보면'));
      var ul3 = el('ul', 'report-bullets is-quiet');
      rg.pieces.forEach(function (pc) {
        var names = pc.units.map(function (u) {
          return u.unit + (u.works ? ' (' + u.works + ')' : '') + (u.part ? ' 일부' : '');
        });
        ul3.appendChild(el('li', null, (pc.label ? '[' + pc.label + '] ' : '') + pc.book + ' ' + pc.where + ' — ' + names.join(' · ')));
      });
      box.appendChild(ul3);
    }

    if (Array.isArray(exam.summary) && exam.summary.length) {
      box.appendChild(el('p', 'report-sub', '이 시험은 이랬어요'));
      var ul2 = el('ul', 'report-bullets');
      exam.summary.forEach(function (line) { ul2.appendChild(el('li', null, line)); });
      box.appendChild(ul2);
    }

    var none = emptyMarks();
    var mix = scoreBy(exam, none, function (q) { return q.area; }, areas())
      .map(function (a) { return a.name + ' ' + a.count + '문항(' + a.full + '점)'; });
    box.appendChild(el('p', 'report-mix', '출제: ' + mix.join(' · ')));
    var src = scoreBy(exam, none, sourceOf, sources()).map(function (a) { return a.name + ' ' + a.count; });
    box.appendChild(el('p', 'report-mix', '출처: ' + src.join(' · ')));
    var essays = questionsOf(exam).filter(isEssay).length;
    if (essays) { box.appendChild(el('p', 'report-mix', '서답형 ' + essays + '문항')); }
    [['대표 유형', exam.best], ['고난도 유형', exam.hardest]].forEach(function (pair) {
      var q = questionsOf(exam).filter(function (x) { return pair[1] != null && String(x.no) === String(pair[1]); })[0];
      if (!q) { return; }
      box.appendChild(el('p', 'report-mix', pair[0] + ': ' + noLabel(q) + ' ' + q.type + ' (' + q.range + ')' +
        (marks.wrong[q.no] ? ' — 틀림' : ' — 맞음')));
    });
  }

  function renderBars(sec, list) {
    var box = el('div', 'area-list');
    sec.appendChild(box);
    list.forEach(function (a) {
      var row = el('div', 'area-row');
      var head = el('div', 'area-head');
      head.appendChild(el('span', 'area-name', a.name));
      head.appendChild(el('span', 'area-score', a.got + ' / ' + a.full + '점'));
      row.appendChild(head);
      var track = el('div', 'area-track');
      var fill = el('div', 'area-fill');
      fill.style.width = a.percent + '%';
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(el('p', 'area-sub', a.count + '문항 중 ' + a.right + '문항 맞음'));
      box.appendChild(row);
    });
  }

  function renderLevels(sec, levels) {
    var box = el('div', 'area-list');
    sec.appendChild(box);
    var NAMES = { '하': '쉬운 문항 (하)', '중': '보통 문항 (중)', '상': '어려운 문항 (상)' };
    levels.forEach(function (a) {
      var row = el('div', 'area-row');
      var head = el('div', 'area-head');
      head.appendChild(el('span', 'area-name', NAMES[a.name] || a.name));
      head.appendChild(el('span', 'area-score', a.right + ' / ' + a.count + '문항'));
      row.appendChild(head);
      var track = el('div', 'area-track');
      var fill = el('div', 'area-fill');
      fill.style.width = (a.count ? Math.round((a.right / a.count) * 100) : 0) + '%';
      track.appendChild(fill);
      row.appendChild(track);
      box.appendChild(row);
    });
  }

  /* 부족한 점 — 점수를 가장 많이 잃은 유형·영역, 쉬운 문항 실수, 교과서 밖 실수, 자주 고른 이유
     + 선생님이 더한 문장 */
  function renderWeak(sec, exam, marks, r, extra) {
    var box = el('div', 'card report-card');
    sec.appendChild(box);
    var ul = el('ul', 'report-bullets');

    if (r.wrong === 0) {
      ul.appendChild(el('li', null, '틀린 문항이 없습니다. 잘했어요!' +
        (r.hard ? ' 헤맨 문항 ' + r.hard + '개만 다시 확인하면 됩니다.' : '')));
    } else {
      var lostTypes = r.types.filter(function (t) { return t.lost > 0; })
        .sort(function (a, b) { return b.lost - a.lost || a.percent - b.percent; });
      if (lostTypes.length) {
        var top = lostTypes.slice(0, 2).map(function (t) {
          return t.name + ' −' + t.lost + '점 (' + t.count + '문항 중 ' + (t.count - t.right) + '개 틀림)';
        });
        ul.appendChild(el('li', null, '점수를 가장 많이 잃은 유형: ' + top.join(' · ')));
      }
      var lostAreas = r.areas.filter(function (a) { return a.lost > 0; }).sort(function (a, b) { return b.lost - a.lost; });
      if (lostAreas.length > 1) {
        ul.appendChild(el('li', null, '영역별로 잃은 점수: ' + lostAreas.map(function (a) { return a.name + ' −' + a.lost + '점'; }).join(' · ')));
      }
      var easy = r.levels.filter(function (l) { return l.name === '하'; })[0];
      if (easy && easy.right < easy.count) {
        ul.appendChild(el('li', 'is-strong', '쉬운 문항(난도 하)을 ' + (easy.count - easy.right) +
          '개 놓쳤습니다. 실수인지, 기초 개념이 빈 것인지 꼭 점검해야 합니다.'));
      }
      var outside = questionsOf(exam).filter(function (q) { return marks.wrong[q.no] && sourceOf(q) !== '교과서'; });
      if (outside.length) {
        ul.appendChild(el('li', null, '교과서 밖 문항에서 ' + outside.length + '개를 틀렸습니다: ' +
          outside.map(function (q) { return noLabel(q) + '(' + sourceOf(q) + ')'; }).join(', ') + '.'));
      }
    }
    if (r.reasons.length) {
      ul.appendChild(el('li', null, '내가 고른 이유: ' + r.reasons.slice(0, 3).map(function (x) {
        return x.label + ' (' + x.n + '문항)';
      }).join(', ') + '.'));
    }
    extra.forEach(function (line) { if (line) { ul.appendChild(el('li', 'is-teacher', line)); } });
    box.appendChild(ul);
  }

  /* 보완할 점 — 이유별 공부법 + 선생님이 더한 문장 + 문항별 보완 포인트 */
  function renderFix(sec, exam, marks, r, extra) {
    var plan = el('div', 'card report-card');
    sec.appendChild(plan);
    if (r.reasons.length) {
      plan.appendChild(el('p', 'report-sub', '이렇게 공부해요'));
      var ul = el('ul', 'report-bullets');
      r.reasons.forEach(function (x) {
        var li = el('li');
        li.appendChild(el('b', null, x.label + ' → '));
        li.appendChild(document.createTextNode(x.fix));
        ul.appendChild(li);
      });
      plan.appendChild(ul);
    } else {
      plan.appendChild(el('p', 'report-sub', asked(exam, marks).length
        ? '틀린 이유를 고르지 않았어요. 아래 문항별 보완 포인트를 보고 다시 공부해요.'
        : '틀리거나 헤맨 문항이 없습니다.'));
    }
    var lines = extra.filter(function (x) { return x; });
    if (lines.length) {
      plan.appendChild(el('p', 'report-sub', '선생님이 정해 준 공부'));
      var ul2 = el('ul', 'report-bullets');
      lines.forEach(function (line) { ul2.appendChild(el('li', 'is-teacher', line)); });
      plan.appendChild(ul2);
    }

    var box = el('div', 'fix-list');
    sec.appendChild(box);
    asked(exam, marks).forEach(function (q) {
      var card = el('div', 'wrong-q' + (marks.wrong[q.no] ? '' : ' is-blank'));
      var head = el('div', 'wrong-q-head');
      head.appendChild(el('span', 'wrong-q-no', noLabel(q)));
      head.appendChild(el('span', 'wrong-q-area', q.area + ' · ' + q.type + ' · 난도 ' + levelOf(exam, q) + ' · ' + q.point + '점'));
      head.appendChild(el('span', 'wrong-q-flag', marks.wrong[q.no] ? '틀림' : '헤맴'));
      card.appendChild(head);
      card.appendChild(el('p', 'fix-range', q.range));
      var picked = (marks.reasons[q.no] || []).map(function (code) {
        var m = reasonOf(code);
        return m ? m.label : code;
      });
      if (picked.length) { card.appendChild(el('p', 'fix-why', '내가 고른 이유: ' + picked.join(', '))); }
      var tip = el('p', 'example');
      tip.appendChild(el('span', 'example-label', '보완 포인트'));
      tip.appendChild(el('span', null, q.tip));
      card.appendChild(tip);
      box.appendChild(card);
    });
  }

  function renderReflectBox(parent, marks) {
    var any = (marks.reflect && marks.reflect.length) || (marks.wish && marks.wish.length) || marks.memo;
    if (!any) { return; }
    var sec = section(parent, '나의 돌아보기');
    var box = el('div', 'card report-card');
    sec.appendChild(box);
    [['돌아본 점', marks.reflect || []], ['수업에 바라는 점', marks.wish || []]].forEach(function (g) {
      if (!g[1].length) { return; }
      box.appendChild(el('p', 'report-sub', g[0]));
      var wrap = el('div', 'why-chips');
      g[1].forEach(function (t) { wrap.appendChild(el('span', 'why-chip is-on is-static', t)); });
      box.appendChild(wrap);
    });
    if (marks.memo) {
      box.appendChild(el('p', 'report-sub', '선생님께'));
      box.appendChild(el('p', 'report-memo', marks.memo));
    }
  }

  return {
    REASONS: REASONS,
    allExams: allExams,
    findExam: findExam,
    isReviewed: isReviewed,
    examLabel: examLabel,
    examTitle: examTitle,
    scheduleOf: scheduleOf,
    validate: validate,
    questionsOf: questionsOf,
    noLabel: noLabel,
    noShort: noShort,
    levelOf: levelOf,
    round1: round1,
    emptyMarks: emptyMarks,
    fullPoints: fullPoints,
    scoreOf: scoreOf,
    asked: asked,
    compute: compute,
    toItems: toItems,
    marksFrom: marksFrom,
    recordScore: recordScore,
    render: render,
    el: el
  };
})();
