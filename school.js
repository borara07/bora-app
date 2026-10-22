/* =========================================================
   내신(정기고사) 앱 동작 파일
   (시험 분류만 바꿀 거라면 school-exams.js 만 고치면 됩니다)

   순서
     1. 선생님(Claude)이 시험지를 분석합니다          → 학생에게는 '시험지 분석 중'
     2. 선생님이 분석을 검토합니다                    → 학생에게는 '시험지 분석 중'
     3. 검토가 끝나면 선생님이 시험을 엽니다           → 학생이 '기록하기' 를 누를 수 있음
     4. 학생이 틀린 문항·이유·돌아보기를 기록해 보냅니다 → '학생 분석리포트를 준비 중입니다'
     5. 선생님이 성적표를 검토·보완하고 한마디를 적어 공개합니다 → 학생이 '리포트 보기'

   정답은 받지 않습니다. 배점으로 점수를 계산합니다.
   성적표를 계산하고 그리는 부분은 school-report.js 에 있습니다. (선생님 화면과 함께 씀)
   ========================================================= */

(function () {
  'use strict';

  var SUBJECT = '내신';
  var R = SchoolReport;

  var $ = function (id) { return document.getElementById(id); };

  var screens = {
    start: $('screen-start'),
    rounds: $('screen-rounds'),
    mark: $('screen-mark'),
    why: $('screen-why'),
    reflect: $('screen-reflect'),
    sent: $('screen-sent'),
    result: $('screen-result'),
    history: $('screen-history'),
    error: $('screen-error')
  };

  /* ---------- 돌아보기 목록 ---------- */
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
    marks: R.emptyMarks(),
    status: {}       /* 시험 이름 → { submitted, published } (서버에서 받음) */
  };

  var historyBackTo = 'start';
  var homeworkRound = '';
  var homeworkSet = false;

  function examLabel(exam) { return R.examLabel(exam); }

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

  /* 학생이 누를 수 있는 시험: 검토를 마쳤고(검토 완료) 선생님이 연 시험 */
  function isOpen(exam) {
    if (!exam || !R.isReviewed(exam) || !homeworkSet) { return false; }
    var titles = openTitles();
    if (titles.indexOf(ALL_OPEN) >= 0) { return true; }
    return titles.indexOf(examLabel(exam)) >= 0;
  }

  /* 학교 이름 맞추기: '경동고등학교' → '경동고', '덕성여자고등학교' → '덕성여고' */
  function shortSchool(name) {
    return String(name || '').replace(/\s/g, '')
      .replace(/여자고등학교$/, '여고').replace(/고등학교$/, '고').replace(/학교$/, '');
  }

  /* 내 학년의 시험 목록 — 분석해 둔 시험 + 정기고사 일정표에서 이미 치른 시험(분석 중)
     내 학교를 찾으면 내 학교 시험만, 못 찾으면 학년 전체를 보여 줍니다. */
  function myExams() {
    var list = R.allExams().filter(function (e) { return !state.grade || e.grade === state.grade; })
      .map(function (e) { return { school: e.school, grade: e.grade, term: e.term, exam: e }; });
    var have = {};
    list.forEach(function (x) { have[x.grade + '|' + x.school + '|' + x.term] = true; });

    var today = new Date().toISOString().slice(0, 10);
    var sched = (typeof SCHOOL_SCHEDULE !== 'undefined' && Array.isArray(SCHOOL_SCHEDULE)) ? SCHOOL_SCHEDULE : [];
    sched.forEach(function (s) {
      if (state.grade && s.grade !== state.grade) { return; }
      if (!s.date || s.date > today) { return; }
      var key = s.grade + '|' + s.school + '|' + s.term;
      if (have[key]) { return; }
      have[key] = true;
      list.push({ school: s.school, grade: s.grade, term: s.term, exam: null, date: s.date });
    });

    var mine = shortSchool(state.student && state.student.school);
    var mySchool = list.filter(function (x) { return x.school === mine; });
    if (mySchool.length) { list = mySchool; }

    /* 최근 시험이 위로 */
    function order(t) { return String(t).replace('중간', '1').replace('기말', '2'); }
    return list.sort(function (a, b) {
      var x = order(a.term), y = order(b.term);
      return x < y ? 1 : x > y ? -1 : (a.school < b.school ? -1 : 1);
    });
  }

  /* 단추 하나의 상태 */
  function stateOf(item) {
    var exam = item.exam;
    if (!isOpen(exam)) { return 'analyzing'; }
    var st = state.status[examLabel(exam)] || {};
    if (st.published) { return 'published'; }
    if (st.submitted) { return 'waiting'; }
    return 'open';
  }

  var STATE_TEXT = {
    analyzing: '시험지 분석 중',
    open: '기록하기',
    waiting: '리포트 준비 중',
    published: '리포트 보기'
  };

  function renderRounds() {
    var box = $('round-list');
    box.innerHTML = '';

    var mine = myExams();
    var empty = $('rounds-empty');
    if (mine.length === 0) {
      empty.textContent = whoFor() + ' 정기고사가 아직 없습니다.';
      empty.hidden = false;
    } else {
      empty.hidden = true;
    }

    mine.forEach(function (item) {
      var st = stateOf(item);
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'round-btn' + (st === 'analyzing' ? ' is-locked' : '');

      /* 학교 이름을 크게, 학년·시험을 작게, 오른쪽에 지금 상태 */
      card.appendChild(R.el('span', 'round-no', item.school));
      card.appendChild(R.el('span', 'round-topic', item.grade + ' · ' + item.term));
      card.appendChild(R.el('span', 'round-state is-' + st, STATE_TEXT[st]));

      if (st === 'analyzing') {
        card.disabled = true;
        card.setAttribute('aria-label', item.school + ' ' + item.term + ' — 시험지 분석 중입니다');
      } else {
        card.addEventListener('click', function () { chooseExam(item.exam, st); });
      }
      box.appendChild(card);
    });

    show('rounds');
  }

  function chooseExam(exam, st) {
    state.exam = exam;
    if (st === 'waiting') { renderSent(false); return; }
    if (st === 'published') { openReport(); return; }
    state.marks = R.emptyMarks();
    $('memo').value = '';
    renderMark();
  }

  /* ---------- 틀린 문항 · 헤맨 문항 누르기 ---------- */

  function questions() { return R.questionsOf(state.exam); }

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
      btn.appendChild(R.el('span', 'mark-no', R.noShort(q)));
      btn.appendChild(R.el('span', 'mark-pt', q.point + '점'));
      btn.addEventListener('click', function () {
        var set = state.marks[kind];
        if (set[q.no]) { delete set[q.no]; } else { set[q.no] = true; }
        /* 한 문항은 '틀림'과 '헤맴' 중 하나만 됩니다 */
        if (kind === 'wrong' && state.marks.wrong[q.no]) { delete state.marks.hard[q.no]; }
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
        var on = !!state.marks[kind][no];
        b.classList.toggle('is-marked', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.setAttribute('aria-label', (/^\d+$/.test(no) ? no + '번' : no) + ' ' + (kind === 'wrong' ? '틀림' : '헤맴'));
        /* 틀린 문항은 '헤맨 문항' 칸에서 누를 수 없게 흐리게 둡니다 */
        if (kind === 'hard') {
          b.disabled = !!state.marks.wrong[no];
          b.classList.toggle('is-off', !!state.marks.wrong[no]);
        }
      });
    });
  }

  function updateMarkScore() {
    var w = questions().filter(function (q) { return state.marks.wrong[q.no]; }).length;
    $('mark-score').textContent = '지금 점수 ' + R.scoreOf(state.exam, state.marks) + '점 / ' +
      R.fullPoints(state.exam) + '점 · 틀린 문항 ' + w + '개';
  }

  function askedQuestions() { return R.asked(state.exam, state.marks); }

  /* ---------- 틀린 이유 체크 ---------- */

  function renderWhy() {
    var box = $('why-list');
    box.innerHTML = '';
    askedQuestions().forEach(function (q) {
      var card = R.el('div', 'wrong-q why-card');
      var head = R.el('div', 'wrong-q-head');
      head.appendChild(R.el('span', 'wrong-q-no', R.noLabel(q)));
      head.appendChild(R.el('span', 'wrong-q-area', q.area + ' · ' + q.range));
      head.appendChild(R.el('span', 'wrong-q-flag', state.marks.wrong[q.no] ? '틀림' : '헤맴'));
      card.appendChild(head);
      card.appendChild(chipGroup(R.REASONS.map(function (r) { return { value: r.code, label: r.label }; }),
        state.marks.reasons[q.no] || [], function (picked) { state.marks.reasons[q.no] = picked; }));
      box.appendChild(card);
    });
    show('why');
  }

  /* 여러 개 고를 수 있는 단추 묶음 */
  function chipGroup(options, picked, onChange) {
    var wrap = R.el('div', 'why-chips');
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
      state.marks.reflect, function (v) { state.marks.reflect = v; }));
    var w = $('wish-chips');
    w.innerHTML = '';
    w.appendChild(chipGroup(WISHES.map(function (t) { return { value: t, label: t }; }),
      state.marks.wish, function (v) { state.marks.wish = v; }));
    show('reflect');
  }

  /* ---------- 기록 보내기 ----------
     회차 이름 앞에 '[내신]' 을 붙입니다. 선생님 화면에서 다른 과목과 섞이지 않게 하려는 것입니다.
     성적표는 바로 보여 주지 않습니다. 선생님이 검토해서 공개하면 그때 볼 수 있습니다. */
  function recordTitle() { return '[내신] ' + examLabel(state.exam); }

  function sendRecord() {
    var r = R.compute(state.exam, state.marks);
    var record = {
      name: state.student.name,
      school: state.student.school,
      phone4: state.student.phone4,
      roundTitle: recordTitle(),
      correct: r.correct,
      total: r.total,
      percent: r.full ? Math.round((r.score / r.full) * 100) : 0,
      savedAt: new Date().toISOString(),
      items: R.toItems(state.exam, state.marks)
    };
    state.status[examLabel(state.exam)] = { submitted: true, published: false };
    renderSent(true, r);

    var box = $('save-state');
    box.hidden = false;
    box.className = 'save-state';
    box.textContent = '기록을 보내는 중…';
    VocabStore.save(record).then(function (res) {
      if (res.sentToServer) {
        box.textContent = '선생님께 보냈습니다.';
      } else if (res.savedOnDevice && VocabStore.usingServer && VocabStore.usingServer()) {
        box.textContent = '기록을 이 기기에 저장했습니다. 인터넷 연결 후 자동으로 선생님께 보내집니다.';
        box.className = 'save-state is-waiting';
      } else if (res.savedOnDevice) {
        box.textContent = '기록이 저장되었습니다.';
      } else {
        box.textContent = '이 브라우저에서는 기록을 저장할 수 없습니다. 선생님께 알려주세요.';
        box.className = 'save-state is-waiting';
      }
    });
  }

  /* 보낸 뒤 화면 — '학생 분석리포트를 준비 중입니다' */
  function renderSent(justSent, r) {
    $('sent-round').textContent = examLabel(state.exam);
    $('sent-title').textContent = justSent ? '기록을 보냈어요' : '이미 기록을 보냈어요';
    $('sent-score').hidden = !r;
    if (r) { $('sent-score').textContent = '내가 체크한 점수 ' + r.score + '점 / ' + r.full + '점'; }
    $('save-state').hidden = !justSent;
    show('sent');
  }

  /* 공개된 성적표 열기 */
  function openReport() {
    var box = $('report');
    box.innerHTML = '';
    box.appendChild(R.el('p', 'rounds-empty is-dark', '성적표를 불러오는 중…'));
    show('result');
    VocabStore.schoolReportGet(state.student, examLabel(state.exam)).then(function (res) {
      if (!res.ok || !res.report) {
        box.innerHTML = '';
        box.appendChild(R.el('p', 'rounds-empty is-dark', res.ok
          ? '아직 공개된 성적표가 없습니다.'
          : '성적표를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.'));
        return;
      }
      R.render(box, {
        exam: state.exam,
        student: state.student,
        marks: R.marksFrom(res.report.items),
        edits: res.report.edits || {},
        comment: res.report.comment || ''
      });
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
        var item = R.el('div', 'history-item');
        var left = R.el('div', 'history-main');
        left.appendChild(R.el('p', 'history-round', String(r.roundTitle || '').replace('[내신] ', '')));
        left.appendChild(R.el('p', 'history-when', formatDate(r.savedAt)));
        var score = R.el('p', 'history-score', R.recordScore(r) + '점');
        score.appendChild(R.el('span', 'history-percent', r.correct + '/' + r.total + ' 맞음'));
        item.appendChild(left);
        item.appendChild(score);
        box.appendChild(item);
      });
    }
    show('history');
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

  /* 열린 시험과 내 기록 상태(보냈는지 · 공개됐는지)를 함께 받아 옵니다 */
  function loadRounds() {
    $('round-list').innerHTML = '';
    $('rounds-empty').textContent = '시험을 확인하는 중…';
    $('rounds-empty').hidden = false;
    show('rounds');

    /* 이 기기에 남은 기록도 '보냄' 으로 봅니다 (인터넷이 끊겨 아직 못 보낸 경우) */
    state.status = {};
    myRecords(state.student).forEach(function (r) {
      state.status[String(r.roundTitle).replace('[내신] ', '')] = { submitted: true, published: false };
    });

    Promise.all([
      VocabStore.homeworkRound(whoFor(), SUBJECT),
      VocabStore.schoolReportStatus(state.student)
    ]).then(function (got) {
      homeworkRound = got[0].round || '';
      homeworkSet = !!got[0].set;
      if (got[1] && got[1].ok) {
        got[1].list.forEach(function (x) {
          var old = state.status[x.exam] || {};
          state.status[x.exam] = { submitted: old.submitted || !!x.submittedAt || x.published, published: x.published };
        });
      }
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
    var problems = R.validate();
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
    $('memo').addEventListener('input', function () { state.marks.memo = this.value.trim(); });
    $('btn-send').addEventListener('click', function () {
      state.marks.memo = $('memo').value.trim();
      sendRecord();
    });

    $('btn-sent-home').addEventListener('click', renderRounds);
    $('btn-report-home').addEventListener('click', renderRounds);
    $('btn-my-history').addEventListener('click', function () {
      state.student = readStudentForm();
      renderHistory('start');
    });
    $('btn-back-from-history').addEventListener('click', function () {
      if (historyBackTo === 'start') { show('start'); } else { renderRounds(); }
    });

    setupQuit();

    var passed = VocabStore.passedStudent && VocabStore.passedStudent();
    if (passed && passed.name && passed.phone4) { enterFromHub(passed); return; }

    var last = VocabStore.lastStudent && VocabStore.lastStudent();
    if (last) {
      $('student-name').value = last.name || '';
      $('student-school').value = last.school || '';
      $('student-phone4').value = last.phone4 || '';
      refreshHistoryButton();
    }
    show('start');
    if (VocabStore.resend) { VocabStore.resend(); }
  }

  init();
})();
