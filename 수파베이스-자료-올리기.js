/* =========================================================
   앱 파일에 들어 있는 자료를 수파베이스가 읽을 수 있는 모양으로 바꿉니다.

   하는 일
     exams.js    (모의고사 회차) → 수파베이스-올릴자료/exams.json
     readings.js (독해 지문)     → 수파베이스-올릴자료/readings.json

   왜 필요한가
     exams.js · readings.js 는 앱이 읽는 자바스크립트 파일이어서
     수파베이스가 그대로 읽을 수 없습니다. 같은 내용을 JSON 으로 한 벌 더
     만들어 두면, 수파베이스가 깃허브에서 그 파일을 직접 받아 표에 쌓습니다.
     (등급컷.json · 정답률.json 은 이미 JSON 이라 그대로 씁니다)

   쓰는 법 — 검은 창(터미널)에서
     node 수파베이스-자료-올리기.js

   회차나 지문을 새로 넣은 뒤에 한 번 실행하고, 깃허브에 올리면 됩니다.
   그다음 클로드에게 "수파베이스에 새 자료 올려줘" 라고 하시면 됩니다.
   ========================================================= */

var fs = require('fs');
var vm = require('vm');
var path = require('path');

var here = __dirname;
var outDir = path.join(here, '수파베이스-올릴자료');

/* 앱 파일을 그대로 읽어 들입니다 (앱이 브라우저에서 읽는 것과 같은 방식) */
function loadAppFile(name) {
  vm.runInThisContext(fs.readFileSync(path.join(here, name), 'utf8'), { filename: name });
}

loadAppFile('exams.js');
loadAppFile('readings.js');

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

function save(name, data) {
  var file = path.join(outDir, name);
  fs.writeFileSync(file, JSON.stringify(data, null, 1) + '\n', 'utf8');
  console.log('만들었습니다: 수파베이스-올릴자료/' + name + ' (' + data.length + '개)');
}

save('exams.json', EXAMS);
save('readings.json', READINGS);

console.log('');
console.log('이 두 파일을 깃허브에 올린 뒤, 클로드에게 수파베이스에 올려 달라고 하세요.');
