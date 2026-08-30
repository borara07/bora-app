-- =========================================================
-- 재원생 명단을 넣고, 시험 기록을 학생별로 누적하기
--
-- 사용법: 수파베이스 SQL Editor 에 붙여넣고 초록 버튼(Run)을 누르세요.
--         한 번만 실행하면 됩니다. 고칠 곳은 없습니다.
--
-- 이 파일이 하는 일
--   1) 재원생 명단을 담을 표(students)를 만듭니다
--   2) 학생이 시험을 보면 명단의 누구인지 자동으로 연결합니다
--   3) 학생별 누적 성적을 한눈에 보는 표를 만듭니다
-- =========================================================


-- ---------------------------------------------------------
-- 1) 재원생 명단 표
-- ---------------------------------------------------------
create table if not exists public.students (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,          -- 이름
  school         text,                   -- 학교
  parent_phone   text,                   -- 학부모 연락처
  student_phone  text,                   -- 학생 연락처
  memo           text,                   -- 메모 (반, 요일 등 자유롭게)
  active         boolean not null default true,   -- 퇴원하면 false 로
  created_at     timestamptz not null default now(),

  -- 아래 두 칸은 자동으로 채워집니다 (직접 입력하지 마세요)
  -- 이름에서 띄어쓰기를 없앤 값 (김 민서 = 김민서 로 취급)
  name_key       text generated always as (
                   lower(regexp_replace(coalesce(name, ''), '\s', '', 'g'))
                 ) stored,
  -- 학부모 연락처의 뒷 4자리 (앱에서 학생이 입력하는 값과 맞춰 봅니다)
  parent_phone4  text generated always as (
                   right(regexp_replace(coalesce(parent_phone, ''), '[^0-9]', '', 'g'), 4)
                 ) stored
);

-- 같은 학생이 두 번 들어가지 않게 합니다
create unique index if not exists students_identity_idx
  on public.students (name_key, parent_phone4);

-- 명단에는 학생 이름과 연락처가 들어갑니다.
-- 정책을 하나도 만들지 않아서, 앱에서는 이 표를 읽을 수도 쓸 수도 없습니다.
alter table public.students enable row level security;


-- ---------------------------------------------------------
-- 2) 시험 기록을 명단의 학생과 연결
-- ---------------------------------------------------------
alter table public.quiz_attempts
  add column if not exists student_id uuid references public.students(id);

create index if not exists quiz_attempts_student_id_idx
  on public.quiz_attempts (student_id);

-- 시험 기록이 들어올 때 '이름 + 학부모 연락처 뒷 4자리' 로 명단에서 찾습니다
-- (학교는 '보라고' / '보라고등학교' 처럼 다르게 적힐 수 있어 기준으로 쓰지 않습니다)
create or replace function public.link_attempt_to_student()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select s.id
    into new.student_id
    from public.students s
   where s.name_key = lower(regexp_replace(coalesce(new.student_name, ''), '\s', '', 'g'))
     and s.parent_phone4 = new.phone4
   limit 1;

  return new;
end;
$$;

drop trigger if exists quiz_attempts_link_student on public.quiz_attempts;

create trigger quiz_attempts_link_student
  before insert on public.quiz_attempts
  for each row execute function public.link_attempt_to_student();


-- 이미 쌓여 있던 기록도 명단과 연결합니다
-- (명단을 새로 넣거나 고친 뒤에 다시 실행하면 됩니다)
create or replace function public.match_all_attempts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  update public.quiz_attempts a
     set student_id = s.id
    from public.students s
   where a.student_id is null
     and s.name_key = lower(regexp_replace(coalesce(a.student_name, ''), '\s', '', 'g'))
     and s.parent_phone4 = a.phone4;

  get diagnostics changed = row_count;
  return changed;
end;
$$;


-- ---------------------------------------------------------
-- 3) 학생별 누적 성적
-- ---------------------------------------------------------
create or replace view public.student_scores as
select
  s.id,
  s.name           as 이름,
  s.school         as 학교,
  s.parent_phone   as 학부모연락처,
  s.student_phone  as 학생연락처,
  s.active         as 재원중,
  count(a.id)                          as 응시횟수,
  count(distinct a.round_title)        as 본회차수,
  coalesce(round(avg(a.percent)), 0)   as 평균정답률,
  coalesce(sum(a.correct), 0)          as 맞은문항합,
  coalesce(sum(a.total), 0)            as 전체문항합,
  max(a.taken_at)                      as 최근응시
from public.students s
left join public.quiz_attempts a on a.student_id = s.id
group by s.id;


-- 명단에서 못 찾은 기록 (이름이나 번호를 잘못 입력한 경우 여기 모입니다)
create or replace view public.unmatched_attempts as
select id, student_name, school, phone4, round_title, correct, total, percent, taken_at
from public.quiz_attempts
where student_id is null
order by taken_at desc;


-- ---------------------------------------------------------
-- 선생님 계정인지 알려 주는 기능
--
--   메모(memo)가 '선생님' 으로 시작하는 줄을 선생님 계정으로 봅니다.
--   선생님도 시험을 볼 수 있어야 해서 명단에 넣어두지만,
--   통계에는 들어가지 않게 하려고 씁니다.
-- ---------------------------------------------------------
create or replace function public.is_teacher(student_name text, phone4 text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  return exists (
    select 1
      from public.students s
     where coalesce(s.memo, '') like '선생님%'
       and s.name_key = lower(regexp_replace(coalesce(student_name, ''), '\s', '', 'g'))
       and s.parent_phone4 = regexp_replace(coalesce(phone4, ''), '[^0-9]', '', 'g')
  );
end;
$$;

-- 이 함수는 선생님만 씁니다. 학생 앱에서는 부를 수 없게 막아 둡니다.
revoke all on function public.is_teacher(text, text) from public;
revoke all on function public.is_teacher(text, text) from anon, authenticated;


-- ---------------------------------------------------------
-- 4) 앱의 선생님용 화면에서 학생별 누적을 볼 수 있게 하기
--    (supabase-선생님.sql 에서 정한 비밀번호를 씁니다)
-- ---------------------------------------------------------
drop function if exists public.admin_students(text);

create or replace function public.admin_students(pass text)
returns table (
  name          text,
  school        text,
  parent_phone  text,
  student_phone text,
  class_name    text,   -- 반 (memo 에 적은 값)
  grade         text,   -- 반 이름 앞부분에서 뽑은 학년 (예: 고2)
  active        boolean,
  attempts      bigint,
  rounds_done   bigint,
  avg_percent   numeric,
  last_taken    timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.admin_secret where password = pass) then
    raise exception '비밀번호가 올바르지 않습니다';
  end if;

  return query
    select s.name, s.school, s.parent_phone, s.student_phone,
           s.memo,
           coalesce(nullif(split_part(coalesce(s.memo, ''), ' ', 1), ''), '미분류'),
           s.active,
           count(a.id),
           count(distinct a.round_title),
           coalesce(round(avg(a.percent)), 0),
           max(a.taken_at)
      from public.students s
      left join public.quiz_attempts a on a.student_id = s.id
     where coalesce(s.memo, '') not like '선생님%'   -- 선생님 계정은 통계에서 뺍니다
     group by s.id, s.name, s.school, s.parent_phone, s.student_phone, s.memo, s.active
     order by s.name;
end;
$$;

revoke all on function public.admin_students(text) from public;
grant execute on function public.admin_students(text) to anon;

-- 이 함수는 선생님만 씁니다. 학생 앱에서는 부를 수 없게 막아 둡니다.
revoke all on function public.match_all_attempts() from public;
revoke all on function public.match_all_attempts() from anon, authenticated;


-- =========================================================
-- 명단을 넣은 뒤 아래 한 줄을 실행하면
-- 그전에 쌓인 기록들도 학생과 연결됩니다.
--
--   select public.match_all_attempts();
-- =========================================================
