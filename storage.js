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
   수파베이스 관리자 설정(supabase-관리자.sql)을 마치면 그쪽 비밀번호를 씁니다. */
var ADMIN_LOCAL_PASSWORD = "bora2026";

var VocabStore = (function () {
  'use strict';

  var KEY_RECORDS = 'vocab.records';
  var KEY_LAST = 'vocab.lastStudent';

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

  function headersFor(way) {
    var h = {
      'apikey': SUPABASE.anonKey,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    };
    if (way === 'bearer') h['Authorization'] = 'Bearer ' + SUPABASE.anonKey;
    return h;
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
      headers: headersFor(way),
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
      return '표에 기록을 넣을 권한이 없습니다.\n' +
             'SQL 중 policy(권한) 부분이 실행되지 않은 것 같습니다.';
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

      return sendToSupabase({
        name: '연결테스트',
        school: '연결테스트',
        phone4: '0000',
        roundTitle: '연결확인',
        correct: 1,
        total: 1,
        percent: 100,
        items: [],
        savedAt: new Date().toISOString()
      }).then(function (sent) {
        if (sent.ok) {
          return {
            ok: true,
            message: '연결 성공!\n수파베이스 Table Editor 에 \'연결테스트\' 기록이 한 건 들어가 있습니다.\n확인하신 뒤 그 줄은 지우셔도 됩니다.'
          };
        }
        return {
          ok: false,
          message: sent.message,
          detail: '자세한 내용: [' + sent.status + '] ' + sent.detail
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

    localPassword: function () { return ADMIN_LOCAL_PASSWORD; },

    usingServer: supabaseReady
  };
})();
