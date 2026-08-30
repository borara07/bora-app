-- =========================================================
-- 재원생만 테스트를 시작할 수 있게 하기
--
-- 사용법: 수파베이스 SQL Editor 에 붙여넣고 Run 을 누르세요.
--         한 번만 실행하면 됩니다. 고칠 곳은 없습니다.
--
-- 이 파일이 하는 일
--   1) 앱이 '이 사람이 재원생인가요?' 하고 물어볼 수 있게 합니다.
--      이름과 학부모님 전화번호 뒷 4자리가 명단과 맞아야 '맞다'고 답합니다.
--      명단 자체는 절대 밖으로 나가지 않고, 맞다/아니다만 답합니다.
--   2) 명단에 없는 사람의 시험 기록은 아예 저장되지 않게 막습니다.
--      (링크만 아는 사람이 앱을 열어도 시험을 시작할 수 없습니다)
--
-- ※ 먼저 supabase-학생명단.sql 로 재원생 명단을 만들어 두어야 합니다.
-- =========================================================


-- ---------------------------------------------------------
-- 1) 재원생인지 물어보는 기능
--
--    같은 학생인지 보는 기준은 앱의 다른 곳과 같습니다.
--      이름(띄어쓰기 무시) + 학부모님 전화번호 뒷 4자리
--    학교는 표기가 달라질 수 있어서 기준으로 쓰지 않습니다.
--    퇴원한 학생(active = false)은 '아니다'로 답합니다.
-- ---------------------------------------------------------

create or replace function public.check_enrolled(student_name text, phone4 text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
      from public.students s
     where s.active
       and s.name_key = lower(regexp_replace(coalesce(student_name, ''), '\s', '', 'g'))
       and s.parent_phone4 = regexp_replace(coalesce(phone4, ''), '[^0-9]', '', 'g')
       and regexp_replace(coalesce(phone4, ''), '[^0-9]', '', 'g') <> ''
       and coalesce(s.name_key, '') <> ''
  );
$$;

revoke all on function public.check_enrolled(text, text) from public;
grant execute on function public.check_enrolled(text, text) to anon;


-- ---------------------------------------------------------
-- 2) 명단에 있는 학생의 기록만 저장되게 하기
--
--    앱 화면에서도 막지만, 서버에서도 한 번 더 막습니다.
--    (앱 파일을 뜯어보는 사람이 있어도 기록을 넣을 수 없습니다)
-- ---------------------------------------------------------

drop policy if exists "앱에서 기록 추가만 허용" on public.quiz_attempts;
drop policy if exists "재원생 기록만 추가 허용" on public.quiz_attempts;

create policy "재원생 기록만 추가 허용"
  on public.quiz_attempts for insert to anon
  with check (public.check_enrolled(student_name, phone4));


-- =========================================================
-- 확인해 보기
--
--   -- 명단에 있는 학생이면 true 가 나옵니다
--   select public.check_enrolled('홍길동', '1234');
--
-- 명단이 시트와 달라졌으면 supabase-명단동기화.sql 의
-- sync_students 로 먼저 명단을 맞춰주세요.
-- =========================================================
