-- =========================================================
-- 이번 주 숙제 회차 정하기
--
-- 사용법: 수파베이스 SQL Editor 에 붙여넣고 Run 을 누르세요.
--         한 번만 실행하면 됩니다. 고칠 곳은 없습니다.
--
-- 이 파일이 하는 일
--   선생님이 정한 '이번 주 숙제 회차'를 저장합니다.
--   학생 화면에는 그 회차 하나만 보이고, 다른 회차는 고를 수 없습니다.
--   같은 회차는 몇 번이든 다시 풀 수 있습니다.
-- =========================================================

create table if not exists public.app_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

-- 학생 앱은 '이번 주 숙제 회차' 한 줄만 읽을 수 있습니다.
-- (다른 설정이 생겨도 학생에게는 보이지 않습니다)
drop policy if exists "숙제 회차만 읽기" on public.app_settings;

create policy "숙제 회차만 읽기"
  on public.app_settings for select to anon
  using (key = 'homework_round');

insert into public.app_settings (key, value)
values ('homework_round', '')
on conflict (key) do nothing;


-- 선생님용: 비밀번호가 맞을 때만 숙제 회차를 바꿉니다
create or replace function public.set_homework_round(pass text, round text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.admin_secret where password = pass) then
    raise exception '비밀번호가 올바르지 않습니다';
  end if;

  insert into public.app_settings (key, value, updated_at)
  values ('homework_round', coalesce(round, ''), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();

  return coalesce(round, '');
end;
$$;

revoke all on function public.set_homework_round(text, text) from public;
grant execute on function public.set_homework_round(text, text) to anon;


-- =========================================================
-- 지금 숙제 회차 확인하기:
--   select value from public.app_settings where key = 'homework_round';
--
-- 값이 비어 있으면 학생이 모든 회차를 고를 수 있습니다.
-- =========================================================
