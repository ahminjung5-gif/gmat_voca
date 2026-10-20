-- =========================================================
-- 업데이트용 SQL: 공부 모드, 애매/어렵 체크, RC set, 새 연속 학습 기준, Day 진도
-- (이미 schema.sql 을 실행한 프로젝트에서 실행)
-- Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다.
-- =========================================================

-- 단어 체크 (외운 단어 / 헷갈리는 단어)
create table if not exists public.bookmarks (
  user_id uuid not null references auth.users (id) on delete cascade,
  word text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, word)
);

-- 공부 모드 이어보기 위치
create table if not exists public.study_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  idx int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- 날짜별로 공부 모드에서 본 카드 수
alter table public.daily_activity add column if not exists viewed int not null default 0;

alter table public.bookmarks      enable row level security;
alter table public.study_progress enable row level security;

drop policy if exists "own bookmarks" on public.bookmarks;
create policy "own bookmarks" on public.bookmarks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own study_progress" on public.study_progress;
create policy "own study_progress" on public.study_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 체크 종류: vague = 애매(헷갈리는 단어), hard = 어렵(어려운 단어)  (known은 예전 '오키', 앱에서 정리됨)
alter table public.bookmarks add column if not exists status text not null default 'vague';
alter table public.bookmarks drop constraint if exists bookmarks_status_check;
alter table public.bookmarks add constraint bookmarks_status_check check (status in ('known', 'vague', 'hard'));

-- 공부 모드에서 한 번이라도 본 카드 (Day 진도 막대)
create table if not exists public.seen_cards (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  seen_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.seen_cards enable row level security;
drop policy if exists "own seen_cards" on public.seen_cards;
create policy "own seen_cards" on public.seen_cards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.seen_cards to authenticated;

-- RC set 게임 기록(mode = 'r') 허용
alter table public.word_stats drop constraint if exists word_stats_mode_check;
alter table public.word_stats add constraint word_stats_mode_check check (mode in ('m', 'v', 'r'));

-- 연속 학습 기준: 그날 VOCA Day 1개, RC set Day 1개를 끝까지 봤는지
alter table public.daily_activity add column if not exists voca_done boolean;
alter table public.daily_activity add column if not exists rc_done boolean;

grant select, insert, update, delete on public.bookmarks, public.study_progress to authenticated;

-- =========================================================
-- 기기 간 '오늘의 연속 학습 조건' 동기화
-- =========================================================

-- 오늘 공부 모드에서 본 카드 (폰 + PC에서 본 것을 합쳐서 Day 완료를 판단)
create table if not exists public.today_views (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  deck text not null check (deck in ('voca', 'rc')),
  day_no int not null,
  key text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day, deck, key)
);
alter table public.today_views enable row level security;
drop policy if exists "own today_views" on public.today_views;
create policy "own today_views" on public.today_views
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.today_views to authenticated;

-- 하루 기록을 덮어쓰지 않고 합치기: 숫자는 큰 값, 완료 표시는 한 번 켜지면 유지
create or replace function public.merge_daily(
  p_day date, p_answered int, p_correct int, p_seconds int, p_viewed int,
  p_voca_done boolean, p_rc_done boolean
) returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.daily_activity (user_id, day, answered, correct, seconds, viewed, voca_done, rc_done)
  values (auth.uid(), p_day, coalesce(p_answered, 0), coalesce(p_correct, 0), coalesce(p_seconds, 0), coalesce(p_viewed, 0), p_voca_done, p_rc_done)
  on conflict (user_id, day) do update set
    answered  = greatest(daily_activity.answered, excluded.answered),
    correct   = greatest(daily_activity.correct, excluded.correct),
    seconds   = greatest(daily_activity.seconds, excluded.seconds),
    viewed    = greatest(daily_activity.viewed, excluded.viewed),
    voca_done = case when excluded.voca_done is null then daily_activity.voca_done
                     else coalesce(daily_activity.voca_done, false) or excluded.voca_done end,
    rc_done   = case when excluded.rc_done is null then daily_activity.rc_done
                     else coalesce(daily_activity.rc_done, false) or excluded.rc_done end;
$$;
grant execute on function public.merge_daily(date, int, int, int, int, boolean, boolean) to authenticated;
