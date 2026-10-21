/* =========================================================
   통합 첫 화면 '보라! 국어' 동작 파일 (index.html)

   학생은 바탕화면 아이콘 하나로 들어와서
   이름을 한 번 확인받고, 어휘·문법·모의고사·독해 중 하나를 고릅니다.
   고른 과목 화면은 이름을 다시 묻지 않고 바로 회차 고르기로 들어갑니다.
   (넘겨주는 곳은 storage.js 의 passStudent, 받는 곳은 각 과목의 enterFromHub)
   ========================================================= */

(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var screens = {
    start: $('screen-start'),
    subjects: $('screen-subjects'),
    history: $('screen-history')
  };

  var student = null;          /* { name, school, phone4 } */
  var historyBackTo = 'start';

  /* ---------- 화면 바꾸기 ---------- */

  /* 이름 입력은 진한 보라, 과목 고르기·내 기록은 연보라 바탕입니다 */
  function show(name) {
    Object.keys(screens).forEach(function (key) {
      screens[key].hidden = (key !== name);
    });
    paintBackground(name === 'start');
    window.scrollTo(0, 0);
  }

  function paintBackground(deep) {
    var root = document.documentElement;
    if (deep) { root.classList.add('on-rounds'); }
    else { root.classList.remove('on-rounds'); }

    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) { return; }
    var color = getComputedStyle(root)
      .getPropertyValue(deep ? '--brand-deep' : '--bg').trim();
    if (color) { meta.setAttribute('content', color); }
  }

  /* ---------- 과목 고르기 ---------- */

  function showSubjects(info) {
    $('hub-name').textContent = info.name;
    $('hub-grade').textContent = info.grade ? (' · ' + info.grade) : '';
    show('subjects');
  }

  /* ---------- 학생 확인 ---------- */

  function readStudentForm() {
    return {
      name: $('student-name').value.trim(),
      school: $('student-school').value.trim(),
      phone4: $('student-phone4').value.trim()
    };
  }

  function checkStudent(s) {
    if (s.name === '') return '학생 이름을 입력해주세요.';
    if (s.school === '') return '학교를 입력해주세요.';
    if (!/^[0-9]{4}$/.test(s.phone4)) return '학부모님 전화번호 뒷 4자리를 숫자 4자리로 입력해주세요.';
    return '';
  }

  /* 재원생 명단에 있는 학생만 과목 고르기로 넘어갑니다 */
  function startIfEnrolled(s) {
    var btn = $('btn-start');
    var label = btn.textContent;

    btn.disabled = true;
    btn.textContent = '확인하는 중…';

    VocabStore.isEnrolled(s).then(function (r) {
      btn.disabled = false;
      btn.textContent = label;

      if (r.ok && r.enrolled) {
        student = s;
        VocabStore.rememberStudent(s);
        var info = {
          name: s.name, school: s.school, phone4: s.phone4,
          group: r.group || '고등부', grade: r.grade || ''
        };
        VocabStore.passStudent(info);
        showSubjects(info);
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

  /* ---------- 내 기록 (네 과목 모두) ---------- */

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var two = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '. ' + two(d.getMonth() + 1) + '. ' + two(d.getDate()) +
           ' ' + two(d.getHours()) + ':' + two(d.getMinutes());
  }

  /* 회차 이름 앞머리로 과목을 가립니다 (선생님 화면의 subjectOf 와 같은 규칙) */
  function subjectOf(title) {
    title = String(title || '');
    if (title.indexOf('[모의고사]') === 0) return '모의고사';
    if (title.indexOf('[문법]') === 0) return '문법';
    if (title.indexOf('[독해]') === 0) return '독해';
    if (title.indexOf('[내신]') === 0) return '내신';
    return '어휘';
  }

  function refreshHistoryButton() {
    var s = readStudentForm();
    var btn = $('btn-my-history');
    if (checkStudent(s) !== '') { btn.hidden = true; return; }
    btn.hidden = VocabStore.listFor(s).length === 0;
  }

  function renderHistory(cameFrom) {
    historyBackTo = cameFrom;

    var records = VocabStore.listFor(student);
    $('history-who').textContent = student.name + ' 학생';

    var box = $('history-list');
    box.innerHTML = '';

    $('history-summary').textContent = records.length === 0
      ? '아직 기록이 없습니다.'
      : '모두 ' + records.length + '번 응시했습니다.';

    records.forEach(function (r) { box.appendChild(historyItem(r)); });
    show('history');
  }

  function historyItem(r) {
    var subject = subjectOf(r.roundTitle);

    var item = document.createElement('div');
    item.className = 'history-item';

    var left = document.createElement('div');
    left.className = 'history-main';

    var title = document.createElement('p');
    title.className = 'history-round';
    /* 앞머리 [문법] 등은 떼고, 앞에 과목 이름을 작게 붙입니다 */
    var tag = document.createElement('span');
    tag.className = 'history-subject';
    tag.textContent = subject;
    title.appendChild(tag);
    title.appendChild(document.createTextNode(
      String(r.roundTitle || '').replace(/^\[(모의고사|문법|독해|내신)\]\s*/, '')));
    left.appendChild(title);

    var when = document.createElement('p');
    when.className = 'history-when';
    when.textContent = formatDate(r.savedAt);
    left.appendChild(when);

    var score = document.createElement('p');
    score.className = 'history-score';
    if (subject === '모의고사' || subject === '내신') {
      score.textContent = r.percent + '점';   /* 모의고사·내신은 100점 만점 점수입니다 */
    } else {
      score.textContent = r.correct + '/' + r.total;
      var pct = document.createElement('span');
      pct.className = 'history-percent';
      pct.textContent = r.percent + '%';
      score.appendChild(pct);
    }

    item.appendChild(left);
    item.appendChild(score);
    return item;
  }

  /* ---------- 첫 실행 ---------- */

  function init() {
    $('start-form').addEventListener('submit', function (e) {
      e.preventDefault();

      var s = readStudentForm();
      var problem = checkStudent(s);
      if (problem !== '') {
        $('name-error').textContent = problem;
        $('name-error').hidden = false;
        return;
      }

      $('name-error').hidden = true;
      startIfEnrolled(s);
    });

    ['student-name', 'student-school', 'student-phone4'].forEach(function (id) {
      $(id).addEventListener('input', refreshHistoryButton);
    });

    /* 전화번호 칸에는 숫자만 남깁니다 */
    $('student-phone4').addEventListener('input', function () {
      this.value = this.value.replace(/[^0-9]/g, '').slice(0, 4);
    });

    /* 이름 다시 입력 — 넘겨 둔 학생 정보를 지우고 처음으로 */
    $('btn-rename').addEventListener('click', function () {
      VocabStore.forgetPassedStudent();
      student = null;
      show('start');
      $('student-name').focus();
    });

    $('btn-my-history').addEventListener('click', function () {
      student = readStudentForm();
      renderHistory('start');
    });

    $('btn-back-from-history').addEventListener('click', function () {
      show(historyBackTo);
    });

    /* 지난번에 못 보낸 기록이 있으면 조용히 다시 보냅니다 */
    VocabStore.resend();

    var last = VocabStore.lastStudent();
    if (last) {
      $('student-name').value = last.name || '';
      $('student-school').value = last.school || '';
      $('student-phone4').value = last.phone4 || '';
    }
    refreshHistoryButton();

    /* 과목 화면에서 '과목 고르기' 로 돌아왔으면 이름을 다시 묻지 않습니다 */
    var passed = VocabStore.passedStudent();
    if (passed) {
      student = { name: passed.name, school: passed.school, phone4: passed.phone4 };
      showSubjects(passed);
      return;
    }

    show('start');
  }

  init();
})();
