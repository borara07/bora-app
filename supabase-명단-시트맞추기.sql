-- =========================================================
-- 구글 시트 재원생 탭으로 앱 명단(students)을 맞추는 함수
--
-- 매주 자동 작업이 부릅니다. (시트-명단-맞추기.md)
-- 시트를 읽어 만든 명단(시트-명단-읽기.py 의 결과)을 받아서
--   - 새 학생은 넣고
--   - 반 · 학교 · 연락처가 바뀌면 고치고
--   - 내려가 있던 학생이 시트에 다시 있으면 올리고
--   - 시트에서 빠진 학생은 지우지 않고 내립니다 (active = false, 시험 기록은 그대로)
-- 선생님 계정(메모가 '선생님' 으로 시작)은 건드리지 않습니다.
--
-- mode
--   'check' — 무엇이 달라지는지 알려 주기만 합니다 (아무것도 안 바꿈)
--   'apply' — 바꿉니다. 단, 안전장치에 걸리면 바꾸지 않고 까닭을 알려 줍니다
--   'force' — 안전장치를 무시하고 바꿉니다 (선생님이 확인하신 뒤에만 씁니다)
--
-- 안전장치 (시트를 고치다 줄을 잘못 지운 채로 맞추는 것을 막습니다)
--   - 한 번에 5명 넘게 내려가는 경우
--   - 시트 인원이 지금 재원생의 8할 아래로 줄어든 경우
--
-- 학생 앱 · 선생님 화면에서는 부를 수 없습니다 (권한을 아예 주지 않았습니다).
-- 수파베이스 관리 화면이나 연결된 도구로만 부릅니다.
-- =========================================================

create or replace function public.sync_roster_from_sheet(payload jsonb, mode text default 'check')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n_sheet  int;
  n_active int;
  n_drop   int;
  blocked  text := null;
  result   jsonb;
  dup      text;
begin
  if mode not in ('check', 'apply', 'force') then
    raise exception 'mode 는 check · apply · force 중 하나입니다';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'array' or jsonb_array_length(payload) = 0 then
    raise exception '받은 명단이 비어 있습니다';
  end if;

  drop table if exists pg_temp._sheet;
  create temp table _sheet on commit drop as
  select btrim(x->>'name')                                                          as name,
         lower(regexp_replace(coalesce(x->>'name', ''), '\s', '', 'g'))              as n,
         right(regexp_replace(coalesce(x->>'parent_phone', ''), '[^0-9]', '', 'g'), 4) as p,
         nullif(btrim(x->>'school'), '')                                            as school,
         nullif(btrim(x->>'memo'), '')                                              as memo,
         coalesce(nullif(btrim(x->>'group'), ''), '고등부')                          as grp,
         nullif(btrim(x->>'parent_phone'), '')                                      as parent_phone,
         nullif(btrim(x->>'student_phone'), '')                                     as student_phone
    from jsonb_array_elements(payload) x
   where coalesce(btrim(x->>'name'), '') <> '';

  -- 학부모 연락처 뒷 4자리가 없으면 학생을 가릴 수 없습니다
  if exists (select 1 from _sheet where length(p) < 4) then
    raise exception '학부모 연락처가 없는 학생이 있습니다: %',
      (select string_agg(name, ', ') from _sheet where length(p) < 4);
  end if;

  -- 같은 학생(이름 + 뒷 4자리)이 두 번 오면 멈춥니다
  select string_agg(name || '(' || p || ')', ', ') into dup
    from (select min(name) name, p from _sheet group by n, p having count(*) > 1) d;
  if dup is not null then
    raise exception '명단에 같은 학생이 두 번 있습니다: %', dup;
  end if;

  select count(*) into n_sheet from _sheet;
  select count(*) into n_active from public.students
   where active and coalesce(memo, '') not like '선생님%';

  select count(*) into n_drop
    from public.students s
   where s.active and coalesce(s.memo, '') not like '선생님%'
     and not exists (select 1 from _sheet x where x.n = s.name_key and x.p = s.parent_phone4);

  if n_drop > 5 then
    blocked := '한 번에 ' || n_drop || '명이 내려갑니다 (5명까지만 저절로 반영합니다)';
  elsif n_sheet < n_active * 0.8 then
    blocked := '시트 인원(' || n_sheet || '명)이 지금 재원생(' || n_active || '명)의 8할보다 적습니다';
  end if;

  -- 무엇이 달라지는지 (바꾸기 전에 셉니다)
  result := jsonb_build_object(
    'mode', mode,
    'sheet_count', n_sheet,
    'active_before', n_active,
    'new', coalesce((
      select jsonb_agg(x.name || ' · ' || coalesce(x.memo, '') order by x.memo, x.name)
        from _sheet x
       where not exists (select 1 from public.students s
                          where s.name_key = x.n and s.parent_phone4 = x.p)), '[]'),
    'rejoined', coalesce((
      select jsonb_agg(x.name || ' · ' || coalesce(x.memo, '') order by x.memo, x.name)
        from _sheet x join public.students s on s.name_key = x.n and s.parent_phone4 = x.p
       where not s.active), '[]'),
    'dropped', coalesce((
      select jsonb_agg(s.name || ' · ' || coalesce(s.memo, '') order by s.memo, s.name)
        from public.students s
       where s.active and coalesce(s.memo, '') not like '선생님%'
         and not exists (select 1 from _sheet x where x.n = s.name_key and x.p = s.parent_phone4)), '[]'),
    'moved', coalesce((
      select jsonb_agg(s.name || ' · ' || coalesce(s.memo, '') || ' → ' || coalesce(x.memo, '') order by s.name)
        from _sheet x join public.students s on s.name_key = x.n and s.parent_phone4 = x.p
       where s.active and s.memo is distinct from x.memo), '[]'),
    'school_changed', coalesce((
      select jsonb_agg(s.name || ' · ' || coalesce(s.school, '') || ' → ' || coalesce(x.school, '') order by s.name)
        from _sheet x join public.students s on s.name_key = x.n and s.parent_phone4 = x.p
       where s.active and s.school is distinct from x.school), '[]'),
    'contact_changed', coalesce((
      select jsonb_agg(s.name order by s.name)
        from _sheet x join public.students s on s.name_key = x.n and s.parent_phone4 = x.p
       where s.active and (s.parent_phone is distinct from x.parent_phone
                       or s.student_phone is distinct from x.student_phone
                       or s.name is distinct from x.name)), '[]')
  );

  if mode = 'check' then
    return result || jsonb_build_object('applied', false, 'blocked', blocked);
  end if;
  if mode = 'apply' and blocked is not null then
    return result || jsonb_build_object('applied', false, 'blocked', blocked);
  end if;

  -- 있는 학생 고치기 (내려가 있던 학생은 다시 올립니다)
  update public.students s set
    name          = x.name,
    school        = x.school,
    parent_phone  = x.parent_phone,
    student_phone = x.student_phone,
    memo          = x.memo,
    grade_group   = x.grp,
    active        = true,
    synced_at     = now(),
    rejoined_at   = case when not s.active then now() else s.rejoined_at end,
    left_at       = case when not s.active then null  else s.left_at end
    from _sheet x
   where s.name_key = x.n and s.parent_phone4 = x.p
     and coalesce(s.memo, '') not like '선생님%';

  -- 새 학생 넣기 (name_key · parent_phone4 는 저절로 채워지는 칸입니다)
  insert into public.students
    (name, school, parent_phone, student_phone, memo, grade_group, active, synced_at, created_at)
  select x.name, x.school, x.parent_phone, x.student_phone, x.memo, x.grp, true, now(), now()
    from _sheet x
   where not exists (select 1 from public.students s
                      where s.name_key = x.n and s.parent_phone4 = x.p);

  -- 시트에서 빠진 학생 내리기 (지우지 않습니다)
  update public.students s set active = false, left_at = now(), synced_at = now()
   where s.active and coalesce(s.memo, '') not like '선생님%'
     and not exists (select 1 from _sheet x where x.n = s.name_key and x.p = s.parent_phone4);

  return result || jsonb_build_object(
    'applied', true,
    'blocked', blocked,
    'active_after', (select count(*) from public.students
                      where active and coalesce(memo, '') not like '선생님%'));
end;
$$;

-- 학생 앱(anon)과 로그인 사용자는 부를 수 없게 합니다
revoke all on function public.sync_roster_from_sheet(jsonb, text) from public;
revoke all on function public.sync_roster_from_sheet(jsonb, text) from anon;
revoke all on function public.sync_roster_from_sheet(jsonb, text) from authenticated;
