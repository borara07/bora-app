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
    return (typeof QUIZ_LENGTH === 'number' && QUIZ_LENGTH > 0) ? QUIZ_LENGTH : 15;
  }

  /* 한 회차에 꼭 넣을 한자성어 수 */
  function idiomCount() {
    return (typeof IDIOM_COUNT === 'number' && IDIOM_COUNT >= 0) ? IDIOM_COUNT : 0;
  }

  function isIdiom(q) {
    return q && q.type === '한자성어';
  }

  /* 이 회차에서 실제로 출제될 문제 수 */
  function countFor(round) {
    return Math.min(quizLength(), round.questions.length);
  }

  /* 이 회차에서 실제로 나올 한자성어 수 */
  function idiomsFor(round) {
    var have = round.questions.filter(isIdiom).length;
    return Math.min(idiomCount(), have, countFor(round));
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
      var n = idiomsFor(round);
      meta.textContent = '전체 ' + round.questions.length + '문제 중 ' + countFor(round) + '문제 출제' +
                         (n > 0 ? ' (한자성어 ' + n + '개 포함)' : '');
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
    var idioms = idiomsFor(round);
    $('chosen-detail').textContent =
      (round.subtitle ? round.subtitle + ' · ' : '') + countFor(round) + '문제 · 4지선다' +
      (idioms > 0 ? ' · 한자성어 ' + idioms + '개 포함' : '');

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
    var all = state.round.questions;
    var total = countFor(state.round);
    var wantIdioms = idiomsFor(state.round);

    /* 한자성어를 먼저 정해진 개수만큼 뽑고, 나머지는 일반 어휘로 채웁니다 */
    var idioms = shuffle(all.filter(isIdiom)).slice(0, wantIdioms);
    var rest = shuffle(all.filter(function (q) { return !isIdiom(q); }));

    var picked = idioms.concat(rest.slice(0, total - idioms.length));

    /* 일반 어휘가 모자라면 남은 한자성어로 채웁니다 */
    if (picked.length < total) {
      var more = shuffle(all.filter(isIdiom)).filter(function (q) {
        return picked.indexOf(q) === -1;
      });
      picked = picked.concat(more.slice(0, total - picked.length));
    }

    /* 한자성어가 뒤에 몰리지 않도록 순서를 섞습니다 */
    picked = shuffle(picked);

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

    // 지난번에 못 보낸 기록이 있으면 조용히 다시 보냅니다
    VocabStore.resend();

    $('btn-next').addEventListener('click', goNext);

    $('btn-retry').addEventListener('click', startQuiz);

    $('btn-other-round').addEventListener('click', renderRounds);

    renderRounds();
  }

  init();
})();
