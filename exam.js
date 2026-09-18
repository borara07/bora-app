/* =========================================================
   모의고사 앱 동작 파일
   (회차와 정답만 바꿀 거라면 exams.js 만 고치면 됩니다)

   학생이 답안지(OMR)에 칠한 번호를 그대로 눌러 넣으면
   그 자리에서 점수·등급·영역별 성취도·틀린 문항이 나옵니다.
   ========================================================= */

(function () {
  'use strict';

  var SUBJECT = '모의고사';

  var $ = function (id) { return document.getElementById(id); };

  var screens = {
    start: $('screen-start'),
    rounds: $('screen-rounds'),
    subject: $('screen-subject'),
    sheet: $('screen-sheet'),
    result: $('screen-result'),
    history: $('screen-history'),
    error: $('screen-error')
  };

  /* ---------- 시험 상태 ---------- */
  var state = {
    student: null,  /* { name, school, phone4 } */
    group: '',      /* 그 학생의 반 (고등부 / 중등부) */
    grade: '',      /* 그 학생의 학년 (고3 …) — 회차를 여는 기준입니다 */
    exam: null,     /* 고른 회차 */
    choice: '',     /* 고른 선택과목 (화법과 작문 / 언어와 매체) */
    answers: [],    /* 학생이 누른 답 (1~5, 안 누른 칸은 0) */
    result: null    /* 채점 결과 */
  };

  var historyBackTo = 'start';

  var homeworkRound = '';
  var homeworkSet = false;

  /* ---------- 회차 파일에서 값 꺼내기 ---------- */

  function questionCount() {
    return (typeof EXAM_QUESTION_COUNT === 'number' && EXAM_QUESTION_COUNT > 0)
      ? EXAM_QUESTION_COUNT : 45;
  }

  function commonCount() {
    return (typeof EXAM_COMMON_COUNT === 'number' && EXAM_COMMON_COUNT >= 0)
      ? EXAM_COMMON_COUNT : 34;
  }

  function choiceNames() {
    return (typeof EXAM_CHOICES !== 'undefined' && Array.isArray(EXAM_CHOICES) && EXAM_CHOICES.length)
      ? EXAM_CHOICES : ['화법과 작문', '언어와 매체'];
  }

  function allExams() {
    return (typeof EXAMS !== 'undefined' && Array.isArray(EXAMS)) ? EXAMS : [];
  }

  /* 글자로 적힌 값을 한 글자씩 숫자로 풉니다 ("432" → [4,3,2]) */
  function digits(text) {
    return String(text == null ? '' : text)
      .replace(/[\s,·\-]/g, '')
      .split('')
      .map(function (c) { return Number(c); });
  }

  /* 그 선택과목의 정답 45개 (1~34번은 공통, 35~45번은 선택과목) */
  function answersFor(exam, choice) {
    return digits((exam.answers || {})['공통']).concat(digits((exam.answers || {})[choice]));
  }

  function pointsFor(exam, choice) {
    return digits((exam.points || {})['공통']).concat(digits((exam.points || {})[choice]));
  }

  /* 그 선택과목이 보는 영역만 골라 냅니다 (공통 + 그 과목) */
  function areasFor(exam, choice) {
    return (exam.areas || []).filter(function (a) {
      var target = a[4];
      return target === '공통' || target === choice;
    }).map(function (a) {
      return { group: a[0], name: a[1], from: a[2], to: a[3] };
    });
  }

  /* 등급컷 "95-88-77-64" → [95, 88, 77, 64] */
  function cutsFor(exam, choice) {
    return String((exam.cuts || {})[choice] || '')
      .split('-')
      .map(function (n) { return Number(String(n).trim()); });
  }

  /* ---------- 공통 도구 ---------- */

  function show(name) {
    Object.keys(screens).forEach(function (key) {
      screens[key].hidden = (key !== name);
    });
    paintBackground(name === 'start' || name === 'rounds');
    window.scrollTo(0, 0);
  }

  function paintBackground(deep) {
    var root = document.documentElement;
    if (deep) { root.classList.add('on-rounds'); }
    else { root.classList.remove('on-rounds'); }

    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) { return; }
    var color = getComputedStyle(root)
      .getPropertyValue(deep ? '--brand-deep' : '--primary').trim();
    if (color) { meta.setAttribute('content', color); }
  }

  /* ---------- 회차 파일 검사 ---------- */

  /* 잘못 적은 곳을 찾아서 사람이 읽을 수 있는 말로 돌려줍니다.
     (엑셀 성적표의 '확인' 칸과 같은 검사입니다) */
  function validateExams() {
    var problems = [];
    var list = allExams();
    var total = questionCount();
    var common = commonCount();
    var choices = choiceNames();

    if (!Array.isArray(list)) {
      problems.push('EXAMS 가 목록([ ]) 모양이 아닙니다.');
      return problems;
    }
    if (list.length === 0) {
      problems.push('회차가 하나도 없습니다. exams.js 에 회차를 넣어 주세요.');
      return problems;
    }

    list.forEach(function (exam, i) {
      var where = (exam && exam.title) ? ('"' + exam.title + '" 회차') : ((i + 1) + '번째 회차');

      if (!exam || typeof exam !== 'object') {
        problems.push(where + '의 내용이 비어 있습니다.');
        return;
      }
      if (!exam.title) { problems.push(where + '에 title(모의고사 이름)이 없습니다.'); }
      if (!exam.grade) { problems.push(where + '에 grade(학년)가 없습니다. "고3" 처럼 적어 주세요.'); }
      if (String(exam.title || '').indexOf('|') >= 0) {
        problems.push(where + '의 이름에 | 가 들어 있습니다. 다른 글자로 바꿔 주세요.');
      }

      /* 정답·배점 길이와 글자 검사 */
      function checkRun(label, values, want, min, max) {
        if (values.length !== want) {
          problems.push(where + '의 ' + label + '이 ' + values.length + '개입니다. ' +
                        want + '개를 적어 주세요.');
          return false;
        }
        var bad = [];
        values.forEach(function (v, k) {
          if (!(v >= min && v <= max)) { bad.push(k + 1); }
        });
        if (bad.length) {
          problems.push(where + '의 ' + label + '에서 ' + bad.slice(0, 5).join(', ') +
                        '번째 글자가 ' + min + '~' + max + ' 가 아닙니다.');
          return false;
        }
        return true;
      }

      checkRun('공통 정답', digits((exam.answers || {})['공통']), common, 1, 5);
      checkRun('공통 배점', digits((exam.points || {})['공통']), common, 1, 9);

      choices.forEach(function (choice) {
        var want = total - common;
        checkRun(choice + ' 정답', digits((exam.answers || {})[choice]), want, 1, 5);
        checkRun(choice + ' 배점', digits((exam.points || {})[choice]), want, 1, 9);

        /* 배점 합이 100점인지 */
        var pts = pointsFor(exam, choice);
        if (pts.length === total) {
          var sum = pts.reduce(function (a, b) { return a + b; }, 0);
          if (sum !== 100) {
            problems.push(where + '의 ' + choice + ' 배점 합이 ' + sum + '점입니다. 100점이 되어야 합니다.');
          }
        }

        /* 등급컷 4개가 높은 순서로 적혀 있는지 */
        var cuts = cutsFor(exam, choice);
        if (cuts.length !== 4 || cuts.some(function (n) { return !(n >= 0 && n <= 100); })) {
          problems.push(where + '의 ' + choice + ' 등급컷을 "95-88-77-64" 처럼 네 개 적어 주세요.');
        } else {
          for (var c = 1; c < 4; c++) {
            if (cuts[c] > cuts[c - 1]) {
              problems.push(where + '의 ' + choice + ' 등급컷이 높은 순서가 아닙니다.');
              break;
            }
          }
        }

        /* 영역이 1~45번을 빠짐없이 한 번씩 덮는지 */
        var mine = areasFor(exam, choice);
        if (mine.length === 0) {
          problems.push(where + '에 ' + choice + ' 영역이 없습니다.');
        } else {
          var cover = [];
          var k;
          for (k = 1; k <= total; k++) { cover[k] = 0; }
          mine.forEach(function (a) {
            for (var q = a.from; q <= a.to; q++) {
              if (q >= 1 && q <= total) { cover[q] += 1; }
            }
          });
          var missing = [], doubled = [];
          for (k = 1; k <= total; k++) {
            if (cover[k] === 0) { missing.push(k); }
            else if (cover[k] > 1) { doubled.push(k); }
          }
          if (missing.length) {
            problems.push(where + '의 ' + choice + ' 영역에서 ' +
                          missing.slice(0, 8).join(', ') + '번이 어느 영역에도 없습니다.');
          }
          if (doubled.length) {
            problems.push(where + '의 ' + choice + ' 영역에서 ' +
                          doubled.slice(0, 8).join(', ') + '번이 두 영역에 겹쳐 있습니다.');
          }
        }
      });
    });

    return problems;
  }

  function showErrors(problems) {
    var box = $('error-list');
    box.innerHTML = '';
    problems.forEach(function (msg) {
      var li = document.createElement('li');
      li.textContent = msg;
      box.appendChild(li);
    });
    show('error');
  }

  /* ---------- 회차 고르기 ---------- */


  /* 모의고사는 학년으로 회차를 엽니다. 학년을 모르면 반 이름으로 찾습니다. */
  function whoFor() {
    return state.grade || state.group || '고등부';
  }

  function openTitles() {
    return String(homeworkRound || '').split('|').filter(function (s) { return s !== ''; });
  }

  function isOpen(exam) {
    if (!homeworkSet) { return false; }
    var titles = openTitles();
    if (titles.length === 0) { return true; }
    return titles.indexOf(exam.title) >= 0;
  }

  function renderRounds() {
    var box = $('round-list');
    box.innerHTML = '';
    /* 모의고사 이름이 길어서 한 줄에 하나씩 넓게 놓습니다 */
    box.classList.add('is-wide');

    var mine = allExams();
    var openCount = mine.filter(isOpen).length;

    var empty = $('rounds-empty');
    if (mine.length === 0) {
      empty.textContent = '모의고사 회차가 아직 준비되지 않았습니다.\n선생님께 알려주세요.';
      empty.hidden = false;
    } else if (openCount === 0) {
      empty.textContent = whoFor() + ' 이번 주 모의고사가 아직 정해지지 않았습니다.\n선생님께 알려주세요.';
      empty.hidden = false;
    } else {
      empty.hidden = true;
    }

    mine.forEach(function (exam) {
      var open = isOpen(exam);

      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'round-btn' + (open ? '' : ' is-locked');

      /* 위에는 학년을 크게, 아래에는 모의고사 이름을 작게 씁니다 */
      var no = document.createElement('span');
      no.className = 'round-no';
      no.textContent = exam.grade || '';
      card.appendChild(no);

      var topic = document.createElement('span');
      topic.className = 'round-topic';
      topic.textContent = exam.title;
      card.appendChild(topic);

      if (open) {
        card.addEventListener('click', function () { chooseExam(exam); });
      } else {
        card.disabled = true;
        card.setAttribute('aria-label', exam.title + ' — 이번 주에는 열려 있지 않습니다');
      }

      box.appendChild(card);
    });

    show('rounds');
  }

  /* 화면에 보여 줄 회차 이름 ("고3 · 30차 심화모의고사") */
  function examLabel(exam) {
    return (exam.grade ? exam.grade + ' · ' : '') + exam.title;
  }

  function chooseExam(exam) {
    state.exam = exam;
    renderSubject();
  }

  /* ---------- 선택과목 고르기 ---------- */

  function renderSubject() {
    $('subject-round').textContent = examLabel(state.exam);

    var box = $('subject-list');
    box.innerHTML = '';

    choiceNames().forEach(function (name) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'subject-btn';
      btn.textContent = name;
      btn.addEventListener('click', function () { chooseSubject(name); });
      box.appendChild(btn);
    });

    show('subject');
  }

  function chooseSubject(name) {
    state.choice = name;
    state.answers = [];
    for (var i = 0; i < questionCount(); i++) { state.answers.push(0); }
    renderSheet();
  }

  /* ---------- 답 입력 (OMR) ---------- */

  function renderSheet() {
    $('sheet-round').textContent = examLabel(state.exam) + ' · ' + state.choice;
    $('sheet-total').textContent = String(questionCount());
    $('sheet-error').hidden = true;

    var box = $('sheet-list');
    box.innerHTML = '';

    for (var q = 1; q <= questionCount(); q++) {
      box.appendChild(sheetRow(q));
    }

    updateSheetCount();
    show('sheet');
  }

  function sheetRow(q) {
    var row = document.createElement('div');
    row.className = 'sheet-row';

    var no = document.createElement('span');
    no.className = 'sheet-no';
    no.textContent = String(q);
    row.appendChild(no);

    var marks = document.createElement('div');
    marks.className = 'sheet-marks';

    for (var n = 1; n <= 5; n++) {
      marks.appendChild(markButton(q, n));
    }

    row.appendChild(marks);
    return row;
  }

  function markButton(q, n) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sheet-mark';
    btn.textContent = String(n);
    btn.setAttribute('data-q', String(q));
    btn.setAttribute('aria-label', q + '번 ' + n + '번 답');

    btn.addEventListener('click', function () {
      /* 같은 번호를 다시 누르면 지워집니다 */
      state.answers[q - 1] = (state.answers[q - 1] === n) ? 0 : n;
      paintRow(q);
      updateSheetCount();
      $('sheet-error').hidden = true;
    });

    return btn;
  }

  function paintRow(q) {
    var picked = state.answers[q - 1];
    var buttons = $('sheet-list').querySelectorAll('[data-q="' + q + '"]');
    Array.prototype.forEach.call(buttons, function (b, i) {
      var on = (i + 1) === picked;
      b.classList.toggle('is-marked', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function doneCount() {
    return state.answers.filter(function (n) { return n >= 1 && n <= 5; }).length;
  }

  function updateSheetCount() {
    var done = doneCount();
    var total = questionCount();
    $('sheet-done').textContent = String(done);
    $('sheet-fill').style.width = Math.round((done / total) * 100) + '%';

    /* 안 누른 칸이 있으면 몇 개가 '못 푼 문제' 로 들어가는지 미리 알려 줍니다 */
    var left = total - done;
    var note = $('sheet-left');
    if (!note) { return; }
    note.textContent = left === 0
      ? '45문항을 모두 눌렀습니다.'
      : ('안 누른 ' + left + '문항은 못 푼 문제로 표시됩니다. 다 못 풀었어도 그대로 채점할 수 있습니다.');
  }

  /* ---------- 채점 ---------- */

  function gradeSheet() {
    var exam = state.exam;
    var choice = state.choice;
    var key = answersFor(exam, choice);
    var pts = pointsFor(exam, choice);
    var total = questionCount();

    var items = [];
    var score = 0;
    var correctCount = 0;
    var blankCount = 0;

    for (var q = 1; q <= total; q++) {
      var mine = state.answers[q - 1];
      var empty = !(mine >= 1 && mine <= 5);   /* 안 누른 칸 = 못 푼 문항 */
      var right = (!empty && mine === key[q - 1]);
      if (right) { score += pts[q - 1]; correctCount += 1; }
      if (empty) { blankCount += 1; }
      items.push({
        no: q,
        answer: key[q - 1],
        myAnswer: mine,
        blank: empty,
        correct: right,
        points: pts[q - 1],
        area: areaNameOf(q)
      });
    }

    var cuts = cutsFor(exam, choice);
    var grade = '등급 외';
    for (var g = 0; g < cuts.length; g++) {
      if (score >= cuts[g]) { grade = (g + 1) + '등급'; break; }
    }

    return {
      score: score,
      correct: correctCount,
      blank: blankCount,                 /* 못 푼 문항 수 */
      wrong: total - correctCount - blankCount,   /* 풀었지만 틀린 문항 수 */
      total: total,
      grade: grade,
      cuts: cuts,
      items: items,
      areas: areaScores(items)
    };
  }

  /* 그 문항이 속한 영역 이름 */
  function areaNameOf(q) {
    var mine = areasFor(state.exam, state.choice);
    for (var i = 0; i < mine.length; i++) {
      if (q >= mine[i].from && q <= mine[i].to) { return mine[i].name; }
    }
    return '';
  }

  function areaScores(items) {
    return areasFor(state.exam, state.choice).map(function (a) {
      var full = 0, got = 0;
      items.forEach(function (it) {
        if (it.no >= a.from && it.no <= a.to) {
          full += it.points;
          if (it.correct) { got += it.points; }
        }
      });
      return {
        group: a.group,
        name: a.name,
        full: full,
        got: got,
        percent: full ? Math.round((got / full) * 1000) / 10 : 0
      };
    });
  }

  /* ---------- 결과 화면 ---------- */

  function renderResult() {
    var r = state.result;

    /* 회차와 선택과목은 줄을 나눠 적습니다 (한 줄로 붙이면 낱말 가운데가 끊어집니다) */
    $('result-round').textContent = examLabel(state.exam) + '\n' + state.choice;
    $('result-name').textContent = state.student.name + ' 학생';
    $('result-score').textContent = String(r.score);
    $('result-grade').textContent = r.grade + '  (등급컷 ' + r.cuts.join('-') + ')';

    renderAreas(r.areas);
    renderWrong(r.items);

    show('result');
    saveResult(r);
  }

  function renderAreas(areas) {
    var box = $('area-list');
    box.innerHTML = '';

    var lastGroup = '';
    areas.forEach(function (a) {
      var row = document.createElement('div');
      row.className = 'area-row';

      var head = document.createElement('div');
      head.className = 'area-head';

      var name = document.createElement('span');
      name.className = 'area-name';
      name.textContent = (a.group !== lastGroup ? a.group + ' · ' : '') + a.name;
      lastGroup = a.group;
      head.appendChild(name);

      var score = document.createElement('span');
      score.className = 'area-score';
      score.textContent = a.got + ' / ' + a.full;
      head.appendChild(score);

      row.appendChild(head);

      var track = document.createElement('div');
      track.className = 'area-track';
      var fill = document.createElement('div');
      fill.className = 'area-fill';
      fill.style.width = a.percent + '%';
      track.appendChild(fill);
      row.appendChild(track);

      box.appendChild(row);
    });
  }

  function renderWrong(items) {
    var box = $('wrong-list');
    box.innerHTML = '';

    var missed = items.filter(function (it) { return !it.correct; });
    var r = state.result;

    /* 몇 개를 틀리고 몇 개를 못 풀었는지 한 줄로 적어 줍니다 */
    var count = $('wrong-count');
    if (count) {
      if (missed.length === 0) {
        count.textContent = '틀린 문항이 없습니다.';
      } else if (r.blank === 0) {
        count.textContent = '틀린 문항 ' + r.wrong + '개';
      } else if (r.wrong === 0) {
        count.textContent = '못 푼 문항 ' + r.blank + '개';
      } else {
        count.textContent = '틀린 문항 ' + r.wrong + '개 · 못 푼 문항 ' + r.blank + '개';
      }
    }

    if (missed.length === 0) { return; }

    missed.forEach(function (it) {
      var card = document.createElement('div');
      card.className = 'wrong-q' + (it.blank ? ' is-blank' : '');

      var head = document.createElement('div');
      head.className = 'wrong-q-head';

      var no = document.createElement('span');
      no.className = 'wrong-q-no';
      no.textContent = it.no + '번';
      head.appendChild(no);

      var area = document.createElement('span');
      area.className = 'wrong-q-area';
      area.textContent = it.area + ' · ' + it.points + '점';
      head.appendChild(area);

      /* 못 푼 문항은 틀린 문항과 눈에 다르게 보이게 표를 붙입니다 */
      if (it.blank) {
        var flag = document.createElement('span');
        flag.className = 'wrong-q-flag';
        flag.textContent = '못 푼 문제';
        head.appendChild(flag);
      }

      card.appendChild(head);

      card.appendChild(answerRow('내 답', it.blank ? '표시 안 함' : String(it.myAnswer), 'my-answer'));
      card.appendChild(answerRow('정답', String(it.answer), 'real-answer'));

      box.appendChild(card);
    });
  }

  function answerRow(tagText, value, valueClass) {
    var row = document.createElement('p');
    row.className = 'answer-row';

    var tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = tagText;
    row.appendChild(tag);

    var val = document.createElement('span');
    val.className = valueClass;
    val.textContent = value;
    row.appendChild(val);

    return row;
  }

  /* ---------- 기록 저장 ---------- */

  /* 기록에는 회차 이름 앞에 '[모의고사]' 가 붙고, 뒤에 선택과목이 붙습니다.
     선생님 화면에서 어휘·문법과 섞이지 않게 하려는 것입니다. */
  function recordTitle() {
    var short = (state.choice === '언어와 매체') ? '언매' : '화작';
    return '[모의고사] ' + examLabel(state.exam) + ' · ' + short;
  }

  function saveResult(r) {
    var box = $('save-state');
    box.hidden = false;
    box.className = 'save-state';
    box.textContent = '기록을 저장하는 중…';

    var record = {
      name: state.student.name,
      school: state.student.school,
      phone4: state.student.phone4,
      roundTitle: recordTitle(),
      correct: r.correct,
      total: r.total,
      percent: r.score,     /* 100점 만점 점수 (배점 합이 100점이라 정답률 자리에 그대로 넣습니다) */
      savedAt: new Date().toISOString(),
      items: r.items.map(function (it) {
        return {
          word: it.no + '번',
          answer: String(it.answer),
          myAnswer: it.blank ? '' : String(it.myAnswer),
          correct: it.correct,
          blank: it.blank,          /* 시간이 없어 표시하지 못한 문항 */
          area: it.area,
          points: it.points
        };
      })
    };

    VocabStore.save(record).then(function (res) {
      if (res.sentToServer) {
        box.textContent = '기록이 저장되었습니다.\n(선생님께 전송 완료)';
      } else if (res.savedOnDevice && VocabStore.usingServer()) {
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

  /* 이 앱에서는 모의고사 기록만 보여 줍니다 */
  function myExamRecords() {
    return VocabStore.listFor(state.student).filter(function (r) {
      return String(r.roundTitle || '').indexOf('[모의고사]') === 0;
    });
  }

  function renderHistory(cameFrom) {
    historyBackTo = cameFrom;

    var records = myExamRecords();
    $('history-who').textContent = state.student.name + ' 학생';

    var box = $('history-list');
    box.innerHTML = '';

    if (records.length === 0) {
      $('history-summary').textContent = '아직 모의고사 기록이 없습니다.';
    } else {
      var sum = records.reduce(function (a, r) { return a + r.percent; }, 0);
      $('history-summary').textContent =
        records.length + '번 응시 · 평균 ' + Math.round(sum / records.length) + '점';

      records.forEach(function (r) {
        box.appendChild(historyItem(r));
      });
    }

    show('history');
  }

  function historyItem(r) {
    var item = document.createElement('div');
    item.className = 'history-item';

    var left = document.createElement('div');
    left.className = 'history-main';

    var title = document.createElement('p');
    title.className = 'history-round';
    title.textContent = String(r.roundTitle || '').replace('[모의고사] ', '');
    left.appendChild(title);

    var when = document.createElement('p');
    when.className = 'history-when';
    when.textContent = formatDate(r.savedAt);
    left.appendChild(when);

    var score = document.createElement('p');
    score.className = 'history-score';
    score.textContent = r.percent + '점';

    var hit = document.createElement('span');
    hit.className = 'history-percent';
    hit.textContent = r.correct + '/' + r.total + ' 맞음';
    score.appendChild(hit);

    item.appendChild(left);
    item.appendChild(score);
    return item;
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
    btn.hidden = VocabStore.listFor(student).filter(function (r) {
      return String(r.roundTitle || '').indexOf('[모의고사]') === 0;
    }).length === 0;
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

        VocabStore.homeworkRound(whoFor(), SUBJECT).then(function (h) {
          homeworkRound = h.round || '';
          homeworkSet = !!h.set;
          renderRounds();
        });
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
                '재원생인지 확인이 되어야 시험을 시작할 수 있습니다.';
    } else if (r.code === 'not-set-up') {
      message = '재원생 확인 준비가 아직 되지 않았습니다.\n선생님께 알려주세요.';
    } else {
      message = '확인하지 못했습니다. 잠시 뒤 다시 눌러주세요.';
    }

    $('name-error').textContent = message;
    $('name-error').hidden = false;
  }

  /* ---------- 첫 실행 ---------- */

  function init() {
    var problems = validateExams();
    if (problems.length > 0) {
      showErrors(problems);
      return;
    }

    if (typeof EXAM_QUIZ_TITLE === 'string' && EXAM_QUIZ_TITLE.trim() !== '') {
      document.title = EXAM_QUIZ_TITLE;
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

    $('btn-back-rounds').addEventListener('click', renderRounds);
    $('btn-back-subject').addEventListener('click', renderSubject);

    $('btn-my-history').addEventListener('click', function () {
      state.student = readStudentForm();
      renderHistory('start');
    });

    $('btn-history').addEventListener('click', function () {
      renderHistory('result');
    });

    $('btn-back-from-history').addEventListener('click', function () {
      show(historyBackTo === 'result' ? 'result' : 'start');
    });

    $('btn-home').addEventListener('click', function () {
      $('save-state').hidden = true;
      renderRounds();
    });

    /* 45번까지 다 누르지 않아도 바로 채점합니다.
       시간 안에 못 푼 문항은 '못 푼 문제' 로 표시됩니다. */
    $('btn-submit').addEventListener('click', function () {
      state.result = gradeSheet();
      renderResult();
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
  }

  init();
})();
