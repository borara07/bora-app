/* =========================================================
   내신(정기고사) 앱 동작 파일
   (시험 분류만 바꿀 거라면 school-exams.js 만 고치면 됩니다)

   학생이 채점된 학교 시험지를 보고 '틀린 문항'을 누르면
   그 학교 시험 분석과 함께 개인 성적표가 나옵니다.
     - 시험 분석: 과목·시험일·범위(정기고사 일정표) + 세 줄 총평
     - 개인 분석: 점수, 영역·유형·난도별 점수, 부족한 점, 보완할 점
   정답은 받지 않습니다. 배점으로 점수를 계산합니다.
   ========================================================= */

(function () {
  'use strict';

  var SUBJECT = '내신';

  var $ = function (id) { return document.getElementById(id); };

  var screens = {
    start: $('screen-start'),
    rounds: $('screen-rounds'),
    mark: $('screen-mark'),
    why: $('screen-why'),
    reflect: $('screen-reflect'),
    result: $('screen-result'),
    history: $('screen-history'),
    error: $('screen-error')
  };

  /* ---------- 틀린 이유 · 돌아보기 목록 ----------
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

  var REFLECTS = [
    '공부량이 부족했다', '어떻게 공부해야 할지 몰랐다', '집중력이 부족했다',
    '수업만 듣고 숙제를 잘 안 했다', '시험 범위를 끝까지 못 봤다', '실수가 많았다'
  ];

  var WISHES = [
    '문제를 더 많이 풀고 싶다', '더 구체적인 설명', '더 쉬운 설명',
    '난도를 올려 주었으면', '교과서 밖(프린트) 대비', '서술형 대비'
  ];

  /* ---------- 상태 ---------- */
  var state = {
    student: null,   /* { name, school, phone4 } */
    group: '',
    grade: '',
    exam: null,      /* 고른 시험 (school-exams.js 의 한 칸) */
    wrong: {},       /* 틀린 문항 번호 → true */
    hard: {},        /* 맞았지만 헤맨 문항 번호 → true */
    reasons: {},     /* 문항 번호 → ['개념', '선지'] */
    reflect: [],
    wish: [],
    memo: '',
    result: null
  };

  var historyBackTo = 'start';
  var homeworkRound = '';
  var homeworkSet = false;

  /* ---------- 기출 파일에서 값 꺼내기 ---------- */

  function allExams() {
    return (typeof SCHOOL_EXAMS !== 'undefined' && Array.isArray(SCHOOL_EXAMS)) ? SCHOOL_EXAMS : [];
  }
  function listOf(name, fallback) {
    var v = (typeof window[name] !== 'undefined') ? window[name] : null;
    return Array.isArray(v) ? v : fallback;
  }
  function areas() { return listOf('SCHOOL_AREAS', ['문학', '독서', '문법', '화법', '작문', '매체', '어휘']); }
  function mapOf(name) {
    var v = (typeof window[name] !== 'undefined') ? window[name] : null;
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : null;
  }
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
  var LEVELS = ['하', '중', '상'];

  /* 난도 — 배점으로 정합니다 (school-exams.js 의 schoolLevels) */
  function levelOf(q) {
    if (!state.levels) {
      state.levels = (typeof schoolLevels === 'function' && state.exam) ? schoolLevels(state.exam) : {};
    }
    return state.levels[q.no] || q.level || '중';
  }

  /* 번호를 화면에 쓰는 법: 1 → "1번", "서답형 1" → "서답형 1" */
  function noLabel(q) { return typeof q.no === 'number' ? q.no + '번' : String(q.no); }
  /* 번호 칸에 들어갈 짧은 글자: 1 → "1", "서답형 1" → "서1" */
  function noShort(q) { return typeof q.no === 'number' ? String(q.no) : String(q.no).replace(/^서답형\s*/, '서'); }
  function sourceOf(q) { return q.source || (/교과서 밖/.test(q.range || '') ? '외부 지문' : '교과서'); }

  /* 정기고사 일정표에서 과목·시험일·범위를 찾습니다 (없으면 null) */
  function scheduleOf(exam) {
    if (typeof findSchoolSchedule !== 'function') { return null; }
    try { return findSchoolSchedule(exam.school, exam.grade, exam.term); } catch (e) { return null; }
  }

  function round1(n) { return Math.round(n * 10) / 10; }

  /* 화면에 보여 줄 이름 ("고1 · 경동고 26-1 중간") — 선생님이 시험을 열 때 쓰는 이름과 같습니다 */
  function examTitle(exam) { return exam.school + ' ' + exam.term; }
  function examLabel(exam) { return exam.grade + ' · ' + examTitle(exam); }

  /* ---------- 기출 파일 검사 ----------
     형식이 틀려도 앱이 멈추지 않고, 어느 시험 몇 번 문항이 잘못됐는지 알려 줍니다. */
  function validateSchoolExams() {
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

      var qs = Array.isArray(exam.questions) ? exam.questions : [];
      if (qs.length === 0) { problems.push(where + ': 문항이 없습니다.'); return; }
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

  function showErrors(problems) {
    var list = $('error-list');
    list.innerHTML = '';
    problems.forEach(function (msg) {
      var li = document.createElement('li');
      li.textContent = msg;
      list.appendChild(li);
    });
    show('error');
  }

  /* ---------- 화면 바꾸기 ---------- */

  function show(name) {
    Object.keys(screens).forEach(function (key) {
      screens[key].hidden = (key !== name);
    });
    /* 이름 입력·시험 고르기는 진한 보라, 나머지는 연보라 바탕입니다 */
    paintBackground(name === 'start' || name === 'rounds');
    window.scrollTo(0, 0);
  }

  function paintBackground(deep) {
    var root = document.documentElement;
    if (deep) { root.classList.add('on-rounds'); }
    else { root.classList.remove('on-rounds'); }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) { return; }
    var color = getComputedStyle(root).getPropertyValue(deep ? '--brand-deep' : '--bg').trim();
    if (color) { meta.setAttribute('content', color); }
  }

  /* ---------- 시험 고르기 ---------- */

  /* 내신 시험은 학년으로 엽니다. (homework_round:내신:고1) */
  function whoFor() { return state.grade || state.group || '고등부'; }

  var ALL_OPEN = '*';

  function openTitles() {
    return String(homeworkRound || '').split('|').filter(function (s) { return s !== ''; });
  }

  function isOpen(exam) {
    if (!homeworkSet) { return false; }
    var titles = openTitles();
    if (titles.indexOf(ALL_OPEN) >= 0) { return true; }
    return titles.indexOf(examLabel(exam)) >= 0;
  }

  /* 내 학년 시험만 보여 줍니다. 학년을 모르면 모두 보여 줍니다. */
  function myExams() {
    var all = allExams();
    if (!state.grade) { return all; }
    return all.filter(function (e) { return e.grade === state.grade; });
  }

  function renderRounds() {
    var box = $('round-list');
    box.innerHTML = '';

    var mine = myExams();
    var openCount = mine.filter(isOpen).length;
    var empty = $('rounds-empty');
    if (mine.length === 0) {
      empty.textContent = whoFor() + ' 정기고사 분석이 아직 준비되지 않았습니다.\n선생님께 알려주세요.';
      empty.hidden = false;
    } else if (openCount === 0) {
      empty.textContent = whoFor() + ' 정기고사가 아직 열리지 않았습니다.\n선생님께 알려주세요.';
      empty.hidden = false;
    } else {
      empty.hidden = true;
    }

    mine.forEach(function (exam) {
      var open = isOpen(exam);
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'round-btn' + (open ? '' : ' is-locked');

      /* 학교 이름을 크게, 학년·시험을 작게 씁니다 */
      var no = document.createElement('span');
      no.className = 'round-no';
      no.textContent = exam.school;
      card.appendChild(no);

      var topic = document.createElement('span');
      topic.className = 'round-topic';
      topic.textContent = exam.grade + ' · ' + exam.term;
      card.appendChild(topic);

      if (open) {
        card.addEventListener('click', function () { chooseExam(exam); });
      } else {
        card.disabled = true;
        card.setAttribute('aria-label', examLabel(exam) + ' — 아직 열려 있지 않습니다');
      }
      box.appendChild(card);
    });

    show('rounds');
  }

  function chooseExam(exam) {
    state.exam = exam;
    state.levels = null;
    state.wrong = {};
    state.hard = {};
    state.reasons = {};
    state.reflect = [];
    state.wish = [];
    state.memo = '';
    $('memo').value = '';
    renderMark();
  }

  /* ---------- 틀린 문항 · 헤맨 문항 누르기 ---------- */

  function questions() { return state.exam ? state.exam.questions : []; }

  function fullPoints() {
    return round1(questions().reduce(function (a, q) { return a + q.point; }, 0));
  }

  function currentScore() {
    return round1(questions().reduce(function (a, q) { return a + (state.wrong[q.no] ? 0 : q.point); }, 0));
  }

  function wrongCount() {
    return questions().filter(function (q) { return state.wrong[q.no]; }).length;
  }

  function renderMark() {
    $('mark-round').textContent = examLabel(state.exam);
    drawGrid('wrong-grid', 'wrong');
    drawGrid('hard-grid', 'hard');
    updateMarkScore();
    show('mark');
  }

  function drawGrid(boxId, kind) {
    var box = $(boxId);
    box.innerHTML = '';
    questions().forEach(function (q) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mark-btn' + (kind === 'hard' ? ' is-hard-kind' : '');
      btn.setAttribute('data-no', String(q.no));

      var n = document.createElement('span');
      n.className = 'mark-no';
      n.textContent = noShort(q);
      btn.appendChild(n);

      var p = document.createElement('span');
      p.className = 'mark-pt';
      p.textContent = q.point + '점';
      btn.appendChild(p);

      btn.addEventListener('click', function () {
        var set = state[kind];
        if (set[q.no]) { delete set[q.no]; } else { set[q.no] = true; }
        /* 한 문항은 '틀림'과 '헤맴' 중 하나만 됩니다 */
        if (kind === 'wrong' && state.wrong[q.no]) { delete state.hard[q.no]; }
        paintGrids();
        updateMarkScore();
      });
      box.appendChild(btn);
    });
    paintGrids();
  }

  function paintGrids() {
    ['wrong', 'hard'].forEach(function (kind) {
      var buttons = $(kind + '-grid').querySelectorAll('.mark-btn');
      Array.prototype.forEach.call(buttons, function (b) {
        var no = b.getAttribute('data-no');
        var on = !!state[kind][no];
        b.classList.toggle('is-marked', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.setAttribute('aria-label', (/^\d+$/.test(no) ? no + '번' : no) + ' ' + (kind === 'wrong' ? '틀림' : '헤맴'));
        /* 틀린 문항은 '헤맨 문항' 칸에서 누를 수 없게 흐리게 둡니다 */
        if (kind === 'hard') {
          b.disabled = !!state.wrong[no];
          b.classList.toggle('is-off', !!state.wrong[no]);
        }
      });
    });
  }

  function updateMarkScore() {
    var w = wrongCount();
    $('mark-score').textContent = '지금 점수 ' + currentScore() + '점 / ' + fullPoints() + '점 · 틀린 문항 ' + w + '개';
  }

  /* 이유를 물을 문항: 틀린 문항 + 헤맨 문항 (번호 순서) */
  function askedQuestions() {
    return questions().filter(function (q) { return state.wrong[q.no] || state.hard[q.no]; });
  }

  /* ---------- 틀린 이유 체크 ---------- */

  function renderWhy() {
    var box = $('why-list');
    box.innerHTML = '';
    askedQuestions().forEach(function (q) {
      var card = document.createElement('div');
      card.className = 'wrong-q why-card';

      var head = document.createElement('div');
      head.className = 'wrong-q-head';
      var no = document.createElement('span');
      no.className = 'wrong-q-no';
      no.textContent = noLabel(q);
      head.appendChild(no);
      var area = document.createElement('span');
      area.className = 'wrong-q-area';
      area.textContent = q.area + ' · ' + q.range;
      head.appendChild(area);
      var flag = document.createElement('span');
      flag.className = 'wrong-q-flag';
      flag.textContent = state.wrong[q.no] ? '틀림' : '헤맴';
      head.appendChild(flag);
      card.appendChild(head);

      card.appendChild(chipGroup(REASONS.map(function (r) { return { value: r.code, label: r.label }; }),
        state.reasons[q.no] || [], function (picked) { state.reasons[q.no] = picked; }));
      box.appendChild(card);
    });
    show('why');
  }

  /* 여러 개 고를 수 있는 단추 묶음 */
  function chipGroup(options, picked, onChange) {
    var wrap = document.createElement('div');
    wrap.className = 'why-chips';
    var now = picked.slice();
    options.forEach(function (op) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'why-chip';
      b.textContent = op.label;
      function paint() {
        var on = now.indexOf(op.value) >= 0;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
      b.addEventListener('click', function () {
        var i = now.indexOf(op.value);
        if (i >= 0) { now.splice(i, 1); } else { now.push(op.value); }
        paint();
        onChange(now.slice());
      });
      paint();
      wrap.appendChild(b);
    });
    return wrap;
  }

  /* ---------- 돌아보기 ---------- */

  function renderReflect() {
    var r = $('reflect-chips');
    r.innerHTML = '';
    r.appendChild(chipGroup(REFLECTS.map(function (t) { return { value: t, label: t }; }),
      state.reflect, function (v) { state.reflect = v; }));
    var w = $('wish-chips');
    w.innerHTML = '';
    w.appendChild(chipGroup(WISHES.map(function (t) { return { value: t, label: t }; }),
      state.wish, function (v) { state.wish = v; }));
    show('reflect');
  }

  /* ---------- 성적표 계산 ---------- */

  /* 묶음(영역·유형·난도)마다 걸린 점수와 내 점수 */
  function scoreBy(key, order) {
    var map = {};
    questions().forEach(function (q) {
      var k = (typeof key === 'function') ? key(q) : q[key];
      if (!map[k]) { map[k] = { name: k, full: 0, got: 0, count: 0, right: 0 }; }
      map[k].full += q.point;
      map[k].count += 1;
      if (!state.wrong[q.no]) { map[k].got += q.point; map[k].right += 1; }
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

  /* 틀린 이유를 고른 횟수 (많은 순서) */
  function reasonCounts() {
    var count = {};
    askedQuestions().forEach(function (q) {
      (state.reasons[q.no] || []).forEach(function (code) { count[code] = (count[code] || 0) + 1; });
    });
    return REASONS.filter(function (r) { return count[r.code]; })
      .map(function (r) { return { code: r.code, label: r.label, fix: r.fix, n: count[r.code] }; })
      .sort(function (a, b) { return b.n - a.n; });
  }

  function makeResult() {
    var qs = questions();
    return {
      score: currentScore(),
      full: fullPoints(),
      total: qs.length,
      correct: qs.length - wrongCount(),
      wrong: wrongCount(),
      hard: qs.filter(function (q) { return state.hard[q.no]; }).length,
      areas: scoreBy('area', areas()),
      types: scoreBy('type', types()),
      levels: scoreBy(levelOf, ['하', '중', '상']),
      sources: scoreBy(sourceOf, sources()),
      reasons: reasonCounts()
    };
  }

  /* ---------- 성적표 그리기 ---------- */

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

  function renderResult() {
    var r = state.result;
    var exam = state.exam;

    $('result-round').textContent = exam.school + '\n' + exam.grade + ' · ' + exam.term;
    $('result-name').textContent = state.student.name + ' 학생';
    $('result-score').textContent = String(r.score);
    $('result-count').textContent = r.full + '점 만점 · ' + r.total + '문항 중 ' + r.correct + '문항 맞음';

    renderExamInfo(exam);
    renderBars('area-list', r.areas);
    renderBars('type-list', r.types);
    renderLevels(r.levels);
    renderWeak(r);
    renderFix(r);
    renderReflectBox();

    show('result');
    saveResult(r);
  }

  /* 학교 시험 분석 — 일정표(과목·시험일·범위) + 세 줄 총평 */
  function renderExamInfo(exam) {
    var box = $('exam-info');
    box.innerHTML = '';
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

    if (Array.isArray(exam.summary) && exam.summary.length) {
      box.appendChild(el('p', 'report-sub', '이 시험은 이랬어요'));
      var ul2 = el('ul', 'report-bullets');
      exam.summary.forEach(function (line) { ul2.appendChild(el('li', null, line)); });
      box.appendChild(ul2);
    }

    /* 출제 구성 한 줄 — 영역별 문항 수 */
    var mix = scoreBy('area', areas()).map(function (a) { return a.name + ' ' + a.count + '문항(' + a.full + '점)'; });
    box.appendChild(el('p', 'report-mix', '출제: ' + mix.join(' · ')));
    /* 어디서 나왔나 — 교과서 · 학교 프린트 · 모의고사 … */
    var src = scoreBy(sourceOf, sources()).map(function (a) { return a.name + ' ' + a.count; });
    box.appendChild(el('p', 'report-mix', '출처: ' + src.join(' · ')));
    var essays = questions().filter(isEssay).length;
    if (essays) { box.appendChild(el('p', 'report-mix', '서답형 ' + essays + '문항')); }
    /* 대표 유형 · 고난도 유형 */
    [['대표 유형', exam.best], ['고난도 유형', exam.hardest]].forEach(function (pair) {
      var q = questions().filter(function (x) { return pair[1] != null && String(x.no) === String(pair[1]); })[0];
      if (!q) { return; }
      box.appendChild(el('p', 'report-mix', pair[0] + ': ' + noLabel(q) + ' ' + q.type + ' (' + q.range + ')'));
    });
  }

  function renderBars(boxId, list) {
    var box = $(boxId);
    box.innerHTML = '';
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

  function renderLevels(levels) {
    var box = $('level-list');
    box.innerHTML = '';
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

  /* 부족한 점 — 점수를 가장 많이 잃은 유형·영역, 쉬운 문항 실수, 자주 고른 이유 */
  function renderWeak(r) {
    var box = $('weak-list');
    box.innerHTML = '';
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
      var outside = questions().filter(function (q) { return state.wrong[q.no] && sourceOf(q) !== '교과서'; });
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
    box.appendChild(ul);
  }

  /* 보완할 점 — 이유별 공부법 + 문항별 보완 포인트 */
  function renderFix(r) {
    var plan = $('fix-plan');
    plan.innerHTML = '';
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
      plan.appendChild(el('p', 'report-sub', askedQuestions().length
        ? '틀린 이유를 고르지 않았어요. 아래 문항별 보완 포인트를 보고 다시 공부해요.'
        : '틀리거나 헤맨 문항이 없습니다.'));
    }
    plan.hidden = false;

    var box = $('fix-list');
    box.innerHTML = '';
    askedQuestions().forEach(function (q) {
      var card = el('div', 'wrong-q' + (state.wrong[q.no] ? '' : ' is-blank'));
      var head = el('div', 'wrong-q-head');
      head.appendChild(el('span', 'wrong-q-no', noLabel(q)));
      head.appendChild(el('span', 'wrong-q-area', q.area + ' · ' + q.type + ' · 난도 ' + levelOf(q) + ' · ' + q.point + '점'));
      head.appendChild(el('span', 'wrong-q-flag', state.wrong[q.no] ? '틀림' : '헤맴'));
      card.appendChild(head);
      card.appendChild(el('p', 'fix-range', q.range));
      var picked = (state.reasons[q.no] || []).map(function (code) {
        var m = REASONS.filter(function (x) { return x.code === code; })[0];
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

  function renderReflectBox() {
    var box = $('reflect-box');
    box.innerHTML = '';
    var any = false;
    [['돌아본 점', state.reflect], ['수업에 바라는 점', state.wish]].forEach(function (g) {
      if (!g[1].length) { return; }
      any = true;
      box.appendChild(el('p', 'report-sub', g[0]));
      var wrap = el('div', 'why-chips');
      g[1].forEach(function (t) { wrap.appendChild(el('span', 'why-chip is-on is-static', t)); });
      box.appendChild(wrap);
    });
    if (state.memo) {
      any = true;
      box.appendChild(el('p', 'report-sub', '선생님께'));
      box.appendChild(el('p', 'report-memo', state.memo));
    }
    $('reflect-area').hidden = !any;
  }

  /* ---------- 기록 저장 ----------
     회차 이름 앞에 '[내신]' 을 붙입니다. 선생님 화면에서 다른 과목과 섞이지 않게 하려는 것입니다.
     점수(100점 만점)는 정답률 자리에, 문항별 체크와 돌아보기는 items 에 넣습니다. */
  function recordTitle() { return '[내신] ' + examLabel(state.exam); }

  function saveResult(r) {
    var box = $('save-state');
    box.hidden = false;
    box.className = 'save-state';
    box.textContent = '기록을 저장하는 중…';

    var items = questions().map(function (q) {
      return {
        word: noLabel(q),
        no: q.no,
        correct: !state.wrong[q.no],
        hard: !!state.hard[q.no],
        reasons: state.reasons[q.no] || [],
        points: q.point,
        area: q.area,
        genre: q.genre || '',
        type: q.type,
        source: sourceOf(q),
        form: formOf(q),
        level: levelOf(q)
      };
    });
    items.push({
      word: '돌아보기',
      survey: true,
      score: r.score,
      full: r.full,
      reflect: state.reflect,
      wish: state.wish,
      memo: state.memo
    });

    var record = {
      name: state.student.name,
      school: state.student.school,
      phone4: state.student.phone4,
      roundTitle: recordTitle(),
      correct: r.correct,
      total: r.total,
      percent: r.full ? Math.round((r.score / r.full) * 100) : 0,
      savedAt: new Date().toISOString(),
      items: items
    };

    VocabStore.save(record).then(function (res) {
      if (res.sentToServer) {
        box.textContent = '기록이 저장되었습니다.\n(선생님께 전송 완료)';
      } else if (res.savedOnDevice && VocabStore.usingServer && VocabStore.usingServer()) {
        box.textContent = '기록을 이 기기에 저장했습니다. 인터넷 연결 후 자동으로 전송됩니다.';
        box.className = 'save-state is-waiting';
      } else if (res.savedOnDevice) {
        box.textContent = '기록이 저장되었습니다.';
      } else {
        box.textContent = '이 브라우저에서는 기록을 저장할 수 없습니다.';
        box.className = 'save-state is-waiting';
      }
    });
  }

  /* ---------- 내 기록 ---------- */

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var two = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '. ' + two(d.getMonth() + 1) + '. ' + two(d.getDate()) +
           ' ' + two(d.getHours()) + ':' + two(d.getMinutes());
  }

  function myRecords(student) {
    return VocabStore.listFor(student).filter(function (r) {
      return String(r.roundTitle || '').indexOf('[내신]') === 0;
    });
  }

  function renderHistory(cameFrom) {
    historyBackTo = cameFrom;
    var records = myRecords(state.student);
    $('history-who').textContent = state.student.name + ' 학생';
    var box = $('history-list');
    box.innerHTML = '';

    if (records.length === 0) {
      $('history-summary').textContent = '아직 내신 기록이 없습니다.';
    } else {
      $('history-summary').textContent = records.length + '번 기록했습니다.';
      records.forEach(function (r) {
        var item = el('div', 'history-item');
        var left = el('div', 'history-main');
        left.appendChild(el('p', 'history-round', String(r.roundTitle || '').replace('[내신] ', '')));
        left.appendChild(el('p', 'history-when', formatDate(r.savedAt)));
        var score = el('p', 'history-score', scoreOf(r) + '점');
        score.appendChild(el('span', 'history-percent', r.correct + '/' + r.total + ' 맞음'));
        item.appendChild(left);
        item.appendChild(score);
        box.appendChild(item);
      });
    }
    show('history');
  }

  /* 기록의 점수 — 소수점 점수를 담아 둔 '돌아보기' 칸이 있으면 그것을 씁니다 */
  function scoreOf(r) {
    var s = (r.items || []).filter(function (it) { return it && it.survey; })[0];
    return (s && typeof s.score === 'number') ? s.score : r.percent;
  }

  /* ---------- 학생 확인 ---------- */

  function readStudentForm() {
    return {
      name: $('student-name').value.trim(),
      school: $('student-school').value.trim(),
      phone4: $('student-phone4').value.trim()
    };
  }

  function checkStudent(student) {
    if (student.name === '') return '학생 이름을 입력해주세요.';
    if (student.school === '') return '학교를 입력해주세요.';
    if (!/^[0-9]{4}$/.test(student.phone4)) return '학부모님 전화번호 뒷 4자리를 숫자 4자리로 입력해주세요.';
    return '';
  }

  function refreshHistoryButton() {
    var student = readStudentForm();
    var btn = $('btn-my-history');
    if (checkStudent(student) !== '') { btn.hidden = true; return; }
    btn.hidden = myRecords(student).length === 0;
  }

  function loadRounds() {
    $('round-list').innerHTML = '';
    $('rounds-empty').textContent = '열린 시험을 확인하는 중…';
    $('rounds-empty').hidden = false;
    show('rounds');
    VocabStore.homeworkRound(whoFor(), SUBJECT).then(function (h) {
      homeworkRound = h.round || '';
      homeworkSet = !!h.set;
      renderRounds();
    });
  }

  function startIfEnrolled(student) {
    var btn = $('btn-start');
    var label = btn.textContent;
    btn.disabled = true;
    btn.textContent = '확인하는 중…';

    VocabStore.isEnrolled(student).then(function (r) {
      btn.disabled = false;
      btn.textContent = label;
      if (r.ok && r.enrolled) {
        state.student = student;
        state.group = r.group || '고등부';
        state.grade = r.grade || '';
        VocabStore.rememberStudent(student);
        loadRounds();
        return;
      }
      showStartError(r);
    });
  }

  function showStartError(r) {
    var message;
    if (r.ok) {
      message = '재원생 명단에서 찾지 못했습니다.\n' +
                '이름과 학부모님 전화번호 뒷 4자리를 다시 확인해주세요.\n' +
                '계속 안 되면 선생님께 문의해주세요.';
    } else if (r.code === 'offline' || r.code === 'no-server') {
      message = '인터넷 연결을 확인한 뒤 다시 눌러주세요.\n' +
                '재원생인지 확인이 되어야 시작할 수 있습니다.';
    } else if (r.code === 'not-set-up') {
      message = '재원생 확인 준비가 아직 되지 않았습니다.\n선생님께 알려주세요.';
    } else {
      message = '확인하지 못했습니다. 잠시 뒤 다시 눌러주세요.';
    }
    $('name-error').textContent = message;
    $('name-error').hidden = false;
  }

  /* 통합 첫 화면에서 온 학생 — 위에 '과목 고르기' 를 보여 주고 '이름 다시 입력' 은 감춥니다 */
  function enterFromHub(passed) {
    state.student = { name: passed.name, school: passed.school, phone4: passed.phone4 };
    state.group = passed.group || '고등부';
    state.grade = passed.grade || '';
    $('btn-to-hub').hidden = false;
    $('btn-back-start').hidden = true;
    loadRounds();
  }

  /* ---------- '처음으로' (체크하던 것 그만두기) ---------- */
  function setupQuit() {
    var ask = $('quit-ask');
    if (!ask) { return; }
    function close() { ask.hidden = true; $('btn-quit').focus(); }
    $('btn-quit').addEventListener('click', function () {
      ask.hidden = false;
      $('quit-keep').focus();
    });
    $('quit-keep').addEventListener('click', close);
    $('quit-leave').addEventListener('click', function () {
      ask.hidden = true;
      renderRounds();
    });
    ask.addEventListener('click', function (e) { if (e.target === ask) { close(); } });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !ask.hidden) { close(); }
    });
  }

  /* ---------- 첫 실행 ---------- */

  function init() {
    var problems = validateSchoolExams();
    if (problems.length > 0) { showErrors(problems); return; }

    if (typeof SCHOOL_EXAM_TITLE === 'string' && SCHOOL_EXAM_TITLE.trim() !== '') {
      document.title = SCHOOL_EXAM_TITLE;
    }

    $('start-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var student = readStudentForm();
      var problem = checkStudent(student);
      if (problem !== '') {
        $('name-error').textContent = problem;
        $('name-error').hidden = false;
        return;
      }
      $('name-error').hidden = true;
      startIfEnrolled(student);
    });

    ['student-name', 'student-school', 'student-phone4'].forEach(function (id) {
      $(id).addEventListener('input', refreshHistoryButton);
    });
    $('student-phone4').addEventListener('input', function () {
      this.value = this.value.replace(/[^0-9]/g, '').slice(0, 4);
    });

    $('btn-back-start').addEventListener('click', function () {
      show('start');
      $('student-name').focus();
    });

    /* 틀린 문항·헤맨 문항이 하나도 없으면 이유 묻기를 건너뜁니다 */
    $('btn-to-why').addEventListener('click', function () {
      if (askedQuestions().length === 0) { renderReflect(); return; }
      renderWhy();
    });
    $('btn-back-mark').addEventListener('click', renderMark);
    $('btn-to-reflect').addEventListener('click', renderReflect);
    $('btn-back-why').addEventListener('click', function () {
      if (askedQuestions().length === 0) { renderMark(); return; }
      renderWhy();
    });
    $('memo').addEventListener('input', function () { state.memo = this.value.trim(); });
    $('btn-report').addEventListener('click', function () {
      state.memo = $('memo').value.trim();
      state.result = makeResult();
      renderResult();
    });

    $('btn-my-history').addEventListener('click', function () {
      state.student = readStudentForm();
      renderHistory('start');
    });
    $('btn-history').addEventListener('click', function () { renderHistory('result'); });
    $('btn-back-from-history').addEventListener('click', function () {
      show(historyBackTo === 'result' ? 'result' : 'start');
    });
    $('btn-home').addEventListener('click', function () {
      $('save-state').hidden = true;
      renderRounds();
    });

    VocabStore.resend();

    var last = VocabStore.lastStudent();
    if (last) {
      $('student-name').value = last.name || '';
      $('student-school').value = last.school || '';
      $('student-phone4').value = last.phone4 || '';
    }
    refreshHistoryButton();
    show('start');

    setupQuit();

    var passed = VocabStore.passedStudent();
    if (passed) { enterFromHub(passed); }
  }

  init();
})();
