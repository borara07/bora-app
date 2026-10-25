/* =========================================================
   시험 범위 풀이 만들기 (Claude 가 돌리는 프로그램입니다)

   정기고사 일정표(school-schedule.js)의 시험 범위에 적힌 교과서 쪽수를
   교과서 차례(교과서-차례.md)와 맞춰서, 그 쪽에 어느 단원·작품이 있는지 풀어 둡니다.
   결과는 school-range.js 에 씁니다. (손으로 고치지 않습니다. 다시 돌리면 새로 만듭니다)

   돌리는 법:  node 도구/범위-정리.js
   ========================================================= */
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');

/* ---------- 교과서 차례 읽기 ---------- */
const md = fs.readFileSync(path.join(ROOT, '교과서-차례.md'), 'utf8').split('\n');
const BOOKS = {};          // "공통국어2|창비(최원식)" → [{s, e, big, unit, works}]
let sect = '', book = '', big = '';
for (const line of md) {
  if (/^# /.test(line)) { sect = line.slice(2).trim(); continue; }
  if (/^## /.test(line)) { book = line.slice(3).trim(); big = ''; continue; }
  const m = line.match(/^\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|(?:\s*([^|]*?)\s*\|)?/);
  if (!m || !book || m[1] === '쪽' || /^-+$/.test(m[1])) continue;
  const key = sect + '|' + book;
  const pg = m[1].match(/^(\d+)?\s*~\s*(\d+|끝)?$/);
  const unit = m[2].replace(/\*\*/g, '').trim();
  if (/^\*\*/.test(m[2])) { big = unit; }
  if (!pg) continue;
  (BOOKS[key] = BOOKS[key] || []).push({
    s: pg[1] ? +pg[1] : null, e: pg[2] && pg[2] !== '끝' ? +pg[2] : null,
    isBig: /^\*\*/.test(m[2]), big, unit, works: (m[3] || '').trim()
  });
}
/* 대단원 번호와, 그 안의 소단원 차례 번호를 매깁니다 — "3(2)" 같은 범위를 찾을 때 씁니다 */
const ROMAN = { 'Ⅰ': 1, 'Ⅱ': 2, 'Ⅲ': 3, 'Ⅳ': 4, 'Ⅴ': 5, 'Ⅵ': 6 };
for (const rows of Object.values(BOOKS)) {
  let bigNo = 0, subNo = 0;
  rows.forEach(r => {
    if (r.isBig) {
      const m = r.unit.match(/^(\d+)|^([ⅠⅡⅢⅣⅤⅥ])/);
      bigNo = m ? (m[1] ? +m[1] : ROMAN[m[2]]) : bigNo + 1; subNo = 0; r.bigNo = bigNo;
    } else {
      r.bigNo = bigNo;
      if (/^(\(\d\)|0?\d[.\s]|❶|❷|❸|❹|❺|①|②|③|④)/.test(r.unit)) { subNo += 1; r.subNo = subNo; }
    }
  });
}

/* 끝 쪽이 없으면 다음 줄 시작 − 1 */
for (const rows of Object.values(BOOKS)) {
  rows.forEach((r, i) => {
    if (r.e == null) {
      const next = rows.slice(i + 1).find(x => x.s != null && x.s > (r.s || 0) && !x.isBig === !r.isBig);
      r.e = next ? next.s - 1 : 9999;
    }
  });
}

/* ---------- 책 이름 찾기 ---------- */
function findBook(subject, name) {
  if (!subject || !name) return null;
  const keys = Object.keys(BOOKS);
  const want = name.replace(/\s/g, '');
  const pub = want.replace(/\(.*\)/, '').replace(/국어|문학|화법과언어$/g, '');
  const author = (want.match(/\((.+)\)/) || [])[1];
  const sec = /공통국어1/.test(subject) ? '공통국어1' : /공통국어2/.test(subject) ? '공통국어2' : subject;
  if (/^주제탐구독서/.test(want)) return keys.find(k => k.replace(/\s/g, '') === '부교재|' + want) || null;
  if (/올림포스/.test(want)) return keys.find(k => k === `부교재|올림포스 ${sec} (EBS)`) || null;
  const inSec = keys.filter(k => k.split('|')[0] === sec);
  let hit = inSec.filter(k => k.split('|')[1].replace(/\s/g, '').startsWith(pub));
  if (author) hit = hit.filter(k => k.includes(author));
  return hit.length === 1 ? hit[0] : (hit.length ? { many: hit } : null);
}

/* 비상 · 천재처럼 같은 출판사 책이 둘인 학교 (선생님 확인) */
const AUTHOR = { '용문고|공통국어2': '비상(박영민)' };

/* ---------- 시험 범위 풀기 ---------- */
const ctx = {}; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'school-schedule.js'), 'utf8'), ctx);
const SCHED = vm.runInContext('SCHOOL_SCHEDULE', ctx);

function rowView(r, part) {
  return { pages: r.s + '–' + (r.e >= 9999 ? '' : r.e), big: r.big, unit: r.unit, works: r.works, part: !!part };
}
/* "3(2)" → 3단원의 둘째 소단원,  "2단원" → 2단원 소단원 모두 */
function unitsByNo(key, big, sub) {
  return (BOOKS[key] || []).filter(r => !r.isBig && r.bigNo === big && (sub ? r.subNo === sub : r.subNo)).map(r => rowView(r));
}
function unitsFor(key, a, b) {
  return (BOOKS[key] || []).filter(r => !r.isBig && r.s != null && r.s <= b && r.e >= a && !/^부록|^출처/.test(r.unit))
    .map(r => ({
      pages: r.s + '–' + (r.e >= 9999 ? '' : r.e),
      big: r.big, unit: r.unit, works: r.works,
      part: a > r.s || (r.e < 9999 && b < r.e)
    }));
}

const out = {};
for (const s of SCHED) {
  if (!s.subject) continue;
  const mainName = (s.book || '').split('/')[0].trim();
  const result = { pieces: [], notes: [] };
  /* 줄이 바뀌어도 앞줄의 책([올림포스] 등)을 이어 씁니다. 줄 머리에 [국어A] 같은 이름표가 오면 교과서로 돌아갑니다. */
  let subject = s.subject, bookName = mainName, skip = '';
  for (const raw of s.range || []) {
    const label = (raw.match(/^\[+([^\]]+)\]+/) || [])[1] || '';
    if (label && !/올림포스|주탐독/.test(label)) { subject = s.subject; bookName = mainName; skip = ''; }
    /* 앞에서부터 차례로 읽으며, '교과서' · '공통국어2' · '올림포스' 같은 말이 나오면 그 뒤 쪽수의 책을 바꿉니다.
       학평·모의고사·자이스토리 뒤의 쪽수는 교과서 차례로 풀 수 없어서 건너뜁니다. */
    const re = /([1-6]\s*\(\s*[1-6]\s*\)|[1-6]\s*[–~\-]\s*[1-6]\s*단원|[1-6]\s*단원|올림포스|자이스토리|수능특강|수특|\d+월\s*학평|학력평가|모의고사|교과서(?:\([^)]*\))?|공통국어\s*[12]|주탐독|p\.?\s*\d+(?:\s*[–\-~]\s*\d+)?(?:\s*·\s*\d+(?:\s*[–\-~]\s*\d+)?)*)/g;
    let m;
    while ((m = re.exec(raw))) {
      const t = m[1];
      const un = t.match(/^([1-6])\s*\(\s*([1-6])\s*\)$/) || t.match(/^([1-6])\s*(?:[–~\-]\s*([1-6])\s*)?단원$/);
      if (un) {
        /* '3(2)' 같은 단원 번호는 늘 교과서를 가리킵니다 (올림포스는 01·02 로 셉니다) */
        if (skip && bookName !== '올림포스') continue;
        const key = findBook(bookName === '올림포스' ? s.subject : subject, bookName === '올림포스' ? mainName : bookName);
        if (!key || typeof key === 'object') continue;
        const isPair = /\(/.test(t);
        const bigs = isPair ? [+un[1]] : (un[2] ? Array.from({ length: +un[2] - +un[1] + 1 }, (_, i) => +un[1] + i) : [+un[1]]);
        const units = [].concat(...bigs.map(bg => unitsByNo(key, bg, isPair ? +un[2] : 0)));
        if (units.length) result.pieces.push({ label, book: key.split('|')[1], subject, pages: t.replace(/\s/g, ''), where: t.replace(/\s/g, ''), units });
        continue;
      }
      if (/^p/.test(t)) for (const one of t.replace(/^p\.?\s*/, '').split('·')) {
        const n = one.match(/(\d+)(?:\s*[–\-~]\s*(\d+))?/);
        const a = +n[1], b = n[2] ? +n[2] : +n[1];
        if (skip) { result.notes.push(`${skip} p.${a}–${b} — 문제집·모의고사 범위라 교과서 차례로 풀지 않았습니다`); continue; }
        const key = findBook(subject, bookName);
        if (!key || typeof key === 'object') {
          result.notes.push(`${bookName} ${subject} p.${a}–${b} — ${key ? '같은 출판사 책이 둘이라 고르지 못했습니다 (' + key.many.map(k => k.split('|')[1]).join(', ') + ')' : '차례에서 책을 찾지 못했습니다'}`);
          continue;
        }
        result.pieces.push({ label, book: key.split('|')[1], subject, pages: a === b ? String(a) : `${a}–${b}`, where: 'p.' + (a === b ? a : `${a}–${b}`), units: unitsFor(key, a, b) });
      } else if (t === '주탐독') {
        const pub = ((s.book || '').match(/\[주탐독\]\s*(\S+)/) || [])[1];
        bookName = pub ? '주제 탐구 독서 — ' + pub : '주제 탐구 독서'; subject = '부교재'; skip = '';
      } else if (/^공통국어/.test(t)) {
        subject = t.replace(/\s/g, '');
        if (bookName !== '올림포스') { bookName = mainName; skip = ''; }
      } else if (t === '올림포스') { bookName = '올림포스'; skip = ''; }
      else if (/^교과서/.test(t)) {
        skip = ''; bookName = mainName; subject = s.subject;
        const strong = t.match(/비상\s*(강|박)/);
        if (strong) bookName = strong[1] === '강' ? '비상(강호영)' : '비상(박영민)';
      } else { skip = t; }
      if (bookName === '비상' && AUTHOR[s.school + '|' + subject]) bookName = AUTHOR[s.school + '|' + subject];
    }
  }
  if (strongConflict(s)) result.notes.push(strongConflict(s));
  if (result.pieces.length || result.notes.length) out[`${s.grade}|${s.school}|${s.term}`] = result;
}

function strongConflict(s) {
  const t = (s.range || []).join(' ');
  if (/비상\s*강/.test(t) && AUTHOR[s.school + '|' + s.subject] === '비상(박영민)')
    return '일정표 범위에는 "비상 강"(강호영)으로 적혀 있는데, 차례표에는 비상(박영민)으로 정해 두었습니다. 어느 책인지 확인이 필요합니다.';
  return '';
}

const js = `/* 시험 범위 풀이 — 도구/범위-정리.js 가 만든 파일입니다. 손으로 고치지 마세요.
   정기고사 일정표의 교과서 쪽수를 교과서 차례와 맞춰, 그 쪽의 단원·작품을 적어 둡니다.
   열쇠: "학년|학교|시험"  (만든 날: ${new Date().toISOString().slice(0, 10)}) */
var SCHOOL_RANGES = ${JSON.stringify(out, null, 1)};

function findSchoolRange(school, grade, term) {
  return (typeof SCHOOL_RANGES !== 'undefined' && SCHOOL_RANGES[grade + '|' + school + '|' + term]) || null;
}
`;
fs.writeFileSync(path.join(ROOT, 'school-range.js'), js);
for (const [k, v] of Object.entries(out)) {
  console.log('##', k, v.pieces.length + '조각', v.notes.length ? '안내 ' + v.notes.length : '');
  v.pieces.forEach(p => console.log('  ', p.label, p.book, p.subject, p.where, '→', p.units.map(u => u.unit.slice(0, 18) + (u.part ? '(일부)' : '')).join(' | ')));
  v.notes.forEach(n => console.log('   !', n));
}
