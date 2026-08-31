/* =========================================================
   선생님용 화면 동작 파일
   (학생 화면과 완전히 분리되어 있습니다)
   ========================================================= */

(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var allRows = [];     /* 서버에서 받아온 전체 시험 기록 */
  var allRoster = null; /* 서버에서 받아온 전체 명단 */
  var statGroup = '';   /* 통계에서 볼 반 (빈 값이면 전체) */
  var rows = [];        /* 지금 화면에 쓰는 시험 기록 (고른 반만) */
  var myPassword = '';  /* 이번에 들어올 때 쓴 비밀번호 (문제 올릴 때 다시 씁니다) */
  var roster = null;    /* 재원생 명단 기준 누적 (명단을 넣어 둔 경우에만) */

  var GRADE_ORDER = ['고3', '고2', '고1', '중3', '중2', '중1'];

  var sorts = {
    'table-grade':    { key: 'order',     desc: false },
    'table-roster-high': { key: 'name',   desc: false },
    'table-roster-mid':  { key: 'name',   desc: false },
    'table-rounds':   { key: 'avg',       desc: true },
    'table-students': { key: 'avg',       desc: true },
    'table-all':      { key: 'savedAt',   desc: true }
  };

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

    VocabStore.fetchAll(password).then(function (r) {
      if (r.ok) {
        err.hidden = true;
        myPassword = password;
        show(r.rows, '전체 학생 기록입니다.');

        loadHomework();

        VocabStore.fetchStudents(password).then(function (sr) {
          allRoster = sr.ok ? sr.rows : null;
          applyGroup();
          render();
        });
        return;
      }

      if (r.code === 'wrong-password') {
        err.textContent = '비밀번호가 맞지 않습니다.';
        err.hidden = false;
        return;
      }

      /* 서버 설정 전이라면 이 기기에 저장된 기록만 보여 줍니다 */
      if (r.code === 'not-set-up' || r.code === 'no-server' || r.code === 'offline') {
        if (password === VocabStore.teacherPassword()) {
          err.hidden = true;
          show(VocabStore.all(),
            '이 기기에 저장된 기록만 보고 있습니다.\n전체 학생 기록을 보려면 수파베이스 설정이 필요합니다.');
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

  function show(list, note) {
    allRows = list || [];
    allRoster = null;
    applyGroup();
    $('source-note').textContent = note;
    $('export-state').hidden = true;
    render();
    $('screen-login').hidden = true;
    $('screen-board').hidden = false;
    window.scrollTo(0, 0);
  }

  function logout() {
    allRows = [];
    rows = [];
    myPassword = '';
    allRoster = null;
    roster = null;
    $('password').value = '';
    $('login-error').hidden = true;
    $('screen-board').hidden = true;
    $('screen-login').hidden = false;
    window.scrollTo(0, 0);
  }

  /* ---------- 계산 ---------- */

  function studentKeyOf(r) {
    return r.name + '|' + r.school + '|' + r.phone4;
  }

  /* 이름(띄어쓰기 무시) + 학부모 연락처 뒷 4자리로 같은 학생을 찾습니다.
     (앱의 다른 곳과 같은 기준입니다) */
  function identityOf(name, phone) {
    var key = String(name || '').replace(/\s/g, '').toLowerCase();
    var four = String(phone || '').replace(/[^0-9]/g, '').slice(-4);
    return key + '|' + four;
  }

  /* 고른 반의 기록·명단만 남깁니다 */
  function applyGroup() {
    roster = allRoster;
    rows = allRows;

    if (!statGroup) { return; }

    if (allRoster) {
      roster = allRoster.filter(function (r) { return (r.group || '고등부') === statGroup; });

      /* 그 반 학생만 남기려면 누가 그 반인지 알아야 합니다 */
      var mine = {};
      roster.forEach(function (r) { mine[identityOf(r.name, r.parentPhone)] = true; });
      rows = allRows.filter(function (r) { return mine[identityOf(r.name, r.phone4)]; });
    }
  }

  function roundStats() {
    var map = {};
    rows.forEach(function (r) {
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
    rows.forEach(function (r) {
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

  function gradeStats() {
    var map = {};
    (roster || []).forEach(function (r) {
      var g = r.grade || '미분류';
      var m = map[g] || (map[g] = { grade: g, count: 0, taken: 0, sum: 0 });
      m.count += 1;
      if (r.count > 0) { m.taken += 1; m.sum += r.avg; }
    });
    return Object.keys(map).map(function (k) {
      var m = map[k];
      var idx = GRADE_ORDER.indexOf(m.grade);
      return {
        grade: m.grade, count: m.count, taken: m.taken,
        notYet: m.count - m.taken,
        avg: m.taken ? Math.round(m.sum / m.taken) : 0,
        order: idx === -1 ? GRADE_ORDER.length : idx
      };
    });
  }

  function sortRows(list, sort) {
    var out = list.slice();
    out.sort(function (a, b) {
      var x = a[sort.key], y = b[sort.key];
      if (typeof x === 'number' && typeof y === 'number') return sort.desc ? y - x : x - y;
      x = String(x == null ? '' : x);
      y = String(y == null ? '' : y);
      return sort.desc ? y.localeCompare(x, 'ko') : x.localeCompare(y, 'ko');
    });
    return out;
  }

  /* ---------- 그리기 ---------- */

  function render() {
    var students = studentStats();
    var sum = rows.reduce(function (a, r) { return a + r.percent; }, 0);

    $('summary').innerHTML = '';
    [
      ['학생', students.length + '명'],
      ['시험', rows.length + '번'],
      ['평균 정답률', (rows.length ? Math.round(sum / rows.length) : 0) + '%']
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
      $('summary').appendChild(box);
    });

    var area = $('roster-area');
    if (roster) {
      area.hidden = false;
      var notYet = roster.filter(function (r) { return r.count === 0; }).length;
      $('roster-note').textContent =
        '현재 재원생 ' + roster.length + '명 중 ' + (roster.length - notYet) + '명 응시' +
        (notYet > 0 ? ' · 아직 안 본 학생 ' + notYet + '명' : '');

      fill('table-grade', sortRows(gradeStats(), sorts['table-grade']), function (r) {
        return [r.grade, r.count + '명', r.taken + '명',
                r.notYet === 0 ? '—' : r.notYet + '명',
                r.taken === 0 ? '—' : r.avg + '%'];
      });

      /* 명단은 반마다 따로 보여 줍니다 */
      [['high', '고등부'], ['mid', '중등부']].forEach(function (pair) {
        var id = pair[0], name = pair[1];
        var mine = roster.filter(function (r) { return (r.group || '고등부') === name; });

        $('roster-box-' + id).hidden = (mine.length === 0);
        if (mine.length === 0) { return; }

        var done = mine.filter(function (r) { return r.count > 0; }).length;
        $('roster-head-' + id).textContent =
          name + ' ' + mine.length + '명 · ' + done + '명 응시';

        fill('table-roster-' + id, sortRows(mine, sorts['table-roster-' + id]), function (r) {
          return [r.name, r.school,
                  r.count === 0 ? '—' : r.count + '번',
                  r.count === 0 ? '—' : r.avg + '%',
                  r.count === 0 ? '아직 안 봄' : shortDate(r.last)];
        });
      });
    } else {
      area.hidden = true;
    }

    fill('table-rounds', sortRows(roundStats(), sorts['table-rounds']), function (r) {
      return [r.title, r.students + '명', r.count + '번', r.avg + '%'];
    });

    fill('table-students', sortRows(students, sorts['table-students']), function (r) {
      return [r.name, r.school, r.count + '번', r.avg + '%', shortDate(r.last)];
    });

    fill('table-all', sortRows(rows, sorts['table-all']), function (r) {
      return [r.name, r.school, r.roundTitle,
              r.correct + '/' + r.total + ' (' + r.percent + '%)', shortDate(r.savedAt)];
    });
  }

  function fill(tableId, list, toCells) {
    var table = $(tableId);
    var body = table.querySelector('tbody');
    body.innerHTML = '';

    if (list.length === 0) {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = table.querySelectorAll('th').length;
      td.className = 'empty-cell';
      td.textContent = '기록이 없습니다.';
      tr.appendChild(td);
      body.appendChild(tr);
    } else {
      list.forEach(function (r) {
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

    var sort = sorts[tableId];
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

  function setupSorting() {
    Object.keys(sorts).forEach(function (id) {
      var table = $(id);
      if (!table) return;
      Array.prototype.forEach.call(table.querySelectorAll('th[data-sort]'), function (th) {
        th.addEventListener('click', function () {
          var key = th.getAttribute('data-sort');
          var sort = sorts[id];
          if (sort.key === key) { sort.desc = !sort.desc; }
          else { sort.key = key; sort.desc = true; }
          render();
        });
      });
    });
  }

  /* ---------- 이번 주 숙제 회차 ---------- */

  function homeworkGroup() {
    return $('homework-group').value || '고등부';
  }

  function fillHomeworkPicker(current) {
    var pick = $('homework-pick');
    var group = homeworkGroup();
    pick.innerHTML = '';

    var all = document.createElement('option');
    all.value = '';
    all.textContent = '모든 회차 열기 (숙제 지정 안 함)';
    pick.appendChild(all);

    var count = 0;
    if (typeof ROUNDS !== 'undefined' && Array.isArray(ROUNDS)) {
      ROUNDS.forEach(function (r) {
        if ((r.group || '고등부') !== group) { return; }
        count += 1;
        var op = document.createElement('option');
        op.value = r.title;
        op.textContent = r.title;
        pick.appendChild(op);
      });
    }

    if (count === 0) {
      all.textContent = group + ' 회차가 아직 없습니다';
    }

    pick.value = current || '';
  }

  function loadHomework() {
    VocabStore.homeworkRound(homeworkGroup()).then(function (r) {
      fillHomeworkPicker(r.round || '');
      if (!r.ok) {
        var box = $('homework-state');
        box.hidden = false;
        box.className = 'check-state';
        box.textContent = '수파베이스에서 숙제 회차를 읽지 못했습니다.\n' +
                          'supabase-반나누기.sql 을 실행했는지 확인해주세요.';
      }
    });
  }

  function saveHomework() {
    var box = $('homework-state');
    var round = $('homework-pick').value;
    var group = homeworkGroup();

    box.hidden = false;
    box.className = 'check-state';
    box.textContent = '정하는 중…';

    VocabStore.setHomeworkRound(myPassword, round, group).then(function (r) {
      if (r.ok) {
        box.className = 'check-state is-ok';
        box.textContent = round
          ? (group + ' 이번 주 숙제를 ' + round + ' 로 정했습니다.\n' +
             group + ' 학생에게는 이 회차만 열립니다.')
          : (group + ' 의 모든 회차를 열었습니다.\n' +
             group + ' 학생이 아무 회차나 고를 수 있습니다.');
        return;
      }
      box.className = 'check-state is-bad';
      if (r.code === 'not-set-up') {
        box.textContent = '수파베이스에 반별 숙제 회차 설정이 아직 없습니다.\n' +
                          'SQL Editor 에서 supabase-반나누기.sql 을 실행해주세요.';
      } else if (r.code === 'wrong-password') {
        box.textContent = '비밀번호가 맞지 않습니다. 나갔다가 다시 들어와 주세요.';
      } else if (r.code === 'no-server' || r.code === 'offline') {
        box.textContent = '수파베이스에 연결하지 못했습니다.';
      } else {
        box.textContent = '정하지 못했습니다.\n' + (r.detail || '');
      }
    });
  }

  /* ---------- 문제 은행 올리기 ---------- */

  /* 앱에 들어 있는 문제를 수파베이스가 받을 모양으로 바꿉니다 */
  function allQuestions() {
    if (typeof ROUNDS === 'undefined' || !Array.isArray(ROUNDS)) return [];
    var out = [];
    ROUNDS.forEach(function (r) {
      r.questions.forEach(function (q) {
        out.push({
          round_title: r.title,
          word: q.word,
          hanja: q.hanja || '',
          correct_answer: q.choices[q.answer - 1],
          choices: q.choices,
          explanation: q.explanation || ''
        });
      });
    });
    return out;
  }

  function showBankNote() {
    var list = allQuestions();
    var rounds = {};
    list.forEach(function (q) { rounds[q.round_title] = true; });
    $('bank-note').textContent =
      '이 앱에 들어 있는 문제: ' + Object.keys(rounds).length + '회차 ' + list.length + '문제';
    $('btn-upload').disabled = list.length === 0;
  }

  function uploadQuestions() {
    var box = $('upload-state');
    var list = allQuestions();

    box.hidden = false;
    box.className = 'check-state';
    box.textContent = list.length + '문제를 올리는 중…';

    VocabStore.syncQuestions(myPassword, list).then(function (r) {
      if (r.ok) {
        box.className = 'check-state is-ok';
        box.textContent = '올렸습니다.\n새로 들어간 문제 ' + r.added + '개, 내용을 새로 맞춘 문제 ' +
                          r.updated + '개.\n문제 은행에 모두 ' + r.total + '문제가 들어 있습니다.';
        return;
      }
      box.className = 'check-state is-bad';
      if (r.code === 'not-set-up') {
        box.textContent = '수파베이스에 문제 은행 설정이 아직 없습니다.\n' +
                          'SQL Editor 에서 supabase-문제은행.sql 을 실행해주세요.';
      } else if (r.code === 'wrong-password') {
        box.textContent = '비밀번호가 맞지 않습니다. 나갔다가 다시 들어와 주세요.';
      } else if (r.code === 'no-server' || r.code === 'offline') {
        box.textContent = '수파베이스에 연결하지 못했습니다.';
      } else {
        box.textContent = '올리지 못했습니다.\n' + (r.detail || '');
      }
    });
  }

  /* ---------- 내려받기 ---------- */

  function exportCsv() {
    var note = $('export-state');
    note.hidden = false;

    if (rows.length === 0) {
      note.textContent = '내려받을 기록이 없습니다.';
      return;
    }

    note.textContent = '내려받는 중…';
    downloadFile('어휘테스트_전체기록.csv', '﻿' + VocabStore.toCsv(rows)).then(function (ok) {
      note.textContent = ok
        ? (rows.length + '개의 기록을 내려받았습니다.')
        : '이 화면에서는 파일을 내려받을 수 없습니다.';
    });
  }

  function downloadFile(filename, text) {
    if (window.claude && typeof window.claude.use === 'function') {
      return window.claude.use('downloads').then(function (downloads) {
        if (!downloads) return browserDownload(filename, text);
        return downloads.save({ filename: filename, data: text })
          .then(function () { return true; })
          .catch(function () { return false; });
      }).catch(function () { return browserDownload(filename, text); });
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

  /* ---------- 첫 실행 ---------- */

  $('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    login($('password').value.trim());
  });

  $('btn-logout').addEventListener('click', logout);
  $('btn-export').addEventListener('click', exportCsv);
  $('btn-upload').addEventListener('click', uploadQuestions);
  $('btn-homework').addEventListener('click', saveHomework);

  /* 반을 바꾸면 그 반의 회차 목록과 지금 정해진 회차를 다시 읽습니다 */
  $('homework-group').addEventListener('change', function () {
    $('homework-state').hidden = true;
    loadHomework();
  });

  /* 통계에서 볼 반을 바꿉니다 */
  $('stat-group').addEventListener('change', function () {
    statGroup = this.value;
    applyGroup();
    render();
  });

  showBankNote();

  setupSorting();
  $('password').focus();
})();
