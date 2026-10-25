// 블로그 카드 만들기 (Claude 가 씁니다): node 블로그/카드-만들기.js "고1 · 경동고 26-1 중간"
// school-exams.js · school-schedule.js 에서 숫자를 계산해 카드 HTML 을 씁니다.
const fs = require('fs'), vm = require('vm'), path = require('path');
const REPO = '/home/user/bora-app';
const ctx = { window: {} }; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['school-exams.js', 'school-schedule.js', 'school-range.js']) vm.runInContext(fs.readFileSync(path.join(REPO, f), 'utf8'), ctx);
const EXAMS = vm.runInContext('SCHOOL_EXAMS', ctx);
const label = process.argv[2] || '고1 · 경동고 26-1 중간';
const exam = EXAMS.find(e => `${e.grade} · ${e.school} ${e.term}` === label);
if (!exam) { console.error('시험을 찾지 못했습니다:', label); process.exit(1); }
const sched = vm.runInContext(`findSchoolSchedule(${JSON.stringify(exam.school)}, ${JSON.stringify(exam.grade)}, ${JSON.stringify(exam.term)})`, ctx) || {};
const levels = vm.runInContext('schoolLevels', ctx)(exam);

const r1 = n => Math.round(n * 10) / 10;
const qs = exam.questions;
const isEssay = q => /^서답형/.test(String(q.form || '')) || /^서답형/.test(String(q.no));
const sum = a => r1(a.reduce((s, q) => s + q.point, 0));
const obj = qs.filter(q => !isEssay(q)), essay = qs.filter(isEssay);
const by = key => { const m = new Map(); qs.forEach(q => { const k = key(q); const v = m.get(k) || { n: 0, p: 0 }; v.n++; v.p += q.point; m.set(k, v); }); return [...m].map(([k, v]) => ({ k, n: v.n, p: r1(v.p) })); };
const areas = by(q => q.area).sort((a, b) => b.p - a.p);
const sources = by(q => q.source || '교과서');
const full = exam.full || sum(qs);
const lv = { 하: 0, 중: 0, 상: 0 }; qs.forEach(q => lv[levels[q.no]]++);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const half = exam.term.replace(/^(\d+)-(\d) /, '$2학기 ');   // "26-1 중간" → "1학기 중간"
const year = '20' + exam.term.slice(0, 2);
const book = (sched.book || '').trim();
const subject = sched.subject || '국어';
const textbookPct = Math.round((sources.find(s => s.k === '교과서') || { n: 0 }).n / qs.length * 100);
const missing = t => `<span class="todo">${t} — 시험지와 함께 받으면 채웁니다</span>`;
const B = exam.blog || { points: [], tips: [] };

const compo = `선택형 ${obj.length}문항 ${sum(obj)}점` + (essay.length ? `, 서답형 ${essay.length}문항 ${sum(essay)}점` : ', 서답형 없음');
const areaLine = areas.map(a => `${a.k} ${a.n}문항(${a.p}점)`).join(' · ');
const srcLine = sources.map(s => `${s.k} ${s.n}`).join(' · ');

const facts = [
  ['교과서', esc(book || '—')],
  ['평가 비율', exam.grading ? esc(exam.grading) : missing('평가 비율')],
  [`${half}`, esc(compo)],
];
const factHtml = facts.map(([k, v]) => `<div class="fact"><dt>${k}</dt><dd>${v}</dd></div>`).join('');
const rangeHtml = vm.runInContext('schoolRangeLines', ctx)(exam).map(l => `<li>${esc(l)}</li>`).join('');
// 교과서 쪽수를 차례와 맞춰 본 단원·작품 (school-range.js)
const pointHtml = B.points.map(([t, d], i) => `<li><span class="n">${i + 1}</span><div><h4>${esc(t)}</h4><p>${esc(d)}</p></div></li>`).join('');
const tipHtml = B.tips.map(([t, d], i) => `<li><div class="tip-k"><span class="n">${i + 1}</span>${esc(t)}</div><p class="tip-v">${esc(d)}</p></li>`).join('');
const cutLine = (exam.cut || exam.average)
  ? `<p class="cut">${exam.cut ? '1등급 컷 <b>' + esc(exam.cut) + '</b>' : ''}${exam.cut && exam.average ? ' · ' : ''}${exam.average ? '평균 <b>' + esc(exam.average) + '</b>' : ''}</p>`
  : `<p class="cut">${missing('1등급 컷 · 평균')}</p>`;
const bars = areas.map(a => `<div class="bar"><span class="bk">${esc(a.k)}</span><span class="bt"><i style="width:${(a.p / full * 100).toFixed(1)}%"></i></span><span class="bv">${a.n}문항 · ${a.p}점</span></div>`).join('');

// 블로그 본문에 붙여 넣을 글
const plain = [
  `[${exam.school} ${exam.grade.replace('고', '')}학년 ${year} ${half}고사 국어 분석]`, '',
  `· 과목: ${subject}`, `· 교과서: ${book || '—'}`, `· 평가 비율: ${exam.grading || '(시험지와 함께 받으면 채움)'}`,
  `· 문항 구성: ${compo} (만점 ${full}점)`, `· 영역: ${areaLine}`, `· 출처: ${srcLine}`, '',
  `■ ${exam.school} 국어 시험은`, ...B.points.map(([t, d], i) => `${i + 1}. ${t}\n   ${d}`), '',
  `■ ${exam.school} 국어 내신 대비 전략`, ...B.tips.map(([t, d], i) => `${i + 1}. ${t}\n   ${d}`), '',
  '보라국어 정기고사 분석'
].join('\n');

const html = `<title>${esc(exam.school)} 정기고사 분석</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
/* 블로그에 올릴 카드 두 장 — 보라국어 연보라·진보라, 카드 한 장씩 그림으로 저장해 씁니다.
   카드는 블로그 이미지라 밝은 한 가지 모습으로 고정합니다 (어두운 화면에서도 같은 카드). */
@font-face { font-family: "고운밤"; src: url("fonts/goun-bam.woff2") format("woff2"); font-display: swap; unicode-range: U+0020-007E, U+1100-11FF, U+3130-318F, U+AC00-D7A3, U+2018-201D, U+00B7; }
@font-face { font-family: "나눔스퀘어"; src: url("fonts/square.woff2") format("woff2"); font-weight: 400; font-display: swap; unicode-range: U+0020-007E, U+1100-11FF, U+3130-318F, U+AC00-D7A3, U+2018-201D, U+00B7; }
@font-face { font-family: "나눔스퀘어"; src: url("fonts/square-bold.woff2") format("woff2"); font-weight: 700; font-display: swap; unicode-range: U+0020-007E, U+1100-11FF, U+3130-318F, U+AC00-D7A3, U+2018-201D, U+00B7; }
@font-face { font-family: "나눔스퀘어"; src: url("fonts/square-extrabold.woff2") format("woff2"); font-weight: 800; font-display: swap; unicode-range: U+0020-007E, U+1100-11FF, U+3130-318F, U+AC00-D7A3, U+2018-201D, U+00B7; }
:root {
  --page: #f3effb;     /* 페이지 바탕 */
  --deep: #582b8d;     /* 로고 진보라 — 카드 바탕 */
  --lav: #ece6fb;      /* 연보라 — 안쪽 상자 */
  --paper: #ffffff;
  --ink: #241c3c;
  --ink-2: #4a4166;
  --muted: #6f6494;
  --accent: #7c3aed;
  --line: #ddd4f4;
  --title: "고운밤", "나눔스퀘어", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  --body: "나눔스퀘어", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  color-scheme: light;
}
* { box-sizing: border-box; }
body { word-break: keep-all; margin: 0; background: var(--page); color: var(--ink); font-family: var(--body); font-size: 16px; line-height: 1.6;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 24px 48px; }
.wrap { max-width: 760px; margin: 0 auto; display: grid; gap: 22px; }
.guide { font-size: 14px; color: var(--muted); margin: 0; }
.guide b { color: var(--ink-2); }
.card { background: var(--deep); color: #fff; border-radius: 22px; padding: clamp(18px, 4vw, 34px); display: grid; gap: 18px; }
.card-top { display: flex; align-items: center; gap: 10px; font-size: 13px; letter-spacing: .12em; color: #d9ccf5; }
.card-top img { width: 28px; height: auto; }
.card-top .rule { flex: 1; height: 1px; background: rgba(255,255,255,.28); }
h1, h2 { font-family: var(--title); font-weight: 400; margin: 0; -webkit-text-stroke: .013em currentColor; text-wrap: balance; line-height: 1.3; }
h1 { font-size: clamp(24px, 5vw, 32px); }
h1 small { display: block; font-family: var(--body); font-size: 15px; color: #d9ccf5; -webkit-text-stroke: 0; margin-top: 4px; }
.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px 22px; margin: 0; }
.fact { display: grid; grid-template-columns: 82px 1fr; gap: 10px; align-items: start; min-width: 0; }
.fact dt { background: var(--paper); color: var(--deep); font-weight: 800; font-size: 13px; text-align: center; border-radius: 999px; padding: 3px 0; }
.fact dd { margin: 0; font-size: 15px; min-width: 0; overflow-wrap: anywhere; }
.range { font-size: 14px; color: #e7defb; margin: 0; padding-left: 18px; display: grid; gap: 2px; }
.range.units .w { color: #c9b8f2; }
.range-k { font-size: 13px; font-weight: 800; letter-spacing: .06em; color: #d9ccf5; margin: 0 0 4px; }
.box { background: var(--paper); color: var(--ink); border-radius: 18px; overflow: hidden; }
.box-h { background: var(--lav); padding: 14px 22px; display: flex; align-items: center; gap: 10px; }
.box-h h2 { font-size: 22px; color: var(--deep); }
.box-b { padding: 18px 22px 22px; display: grid; gap: 16px; }
.badge { width: 30px; height: 30px; border-radius: 50%; background: var(--deep); color: #fff; display: grid; place-items: center; font-weight: 800; font-size: 15px; flex: none; }
.points { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
.points li { display: grid; grid-template-columns: 26px 1fr; gap: 10px; }
.n { width: 24px; height: 24px; border-radius: 6px; background: var(--accent); color: #fff; font-size: 13px; font-weight: 800; display: inline-grid; place-items: center; margin-top: 2px; }
.points h4 { margin: 0; font-size: 17px; font-weight: 800; color: var(--ink); }
.points p { margin: 2px 0 0; font-size: 14.5px; color: var(--ink-2); }
.bars { display: grid; gap: 8px; }
.bar { display: grid; grid-template-columns: 44px 1fr auto; gap: 10px; align-items: center; font-size: 14px; }
.bk { font-weight: 800; color: var(--deep); }
.bt { height: 10px; background: var(--lav); border-radius: 5px; overflow: hidden; }
.bt i { display: block; height: 100%; background: var(--accent); border-radius: 5px; }
.bv { color: var(--muted); font-variant-numeric: tabular-nums; }
.meta { font-size: 13.5px; color: var(--muted); margin: 0; }
.cut { margin: 0; font-size: 15px; }
.tips { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.tips li { display: grid; grid-template-columns: minmax(150px, 34%) 1fr; gap: 12px; align-items: stretch; }
.tip-k { background: var(--lav); border-radius: 12px; padding: 12px; font-family: var(--title); font-size: 17px; -webkit-text-stroke: .013em currentColor; color: var(--deep); display: flex; gap: 8px; align-items: flex-start; word-break: keep-all; }
.tip-k .n { font-family: var(--body); -webkit-text-stroke: 0; }
.tip-v { margin: 0; border: 1.5px solid var(--line); border-radius: 12px; padding: 12px 14px; font-size: 14.5px; color: var(--ink-2); }
.foot { display: flex; justify-content: flex-end; }
.foot img { height: 22px; width: auto; filter: brightness(0) invert(1); opacity: .9; }
.todo { display: inline-block; font-size: 13px; color: #fff; border: 1px dashed rgba(255,255,255,.6); border-radius: 6px; padding: 0 6px; }
.box .todo { color: var(--muted); border-color: var(--line); }
.copy-box { background: var(--paper); border-radius: 16px; padding: 18px; display: grid; gap: 10px; border: 1px solid var(--line); }
.copy-box h3 { margin: 0; font-size: 16px; }
.copy-box pre { margin: 0; white-space: pre-wrap; font-family: var(--body); font-size: 14px; color: var(--ink-2); background: var(--page); border-radius: 10px; padding: 12px; max-height: 260px; overflow: auto; }
.copy-btn { justify-self: start; min-height: 44px; padding: 0 18px; border-radius: 12px; border: 0; background: var(--accent); color: #fff; font: inherit; font-weight: 800; cursor: pointer; }
.copy-btn:focus-visible { outline: 3px solid var(--line); outline-offset: 2px; }
@media (max-width: 520px) { .tips li { grid-template-columns: 1fr; } .box-b, .box-h { padding-left: 16px; padding-right: 16px; } }
</style>

<div class="wrap">
  <p class="guide"><b>${esc(label)}</b> 블로그 카드 시안입니다. 카드 두 장을 각각 그림으로 저장해 블로그에 올리고, 맨 아래 글은 본문에 붙여 넣습니다. 점선 칸은 시험지와 함께 받으면 채웁니다.</p>

  <section class="card" aria-label="${esc(exam.school)} 국어 시험은">
    <div class="card-top"><img src="logo/mark-white.png" alt=""><span>보라국어 정기고사 분석</span><span class="rule"></span></div>
    <h1>${esc(exam.school)} ${esc(exam.grade.replace('고', ''))}학년 '${esc(subject)}'<small>${year} ${half}고사</small></h1>
    <dl class="facts">${factHtml}</dl>
    <div><p class="range-k">시험 범위</p><ul class="range">${rangeHtml}</ul></div>
    <div class="box">
      <div class="box-h"><span class="badge">1</span><h2>${esc(exam.school)} 국어 시험은</h2></div>
      <div class="box-b">
        <ol class="points">${pointHtml}</ol>
        <div class="bars">${bars}</div>
        <p class="meta">출처: ${esc(srcLine)} (교과서 ${textbookPct}%) · 배점으로 본 난도: 하 ${lv.하} · 중 ${lv.중} · 상 ${lv.상}</p>
        ${cutLine}
      </div>
    </div>
    <div class="foot"><img src="logo/logo-h.png" alt="보라국어"></div>
  </section>

  <section class="card" aria-label="${esc(exam.school)} 국어 내신 대비 전략">
    <div class="card-top"><img src="logo/mark-white.png" alt=""><span>보라국어 정기고사 분석</span><span class="rule"></span></div>
    <div class="box">
      <div class="box-h"><span class="badge">2</span><h2>${esc(exam.school)} 국어 내신 대비 전략</h2></div>
      <div class="box-b"><ol class="tips">${tipHtml}</ol></div>
    </div>
    <div class="foot"><img src="logo/logo-h.png" alt="보라국어"></div>
  </section>

  <section class="copy-box">
    <h3>블로그 본문에 붙여 넣을 글</h3>
    <pre id="plain">${esc(plain)}</pre>
    <button class="copy-btn" id="copy" type="button">글 복사</button>
  </section>
</div>
<script>
document.getElementById('copy').addEventListener('click', function () {
  var btn = this, text = document.getElementById('plain').textContent;
  function sel() { var r = document.createRange(); r.selectNodeContents(document.getElementById('plain')); var s = getSelection(); s.removeAllRanges(); s.addRange(r); btn.textContent = '선택했어요 · 길게 눌러 복사'; }
  try { navigator.clipboard.writeText(text).then(function () { btn.textContent = '복사했어요'; setTimeout(function () { btn.textContent = '글 복사'; }, 1500); }, sel); } catch (e) { sel(); }
});
</script>
`;
const out = path.join(process.env.OUT || __dirname, `${exam.school}-${exam.term.replace(' ', '')}.html`);
fs.writeFileSync(out, html);
console.log(out);
