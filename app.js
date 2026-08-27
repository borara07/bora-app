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
    error: $('screen-error')
  };

  /* ---------- 시험 진행 상태 ---------- */
  var state = {
    name: '',
    round: null,   // 고른 회차
    list: [],      // 이번 시험에 출제된 문제들
    index: 0,      // 지금 몇 번째 문제인지 (0부터)
    picked: null   // 현재 문제에서 고른 보기
  };

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

    $('result-name').textContent = state.name + ' 학생';
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
      var name = $('student-name').value.trim();

      if (name === '') {
        $('name-error').hidden = false;
        $('student-name').focus();
        return;
      }

      $('name-error').hidden = true;
      state.name = name;
      startQuiz();
    });

    $('btn-next').addEventListener('click', goNext);

    $('btn-retry').addEventListener('click', startQuiz);

    $('btn-other-round').addEventListener('click', renderRounds);

    renderRounds();
  }

  init();
})();
