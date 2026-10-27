-- =========================================================
-- 파일에만 있던 학원 자료를 수파베이스에 쌓기
--
-- 사용법: 수파베이스 SQL Editor 에 붙여넣고 Run 을 누르세요.
--         한 번만 실행하면 됩니다. 고칠 곳은 없습니다.
--
-- 이 파일이 하는 일 — 표 네 개를 만듭니다
--   1) exams       모의고사 회차 설정 (정답·배점·영역·등급컷)   ← exams.js
--   2) readings    독해 지문과 문단별 요약 문제                ← readings.js
--   3) grade_cuts  교육청·평가원 등급컷 모음                   ← 모의고사/등급컷/등급컷.json
--   4) item_rates  모의고사 문항별 정답률 모음                 ← 모의고사/정답률/정답률.json
--
-- 왜 쌓나요
--   지금까지 이 네 가지는 저장소 파일에만 있었습니다. 파일이 사라지면 같이 사라지고,
--   선생님 화면에서 꺼내 볼 수도 없었습니다. 수파베이스에 같이 쌓아 두면
--   앱과 상관없이 자료가 남고, 나중에 화면에서 바로 꺼내 쓸 수 있습니다.
--
-- 자료를 올리고 바꾸는 것은 `수파베이스-자료-올리기.js` 가 만들어 주는 SQL 로 합니다.
-- (저장소 파일이 기준입니다. 파일을 고친 뒤 다시 올리면 수파베이스도 같은 내용이 됩니다)
--
-- ※ supabase-선생님-권한.sql 을 먼저 실행해주세요. (teacher_role 기능을 씁니다)
-- =========================================================

-- ---------------------------------------------------------
-- 1) 모의고사 회차 설정
-- ---------------------------------------------------------
create table if not exists public.exams (
  id         bigint generated always as identity primary key,
  grade      text not null,            -- 학년 (고2 · 예비고(중3) …)
  title      text not null,            -- 모의고사 이름 (심화모의고사 10월)
  exam_date  date,                     -- 시행일
  choices    jsonb,                    -- 선택과목 목록
  cuts       jsonb,                    -- 등급컷
  answers    jsonb,                    -- 정답 (공통 / 화법과 작문 / 언어와 매체)
  points     jsonb,                    -- 배점
  areas      jsonb,                    -- 영역 표
  updated_at timestamptz not null default now(),
  unique (grade, title)
);

alter table public.exams enable row level security;
-- 정책을 하나도 만들지 않습니다 = 학생 앱에서는 읽을 수도 쓸 수도 없습니다

-- ---------------------------------------------------------
-- 2) 독해 지문
-- ---------------------------------------------------------
create table if not exists public.readings (
  id         bigint generated always as identity primary key,
  area       text not null,            -- 분야 (인문예술 · 사회문화 · 과학기술)
  no         int  not null,            -- 분야 안에서의 번호
  title      text not null,            -- 지문 이름
  paragraphs jsonb not null,           -- 문단 본문·요약 문장·보기·해설·근거
  updated_at timestamptz not null default now(),
  unique (area, no)
);

alter table public.readings enable row level security;

-- ---------------------------------------------------------
-- 3) 등급컷 모음 (교육청 학력평가 · 평가원 모의평가 · 수능)
-- ---------------------------------------------------------
create table if not exists public.grade_cuts (
  id         bigint generated always as identity primary key,
  grade      text not null,            -- 학년
  exam_date  date not null,            -- 시행일
  choices    jsonb,                    -- 선택과목 목록
  cuts       jsonb not null,           -- 등급별 표준점수·백분위·원점수
  updated_at timestamptz not null default now(),
  unique (grade, exam_date)
);

alter table public.grade_cuts enable row level security;

-- ---------------------------------------------------------
-- 4) 문항별 정답률 모음
-- ---------------------------------------------------------
create table if not exists public.item_rates (
  id         bigint generated always as identity primary key,
  grade      text not null,            -- 학년
  year       int  not null,            -- 연도
  month      int  not null,            -- 월
  subject    text not null,            -- 선택과목 (국어통합 · 화법과 작문 …)
  exam_date  date,                     -- 시행일
  items      jsonb not null,           -- 문항별 정답·배점·난이도·정답률·선지별 비율
  updated_at timestamptz not null default now(),
  unique (grade, year, month, subject)
);

alter table public.item_rates enable row level security;


-- =========================================================
-- 선생님 화면에서 꺼내 보는 기능
--   비밀번호가 맞아야만 돌려줍니다. (원장·다른 선생님 모두 볼 수 있습니다)
--   학생 개인정보가 들어 있지 않은 수업 자료라서 두 권한 모두 열어 둡니다.
-- =========================================================

create or replace function public.admin_exams(pass text)
returns setof public.exams
language plpgsql stable security definer
set search_path = public
as $$
begin
  if public.teacher_role(pass) = '' then
    raise exception '비밀번호가 올바르지 않습니다';
  end if;
  return query select e.* from public.exams e order by e.exam_date desc nulls last, e.grade;
end;
$$;

create or replace function public.admin_readings(pass text)
returns setof public.readings
language plpgsql stable security definer
set search_path = public
as $$
begin
  if public.teacher_role(pass) = '' then
    raise exception '비밀번호가 올바르지 않습니다';
  end if;
  return query select r.* from public.readings r order by r.area, r.no;
end;
$$;

create or replace function public.admin_grade_cuts(pass text)
returns setof public.grade_cuts
language plpgsql stable security definer
set search_path = public
as $$
begin
  if public.teacher_role(pass) = '' then
    raise exception '비밀번호가 올바르지 않습니다';
  end if;
  return query select c.* from public.grade_cuts c order by c.exam_date desc, c.grade;
end;
$$;

create or replace function public.admin_item_rates(pass text)
returns setof public.item_rates
language plpgsql stable security definer
set search_path = public
as $$
begin
  if public.teacher_role(pass) = '' then
    raise exception '비밀번호가 올바르지 않습니다';
  end if;
  return query select i.* from public.item_rates i order by i.year desc, i.month desc, i.grade;
end;
$$;

revoke all on function public.admin_exams(text)      from public;
revoke all on function public.admin_readings(text)   from public;
revoke all on function public.admin_grade_cuts(text) from public;
revoke all on function public.admin_item_rates(text) from public;

grant execute on function public.admin_exams(text)      to anon, authenticated;
grant execute on function public.admin_readings(text)   to anon, authenticated;
grant execute on function public.admin_grade_cuts(text) to anon, authenticated;
grant execute on function public.admin_item_rates(text) to anon, authenticated;
