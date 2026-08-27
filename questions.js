/* =========================================================
   문제 파일 (여기만 고치면 됩니다)
   =========================================================

   ▶ 문제 하나는 아래처럼 생겼습니다.

     {
       word: "단어",
       choices: ["보기1", "보기2", "보기3", "보기4"],
       answer: 1,                       // 정답이 몇 번째 보기인지 (1~4)
       explanation: "해설 내용"
     },

   ▶ 규칙
     1. 보기(choices)는 반드시 4개를 적어주세요.
     2. answer 는 1, 2, 3, 4 중 하나입니다. (첫 번째 보기가 정답이면 1)
     3. 각 항목 끝에 쉼표( , )가 있는지 확인해주세요.
     4. 큰따옴표( " ) 안에 글자를 적습니다.
        만약 뜻 안에 큰따옴표를 쓰고 싶다면 작은따옴표( ' )로 대신 써주세요.
     5. 마지막 문제 뒤의 쉼표는 있어도 되고 없어도 됩니다.

   ▶ 문제를 더 넣고 싶으면 { ... } 블록을 복사해서 아래에 붙여넣으세요.
     문제를 20개 넣어두고 그중 10개만 랜덤으로 출제할 수도 있습니다.
     (아래 QUIZ_LENGTH 값을 조절하세요.)
   ========================================================= */

/* 한 번에 출제할 문제 수 (문제가 이 숫자보다 적으면 있는 만큼만 출제됩니다) */
var QUIZ_LENGTH = 10;

/* 시험지 제목 (화면 맨 위에 표시됩니다) */
var QUIZ_TITLE = "고등 영어 어휘 테스트";

var QUESTIONS = [
  {
    word: "abandon",
    choices: ["버리다, 포기하다", "존경하다", "설득하다", "동의하다"],
    answer: 1,
    explanation: "abandon = 버리다, 포기하다. ban(금지)과 헷갈리지 마세요. 예) abandon a plan 계획을 포기하다"
  },
  {
    word: "anticipate",
    choices: ["참여하다", "예상하다, 기대하다", "사과하다", "감소하다"],
    answer: 2,
    explanation: "anticipate = 예상하다, 기대하다. participate(참여하다)와 철자가 비슷하니 주의하세요."
  },
  {
    word: "crucial",
    choices: ["잔인한", "호기심 많은", "결정적인, 매우 중요한", "순환하는"],
    answer: 3,
    explanation: "crucial = 결정적인, 매우 중요한. = critical, essential. 예) a crucial role 결정적인 역할"
  },
  {
    word: "diminish",
    choices: ["구별하다", "분배하다", "발견하다", "줄어들다, 감소시키다"],
    answer: 4,
    explanation: "diminish = 줄어들다, 감소시키다. = decrease, reduce ↔ increase(증가하다)"
  },
  {
    word: "inevitable",
    choices: ["피할 수 없는, 필연적인", "믿을 수 없는", "보이지 않는", "가치 있는"],
    answer: 1,
    explanation: "inevitable = 피할 수 없는, 필연적인. in(부정) + evitable(피할 수 있는) 구조입니다."
  },
  {
    word: "reluctant",
    choices: ["관련 있는", "꺼리는, 마지못한", "신뢰할 수 있는", "빛나는"],
    answer: 2,
    explanation: "reluctant = 꺼리는, 마지못한. be reluctant to V = 마지못해 ~하다, ~하기를 꺼리다"
  },
  {
    word: "sustain",
    choices: ["의심하다", "제출하다", "지속시키다, 지탱하다", "대신하다"],
    answer: 3,
    explanation: "sustain = 지속시키다, 지탱하다. sustainable = 지속 가능한. 예) sustain life 생명을 유지시키다"
  },
  {
    word: "subtle",
    choices: ["안정된", "적합한", "갑작스러운", "미묘한, 감지하기 힘든"],
    answer: 4,
    explanation: "subtle = 미묘한, 감지하기 힘든. b는 발음하지 않아 [써틀]로 읽습니다."
  },
  {
    word: "abundant",
    choices: ["풍부한, 많은", "부족한", "지루한", "위험한"],
    answer: 1,
    explanation: "abundant = 풍부한, 많은. abundance(풍부) ↔ scarce(부족한)"
  },
  {
    word: "deliberate",
    choices: ["섬세한", "의도적인, 고의의", "무관심한", "일시적인"],
    answer: 2,
    explanation: "deliberate = (형용사) 의도적인, 고의의 / (동사) 심사숙고하다. deliberately = 고의로, 일부러"
  }
];
