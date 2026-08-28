/* =========================================================
   앱 동작 파일 (문제만 바꿀 거라면 이 파일은 건드리지 않아도 됩니다)
   ========================================================= */

(function () {
  'use strict';

  /* ---------- 화면 요소 모으기 ---------- */
  var $ = function (id) { return document.getElementById(id); };

  var screens = {
    rounds: $('screen-rounds'),
    start: $('screen-start'),
    quiz: $('screen-quiz'),
    result: $('screen-result'),
    history: $('screen-history'),
    adminLogin: $('screen-admin-login'),
    admin: $('screen-admin'),
    error: $('screen-error')
  };

  /* ---------- 시험 진행 상태 ---------- */
  var state = {
    student: null, // { name, school, phone4 }
    round: null,   // 고른 회차
    list: [],      // 이번 시험에 출제된 문제들
    index: 0,      // 지금 몇 번째 문제인지 (0부터)
    picked: null   // 현재 문제에서 고른 보기
  };

  /* 기록 화면에서 '돌아가기'를 눌렀을 때 갈 화면 */
  var historyBackTo = 'rounds';

  /* ---------- 공통 도구 ---------- */

  function show(name) {
    Object.keys(screens).forEach(function (key) {
      screens[key].hidden = (key !== name);
    });
    window.scrollTo(0, 0);
  }

  function shuffle(arr) {
    var copy = arr.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function quizLength() {
    return (typeof QUIZ_LENGTH === 'number' && QUIZ_LENGTH > 0) ? QUIZ_LENGTH : 10;
  }

  /* 이 회차에서 실제로 출제될 문제 수 */
  function countFor(round) {
    return Math.min(quizLength(), round.questions.length);
  }

  /* ---------- 문제 파일 검사 ---------- */

  function validateRounds() {
    var problems = [];

    if (typeof ROUNDS === 'undefined' || !Array.isArray(ROUNDS)) {
      problems.push('회차 목록(ROUNDS)을 찾을 수 없습니다. questions.js 파일을 확인해주세요.');
      return problems;
    }

    if (ROUNDS.length === 0) {
      problems.push('회차가 하나도 없습니다. questions.js 에 회차를 추가해주세요.');
      return problems;
    }

    ROUNDS.forEach(function (round, r) {
      var where = (r + 1) + '번째 회차';

      if (!round || typeof round !== 'object') {
        problems.push(where + ': 회차 내용이 비어 있습니다.');
        return;
      }
      if (typeof round.title !== 'string' || round.title.trim() === '') {
        problems.push(where + ': title(회차 이름)이 비어 있습니다.');
      }
      if (!Array.isArray(round.questions) || round.questions.length === 0) {
        problems.push(where + ': 문제(questions)가 하나도 없습니다.');
        return;
      }

      var name = round.title || where;

      round.questions.forEach(function (q, i) {
        var no = name + ' ' + (i + 1) + '번째 문제';

        if (!q || typeof q.word !== 'string' || q.word.trim() === '') {
          problems.push(no + ': word(어휘)가 비어 있습니다.');
        }
        if (!Array.isArray(q.choices) || q.choices.length !== 4) {
          problems.push(no + ': 보기(choices)는 정확히 4개여야 합니다.');
        } else {
          q.choices.forEach(function (c, ci) {
            if (typeof c !== 'string' || c.trim() === '') {
              problems.push(no + ': ' + (ci + 1) + '번 보기가 비어 있습니다.');
            }
          });
        }
        if (typeof q.answer !== 'number' || q.answer < 1 || q.answer > 4) {
          problems.push(no + ': answer(정답 번호)는 1~4 중 하나여야 합니다.');
        }
      });
    });

    return problems;
  }

  function showErrors(problems) {
    var ul = $('error-list');
    ul.innerHTML = '';
    problems.forEach(function (msg) {
      var li = document.createElement('li');
      li.textContent = msg;
      ul.appendChild(li);
    });
    show('error');
  }

  /* ---------- 회차 선택 화면 ---------- */

  function renderRounds() {
    var box = $('round-list');
    box.innerHTML = '';

    ROUNDS.forEach(function (round) {
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'round-card';

      var title = document.createElement('span');
      title.className = 'round-title';
      title.textContent = round.title;
      card.appendChild(title);

      if (round.subtitle) {
        var sub = document.createElement('span');
        sub.className = 'round-subtitle';
        sub.textContent = round.subtitle;
        card.appendChild(sub);
      }

      var meta = document.createElement('span');
      meta.className = 'round-meta';
      meta.textContent = '전체 ' + round.questions.length + '문제 중 ' + countFor(round) + '문제 출제';
      card.appendChild(meta);

      card.addEventListener('click', function () {
        chooseRound(round);
      });

      box.appendChild(card);
    });

    show('rounds');
  }

  function chooseRound(round) {
    state.round = round;

    $('chosen-round').textContent = round.title;
    $('chosen-detail').textContent =
      (round.subtitle ? round.subtitle + ' · ' : '') + countFor(round) + '문제 · 4지선다';

    $('name-error').hidden = true;

    // 지난번에 시험 본 학생이면 입력칸을 미리 채워 줍니다
    var last = VocabStore.lastStudent();
    if (last) {
      if (!$('student-name').value) $('student-name').value = last.name || '';
      if (!$('student-school').value) $('student-school').value = last.school || '';
      if (!$('student-phone4').value) $('student-phone4').value = last.phone4 || '';
    }
    refreshHistoryButton();

    show('start');
    $('student-name').focus();
  }

  /* ---------- 시험 만들기 ---------- */

  function buildQuiz() {
    var picked = shuffle(state.round.questions).slice(0, countFor(state.round));

    return picked.map(function (q) {
      return {
        word: q.word,
        hanja: q.hanja || '',
        choices: shuffle(q.choices),   // 보기 순서도 섞습니다
        correctText: q.choices[q.answer - 1],
        explanation: q.explanation || '',
        myAnswer: null
      };
    });
  }

  /* ---------- 문제 화면 그리기 ---------- */

  function renderQuestion() {
    var q = state.list[state.index];
    var total = state.list.length;
    var now = state.index + 1;

    $('quiz-round').textContent = state.round.title;
    $('progress-now').textContent = now;
    $('progress-total').textContent = total;
    $('progress-fill').style.width = Math.round((now / total) * 100) + '%';

    $('question-word').textContent = q.word;

    var hanjaBox = $('question-hanja');
    if (q.hanja) {
      hanjaBox.textContent = q.hanja;
      hanjaBox.hidden = false;
    } else {
      hanjaBox.textContent = '';
      hanjaBox.hidden = true;
    }

    var box = $('choices');
    box.innerHTML = '';

    q.choices.forEach(function (text, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'choice';

      var num = document.createElement('span');
      num.className = 'choice-num';
      num.textContent = String(i + 1);

      var label = document.createElement('span');
      label.textContent = text;

      btn.appendChild(num);
      btn.appendChild(label);

      btn.addEventListener('click', function () {
        pick(text, btn);
      });

      box.appendChild(btn);
    });

    state.picked = null;

    var nextBtn = $('btn-next');
    nextBtn.disabled = true;
    nextBtn.textContent = (now === total) ? '결과 보기' : '다음 문제';
  }

  function pick(text, btn) {
    state.picked = text;

    var all = $('choices').querySelectorAll('.choice');
    Array.prototype.forEach.call(all, function (el) {
      el.classList.remove('is-selected');
    });
    btn.classList.add('is-selected');

    $('btn-next').disabled = false;
  }

  function goNext() {
    if (state.picked === null) return;

    state.list[state.index].myAnswer = state.picked;

    if (state.index < state.list.length - 1) {
      state.index += 1;
      renderQuestion();
    } else {
      renderResult();
    }
  }

  /* ---------- 결과 화면 그리기 ---------- */

  function renderResult() {
    var total = state.list.length;
    var wrong = state.list.filter(function (q) {
      return q.myAnswer !== q.correctText;
    });
    var correct = total - wrong.length;
    var percent = Math.round((correct / total) * 100);

    $('result-name').textContent = state.student.name + ' 학생';
    $('result-correct').textContent = correct;
    $('result-total').textContent = total;
    $('result-percent').textContent = '정답률 ' + percent + '%';
    $('result-round').textContent = state.round.title;

    var comment;
    if (percent === 100) {
      comment = '완벽합니다! 전부 맞혔어요.';
    } else if (percent >= 80) {
      comment = '훌륭해요. 조금만 더 다듬으면 완벽합니다.';
    } else if (percent >= 60) {
      comment = '기본기는 있어요. 틀린 어휘를 복습해봐요.';
    } else {
      comment = '아직 헷갈리는 어휘가 많아요. 해설을 꼭 읽어보세요.';
    }
    $('result-comment').textContent = comment;

    var list = $('wrong-list');
    list.innerHTML = '';

    if (wrong.length === 0) {
      var ok = document.createElement('div');
      ok.className = 'all-correct';
      ok.textContent = '틀린 문제가 없습니다!';
      list.appendChild(ok);
    } else {
      wrong.forEach(function (q) {
        list.appendChild(buildWrongItem(q));
      });
    }

    saveResult(correct, total, percent);

    show('result');
  }

  function buildWrongItem(q) {
    var item = document.createElement('div');
    item.className = 'wrong-item';

    var word = document.createElement('p');
    word.className = 'wrong-word';
    word.textContent = q.word;
    if (q.hanja) {
      var h = document.createElement('span');
      h.className = 'wrong-hanja';
      h.textContent = q.hanja;
      word.appendChild(h);
    }
    item.appendChild(word);

    item.appendChild(answerRow('내 답', q.myAnswer, 'my-answer'));
    item.appendChild(answerRow('정답', q.correctText, 'real-answer'));

    if (q.explanation) {
      var exp = document.createElement('p');
      exp.className = 'explanation';
      exp.textContent = q.explanation;
      item.appendChild(exp);
    }

    return item;
  }

  function answerRow(tagText, value, valueClass) {
    var row = document.createElement('p');
    row.className = 'answer-row';

    var tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = tagText;

    var val = document.createElement('span');
    val.className = valueClass;
    val.textContent = value;

    row.appendChild(tag);
    row.appendChild(val);
    return row;
  }

  /* ---------- 학생 정보 ---------- */

  function readStudentForm() {
    return {
      name: $('student-name').value.trim(),
      school: $('student-school').value.trim(),
      phone4: $('student-phone4').value.trim()
    };
  }

  /* 입력한 내용에 문제가 있으면 안내 문구를 돌려줍니다 */
  function checkStudent(student) {
    if (student.name === '') return '학생 이름을 입력해주세요.';
    if (student.school === '') return '학교를 입력해주세요.';
    if (!/^[0-9]{4}$/.test(student.phone4)) return '학부모님 전화번호 뒷 4자리를 숫자 4자리로 입력해주세요.';
    return '';
  }

  /* 입력한 학생에게 지난 기록이 있으면 '내 지난 기록 보기' 버튼을 보여 줍니다 */
  function refreshHistoryButton() {
    var student = readStudentForm();
    var btn = $('btn-my-history');
    if (checkStudent(student) !== '') {
      btn.hidden = true;
      return;
    }
    btn.hidden = VocabStore.listFor(student).length === 0;
  }

  /* ---------- 기록 저장 ---------- */

  function saveResult(correct, total, percent) {
    var box = $('save-state');
    box.hidden = false;
    box.className = 'save-state';
    box.textContent = '기록을 저장하는 중…';

    var record = {
      name: state.student.name,
      school: state.student.school,
      phone4: state.student.phone4,
      roundTitle: state.round.title,
      correct: correct,
      total: total,
      percent: percent,
      savedAt: new Date().toISOString(),
      items: state.list.map(function (q) {
        return {
          word: q.word,
          hanja: q.hanja,
          answer: q.correctText,
          myAnswer: q.myAnswer,
          correct: q.myAnswer === q.correctText
        };
      })
    };

    VocabStore.save(record).then(function (r) {
      if (r.sentToServer) {
        box.textContent = '기록이 저장되었습니다. (선생님께 전송 완료)';
      } else if (r.savedOnDevice && VocabStore.usingServer()) {
        box.textContent = '기록을 이 기기에 저장했습니다. 인터넷 연결 후 자동으로 전송됩니다.';
        box.className = 'save-state is-waiting';
        if (r.reason) {
          var why = document.createElement('span');
          why.className = 'check-detail';
          why.textContent = r.reason;
          box.appendChild(why);
        }
      } else if (r.savedOnDevice) {
        box.textContent = '기록이 저장되었습니다.';
      } else {
        box.textContent = '이 브라우저에서는 기록을 저장할 수 없습니다.';
        box.className = 'save-state is-waiting';
      }
    });
  }

  /* ---------- 내 기록 화면 ---------- */

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var two = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '. ' + two(d.getMonth() + 1) + '. ' + two(d.getDate()) +
           ' ' + two(d.getHours()) + ':' + two(d.getMinutes());
  }

  function renderHistory(cameFrom) {
    historyBackTo = cameFrom || 'rounds';

    var student = state.student || readStudentForm();
    var records = VocabStore.listFor(student);

    $('history-who').textContent = student.name + ' 학생';

    var box = $('history-list');
    box.innerHTML = '';

    if (records.length === 0) {
      $('history-summary').textContent = '아직 저장된 기록이 없습니다.';
      var empty = document.createElement('p');
      empty.className = 'empty-note';
      empty.textContent = '테스트를 끝내면 이곳에 기록이 쌓입니다.';
      box.appendChild(empty);
    } else {
      var rounds = {};
      var sum = 0;
      records.forEach(function (r) {
        rounds[r.roundTitle] = true;
        sum += r.percent;
      });
      $('history-summary').textContent =
        '본 회차 ' + Object.keys(rounds).length + '개 · 시험 ' + records.length + '번 · 평균 정답률 ' +
        Math.round(sum / records.length) + '%';

      records.forEach(function (r) {
        box.appendChild(buildHistoryItem(r));
      });
    }

    show('history');
  }

  function buildHistoryItem(r) {
    var item = document.createElement('div');
    item.className = 'history-item';

    var left = document.createElement('div');
    left.className = 'history-main';

    var title = document.createElement('p');
    title.className = 'history-round';
    title.textContent = r.roundTitle;
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

  /* ---------- 기록 내려받기 (선생님용) ---------- */

  function exportRecords() {
    var note = $('export-state');
    note.hidden = false;

    var rows = VocabStore.all();
    if (rows.length === 0) {
      note.textContent = '이 기기에 저장된 기록이 없습니다.';
      return;
    }

    var csv = '\ufeff' + VocabStore.toCsv();   // 엑셀에서 한글이 깨지지 않도록
    var filename = '어휘테스트_기록.csv';

    note.textContent = '내려받는 중…';

    downloadFile(filename, csv).then(function (ok) {
      note.textContent = ok
        ? (rows.length + '개의 기록을 내려받았습니다.')
        : '이 화면에서는 파일을 내려받을 수 없습니다.';
    });
  }

  /* ---------- 서버 연결 확인 (선생님용) ---------- */

  function checkConnection() {
    var box = $('check-state');
    box.hidden = false;
    box.className = 'check-state';
    box.textContent = '확인하는 중…';

    VocabStore.testConnection().then(function (r) {
      box.className = 'check-state ' + (r.ok ? 'is-ok' : 'is-bad');
      box.textContent = r.message;

      if (!r.ok && r.detail) {
        var more = document.createElement('span');
        more.className = 'check-detail';
        more.textContent = r.detail;
        box.appendChild(more);
      }
    });
  }

  function downloadFile(filename, text) {
    // 아티팩트 화면에서는 전용 기능을 통해서만 파일을 건넬 수 있습니다
    if (window.claude && typeof window.claude.use === 'function') {
      return window.claude.use('downloads').then(function (downloads) {
        if (!downloads) return browserDownload(filename, text);
        return downloads.save({ filename: filename, data: text }).then(function () {
          return true;
        }).catch(function () {
          return false;
        });
      }).catch(function () {
        return browserDownload(filename, text);
      });
    }
    return Promise.resolve(browserDownload(filename, text));
  }

  function browserDownload(filename, text) {
    try {
      var blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------- 관리자 화면 (선생님 전용) ---------- */

  /* 관리자 화면에서 보고 있는 기록과 정렬 상태 */
  var adminRows = [];
  var adminRoster = null;   /* 재원생 명단 기준 누적 (명단을 넣어 둔 경우에만) */
  var adminSorts = {
    'table-rounds': { key: 'avg', desc: true },
    'table-students': { key: 'avg', desc: true },
    'table-all': { key: 'savedAt', desc: true },
    'table-roster': { key: 'name', desc: false },
    'table-grade': { key: 'order', desc: false }
  };

  /* 학년을 보여 줄 순서 (고3 → 중1) */
  var GRADE_ORDER = ['고3', '고2', '고1', '중3', '중2', '중1'];

  function openAdminLogin() {
    $('admin-password').value = '';
    $('admin-error').hidden = true;
    show('adminLogin');
    $('admin-password').focus();
  }

  function tryAdminLogin(password) {
    var err = $('admin-error');
    err.hidden = true;

    if (password === '') {
      err.textContent = '비밀번호를 입력해주세요.';
      err.hidden = false;
      return;
    }

    err.textContent = '확인하는 중…';
    err.hidden = false;

    VocabStore.fetchAll(password).then(function (r) {
      if (r.ok) {
        err.hidden = true;
        showAdmin(r.rows, '수파베이스에 쌓인 전체 학생 기록입니다.');

        /* 재원생 명단을 넣어 두었으면 그 기준 누적도 함께 보여 줍니다 */
        VocabStore.fetchStudents(password).then(function (sr) {
          adminRoster = sr.ok ? sr.rows : null;
          renderAdmin();
        });
        return;
      }

      if (r.code === 'wrong-password') {
        err.textContent = '비밀번호가 맞지 않습니다.';
        err.hidden = false;
        return;
      }

      /* 서버 설정 전이라면, 이 기기에 저장된 기록만 보여 줍니다 */
      if (r.code === 'not-set-up' || r.code === 'no-server' || r.code === 'offline') {
        if (password === VocabStore.localPassword()) {
          err.hidden = true;
          showAdmin(VocabStore.all(),
            '이 기기에 저장된 기록만 보고 있습니다.\n' +
            '전체 학생 기록을 보려면 supabase-관리자.sql 설정이 필요합니다.');
          return;
        }
        err.textContent = '비밀번호가 맞지 않습니다.';
        err.hidden = false;
        return;
      }

      err.textContent = '기록을 가져오지 못했습니다.\n' + (r.detail || '');
      err.hidden = false;
    });
  }

  function showAdmin(rows, note) {
    adminRows = rows || [];
    adminRoster = null;
    $('admin-source').textContent = note;
    $('admin-export-state').hidden = true;
    renderAdmin();
    show('admin');
  }

  /* ---------- 관리자 화면 계산 ---------- */

  /* 재원생 명단을 학년별로 묶습니다 */
  function gradeStats() {
    var map = {};
    (adminRoster || []).forEach(function (r) {
      var g = r.grade || '미분류';
      var m = map[g] || (map[g] = { grade: g, count: 0, taken: 0, sum: 0 });
      m.count += 1;
      if (r.count > 0) {
        m.taken += 1;
        m.sum += r.avg;
      }
    });
    return Object.keys(map).map(function (k) {
      var m = map[k];
      var idx = GRADE_ORDER.indexOf(m.grade);
      return {
        grade: m.grade,
        count: m.count,
        taken: m.taken,
        notYet: m.count - m.taken,
        avg: m.taken ? Math.round(m.sum / m.taken) : 0,
        order: idx === -1 ? GRADE_ORDER.length : idx
      };
    });
  }

  function studentKeyOf(r) {
    return r.name + '|' + r.school + '|' + r.phone4;
  }

  function roundStats() {
    var map = {};
    adminRows.forEach(function (r) {
      var m = map[r.roundTitle] || (map[r.roundTitle] = { title: r.roundTitle, count: 0, sum: 0, who: {} });
      m.count += 1;
      m.sum += r.percent;
      m.who[studentKeyOf(r)] = true;
    });
    return Object.keys(map).map(function (k) {
      var m = map[k];
      return { title: m.title, count: m.count, students: Object.keys(m.who).length, avg: Math.round(m.sum / m.count) };
    });
  }

  function studentStats() {
    var map = {};
    adminRows.forEach(function (r) {
      var k = studentKeyOf(r);
      var m = map[k] || (map[k] = { name: r.name, school: r.school, count: 0, sum: 0, last: '' });
      m.count += 1;
      m.sum += r.percent;
      if (r.savedAt > m.last) m.last = r.savedAt;
    });
    return Object.keys(map).map(function (k) {
      var m = map[k];
      return { name: m.name, school: m.school, count: m.count, avg: Math.round(m.sum / m.count), last: m.last };
    });
  }

  function sortRows(rows, sort) {
    var out = rows.slice();
    out.sort(function (a, b) {
      var x = a[sort.key], y = b[sort.key];
      if (typeof x === 'number' && typeof y === 'number') return sort.desc ? y - x : x - y;
      x = String(x == null ? '' : x);
      y = String(y == null ? '' : y);
      return sort.desc ? y.localeCompare(x, 'ko') : x.localeCompare(y, 'ko');
    });
    return out;
  }

  /* ---------- 관리자 화면 그리기 ---------- */

  function renderAdmin() {
    var students = studentStats();
    var sum = adminRows.reduce(function (a, r) { return a + r.percent; }, 0);

    $('admin-summary').innerHTML = '';
    [
      ['학생', students.length + '명'],
      ['시험', adminRows.length + '번'],
      ['평균 정답률', (adminRows.length ? Math.round(sum / adminRows.length) : 0) + '%']
    ].forEach(function (pair) {
      var box = document.createElement('div');
      box.className = 'summary-item';
      var v = document.createElement('p');
      v.className = 'summary-value';
      v.textContent = pair[1];
      var t = document.createElement('p');
      t.className = 'summary-label';
      t.textContent = pair[0];
      box.appendChild(v);
      box.appendChild(t);
      $('admin-summary').appendChild(box);
    });

    var rosterArea = $('roster-area');
    if (adminRoster) {
      rosterArea.hidden = false;
      var notYet = adminRoster.filter(function (r) { return r.count === 0; }).length;
      $('roster-note').textContent =
        '현재 재원생 ' + adminRoster.length + '명 중 ' + (adminRoster.length - notYet) + '명 응시' +
        (notYet > 0 ? ' · 아직 안 본 학생 ' + notYet + '명' : '');

      fillTable('table-grade', sortRows(gradeStats(), adminSorts['table-grade']),
        function (r) {
          return [
            r.grade,
            r.count + '명',
            r.taken + '명',
            r.notYet === 0 ? '—' : r.notYet + '명',
            r.taken === 0 ? '—' : r.avg + '%'
          ];
        });

      fillTable('table-roster', sortRows(adminRoster, adminSorts['table-roster']),
        function (r) {
          return [
            r.name,
            r.school,
            r.count === 0 ? '—' : r.count + '번',
            r.count === 0 ? '—' : r.avg + '%',
            r.count === 0 ? '아직 안 봄' : shortDate(r.last)
          ];
        });
    } else {
      rosterArea.hidden = true;
    }

    fillTable('table-rounds', sortRows(roundStats(), adminSorts['table-rounds']),
      function (r) { return [r.title, r.students + '명', r.count + '번', r.avg + '%']; });

    fillTable('table-students', sortRows(students, adminSorts['table-students']),
      function (r) { return [r.name, r.school, r.count + '번', r.avg + '%', shortDate(r.last)]; });

    fillTable('table-all', sortRows(adminRows, adminSorts['table-all']),
      function (r) { return [r.name, r.school, r.roundTitle, r.correct + '/' + r.total + ' (' + r.percent + '%)', shortDate(r.savedAt)]; });
  }

  function fillTable(tableId, rows, toCells) {
    var table = $(tableId);
    var body = table.querySelector('tbody');
    body.innerHTML = '';

    if (rows.length === 0) {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = table.querySelectorAll('th').length;
      td.className = 'empty-cell';
      td.textContent = '기록이 없습니다.';
      tr.appendChild(td);
      body.appendChild(tr);
    } else {
      rows.forEach(function (r) {
        var tr = document.createElement('tr');
        toCells(r).forEach(function (text, i) {
          var td = document.createElement('td');
          if (i > 0 && /^[0-9]/.test(String(text))) td.className = 'num';
          td.textContent = text;
          tr.appendChild(td);
        });
        body.appendChild(tr);
      });
    }

    /* 어느 칸을 기준으로 정렬 중인지 표시 */
    var sort = adminSorts[tableId];
    Array.prototype.forEach.call(table.querySelectorAll('th'), function (th) {
      th.classList.remove('is-asc', 'is-desc');
      if (th.getAttribute('data-sort') === sort.key) {
        th.classList.add(sort.desc ? 'is-desc' : 'is-asc');
      }
    });
  }

  function shortDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var two = function (n) { return (n < 10 ? '0' : '') + n; };
    return (d.getFullYear() % 100) + '.' + two(d.getMonth() + 1) + '.' + two(d.getDate());
  }

  function setupAdminSorting() {
    ['table-rounds', 'table-students', 'table-all', 'table-roster', 'table-grade'].forEach(function (id) {
      var table = $(id);
      Array.prototype.forEach.call(table.querySelectorAll('th[data-sort]'), function (th) {
        th.addEventListener('click', function () {
          var key = th.getAttribute('data-sort');
          var sort = adminSorts[id];
          if (sort.key === key) {
            sort.desc = !sort.desc;
          } else {
            sort.key = key;
            sort.desc = true;
          }
          renderAdmin();
        });
      });
    });
  }

  function exportAdmin() {
    var note = $('admin-export-state');
    note.hidden = false;

    if (adminRows.length === 0) {
      note.textContent = '내려받을 기록이 없습니다.';
      return;
    }

    note.textContent = '내려받는 중…';
    downloadFile('어휘테스트_전체기록.csv', '\ufeff' + VocabStore.toCsv(adminRows)).then(function (ok) {
      note.textContent = ok
        ? (adminRows.length + '개의 기록을 내려받았습니다.')
        : '이 화면에서는 파일을 내려받을 수 없습니다.';
    });
  }

  /* ---------- 시작 / 다시 풀기 ---------- */

  function startQuiz() {
    state.list = buildQuiz();
    state.index = 0;
    state.picked = null;
    renderQuestion();
    show('quiz');
  }

  /* ---------- 첫 실행 ---------- */

  function init() {
    var problems = validateRounds();
    if (problems.length > 0) {
      showErrors(problems);
      return;
    }

    if (typeof QUIZ_QUESTION_LABEL === 'string' && QUIZ_QUESTION_LABEL.trim() !== '') {
      $('question-label').textContent = QUIZ_QUESTION_LABEL;
    }

    if (typeof QUIZ_TITLE === 'string' && QUIZ_TITLE.trim() !== '') {
      $('quiz-title').textContent = QUIZ_TITLE;
      document.title = QUIZ_TITLE;
    }

    $('btn-back-rounds').addEventListener('click', renderRounds);

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
      state.student = student;
      VocabStore.rememberStudent(student);
      startQuiz();
    });

    ['student-name', 'student-school', 'student-phone4'].forEach(function (id) {
      $(id).addEventListener('input', refreshHistoryButton);
    });

    // 전화번호 칸에는 숫자만 남깁니다
    $('student-phone4').addEventListener('input', function () {
      this.value = this.value.replace(/[^0-9]/g, '').slice(0, 4);
    });

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

    $('btn-export').addEventListener('click', exportRecords);

    $('btn-check').addEventListener('click', checkConnection);

    $('btn-admin').addEventListener('click', openAdminLogin);
    $('btn-admin-back').addEventListener('click', renderRounds);
    $('btn-admin-exit').addEventListener('click', renderRounds);
    $('btn-admin-export').addEventListener('click', exportAdmin);

    $('admin-form').addEventListener('submit', function (e) {
      e.preventDefault();
      tryAdminLogin($('admin-password').value.trim());
    });

    setupAdminSorting();

    // 지난번에 못 보낸 기록이 있으면 조용히 다시 보냅니다
    VocabStore.resend();

    $('btn-next').addEventListener('click', goNext);

    $('btn-retry').addEventListener('click', startQuiz);

    $('btn-other-round').addEventListener('click', renderRounds);

    renderRounds();
  }

  init();
})();
