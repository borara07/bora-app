-- =========================================================
-- 선생님용 '전체 기록 보기' 설정
--
-- 사용법: 수파베이스 SQL Editor 에 붙여넣고 Run 을 누르세요.
--
--   ★ 아래 딱 한 줄만 고치시면 됩니다 ★
--     '바꿀비밀번호' 를 선생님이 쓰실 비밀번호로 바꾸세요.
--     (따옴표는 그대로 두고 안쪽 글자만 바꿉니다)
--
-- 이 비밀번호는 앱 파일 어디에도 저장되지 않습니다.
-- 수파베이스에만 저장되고, 선생님이 입력할 때만 맞는지 확인합니다.
-- =========================================================

-- 1) 비밀번호를 담는 표 (앱에서는 절대 읽을 수 없습니다)
create table if not exists public.admin_secret (
  id       int  primary key default 1,
  password text not null
);

alter table public.admin_secret enable row level security;
-- 정책을 하나도 만들지 않습니다 = 앱에서 이 표는 읽을 수도 쓸 수도 없습니다

insert into public.admin_secret (id, password)
values (1, '바꿀비밀번호')                     -- ★ 여기만 고치세요 ★
on conflict (id) do update set password = excluded.password;


-- 2) 비밀번호가 맞을 때만 전체 기록을 돌려주는 기능
create or replace function public.admin_attempts(pass text)
returns setof public.quiz_attempts
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.admin_secret where password = pass) then
    raise exception '비밀번호가 올바르지 않습니다';
  end if;

  return query
    select * from public.quiz_attempts order by taken_at desc;
end;
$$;

revoke all on function public.admin_attempts(text) from public;
grant execute on function public.admin_attempts(text) to anon;


-- =========================================================
-- 나중에 비밀번호를 바꾸고 싶으면 아래 한 줄만 실행하세요.
--
--   update public.admin_secret set password = '새비밀번호' where id = 1;
-- =========================================================
