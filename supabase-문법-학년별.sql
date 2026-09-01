-- =========================================================
-- 문법 시험을 학년별로 열기
-- 수파베이스 > SQL Editor 에 붙여 넣고 Run 하면 됩니다.
-- (2026-09-03 에 이미 실행했습니다. 다시 실행해도 탈이 없습니다)
-- =========================================================

-- 명단 메모 앞머리에서 학년을 읽어 냅니다
--   '고1 금 · 26기'  →  '고1'
--   '중3 토 오전'    →  '중3'
--   '선생님'          →  ''      (학년 없음)
create or replace function public.guess_grade(memo text)
returns text
language sql
immutable
as $$
  select case
           when substring(btrim(coalesce(memo, '')) from '^(중[1-3]|고[1-3])') is not null
             then substring(btrim(coalesce(memo, '')) from '^(중[1-3]|고[1-3])')
           else ''
         end;
$$;

-- 재원생 확인이 반과 함께 학년도 돌려줍니다.
-- 명단은 여전히 앱으로 내려보내지 않습니다. 그 학생의 반·학년만 알려 줍니다.
create or replace function public.check_enrolled_group(student_name text, phone4 text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select jsonb_build_object(
              'ok', true,
              'group', coalesce(nullif(btrim(s.grade_group), ''), public.guess_group(s.memo)),
              'grade', public.guess_grade(s.memo))
       from public.students s
      where s.active
        and s.name_key = lower(regexp_replace(coalesce(student_name, ''), '\s', '', 'g'))
        and s.parent_phone4 = regexp_replace(coalesce(phone4, ''), '[^0-9]', '', 'g')
        and regexp_replace(coalesce(phone4, ''), '[^0-9]', '', 'g') <> ''
        and coalesce(s.name_key, '') <> ''
      limit 1),
    jsonb_build_object('ok', false, 'group', '', 'grade', ''));
$$;

grant execute on function public.check_enrolled_group(text, text) to anon, authenticated;
grant execute on function public.guess_grade(text) to anon, authenticated;

-- 회차를 저장하는 함수(set_homework_round)는 고치지 않아도 됩니다.
-- 선생님 화면이 '문법:고1' 처럼 넘겨 주면
-- app_settings 에 'homework_round:문법:고1' 로 저장됩니다.
