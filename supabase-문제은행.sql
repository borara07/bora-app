-- =========================================================
-- 출제된 문제 누적하기
--
-- 사용법: 수파베이스 SQL Editor 에 붙여넣고 Run 을 누르세요.
--         한 번만 실행하면 됩니다. 고칠 곳은 없습니다.
--
-- 이 파일이 하는 일
--   1) 문제 은행(questions)을 만듭니다
--   2) 학생이 시험을 볼 때마다 '어떤 문제가 나왔고 맞혔는지'를
--      한 줄씩 쌓습니다(attempt_items)
--   3) 어휘별 정답률을 볼 수 있는 표를 만듭니다
--
-- ※ 앱은 고치지 않아도 됩니다. 지금도 보내고 있는 자료를
--    수파베이스가 알아서 풀어서 쌓습니다.
-- =========================================================

create table if not exists public.questions (
  id             bigint generated always as identity primary key,
  round_title    text not null,          -- 회차
  word           text not null,          -- 어휘
  hanja          text,                   -- 한자
  correct_answer text,                   -- 정답
  choices        jsonb,                  -- 보기 4개
  explanation    text,                   -- 해설
  first_seen     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (round_title, word)
);

alter table public.questions enable row level security;

create table if not exists public.attempt_items (
  id             bigint generated always as identity primary key,
  attempt_id     bigint not null references public.quiz_attempts(id) on delete cascade,
  question_id    bigint references public.questions(id),
  student_id     uuid   references public.students(id),
  round_title    text not null,
  word           text not null,
  correct_answer text,
  my_answer      text,                   -- 학생이 고른 답
  is_correct     boolean not null,
  position       int,                    -- 몇 번째 문제였는지
  taken_at       timestamptz not null
);

create index if not exists attempt_items_question_idx on public.attempt_items (question_id);
create index if not exists attempt_items_student_idx  on public.attempt_items (student_id);
create index if not exists attempt_items_attempt_idx  on public.attempt_items (attempt_id);

alter table public.attempt_items enable row level security;

-- 시험 기록이 저장되면 문항을 한 줄씩 풀어서 쌓습니다
create or replace function public.expand_attempt_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.questions (round_title, word, hanja, correct_answer)
  select new.round_title, it->>'word', nullif(it->>'hanja', ''), it->>'answer'
    from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) it
   where coalesce(it->>'word', '') <> ''
  on conflict (round_title, word) do nothing;

  insert into public.attempt_items
    (attempt_id, question_id, student_id, round_title, word,
     correct_answer, my_answer, is_correct, position, taken_at)
  select new.id, q.id, new.student_id, new.round_title, t.it->>'word',
         t.it->>'answer', t.it->>'myAnswer',
         coalesce((t.it->>'correct')::boolean, false), t.ord, new.taken_at
    from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) with ordinality as t(it, ord)
    left join public.questions q
      on q.round_title = new.round_title and q.word = t.it->>'word'
   where coalesce(t.it->>'word', '') <> '';

  return null;
end;
$$;

drop trigger if exists quiz_attempts_expand_items on public.quiz_attempts;

create trigger quiz_attempts_expand_items
  after insert on public.quiz_attempts
  for each row execute function public.expand_attempt_items();

-- 이미 쌓인 기록도 문항으로 풀어 넣기 (다시 실행해도 중복되지 않습니다)
create or replace function public.rebuild_attempt_items()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  added integer;
begin
  insert into public.questions (round_title, word, hanja, correct_answer)
  select distinct a.round_title, it->>'word', nullif(it->>'hanja',''), it->>'answer'
    from public.quiz_attempts a,
         jsonb_array_elements(coalesce(a.items, '[]'::jsonb)) it
   where coalesce(it->>'word','') <> ''
  on conflict (round_title, word) do nothing;

  insert into public.attempt_items
    (attempt_id, question_id, student_id, round_title, word,
     correct_answer, my_answer, is_correct, position, taken_at)
  select a.id, q.id, a.student_id, a.round_title, t.it->>'word',
         t.it->>'answer', t.it->>'myAnswer',
         coalesce((t.it->>'correct')::boolean, false), t.ord, a.taken_at
    from public.quiz_attempts a
    cross join lateral jsonb_array_elements(coalesce(a.items,'[]'::jsonb)) with ordinality as t(it, ord)
    left join public.questions q
      on q.round_title = a.round_title and q.word = t.it->>'word'
   where coalesce(t.it->>'word','') <> ''
     and not exists (select 1 from public.attempt_items x where x.attempt_id = a.id);

  get diagnostics added = row_count;
  return added;
end;
$$;

revoke all on function public.rebuild_attempt_items() from public;

-- 어휘별 정답률
create or replace view public.question_stats as
select q.round_title                               as 회차,
       q.word                                      as 어휘,
       q.hanja                                     as 한자,
       q.correct_answer                            as 정답,
       count(i.id)                                 as 출제횟수,
       count(i.id) filter (where i.is_correct)     as 맞힌횟수,
       count(i.id) filter (where not i.is_correct) as 틀린횟수,
       case when count(i.id) = 0 then null
            else round(100.0 * count(i.id) filter (where i.is_correct) / count(i.id))
       end                                         as 정답률
  from public.questions q
  left join public.attempt_items i on i.question_id = q.id
 group by q.id, q.round_title, q.word, q.hanja, q.correct_answer;

-- 선생님용 화면에서 씁니다
create or replace function public.admin_question_stats(pass text)
returns table (
  round_title text, word text, hanja text,
  asked bigint, wrong bigint, accuracy numeric
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
    select q.round_title, q.word, q.hanja,
           count(i.id),
           count(i.id) filter (where not i.is_correct),
           case when count(i.id) = 0 then null
                else round(100.0 * count(i.id) filter (where i.is_correct) / count(i.id))
           end
      from public.questions q
      left join public.attempt_items i on i.question_id = q.id
     group by q.id, q.round_title, q.word, q.hanja
     order by q.round_title, q.word;
end;
$$;

revoke all on function public.admin_question_stats(text) from public;
grant execute on function public.admin_question_stats(text) to anon;


-- =========================================================
-- 어떤 어휘를 많이 틀렸는지 보려면:
--
--   select * from public.question_stats
--    where 출제횟수 > 0 order by 정답률;
-- =========================================================


-- =========================================================
-- 앱의 문제를 수파베이스에 한꺼번에 올리기
--
-- 선생님용 화면의 '문제 은행 올리기' 버튼이 이 기능을 씁니다.
-- 회차를 새로 추가한 뒤 그 버튼을 누르면 보기와 해설까지 전부 채워집니다.
-- =========================================================

create or replace function public.sync_questions(pass text, payload jsonb)
returns table (added int, updated int, total int)
language plpgsql
security definer
set search_path = public
as $$
declare
  a int := 0; u int := 0;
begin
  if not exists (select 1 from public.admin_secret where password = pass) then
    raise exception '비밀번호가 올바르지 않습니다';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'array' or jsonb_array_length(payload) = 0 then
    raise exception '보낼 문제가 없습니다';
  end if;

  with up as (
    insert into public.questions
      (round_title, word, hanja, correct_answer, choices, explanation, updated_at)
    select it->>'round_title',
           it->>'word',
           nullif(it->>'hanja', ''),
           it->>'correct_answer',
           it->'choices',
           nullif(it->>'explanation', ''),
           now()
      from jsonb_array_elements(payload) it
     where coalesce(it->>'round_title', '') <> ''
       and coalesce(it->>'word', '') <> ''
    on conflict (round_title, word) do update set
      hanja          = excluded.hanja,
      correct_answer = excluded.correct_answer,
      choices        = excluded.choices,
      explanation    = excluded.explanation,
      updated_at     = now()
    returning (xmax = 0) as is_new
  )
  select count(*) filter (where is_new), count(*) filter (where not is_new)
    into a, u from up;

  return query select a, u, (select count(*)::int from public.questions);
end;
$$;

revoke all on function public.sync_questions(text, jsonb) from public;
grant execute on function public.sync_questions(text, jsonb) to anon;
