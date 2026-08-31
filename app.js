/* =========================================================
   앱 동작 파일 (문제만 바꿀 거라면 이 파일은 건드리지 않아도 됩니다)
   ========================================================= */

(function () {
  'use strict';

  /* 이 페이지가 다루는 과목입니다.
     index.html 은 '어휘', grammar.html 은 '문법' 이라고 미리 적어 둡니다. */
  var SUBJECT = (typeof APP_SUBJECT === 'string' && APP_SUBJECT) ? APP_SUBJECT : '어휘';

  /* 이 과목의 회차 목록 (어휘는 ROUNDS, 문법은 GRAMMAR_ROUNDS) */
  function allRounds() {
    var list = (SUBJECT === '문법')
      ? (typeof GRAMMAR_ROUNDS !== 'undefined' ? GRAMMAR_ROUNDS : undefined)
      : (typeof ROUNDS !== 'undefined' ? ROUNDS : undefined);
    return list;
  }

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
    group: '',     // 그 학생의 반 (고등부 / 중등부)
    round: null,   // 고른 회차
    list: [],      // 이번 시험에 출제된 문제들
    index: 0,      // 지금 몇 번째 문제인지 (0부터)
    picked: null   // 현재 문제에서 고른 보기
  };

  /* 기록 화면에서 '돌아가기'를 눌렀을 때 갈 화면 */
  var historyBackTo = 'start';

  /* 이번 주 숙제 회차 (빈 값이면 모든 회차를 고를 수 있습니다) */
  var homeworkRound = '';

  /* 문제 위에 놓이는 기본 물음 (문법 문제는 문제마다 따로 적습니다) */
  var defaultLabel = '다음 어휘의 뜻으로 알맞은 것은?';

  /* ---------- 공통 도구 ---------- */

  function show(name) {
    Object.keys(screens).forEach(function (key) {
      screens[key].hidden = (key !== name);
    });
    paintBackground(name === 'start' || name === 'rounds');
    window.scrollTo(0, 0);
  }

  /* 첫 화면만 진한 보라 바탕으로 바꿉니다.
     휴대폰 맨 위 띠 색(theme-color)도 같이 맞춥니다 */
  function paintBackground(deep) {
    var root = document.documentElement;
    if (deep) {
      root.classList.add('on-rounds');
    } else {
      root.classList.remove('on-rounds');
    }

    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) { return; }
    var color = getComputedStyle(root)
      .getPropertyValue(deep ? '--brand-deep' : '--primary').trim();
    if (color) { meta.setAttribute('content', color); }
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
    var list = allRounds();
    var file = (SUBJECT === '문법') ? 'questions-grammar.js' : 'questions.js';

    if (!Array.isArray(list)) {
      problems.push('회차 목록을 찾을 수 없습니다. ' + file + ' 파일을 확인해주세요.');
      return problems;
    }

    if (list.length === 0) {
      problems.push('회차가 하나도 없습니다. ' + file + ' 에 회차를 추가해주세요.');
      return problems;
    }

    list.forEach(function (round, r) {
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

        if (!q || typeof q !== 'object') {
          problems.push(no + ': 문제 내용이 비어 있습니다.');
          return;
        }

        var head = [q.word, q.sentence, q.ask].filter(function (t) {
          return typeof t === 'string' && t.trim() !== '';
        });
        if (head.length === 0) {
          problems.push(no + ': 어휘(word)나 물음(ask)이 비어 있습니다.');
        }

        var choices = q.ox ? ['O', 'X'] : q.choices;
        if (!Array.isArray(choices) || choices.length < 2 || choices.length > 5) {
          problems.push(no + ': 보기(choices)는 2개에서 5개 사이여야 합니다.');
        } else {
          choices.forEach(function (c, ci) {
            if (typeof c !== 'string' || c.trim() === '') {
              problems.push(no + ': ' + (ci + 1) + '번 보기가 비어 있습니다.');
            }
          });
          if (typeof q.answer !== 'number' || q.answer < 1 || q.answer > choices.length) {
            problems.push(no + ': answer(정답 번호)는 1~' + choices.length + ' 중 하나여야 합니다.');
          }
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

  /* 이번 주에 풀 수 있는 회차만 골라 냅니다 */
  /* 회차 이름을 번호와 주제로 나눕니다. ("01회 논리 1" -> "01", "논리 1") */
  function splitRoundTitle(title) {
    var m = /^\s*(\d+)\s*회\s*(.*)$/.exec(title || '');
    return m ? { no: m[1], topic: m[2] } : { no: '', topic: title || '' };
  }

  /* 그 반이 볼 회차만 고릅니다. 회차에 반이 안 적혀 있으면 고등부로 봅니다 */
  function roundsForGroup(group) {
    var want = group || '고등부';
    return (allRounds() || []).filter(function (r) {
      return (r.group || '고등부') === want;
    });
  }

  /* 지금 풀 수 있는 회차인지 (선생님이 숙제 회차를 정했으면 그 회차만) */
  function isOpen(round) {
    if (!homeworkRound) { return true; }
    return round.title === homeworkRound;
  }

  function renderRounds() {
    var box = $('round-list');
    box.innerHTML = '';

    var mine = roundsForGroup(state.group);

    /* 숙제 회차를 못 찾으면 모두 열어 둡니다 (학생이 아예 못 푸는 일이 없게) */
    var found = !homeworkRound || mine.some(function (r) {
      return r.title === homeworkRound;
    });

    var empty = $('rounds-empty');
    if (mine.length === 0) {
      empty.textContent = state.group + ' 시험이 아직 준비되지 않았습니다.\n선생님께 알려주세요.';
      empty.hidden = false;
    } else {
      empty.hidden = true;
    }

    mine.forEach(function (round) {
      var open = !found || isOpen(round);
      var part = splitRoundTitle(round.title);

      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'round-btn' + (open ? '' : ' is-locked');

      var no = document.createElement('span');
      no.className = 'round-no';
      no.textContent = part.no || round.title;
      card.appendChild(no);

      if (part.no) {
        var topic = document.createElement('span');
        topic.className = 'round-topic';
        topic.textContent = part.topic;
        card.appendChild(topic);
      }

      if (open) {
        card.addEventListener('click', function () {
          chooseRound(round);
        });
      } else {
        card.disabled = true;
        card.setAttribute('aria-label', round.title + ' — 이번 주에는 열려 있지 않습니다');
      }

      box.appendChild(card);
    });

    show('rounds');
  }

  /* 회차를 고르면 바로 시험을 시작합니다 (이름은 이미 확인했습니다) */
  function chooseRound(round) {
    state.round = round;
    startQuiz();
  }

  /* ---------- 시험 만들기 ---------- */

  /* 보기가 둘뿐이거나 OX 인 '단순' 문제인지 봅니다 */
  function isSimple(q) {
    if (q.ox) { return true; }
    return Array.isArray(q.choices) && q.choices.length <= 2;
  }

  /* 회차에 mix 가 적혀 있으면 그 개수만큼 골고루 뽑습니다.
     (예: mix: { 단순: 12, 객관식: 3 }) */
  function pickByMix(all, total, mix) {
    var simple = shuffle(all.filter(isSimple));
    var choice = shuffle(all.filter(function (q) { return !isSimple(q); }));

    var picked = simple.slice(0, Math.min(mix['단순'] || 0, simple.length))
      .concat(choice.slice(0, Math.min(mix['객관식'] || 0, choice.length)));

    /* 한쪽이 모자라면 남은 문제로 채웁니다 */
    if (picked.length < total) {
      var rest = shuffle(all.filter(function (q) { return picked.indexOf(q) === -1; }));
      picked = picked.concat(rest.slice(0, total - picked.length));
    }
    return shuffle(picked.slice(0, total));
  }

  function buildQuiz() {
    var all = state.round.questions;
    var total = countFor(state.round);
    var wantIdioms = idiomsFor(state.round);

    if (state.round.mix) {
      return toQuizItems(pickByMix(all, total, state.round.mix));
    }

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

    return toQuizItems(picked);
  }

  function toQuizItems(picked) {
    return picked.map(function (q) {
      var choices = q.ox ? ['O', 'X'] : q.choices;
      return {
        ask: q.ask || '',                       // 물음 (문법 문제)
        word: q.word || q.sentence || '',       // 큰 글씨로 보일 말
        hanja: q.hanja || '',
        /* OX 는 O·X 순서가 정해져 있으니 섞지 않습니다 */
        choices: q.ox ? choices.slice() : shuffle(choices),
        correctText: choices[q.answer - 1],
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

    /* 문법 문제는 물음이 따로 있습니다. 어휘는 회차 공통 문구를 씁니다 */
    $('question-label').textContent = q.ask || defaultLabel;

    var wordBox = $('question-word');
    wordBox.textContent = q.word;
    wordBox.hidden = (q.word === '');
    wordBox.classList.toggle('is-sentence', q.word.length > 8);
    wordBox.classList.toggle('is-long', q.word.length > 40);

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
      comment = '훌륭해요.\n조금만 더 다듬으면 완벽합니다.';
    } else if (percent >= 60) {
      comment = '기본기는 있어요.\n틀린 어휘를 복습해봐요.';
    } else {
      comment = '아직 헷갈리는 어휘가 많아요.\n해설을 꼭 읽어보세요.';
    }
    $('result-comment').textContent = comment;

    showRetestNote(correct);

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

  /* 맞힌 개수가 기준(RETEST_MAX) 이하이면 재시험을 보라고 안내합니다.
     '다시 보기'는 누구나 누를 수 있지만, 이 경우에는 꼭 봐야 합니다. */
  function retestMax() {
    return (typeof RETEST_MAX === 'number' && RETEST_MAX >= 0) ? RETEST_MAX : 10;
  }

  function showRetestNote(correct) {
    var box = $('retest-note');

    if (correct > retestMax()) {
      box.hidden = true;
      return;
    }

    /* 안내 내용은 index.html 에 적혀 있고, 기준 개수만 여기서 채웁니다 */
    $('retest-title').textContent =
      '정답이 ' + retestMax() + '개 이하예요.\n재시험을 봐야 합니다.';
    box.hidden = false;
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
      var parts = splitExplanation(q.explanation);

      var exp = document.createElement('p');
      exp.className = 'explanation';
      exp.textContent = parts.meaning;
      item.appendChild(exp);

      if (parts.example) {
        var ex = document.createElement('p');
        ex.className = 'example';

        var tag = document.createElement('span');
        tag.className = 'example-label';
        tag.textContent = parts.label;
        ex.appendChild(tag);
        ex.appendChild(document.createTextNode(parts.example));

        item.appendChild(ex);
      }
    }

    return item;
  }

  /* 해설을 '뜻풀이'와 '예문'으로 나눕니다.
     해설에 '예)' 나 '유래)' 가 있으면 그 뒤가 예문입니다. */
  function splitExplanation(text) {
    var m = /\s*(예|유래)\)\s*/.exec(text);

    if (!m) {
      return { meaning: breakSenses(text), example: '', label: '' };
    }

    return {
      meaning: breakSenses(text.slice(0, m.index).trim()),
      example: text.slice(m.index + m[0].length).trim(),
      label: m[1] === '유래' ? '유래' : '예문'
    };
  }

  /* ① ② ③ 처럼 뜻이 여러 개면 줄을 나눠 줍니다 */
  function breakSenses(text) {
    return text.replace(/ (?=[①②③④⑤])/g, '\n').trim();
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
      roundTitle: (SUBJECT === '문법' ? '[문법] ' : '') + state.round.title,
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
        box.textContent = '기록이 저장되었습니다.\n(선생님께 전송 완료)';
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

  /* ---------- 재원생 확인 ---------- */

  /* 재원생 명단에 있는 학생인지 서버에 물어본 뒤에 시작합니다.
     명단에 없으면 시험을 시작할 수 없습니다.
     (링크만 아는 사람이 들어와도 풀 수 없게 하기 위한 것입니다) */
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
        VocabStore.rememberStudent(student);

        /* 그 반의 이번 주 숙제 회차를 읽은 뒤 회차 화면을 보여 줍니다 */
        VocabStore.homeworkRound(state.group, SUBJECT).then(function (h) {
          homeworkRound = h.round || '';
          renderRounds();
        });
        return;
      }

      showStartError(r);
    });
  }

  /* 시작하지 못한 이유를 학생이 알아들을 수 있게 알려 줍니다 */
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
      defaultLabel = QUIZ_QUESTION_LABEL;
    }
    if (SUBJECT === '문법') {
      defaultLabel = '알맞은 것을 고르세요.';
    }
    $('question-label').textContent = defaultLabel;

    if (typeof QUIZ_TITLE === 'string' && QUIZ_TITLE.trim() !== '') {
      /* 첫 화면에는 로고만 두었습니다. 제목 자리가 있으면 그때만 채웁니다 */
      var titleBox = $('quiz-title');
      if (titleBox) titleBox.textContent = QUIZ_TITLE;
      document.title = QUIZ_TITLE;
    }

    $('btn-back-start').addEventListener('click', function () {
      show('start');
      $('student-name').focus();
    });

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

    /* 지난번에 시험 본 학생이면 입력칸을 미리 채워 줍니다 */
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
