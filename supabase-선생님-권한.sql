-- =========================================================
-- 선생님 비밀번호를 두 가지로 나누기
--   admin  = 원장 선생님. 모든 것
--   viewer = 다른 선생님. 학생 기록 보기만
-- 수파베이스 > SQL Editor 에 붙여 넣고 Run 하면 됩니다.
-- (2026-09-03 에 이미 실행했습니다)
-- =========================================================

alter table public.admin_secret
  add column if not exists role text not null default 'admin';

alter table public.admin_secret drop constraint if exists admin_secret_role_check;
alter table public.admin_secret
  add constraint admin_secret_role_check check (role in ('admin', 'viewer'));

-- 비밀번호가 어떤 권한인지 알려 줍니다. 틀리면 빈 글자입니다.
create or replace function public.teacher_role(pass text)
returns text
language sql stable security definer
set search_path to 'public'
as $$
  select coalesce((select s.role from public.admin_secret s
                    where s.password = pass and coalesce(pass, '') <> ''
                    limit 1), '');
$$;

grant execute on function public.teacher_role(text) to anon, authenticated;


-- ▶ 다른 선생님 비밀번호를 새로 정하거나 바꾸려면 아래 한 줄에서
--   'borat2026' 만 원하는 말로 바꿔 실행하세요.
insert into public.admin_secret (id, password, role)
values (2, 'borat2026', 'viewer')
on conflict (id) do update set password = excluded.password, role = excluded.role;


-- ▶ 아래 다섯 함수의 권한 검사가 바뀌었습니다.
--   admin_attempts        (기록 보기)        → 두 권한 모두
--   admin_question_stats  (어휘별 정답률)     → 두 권한 모두
--   admin_students        (재원생 명단)       → 원장 선생님만
--   set_homework_round    (이번 주 회차 정하기) → 원장 선생님만
--   sync_questions        (문제 은행 올리기)   → 원장 선생님만
--
--   함수 본문은 길어서 여기에 옮겨 적지 않았습니다.
--   각 함수 맨 앞의 검사 줄이 이렇게 바뀌었습니다.
--
--     (전) if not exists (select 1 from public.admin_secret where password = pass) then
--     (후, 기록 보기)  if public.teacher_role(pass) = '' then
--     (후, 원장 전용)  if public.teacher_role(pass) <> 'admin' then
