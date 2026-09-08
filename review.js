/* =========================================================
   문제 검토판 (선생님용)

   학생에게 내기 전에 한 회차의 문제·정답·해설을 모두 펼쳐 봅니다.
   문제 파일(questions.js / questions-grammar.js)을 그대로 읽으므로
   파일을 고치면 이 화면도 바로 따라 바뀝니다.
   ========================================================= */

(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- 들어가기 ---------- */

  function login(password) {
    var err = $('login-error');

    if (password === '') {
      err.textContent = '비밀번호를 입력해주세요.';
      err.hidden = false;
      return;
    }

    err.textContent = '확인하는 중…';
    err.hidden = false;

    /* 선생님 비밀번호인지 서버에 물어봅니다 (비밀번호를 앱에 적어 두지 않습니다) */
    VocabStore.teacherRole(password).then(function (t) {
      if (t && t.role) {
        err.hidden = true;
        $('screen-login').hidden = true;
        $('screen-review').hidden = false;
        fillRounds();
        window.scrollTo(0, 0);
        return;
      }
      err.textContent = '비밀번호가 맞지 않습니다.';
      err.hidden = false;
    }).catch(function () {
      err.textContent = '서버에 연결하지 못했습니다.';
      err.hidden = false;
    });
  }

  /* ---------- 회차 고르기 ---------- */

  function roundsOf(subject) {
    if (subject === '문법') {
      return (typeof GRAMMAR_ROUNDS !== 'undefined' && GRAMMAR_ROUNDS) || [];
    }
    return (typeof ROUNDS !== 'undefined' && ROUNDS) || [];
  }

  function fillRounds() {
    var list = roundsOf($('pick-subject').value);
    var pick = $('pick-round');
    pick.innerHTML = '';

    list.forEach(function (r, i) {
      var opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = r.title + ' (' + (r.questions || []).length + '문제)';
      pick.appendChild(opt);
    });

    /* 새로 만든 회차가 대개 맨 뒤에 있으므로 마지막 회차부터 보여 줍니다 */
    pick.value = String(Math.max(0, list.length - 1));
    draw();
  }

  /* ---------- 그리기 ---------- */

  function choicesOf(q) {
    return q.ox ? ['O', 'X'] : (q.choices || []);
  }

  /* 선생님 화면의 '문제별 정답률' 에서 쓰는 이름과 같은 규칙입니다 */
  function nameOf(q) {
    var ch = choicesOf(q);
    return q.name || q.word || q.sentence || ch[q.answer - 1] || q.ask || '';
  }

  function isSimple(q) {
    return q.ox || choicesOf(q).length <= 2;
  }

  function draw() {
    var list = roundsOf($('pick-subject').value);
    var round = list[Number($('pick-round').value)] || null;
    var box = $('question-list');
    box.innerHTML = '';
    $('notes').innerHTML = '';
    $('summary').innerHTML = '';

    if (!round) {
      $('round-title').textContent = '회차가 없습니다';
      $('round-sub').textContent = '';
      return;
    }

    var qs = round.questions || [];
    $('round-title').textContent = round.title;
    $('round-sub').textContent =
      (round.subtitle || '') +
      (round.group ? '  ·  ' + round.group : '');

    drawSummary(round, qs);
    drawNotes(round, qs);

    qs.forEach(function (q, i) {
      box.appendChild(card(q, i + 1));
    });
  }

  function drawSummary(round, qs) {
    var simple = qs.filter(isSimple).length;
    var pairs = [
      ['문제', qs.length + '개'],
      ['단순', simple + '개'],
      ['객관식', (qs.length - simple) + '개']
    ];

    if (round.mix) {
      pairs.push(['한 시험에',
        (round.mix['단순'] || 0) + ' + ' + (round.mix['객관식'] || 0)]);
    }

    pairs.forEach(function (pair) {
      var item = document.createElement('div');
      item.className = 'summary-item';
      var v = document.createElement('p');
      v.className = 'summary-value';
      v.textContent = pair[1];
      var t = document.createElement('p');
      t.className = 'summary-label';
      t.textContent = pair[0];
      item.appendChild(v);
      item.appendChild(t);
      $('summary').appendChild(item);
    });
  }

  /* 검토할 때 눈여겨볼 것들을 몇 줄로 알려 줍니다 */
  function drawNotes(round, qs) {
    var notes = [];

    /* OX 답이 한쪽으로 쏠렸는지 */
    var ox = qs.filter(function (q) { return q.ox; });
    if (ox.length) {
      var o = ox.filter(function (q) { return q.answer === 1; }).length;
      var x = ox.length - o;
      notes.push({
        bad: (Math.min(o, x) * 3 < Math.max(o, x)),
        text: 'OX 문제 ' + ox.length + '개의 답은 O ' + o + '개 · X ' + x + '개입니다.' +
              ((Math.min(o, x) * 3 < Math.max(o, x))
                ? ' 한쪽으로 쏠려 있어 찍어도 맞을 수 있습니다.' : '')
      });
    }

    /* 갈래마다 몇 개인지, 한 시험에 몇 개까지 나오는지 */
    var kinds = {};
    qs.forEach(function (q) { if (q.kind) { kinds[q.kind] = (kinds[q.kind] || 0) + 1; } });
    Object.keys(kinds).forEach(function (k) {
      var cap = round.limit && round.limit[k];
      notes.push({
        bad: false,
        text: '갈래 ' + k + ' : ' + kinds[k] + '개' +
              (cap != null ? ' (한 시험에 많아야 ' + cap + '개)' : ' (개수를 정해 두지 않았습니다)')
      });
    });

    /* 한 시험을 채울 만큼 있는지 */
    if (round.mix) {
      var simple = qs.filter(isSimple).length;
      var choice = qs.length - simple;
      if (simple < (round.mix['단순'] || 0)) {
        notes.push({ bad: true, text: '단순 문제가 ' + simple + '개뿐이라 한 시험에 넣을 ' +
          round.mix['단순'] + '개를 채우지 못합니다.' });
      }
      if (choice < (round.mix['객관식'] || 0)) {
        notes.push({ bad: true, text: '객관식이 ' + choice + '개뿐이라 한 시험에 넣을 ' +
          round.mix['객관식'] + '개를 채우지 못합니다.' });
      }
    }

    /* 앱이 막아 주지 못하는 실수들 */
    var seen = {}, dup = [], broken = [];
    qs.forEach(function (q, i) {
      var ch = choicesOf(q);
      var no = i + 1;
      if (!ch.length) { broken.push(no + '번: 보기가 없습니다'); }
      if (!(q.answer >= 1 && q.answer <= ch.length)) {
        broken.push(no + '번: 정답 번호가 보기 수와 맞지 않습니다');
      }
      if (!q.explanation) { broken.push(no + '번: 해설이 비어 있습니다'); }
      if (!q.ox && ch.length !== new Set(ch).size) {
        broken.push(no + '번: 보기에 같은 말이 두 번 있습니다');
      }
      var nm = nameOf(q);
      if (seen[nm]) { dup.push(no + '번과 ' + seen[nm] + '번: “' + nm + '”'); }
      else { seen[nm] = no; }
    });

    dup.forEach(function (d) {
      notes.push({ bad: true, text: '이름이 겹칩니다 — ' + d +
        '. 통계에서 한 칸을 나눠 쓰니 한쪽에 name 을 적어 주세요.' });
    });
    broken.forEach(function (b) { notes.push({ bad: true, text: b }); });

    if (!dup.length && !broken.length) {
      notes.push({ bad: false, text: '보기·정답·해설·이름에 빠지거나 겹친 것은 없습니다.' });
    }

    notes.forEach(function (n) {
      var li = document.createElement('li');
      li.className = n.bad ? 'review-note is-bad' : 'review-note';
      li.textContent = n.text;
      $('notes').appendChild(li);
    });
  }

  function card(q, no) {
    var wrap = document.createElement('div');
    wrap.className = 'review-card';

    var head = document.createElement('p');
    head.className = 'review-no';
    head.textContent = no + '번' + (q.kind ? '  ·  ' + q.kind : '') +
                       (q.ox ? '  ·  OX' : '  ·  보기 ' + choicesOf(q).length + '개');
    wrap.appendChild(head);

    if (q.ask) {
      var ask = document.createElement('p');
      ask.className = 'review-ask';
      ask.textContent = q.ask;
      wrap.appendChild(ask);
    }

    var big = q.word || q.sentence || '';
    if (big) {
      var word = document.createElement('p');
      word.className = 'review-word';
      word.textContent = big;
      if (q.hanja) {
        var h = document.createElement('span');
        h.className = 'review-hanja';
        h.textContent = ' ' + q.hanja;
        word.appendChild(h);
      }
      wrap.appendChild(word);
    }

    var ul = document.createElement('ul');
    ul.className = 'review-choices';
    choicesOf(q).forEach(function (c, i) {
      var li = document.createElement('li');
      li.className = (i + 1 === q.answer) ? 'review-choice is-answer' : 'review-choice';
      li.textContent = c;
      ul.appendChild(li);
    });
    wrap.appendChild(ul);

    var ex = document.createElement('p');
    ex.className = 'review-explain';
    ex.textContent = q.explanation || '(해설 없음)';
    wrap.appendChild(ex);

    /* 기록·문제 은행에 어떤 이름으로 남는지 (통계에서 문제를 구분하는 이름) */
    var nm = document.createElement('p');
    nm.className = 'review-name';
    nm.textContent = '기록에 남을 이름: ' + nameOf(q);
    wrap.appendChild(nm);

    return wrap;
  }

  /* ---------- 화면 붙이기 ---------- */

  $('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    login($('password').value.trim());
  });

  $('btn-logout').addEventListener('click', function () {
    $('password').value = '';
    $('login-error').hidden = true;
    $('screen-review').hidden = true;
    $('screen-login').hidden = false;
    window.scrollTo(0, 0);
  });

  $('pick-subject').addEventListener('change', fillRounds);
  $('pick-round').addEventListener('change', draw);
  $('btn-print').addEventListener('click', function () { window.print(); });

  $('password').focus();
})();
