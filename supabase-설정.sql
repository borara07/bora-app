-- =========================================================
-- 어휘 테스트 점수 기록용 표 만들기
--
-- 사용법: 수파베이스 화면 왼쪽의 SQL Editor 를 열고
--         이 파일 내용을 전부 복사해 붙여넣은 뒤 Run 을 누르세요.
--         한 번만 실행하면 됩니다.
-- =========================================================

create table public.quiz_attempts (
  id           bigint generated always as identity primary key,
  student_name text        not null,   -- 학생 이름
  school       text        not null,   -- 학교
  phone4       text        not null,   -- 학부모님 전화번호 뒷 4자리
  round_title  text        not null,   -- 회차 이름
  correct      int         not null,   -- 맞은 개수
  total        int         not null,   -- 전체 문항 수
  percent      int         not null,   -- 정답률
  items        jsonb       not null,   -- 출제된 문제와 학생이 고른 답
  taken_at     timestamptz not null,   -- 시험 본 시각
  created_at   timestamptz not null default now()
);

-- 개인정보 보호 설정
-- 앱은 기록을 '넣기만' 할 수 있고, 남의 기록을 읽지는 못합니다.
-- 기록 확인은 수파베이스에 로그인해서 하세요.
alter table public.quiz_attempts enable row level security;

create policy "앱에서 기록 추가만 허용"
  on public.quiz_attempts for insert to anon with check (true);

-- 같은 학생의 기록을 빨리 찾기 위한 색인
create index quiz_attempts_student_idx
  on public.quiz_attempts (student_name, school, phone4, taken_at desc);
