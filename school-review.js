/* =========================================================
   선생님 화면 — 내신 성적표 검토 (teacher.html 의 '내신 성적표 검토' 칸)

   학생이 보낸 기록을 시험마다 모아 보여 줍니다.
   학생 한 명을 누르면
     - 학생이 누른 틀린 문항·헤맨 문항을 고칠 수 있고 (시험지와 다르게 누른 경우)
     - 부족한 점 · 보완할 점에 선생님 문장을 더하고
     - 선생님 한마디를 적은 뒤
     - '저장' 또는 '학생에게 공개' 를 누릅니다.
   아래 미리보기는 학생이 받을 성적표와 똑같습니다. (school-report.js 로 그림)
   공개하기 전까지 학생에게는 '학생 분석리포트를 준비 중입니다' 가 보입니다.
   ========================================================= */

var SchoolReview = (function () {
  'use strict';

  var R = SchoolReport;
  var $ = function (id) { return document.getElementById(id); };
  var el = R.el;

  var password = '';
  var rows = [];          /* 선생님 화면이 받아 온 전체 기록 */
  var exam = null;        /* 고른 시험 */
  var reports = {};       /* 학생 열쇠 → 서버에 저장된 성적표 */
  var current = null;     /* 지금 고치는 학생 { student, marks, weak, fix, comment, published } */

  function keyOf(name, phone4) {
    return String(name || '').replace(/\s/g, '').toLowerCase() + '|' + String(phone4 || '').replace(/[^0-9]/g, '');
  }

  /* 검토를 마친 시험만 고를 수 있습니다 */
  function reviewedExams() { return R.allExams().filter(R.isReviewed); }

  function start(pass, allRows) {
    password = pass;
    rows = allRows || [];
    var box = $('school-review');
    if (!box) { return; }
    box.hidden = false;

    var pick = $('review-exam');
    pick.innerHTML = '';
    var list = reviewedExams();
    if (!list.length) {
      pick.appendChild(el('option', null, '검토를 마친 시험이 없습니다'));
      pick.disabled = true;
      $('review-list').innerHTML = '';
      return;
    }
    pick.disabled = false;
    list.forEach(function (e) {
      var label = R.examLabel(e);
      var n = latestRecords(label).length;
      var op = el('option', null, label + ' (' + n + '명 기록)');
      op.value = label;
      pick.appendChild(op);
    });
    pick.onchange = function () { chooseExam(pick.value); };
    chooseExam(pick.value);
  }

  /* 한 시험에 학생마다 가장 최근 기록 하나 */
  function latestRecords(label) {
    var title = '[내신] ' + label;
    var seen = {};
    rows.filter(function (r) { return r.roundTitle === title; })
      .sort(function (a, b) { return a.savedAt < b.savedAt ? 1 : -1; })
      .forEach(function (r) {
        var k = keyOf(r.name, r.phone4);
        if (!seen[k]) { seen[k] = r; }
      });
    return Object.keys(seen).map(function (k) { return seen[k]; })
      .sort(function (a, b) { return a.name < b.name ? -1 : 1; });
  }

  function chooseExam(label) {
    exam = R.findExam(label);
    current = null;
    $('review-edit').hidden = true;
    reports = {};
    var list = $('review-list');
    list.innerHTML = '';
    list.appendChild(el('p', 'field-hint', '불러오는 중…'));
    VocabStore.adminSchoolReports(password, label).then(function (res) {
      if (res.ok) {
        res.list.forEach(function (x) { reports[keyOf(x.student_name, x.phone4)] = x; });
      }
      drawList(res.ok ? '' : '저장된 성적표를 불러오지 못했습니다. (' + (res.code || '') + ')');
    });
  }

  function statusOf(rec) {
    var rep = reports[keyOf(rec.name, rec.phone4)];
    if (!rep) { return { text: '검토 전', cls: 'is-new' }; }
    if (rep.published) { return { text: '공개함', cls: 'is-published' }; }
    return { text: '저장함', cls: 'is-saved' };
  }

  function drawList(problem) {
    var list = $('review-list');
    list.innerHTML = '';
    if (problem) { list.appendChild(el('p', 'check-state is-bad', problem)); }
    var recs = latestRecords(R.examLabel(exam));
    var count = { '검토 전': 0, '저장함': 0, '공개함': 0 };
    recs.forEach(function (r) { count[statusOf(r).text] += 1; });
    $('review-count').textContent = recs.length
      ? '기록한 학생 ' + recs.length + '명 · 검토 전 ' + count['검토 전'] + ' · 저장함 ' + count['저장함'] + ' · 공개함 ' + count['공개함']
      : '아직 이 시험을 기록한 학생이 없습니다.';
    recs.forEach(function (rec) {
      var st = statusOf(rec);
      var marks = R.marksFrom(rec.items);
      var b = el('button', 'review-row');
      b.type = 'button';
      b.appendChild(el('span', 'review-name', rec.name));
      b.appendChild(el('span', 'review-sub', (rec.school || '') + ' · 체크 ' + R.scoreOf(exam, marks) + '점'));
      b.appendChild(el('span', 'round-state ' + st.cls, st.text));
      b.addEventListener('click', function () { openStudent(rec); });
      list.appendChild(b);
    });
  }

  function openStudent(rec) {
    var rep = reports[keyOf(rec.name, rec.phone4)];
    current = {
      student: { name: rec.name, school: rec.school, phone4: rec.phone4 },
      marks: R.marksFrom(rep ? rep.items : rec.items),
      studentMarks: R.marksFrom(rec.items),
      weak: rep && rep.edits && rep.edits.weak ? rep.edits.weak.join('\n') : '',
      fix: rep && rep.edits && rep.edits.fix ? rep.edits.fix.join('\n') : '',
      comment: rep ? rep.comment || '' : '',
      published: !!(rep && rep.published)
    };
    $('review-edit').hidden = false;
    $('review-who').textContent = rec.name + ' · ' + (rec.school || '') + ' · ' + R.examLabel(exam);
    $('review-weak').value = current.weak;
    $('review-fix').value = current.fix;
    $('review-comment').value = current.comment;
    $('review-state').hidden = true;
    drawGrid('review-wrong', 'wrong');
    drawGrid('review-hard', 'hard');
    paintButtons();
    preview();
    $('review-edit').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* 틀린 문항 · 헤맨 문항 고치기 — 학생이 처음에 누른 것과 달라진 칸은 점선으로 표시합니다 */
  function drawGrid(boxId, kind) {
    var box = $(boxId);
    box.innerHTML = '';
    R.questionsOf(exam).forEach(function (q) {
      var b = el('button', 'mark-btn' + (kind === 'hard' ? ' is-hard-kind' : ''));
      b.type = 'button';
      b.setAttribute('data-no', String(q.no));
      b.appendChild(el('span', 'mark-no', R.noShort(q)));
      b.appendChild(el('span', 'mark-pt', q.point + '점'));
      b.addEventListener('click', function () {
        var set = current.marks[kind];
        if (set[q.no]) { delete set[q.no]; } else { set[q.no] = true; }
        if (kind === 'wrong' && current.marks.wrong[q.no]) { delete current.marks.hard[q.no]; }
        paintGrids();
        preview();
      });
      box.appendChild(b);
    });
    paintGrids();
  }

  function paintGrids() {
    ['wrong', 'hard'].forEach(function (kind) {
      var buttons = $('review-' + kind).querySelectorAll('.mark-btn');
      Array.prototype.forEach.call(buttons, function (b) {
        var no = b.getAttribute('data-no');
        var on = !!current.marks[kind][no];
        b.classList.toggle('is-marked', on);
        b.classList.toggle('is-changed', on !== !!current.studentMarks[kind][no]);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        if (kind === 'hard') {
          b.disabled = !!current.marks.wrong[no];
          b.classList.toggle('is-off', !!current.marks.wrong[no]);
        }
      });
    });
  }

  function lines(text) {
    return String(text || '').split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
  }

  function readEdits() {
    current.weak = $('review-weak').value;
    current.fix = $('review-fix').value;
    current.comment = $('review-comment').value.trim();
  }

  function preview() {
    readEdits();
    R.render($('review-preview'), {
      exam: exam,
      student: current.student,
      marks: current.marks,
      edits: { weak: lines(current.weak), fix: lines(current.fix) },
      comment: current.comment
    });
  }

  function paintButtons() {
    /* 공개 전: [학생에게 공개] [저장만 하기]  /  공개 뒤: [고친 내용 저장] [공개 취소] */
    $('btn-review-publish').hidden = current.published;
    $('btn-review-save').textContent = current.published ? '고친 내용 저장 (공개 유지)' : '저장만 하기 (공개 안 함)';
    $('btn-review-unpublish').hidden = !current.published;
    $('review-flag').textContent = current.published ? '지금 학생에게 공개되어 있습니다.' : '아직 학생에게 공개하지 않았습니다.';
  }

  function save(publish) {
    readEdits();
    var box = $('review-state');
    box.hidden = false;
    box.className = 'check-state';
    box.textContent = '저장하는 중…';
    var payload = {
      exam: R.examLabel(exam),
      name: current.student.name,
      phone4: current.student.phone4,
      school: current.student.school,
      items: R.toItems(exam, current.marks),
      edits: { weak: lines(current.weak), fix: lines(current.fix) },
      comment: current.comment,
      publish: publish
    };
    VocabStore.adminSchoolReportSave(password, payload).then(function (res) {
      if (!res.ok) {
        box.className = 'check-state is-bad';
        box.textContent = res.code === 'wrong-password'
          ? '원장 선생님 비밀번호로 들어와야 저장할 수 있습니다.'
          : '저장하지 못했습니다. ' + (res.detail || res.code || '');
        return;
      }
      var row = Array.isArray(res.row) ? res.row[0] : res.row;
      if (row) { reports[keyOf(row.student_name, row.phone4)] = row; }
      current.published = publish;
      paintButtons();
      box.className = 'check-state is-ok';
      box.textContent = publish ? '학생에게 공개했습니다. 학생 화면에 \'리포트 보기\' 가 나옵니다.'
                                : '저장했습니다. (학생에게는 아직 \'준비 중\' 으로 보입니다)';
      drawList('');
    });
  }

  function init() {
    if (!$('school-review')) { return; }
    ['review-weak', 'review-fix', 'review-comment'].forEach(function (id) {
      $(id).addEventListener('input', function () { if (current) { preview(); } });
    });
    $('btn-review-save').addEventListener('click', function () { save(current.published); });
    $('btn-review-publish').addEventListener('click', function () { save(true); });
    $('btn-review-unpublish').addEventListener('click', function () { save(false); });
    $('btn-review-close').addEventListener('click', function () {
      $('review-edit').hidden = true;
      current = null;
      $('school-review').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  init();

  return { start: start };
})();
