/* =========================================================
   독해 앱 동작 파일
   (지문과 문제만 바꿀 거라면 readings.js 만 고치면 됩니다)

   학생은 긴 지문을 한 문단씩 읽고, 그 문단을 한 문장으로 요약한
   문장의 빈칸에 알맞은 말을 네 개 중에서 고릅니다.
   고르자마자 맞았는지와 근거 문장을 보여 주고 다음 문단으로 넘어갑니다.
   ========================================================= */

(function () {
  'use strict';

  var SUBJECT = '독해';

  var $ = function (id) { return document.getElementById(id); };

  var screens = {
    start: $('screen-start'),
    rounds: $('screen-rounds'),
    read: $('screen-read'),
    result: $('screen-result'),
    history: $('screen-history'),
    error: $('screen-error')
  };

  /* ---------- 시험 상태 ---------- */
  var state = {
    student: null,  /* { name, school, phone4 } */
    group: '',      /* 그 학생의 반 (고등부 / 중등부) */
    grade: '',      /* 그 학생의 학년 (고1 …) — 지문을 여는 기준입니다 */
    round: null,    /* 고른 지문 */
    at: 0,          /* 지금 읽는 문단 (0부터) */
    order: [],      /* 문단마다 섞은 보기 순서 */
    picks: []       /* 문단마다 학생이 고른 보기 */
  };

  var historyBackTo = 'start';

  var homeworkRound = '';
  var homeworkSet = false;

  function allReadings() {
    return (typeof READINGS !== 'undefined' && Array.isArray(READINGS)) ? READINGS : [];
  }

  /* 지문 이름 — "[인문예술1] 조선 시대의 민본 사상"
     선생님 화면에서 이번 주 지문을 정할 때도 이 이름으로 저장합니다 */
  function roundLabel(r) {
    return '[' + r.area + r.no + '] ' + r.title;
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

  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* 요약 문장의 ___ 자리를 빈칸으로 그립니다. fill 이 있으면 그 말을 채웁니다 */
  function drawSentence(box, sentence, fill) {
    box.textContent = '';
    var parts = String(sentence).split('___');
    box.appendChild(document.createTextNode(parts[0]));
    var blank = document.createElement('span');
    blank.className = 'read-blank' + (fill ? ' is-filled' : '');
    blank.textContent = fill || ' ';
    box.appendChild(blank);
    box.appendChild(document.createTextNode(parts[1] || ''));
  }

  /* 근거 문장에서 [ ] 로 감싼 곳을 형광펜으로 칠합니다 */
  function drawEvidence(box, text) {
    box.textContent = '';
    String(text).split(/(\[[^\]]*\])/).forEach(function (piece) {
      if (/^\[.*\]$/.test(piece)) {
        var m = document.createElement('mark');
        m.className = 'read-mark';
        m.textContent = piece.slice(1, -1);
        box.appendChild(m);
      } else if (piece) {
        box.appendChild(document.createTextNode(piece));
      }
    });
  }

  /* ---------- 지문 파일 검사 ---------- */

  /* 잘못 적은 곳을 찾아서 사람이 읽을 수 있는 말로 돌려줍니다 */
  function validateReadings() {
    var problems = [];
    var list = allReadings();

    if (list.length === 0) {
      problems.push('지문이 하나도 없습니다. readings.js 에 지문을 넣어 주세요.');
      return problems;
    }

    var seen = {};
    list.forEach(function (r, i) {
      if (!r || typeof r !== 'object') {
        problems.push((i + 1) + '번째 지문의 내용이 비어 있습니다.');
        return;
      }
      var where = (r.area && r.no) ? ('[' + r.area + r.no + '] 지문') : ((i + 1) + '번째 지문');

      if (!r.area) { problems.push(where + '에 area(분야)가 없습니다. "인문예술" 처럼 적어 주세요.'); }
      if (!(r.no > 0)) { problems.push(where + '에 no(번호)가 없습니다. 1 처럼 숫자로 적어 주세요.'); }
      if (!r.title) { problems.push(where + '에 title(제목)이 없습니다.'); }
      if (String(r.title || '').indexOf('|') >= 0) {
        problems.push(where + '의 제목에 | 가 들어 있습니다. 다른 글자로 바꿔 주세요.');
      }
      var key = r.area + r.no;
      if (seen[key]) { problems.push(where + '과 같은 분야·번호의 지문이 또 있습니다.'); }
      seen[key] = true;

      if (!Array.isArray(r.paragraphs) || r.paragraphs.length === 0) {
        problems.push(where + '에 문단(paragraphs)이 없습니다.');
        return;
      }

      r.paragraphs.forEach(function (p, k) {
        var at = where + ' ' + (k + 1) + '문단';
        if (!p || !p.text) { problems.push(at + '에 원문(text)이 없습니다.'); return; }
        if (String(p.summary || '').split('___').length !== 2) {
          problems.push(at + '의 요약 문장(summary)에 빈칸 ___ 을 한 번만 적어 주세요.');
        }
        if (!p.answer) { problems.push(at + '에 정답(answer)이 없습니다.'); }
        if (!Array.isArray(p.wrong) || p.wrong.length !== 3) {
          problems.push(at + '의 오답(wrong)을 세 개 적어 주세요.');
        } else {
          var options = [p.answer].concat(p.wrong.map(function (w) {
            return Array.isArray(w) ? w[0] : w;
          }));
          var bad = options.some(function (o) { return !o; });
          var dup = options.some(function (o, n) { return options.indexOf(o) !== n; });
          if (bad) { problems.push(at + '의 보기 중 비어 있는 것이 있습니다.'); }
          if (dup) { problems.push(at + '의 보기 중 똑같은 것이 있습니다.'); }
        }
        /* 근거 문장이 원문에 그대로 있는지 봅니다 ([ ] 표시는 빼고) */
        String(p.evidence || '').replace(/[\[\]]/g, '').split(' … ').forEach(function (piece) {
          piece = piece.trim();
          if (piece && p.text.indexOf(piece) < 0) {
            problems.push(at + '의 근거 문장이 원문에 없습니다: "' + piece.slice(0, 20) + '…"');
          }
        });
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

  /* ---------- 지문 고르기 ---------- */

  /* 독해는 학년으로 지문을 엽니다. 학년을 모르면 반 이름으로 찾습니다. */
  function whoFor() {
    return state.grade || state.group || '고등부';
  }

  function openTitles() {
    return String(homeworkRound || '').split('|').filter(function (s) { return s !== ''; });
  }

  function isOpen(r) {
    if (!homeworkSet) { return false; }
    var titles = openTitles();
    if (titles.length === 0) { return true; }
    return titles.indexOf(roundLabel(r)) >= 0;
  }

  function renderRounds() {
    var box = $('round-list');
    box.innerHTML = '';

    var list = allReadings();
    var openCount = list.filter(isOpen).length;

    var empty = $('rounds-empty');
    if (openCount === 0) {
      empty.textContent = whoFor() + ' 이번 주 독해 지문이 아직 정해지지 않았습니다.\n선생님께 알려주세요.';
      empty.hidden = false;
    } else {
      empty.hidden = true;
    }

    /* 분야마다 이름을 적고 그 아래에 세 칸씩 놓습니다 */
    var areas = [];
    list.forEach(function (r) { if (areas.indexOf(r.area) < 0) { areas.push(r.area); } });

    areas.forEach(function (area) {
      var head = document.createElement('p');
      head.className = 'reading-area';
      head.textContent = area;
      box.appendChild(head);

      var grid = document.createElement('div');
      grid.className = 'round-list';

      list.filter(function (r) { return r.area === area; }).forEach(function (r) {
        var open = isOpen(r);

        var card = document.createElement('button');
        card.type = 'button';
        card.className = 'round-btn' + (open ? '' : ' is-locked');

        var no = document.createElement('span');
        no.className = 'round-no';
        no.textContent = String(r.no);
        card.appendChild(no);

        var topic = document.createElement('span');
        topic.className = 'round-topic';
        topic.textContent = r.title;
        card.appendChild(topic);

        if (open) {
          card.addEventListener('click', function () { start(r); });
        } else {
          card.disabled = true;
          card.setAttribute('aria-label', roundLabel(r) + ' — 이번 주에는 열려 있지 않습니다');
        }

        grid.appendChild(card);
      });

      box.appendChild(grid);
    });

    show('rounds');
  }

  function start(r) {
    state.round = r;
    state.at = 0;
    state.picks = [];
    state.order = r.paragraphs.map(function (p) {
      return shuffle([p.answer].concat(p.wrong.map(function (w) {
        return Array.isArray(w) ? w[0] : w;
      })));
    });
    $('save-state').hidden = true;
    renderPara();
  }

  /* ---------- 문단 읽기 ---------- */

  function renderPara() {
    var r = state.round;
    var i = state.at;
    var p = r.paragraphs[i];
    var n = r.paragraphs.length;

    $('read-round').textContent = roundLabel(r);
    $('read-now').textContent = String(i + 1);
    $('read-total').textContent = String(n);
    $('read-fill').style.width = Math.round((i / n) * 100) + '%';

    $('para-no').textContent = (i + 1) + '문단';
    $('para-text').textContent = p.text;
    $('para-note').textContent = p.note || '';
    $('para-note').hidden = !p.note;

    drawSentence($('summary-line'), p.summary, '');
    $('feedback').hidden = true;
    $('btn-next').disabled = true;
    $('btn-next').textContent = (i === n - 1) ? '결과 보기' : '다음 문단';

    renderNotes();

    var box = $('choices');
    box.innerHTML = '';
    state.order[i].forEach(function (text, k) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'choice';
      btn.setAttribute('data-text', text);

      var num = document.createElement('span');
      num.className = 'choice-num';
      num.textContent = String(k + 1);
      btn.appendChild(num);

      var label = document.createElement('span');
      label.className = 'choice-text';
      label.textContent = text;
      btn.appendChild(label);

      btn.addEventListener('click', function () { pick(text); });
      box.appendChild(btn);
    });

    show('read');
  }

  /* 앞 문단에서 정리한 요약을 접어서 보여 줍니다 (정답으로 채운 문장) */
  function renderNotes() {
    var done = state.picks.length;
    $('notes').hidden = (done === 0);
    $('notes-title').textContent = '지금까지 정리한 요약 (' + done + ')';

    var list = $('notes-list');
    list.innerHTML = '';
    for (var k = 0; k < done; k++) {
      list.appendChild(outlineItem(k, false));
    }
  }

  /* 요약 한 줄 — "1문단  조선 시대 유학자들은 … (정답) …" */
  function outlineItem(k, flagWrong) {
    var p = state.round.paragraphs[k];
    var li = document.createElement('li');

    var no = document.createElement('span');
    no.className = 'read-outline-no';
    no.textContent = (k + 1) + '문단';
    li.appendChild(no);

    var text = document.createElement('span');
    text.className = 'read-outline-text';
    var parts = String(p.summary).split('___');
    text.appendChild(document.createTextNode(parts[0]));
    var b = document.createElement('b');
    b.textContent = p.answer;
    text.appendChild(b);
    text.appendChild(document.createTextNode(parts[1] || ''));

    if (flagWrong && state.picks[k] !== p.answer) {
      var flag = document.createElement('span');
      flag.className = 'read-outline-flag';
      flag.textContent = '다시 보기';
      text.appendChild(flag);
    }

    li.appendChild(text);
    return li;
  }

  /* 보기를 고르면 바로 채점하고 근거를 보여 줍니다.
     정답만 초록으로, 내가 고른 오답은 회색 점선으로 둡니다 */
  function pick(text) {
    var p = state.round.paragraphs[state.at];
    var ok = (text === p.answer);
    state.picks.push(text);

    Array.prototype.forEach.call($('choices').children, function (btn) {
      var t = btn.getAttribute('data-text');
      btn.disabled = true;
      if (t === p.answer) {
        btn.classList.add('is-right');
        btn.appendChild(choiceMark('정답'));
      } else if (t === text) {
        btn.classList.add('is-mine');
        btn.appendChild(choiceMark('내 답'));
      } else {
        btn.classList.add('is-dim');
      }
    });

    drawSentence($('summary-line'), p.summary, p.answer);

    $('verdict').textContent = ok ? '맞았습니다.' : '아쉬워요. 초록색 보기가 정답입니다.';
    $('verdict').className = 'read-verdict' + (ok ? ' is-ok' : '');
    $('why').textContent = p.why || '';
    drawEvidence($('evidence'), p.evidence || '');
    $('feedback').hidden = false;
    $('btn-next').disabled = false;
  }

  function choiceMark(text) {
    var mark = document.createElement('span');
    mark.className = 'choice-mark';
    mark.textContent = text;
    return mark;
  }

  function next() {
    state.at += 1;
    if (state.at >= state.round.paragraphs.length) {
      renderResult();
      return;
    }
    renderPara();
  }

  /* ---------- 결과 ---------- */

  function renderResult() {
    var r = state.round;
    var n = r.paragraphs.length;
    var correct = 0;
    r.paragraphs.forEach(function (p, k) {
      if (state.picks[k] === p.answer) { correct += 1; }
    });

    $('result-round').textContent = roundLabel(r);
    $('result-name').textContent = state.student.name + ' 학생';
    $('result-correct').textContent = String(correct);
    $('result-total').textContent = String(n);
    $('result-comment').textContent = (correct === n)
      ? '모든 문단의 중심 내용을 잡았습니다.'
      : '요약 노트를 처음부터 읽으며 글 전체의 흐름을 다시 잡아 보세요.';

    /* 요약 노트 — 정답으로 채운 요약 문장을 문단 순서대로 이어 놓습니다 */
    var outline = $('outline');
    outline.innerHTML = '';
    for (var k = 0; k < n; k++) {
      outline.appendChild(outlineItem(k, true));
    }

    renderWrong();
    show('result');
    saveResult(correct, n);
  }

  /* 틀린 문단 — 내 답(회색)·정답(분홍)·해설·근거 문장 */
  function renderWrong() {
    var r = state.round;
    var box = $('wrong-list');
    box.innerHTML = '';

    var missed = 0;
    r.paragraphs.forEach(function (p, k) {
      if (state.picks[k] === p.answer) { return; }
      missed += 1;

      var card = document.createElement('div');
      card.className = 'wrong-item';

      var title = document.createElement('p');
      title.className = 'wrong-word';
      title.textContent = (k + 1) + '문단';
      card.appendChild(title);

      card.appendChild(answerRow('내 답', state.picks[k], 'my-answer'));
      card.appendChild(answerRow('정답', p.answer, 'real-answer'));

      if (p.why) {
        var why = document.createElement('p');
        why.className = 'explanation';
        why.textContent = p.why;
        card.appendChild(why);
      }

      if (p.evidence) {
        var ev = document.createElement('p');
        ev.className = 'example';
        var label = document.createElement('span');
        label.className = 'example-label';
        label.textContent = '근거 문장';
        ev.appendChild(label);
        var body = document.createElement('span');
        drawEvidence(body, p.evidence);
        ev.appendChild(body);
        card.appendChild(ev);
      }

      box.appendChild(card);
    });

    $('wrong-area').hidden = (missed === 0);
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

  /* 기록에는 지문 이름 앞에 '[독해]' 가 붙습니다.
     선생님 화면에서 어휘·문법·모의고사와 섞이지 않게 하려는 것입니다. */
  function recordTitle() {
    return '[독해] ' + roundLabel(state.round);
  }

  function saveResult(correct, total) {
    var box = $('save-state');
    box.hidden = false;
    box.className = 'save-state';
    box.textContent = '기록을 저장하는 중…';

    var r = state.round;
    var record = {
      name: state.student.name,
      school: state.student.school,
      phone4: state.student.phone4,
      roundTitle: recordTitle(),
      correct: correct,
      total: total,
      percent: Math.round((correct / total) * 100),
      savedAt: new Date().toISOString(),
      items: r.paragraphs.map(function (p, k) {
        return {
          word: (k + 1) + '문단',
          answer: p.answer,
          myAnswer: state.picks[k] || '',
          correct: state.picks[k] === p.answer
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

  /* 이 앱에서는 독해 기록만 보여 줍니다 */
  function readingRecords(student) {
    return VocabStore.listFor(student).filter(function (r) {
      return String(r.roundTitle || '').indexOf('[독해]') === 0;
    });
  }

  function renderHistory(cameFrom) {
    historyBackTo = cameFrom;

    var records = readingRecords(state.student);
    $('history-who').textContent = state.student.name + ' 학생';

    var box = $('history-list');
    box.innerHTML = '';

    if (records.length === 0) {
      $('history-summary').textContent = '아직 독해 기록이 없습니다.';
    } else {
      var sum = records.reduce(function (a, r) { return a + r.percent; }, 0);
      $('history-summary').textContent =
        records.length + '번 응시 · 평균 정답률 ' + Math.round(sum / records.length) + '%';
      records.forEach(function (r) { box.appendChild(historyItem(r)); });
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
    title.textContent = String(r.roundTitle || '').replace('[독해] ', '');
    left.appendChild(title);

    var when = document.createElement('p');
    when.className = 'history-when';
    when.textContent = formatDate(r.savedAt);
    left.appendChild(when);

    var score = document.createElement('p');
    score.className = 'history-score';
    score.textContent = r.correct + '/' + r.total;

    var pct = document.createElement('span');
    pct.className = 'history-percent';
    pct.textContent = r.percent + '%';
    score.appendChild(pct);

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
    btn.hidden = readingRecords(student).length === 0;
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
    var problems = validateReadings();
    if (problems.length > 0) {
      showErrors(problems);
      return;
    }

    if (typeof READING_QUIZ_TITLE === 'string' && READING_QUIZ_TITLE.trim() !== '') {
      document.title = READING_QUIZ_TITLE;
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

    $('btn-next').addEventListener('click', next);
    $('btn-retry').addEventListener('click', function () { start(state.round); });

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
