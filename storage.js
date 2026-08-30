/* =========================================================
   점수 기록 저장 파일

   ▶ 지금은 학생이 쓰는 기기(브라우저)에 기록이 저장됩니다.
     같은 기기로 다시 들어오면 자기 기록을 볼 수 있습니다.

   ▶ 수파베이스(Supabase)에 모아서 쌓으려면
     아래 SUPABASE 의 url 과 anonKey 두 칸만 채우면 됩니다.
     (채우는 방법은 README.md 의 '점수를 수파베이스에 쌓기' 참고)
     채우지 않으면 기기 저장만 사용합니다.
   ========================================================= */

var SUPABASE = {
  url: "https://naiabxgeprxebfqbvpnz.supabase.co",
  anonKey: "sb_publishable_sbvGefQimsbkgnN_Bqc62Q_ZTKdyfBa",
  table: "quiz_attempts"      /* 기록을 쌓을 표 이름 */
};

/* 수파베이스를 아직 설정하지 않았을 때, 이 기기의 기록만 보기 위한 비밀번호입니다.
   수파베이스 선생님용 설정(supabase-선생님.sql)을 마치면 그쪽 비밀번호를 씁니다. */
var TEACHER_PASSWORD = "bora2026";

var VocabStore = (function () {
  'use strict';

  var KEY_RECORDS = 'vocab.records';
  var KEY_LAST = 'vocab.lastStudent';
  var KEY_HOMEWORK = 'vocab.homework';   /* 마지막으로 확인한 숙제 회차 */

  /* ---------- 기기 저장소 다루기 ---------- */

  function readAll() {
    try {
      var raw = window.localStorage.getItem(KEY_RECORDS);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];   /* 저장소를 못 쓰는 브라우저에서도 앱은 계속 돌아갑니다 */
    }
  }

  function writeAll(list) {
    try {
      window.localStorage.setItem(KEY_RECORDS, JSON.stringify(list));
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------- 학생 구분 ---------- */

  /* 이름·학교의 띄어쓰기와 대소문자 차이를 무시하고 같은 학생으로 봅니다 */
  function keyOf(student) {
    return [
      String(student.name || '').replace(/\s+/g, '').toLowerCase(),
      String(student.school || '').replace(/\s+/g, '').toLowerCase(),
      String(student.phone4 || '')
    ].join('|');
  }

  /* ---------- 수파베이스로 보내기 ---------- */

  function supabaseReady() {
    return !!(SUPABASE.url && SUPABASE.anonKey && SUPABASE.table);
  }

  /* 키를 보내는 방법이 두 가지라서, 하나가 막히면 다른 방법으로 다시 시도합니다.
     (예전 키와 새 publishable 키의 형식이 다릅니다) */
  var workingWay = null;

  /* minimal 을 true 로 주면 '답장 내용은 필요 없다'고 알립니다.
     기록을 넣을 때만 씁니다. 서버에서 무언가를 받아와야 하는 요청에는 쓰지 않습니다. */
  function headersFor(way, minimal) {
    var h = {
      'apikey': SUPABASE.anonKey,
      'Content-Type': 'application/json'
    };
    if (minimal) h['Prefer'] = 'return=minimal';
    if (way === 'bearer') h['Authorization'] = 'Bearer ' + SUPABASE.anonKey;
    return h;
  }

  /* 서버가 보낸 '맞다/아니다' 답을 읽습니다.
     읽을 수 없으면 null 을 돌려줍니다. (모양이 달라져도 앱이 멈추지 않게) */
  function readYesNo(text) {
    var v;
    try {
      v = JSON.parse(text);
    } catch (e) {
      v = String(text).trim();
      return (v === 'true') ? true : (v === 'false' ? false : null);
    }
    if (Array.isArray(v)) v = v[0];
    if (v && typeof v === 'object') v = v.check_enrolled;
    return (v === true || v === false) ? v : null;
  }

  function bodyFor(record) {
    return JSON.stringify([{
      student_name: record.name,
      school: record.school,
      phone4: record.phone4,
      round_title: record.roundTitle,
      correct: record.correct,
      total: record.total,
      percent: record.percent,
      items: record.items,
      taken_at: record.savedAt
    }]);
  }

  function postOnce(record, way) {
    var url = SUPABASE.url.replace(/\/+$/, '') + '/rest/v1/' + SUPABASE.table;

    return fetch(url, {
      method: 'POST',
      headers: headersFor(way, true),
      body: bodyFor(record)
    }).then(function (res) {
      if (res.ok) return { ok: true, way: way };
      return res.text().then(function (body) {
        return {
          ok: false,
          way: way,
          status: res.status,
          detail: body.slice(0, 300),
          message: explainError(res.status, body)
        };
      });
    }).catch(function (e) {
      return {
        ok: false,
        way: way,
        status: 0,
        detail: String(e && e.message ? e.message : e),
        message: '서버에 연결하지 못했습니다.\n인터넷 연결과 프로젝트 주소를 확인해주세요.'
      };
    });
  }

  function sendToSupabase(record) {
    if (!supabaseReady()) return Promise.resolve({ ok: false, status: 0, detail: '', message: '수파베이스 설정이 비어 있습니다.' });

    var ways = workingWay ? [workingWay] : ['bearer', 'apikey'];

    return postOnce(record, ways[0]).then(function (first) {
      if (first.ok) { workingWay = first.way; return first; }
      if (ways.length === 1) return first;

      /* 첫 번째 방법이 막혔으면 두 번째 방법으로 한 번 더 */
      return postOnce(record, ways[1]).then(function (second) {
        if (second.ok) { workingWay = second.way; return second; }
        return first.status === 0 ? second : first;
      });
    });
  }

  /* 서버가 돌려준 오류를 알아듣기 쉬운 말로 바꿔 줍니다 */
  function explainError(status, body) {
    var text = String(body || '');

    if (status === 404 || /PGRST205|does not exist|Could not find the table/i.test(text)) {
      return '수파베이스에 \'' + SUPABASE.table + '\' 표가 없습니다.\n' +
             'SQL Editor 에서 표 만들기 명령(supabase-설정.sql)을 실행했는지 확인해주세요.';
    }
    if (status === 401 || /Invalid API key|JWT/i.test(text)) {
      return '키가 올바르지 않습니다.\n' +
             '수파베이스 API 화면에서 publishable(anon) 키를 다시 복사해주세요.';
    }
    if (status === 403 || /42501|row-level security/i.test(text)) {
      return '재원생 명단에 없는 학생이라 기록을 저장하지 못했습니다.\n' +
             '이름과 학부모님 전화번호 뒷 4자리가 명단과 같은지 확인해주세요.';
    }
    if (status === 400 || /PGRST204|column/i.test(text)) {
      return '보내는 내용이 표의 칸과 맞지 않습니다.\n' +
             '표를 만들 때 SQL 일부만 실행되지 않았는지 확인해주세요.';
    }
    return '알 수 없는 오류입니다. (코드 ' + status + ')';
  }

  /* 서버에서 받은 한 줄을 앱이 쓰는 모양으로 바꿉니다 */
  function fromServerRow(row) {
    return {
      id: 'server-' + row.id,
      name: row.student_name,
      school: row.school,
      phone4: row.phone4,
      roundTitle: row.round_title,
      correct: row.correct,
      total: row.total,
      percent: row.percent,
      items: row.items || [],
      savedAt: row.taken_at,
      sent: true
    };
  }

  /* ---------- 바깥에서 쓰는 기능 ---------- */

  return {
    /* 마지막에 시험 본 학생 정보 (다음에 들어올 때 자동으로 채워 줍니다) */
    lastStudent: function () {
      try {
        var raw = window.localStorage.getItem(KEY_LAST);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    },

    rememberStudent: function (student) {
      try {
        window.localStorage.setItem(KEY_LAST, JSON.stringify({
          name: student.name, school: student.school, phone4: student.phone4
        }));
      } catch (e) { /* 저장 못 해도 그냥 넘어갑니다 */ }
    },

    /* 시험 결과 한 건 저장 */
    save: function (record) {
      record.id = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8);
      record.studentKey = keyOf(record);
      record.sent = false;

      var list = readAll();
      list.push(record);
      var savedOnDevice = writeAll(list);

      return sendToSupabase(record).then(function (sent) {
        var ok = sent.ok;
        if (ok) {
          var now = readAll();
          for (var i = now.length - 1; i >= 0; i--) {
            if (now[i].id === record.id) { now[i].sent = true; break; }
          }
          writeAll(now);
        }
        return {
          savedOnDevice: savedOnDevice,
          sentToServer: ok,
          reason: ok ? '' : (sent.message || '')
        };
      });
    },

    /* 아직 서버로 못 보낸 기록을 다시 보내기 */
    resend: function () {
      if (!supabaseReady()) return Promise.resolve(0);

      var list = readAll();
      var waiting = list.filter(function (r) { return !r.sent; });
      if (waiting.length === 0) return Promise.resolve(0);

      return Promise.all(waiting.map(function (r) {
        return sendToSupabase(r).then(function (sent) {
          return sent.ok ? r.id : null;
        });
      })).then(function (done) {
        var okIds = done.filter(Boolean);
        if (okIds.length) {
          var now = readAll();
          now.forEach(function (r) {
            if (okIds.indexOf(r.id) !== -1) r.sent = true;
          });
          writeAll(now);
        }
        return okIds.length;
      });
    },

    /* 이 학생의 기록만 최근 순으로 */
    listFor: function (student) {
      var key = keyOf(student);
      return readAll()
        .filter(function (r) { return r.studentKey === key; })
        .sort(function (a, b) { return (a.savedAt < b.savedAt) ? 1 : -1; });
    },

    /* 이 기기에 쌓인 모든 기록 (선생님용 내려받기에 사용) */
    all: function () {
      return readAll().sort(function (a, b) { return (a.savedAt < b.savedAt) ? 1 : -1; });
    },

    /* 엑셀에서 열 수 있는 표 형식으로 만들기 */
    toCsv: function (list) {
      var head = ['이름', '학교', '전화뒷자리', '회차', '맞은개수', '전체문항', '정답률', '본날짜'];
      var rows = (list || readAll()).map(function (r) {
        return [r.name, r.school, r.phone4, r.roundTitle, r.correct, r.total, r.percent + '%', r.savedAt];
      });
      return [head].concat(rows).map(function (row) {
        return row.map(function (cell) {
          var s = String(cell == null ? '' : cell);
          return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        }).join(',');
      }).join('\n');
    },

    /* 선생님용 연결 확인: 테스트 기록 한 건을 실제로 보내 봅니다 */
    testConnection: function () {
      if (!supabaseReady()) {
        return Promise.resolve({
          ok: false,
          message: '수파베이스 설정이 비어 있습니다.\nstorage.js 의 url 과 anonKey 를 채워주세요.'
        });
      }

      /* 기록을 넣어 보지 않고, 읽기만 해서 확인합니다.
         (이제는 재원생 명단에 있는 학생의 기록만 들어갈 수 있습니다) */
      var base = SUPABASE.url.replace(/\/+$/, '');

      return fetch(base + '/rest/v1/app_settings?key=eq.homework_round&select=value', {
        headers: headersFor('bearer')
      }).then(function (res) {
        if (!res.ok) {
          return res.text().then(function (body) {
            return {
              ok: false,
              message: explainError(res.status, body),
              detail: '자세한 내용: [' + res.status + '] ' + body.slice(0, 300)
            };
          });
        }

        /* 재원생 확인 기능이 켜져 있는지도 함께 봅니다 */
        return fetch(base + '/rest/v1/rpc/check_enrolled', {
          method: 'POST',
          headers: headersFor('bearer'),
          body: JSON.stringify({ student_name: '', phone4: '' })
        }).then(function (res2) {
          return res2.text().then(function (body2) {
            if (res2.ok && readYesNo(body2) === false) {
              return {
                ok: true,
                message: '연결 성공!\n재원생 확인도 켜져 있습니다.\n명단에 있는 학생만 시험을 시작할 수 있습니다.'
              };
            }
            if (res2.ok) {
              return {
                ok: false,
                message: '재원생 확인의 답을 읽지 못했습니다.\n이 화면을 사진 찍어 보내주세요.',
                detail: '받은 내용: ' + body2.slice(0, 200)
              };
            }
            return {
              ok: false,
              message: '서버에는 연결되지만 재원생 확인 기능이 아직 없습니다.\n' +
                       'SQL Editor 에서 supabase-재원생확인.sql 을 실행해주세요.',
              detail: '자세한 내용: [' + res2.status + '] ' + body2.slice(0, 200)
            };
          });
        });
      }).catch(function (e) {
        return {
          ok: false,
          message: '서버에 연결하지 못했습니다.\n인터넷 연결과 프로젝트 주소를 확인해주세요.',
          detail: String(e && e.message ? e.message : e)
        };
      });
    },

    /* 선생님용: 비밀번호를 서버에 보내 맞을 때만 전체 기록을 받아옵니다.
       (비밀번호는 이 파일에 저장되지 않고, 서버에서 확인합니다) */
    fetchAll: function (password) {
      if (!supabaseReady()) {
        return Promise.resolve({ ok: false, code: 'no-server' });
      }

      var url = SUPABASE.url.replace(/\/+$/, '') + '/rest/v1/rpc/admin_attempts';

      return fetch(url, {
        method: 'POST',
        headers: headersFor(workingWay || 'bearer'),
        body: JSON.stringify({ pass: password })
      }).then(function (res) {
        return res.text().then(function (text) {
          if (res.ok) {
            var rows;
            try { rows = JSON.parse(text); } catch (e) { rows = []; }
            return { ok: true, rows: rows.map(fromServerRow) };
          }
          if (/비밀번호|admin_secret/.test(text)) {
            return { ok: false, code: 'wrong-password' };
          }
          if (res.status === 404 || /admin_attempts|PGRST202/.test(text)) {
            return { ok: false, code: 'not-set-up' };
          }
          return { ok: false, code: 'error', detail: '[' + res.status + '] ' + text.slice(0, 200) };
        });
      }).catch(function (e) {
        return { ok: false, code: 'offline', detail: String(e && e.message ? e.message : e) };
      });
    },

    /* 선생님용: 재원생 명단 기준 누적 성적 (명단을 넣어 둔 경우에만 나옵니다) */
    fetchStudents: function (password) {
      if (!supabaseReady()) return Promise.resolve({ ok: false, code: 'no-server' });

      var url = SUPABASE.url.replace(/\/+$/, '') + '/rest/v1/rpc/admin_students';

      return fetch(url, {
        method: 'POST',
        headers: headersFor(workingWay || 'bearer'),
        body: JSON.stringify({ pass: password })
      }).then(function (res) {
        return res.text().then(function (text) {
          if (!res.ok) return { ok: false, code: 'unavailable' };
          var rows;
          try { rows = JSON.parse(text); } catch (e) { return { ok: false, code: 'unavailable' }; }
          return {
            ok: true,
            rows: rows.map(function (r) {
              return {
                name: r.name,
                school: r.school || '',
                className: r.class_name || '',
                grade: r.grade || '미분류',
                parentPhone: r.parent_phone || '',
                studentPhone: r.student_phone || '',
                active: r.active !== false,
                count: Number(r.attempts) || 0,
                rounds: Number(r.rounds_done) || 0,
                avg: Math.round(Number(r.avg_percent) || 0),
                last: r.last_taken || ''
              };
            })
          };
        });
      }).catch(function () {
        return { ok: false, code: 'offline' };
      });
    },

    /* 재원생 명단에 있는 학생인지 서버에 물어봅니다.
       명단 자체는 받아오지 않고, 맞다/아니다만 받습니다.
       확인이 되지 않으면 시험을 시작할 수 없습니다. */
    isEnrolled: function (student) {
      if (!supabaseReady()) return Promise.resolve({ ok: false, code: 'no-server' });

      var url = SUPABASE.url.replace(/\/+$/, '') + '/rest/v1/rpc/check_enrolled';

      return fetch(url, {
        method: 'POST',
        headers: headersFor(workingWay || 'bearer'),
        body: JSON.stringify({
          student_name: student.name || '',
          phone4: student.phone4 || ''
        })
      }).then(function (res) {
        return res.text().then(function (text) {
          if (res.ok) {
            var yes = readYesNo(text);
            if (yes === null) return { ok: false, code: 'error', detail: '답을 읽지 못했습니다.' };
            return { ok: true, enrolled: yes };
          }
          if (res.status === 404 || /check_enrolled|PGRST202/.test(text)) {
            return { ok: false, code: 'not-set-up' };
          }
          return { ok: false, code: 'error', detail: '[' + res.status + '] ' + text.slice(0, 200) };
        });
      }).catch(function () {
        return { ok: false, code: 'offline' };
      });
    },

    /* 이번 주 숙제 회차를 읽어 옵니다.
       인터넷이 안 되면 지난번에 확인한 값을 씁니다. */
    homeworkRound: function () {
      var cached = null;
      try { cached = window.localStorage.getItem(KEY_HOMEWORK); } catch (e) { cached = null; }

      if (!supabaseReady()) {
        return Promise.resolve({ ok: false, round: cached });
      }

      var url = SUPABASE.url.replace(/\/+$/, '') +
                '/rest/v1/app_settings?key=eq.homework_round&select=value';

      return fetch(url, { headers: headersFor(workingWay || 'bearer') })
        .then(function (res) {
          if (!res.ok) return { ok: false, round: cached };
          return res.json().then(function (rows) {
            var value = (rows && rows[0] && rows[0].value) || '';
            try { window.localStorage.setItem(KEY_HOMEWORK, value); } catch (e) { /* 넘어갑니다 */ }
            return { ok: true, round: value };
          });
        })
        .catch(function () {
          return { ok: false, round: cached };
        });
    },

    /* 선생님용: 이번 주 숙제 회차를 정합니다 (빈 값이면 전체 열기) */
    setHomeworkRound: function (password, round) {
      if (!supabaseReady()) return Promise.resolve({ ok: false, code: 'no-server' });

      var url = SUPABASE.url.replace(/\/+$/, '') + '/rest/v1/rpc/set_homework_round';

      return fetch(url, {
        method: 'POST',
        headers: headersFor(workingWay || 'bearer'),
        body: JSON.stringify({ pass: password, round: round || '' })
      }).then(function (res) {
        return res.text().then(function (text) {
          if (res.ok) return { ok: true, round: round || '' };
          if (/비밀번호/.test(text)) return { ok: false, code: 'wrong-password' };
          if (res.status === 404 || /set_homework_round|PGRST202/.test(text)) return { ok: false, code: 'not-set-up' };
          return { ok: false, code: 'error', detail: '[' + res.status + '] ' + text.slice(0, 200) };
        });
      }).catch(function () {
        return { ok: false, code: 'offline' };
      });
    },

    /* 선생님용: 앱에 들어 있는 문제를 수파베이스 문제 은행에 올립니다 */
    syncQuestions: function (password, list) {
      if (!supabaseReady()) return Promise.resolve({ ok: false, code: 'no-server' });

      var url = SUPABASE.url.replace(/\/+$/, '') + '/rest/v1/rpc/sync_questions';

      return fetch(url, {
        method: 'POST',
        headers: headersFor(workingWay || 'bearer'),
        body: JSON.stringify({ pass: password, payload: list })
      }).then(function (res) {
        return res.text().then(function (text) {
          if (res.ok) {
            var rows;
            try { rows = JSON.parse(text); } catch (e) { rows = []; }
            var r = rows[0] || {};
            return { ok: true, added: r.added || 0, updated: r.updated || 0, total: r.total || 0 };
          }
          if (/비밀번호/.test(text)) return { ok: false, code: 'wrong-password' };
          if (res.status === 404 || /sync_questions|PGRST202/.test(text)) return { ok: false, code: 'not-set-up' };
          return { ok: false, code: 'error', detail: '[' + res.status + '] ' + text.slice(0, 200) };
        });
      }).catch(function () {
        return { ok: false, code: 'offline' };
      });
    },

    teacherPassword: function () { return TEACHER_PASSWORD; },

    usingServer: supabaseReady
  };
})();
