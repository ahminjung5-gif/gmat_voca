# GMAT VOCA 플래시카드

`GMAT_VOCA.xlsx`의 **Day별 학습** 시트(36 Day, 3,522단어)로 만든 단어 학습 게임입니다.
빌드 과정이 없는 정적 사이트라서 GitHub에 올리고 Vercel에 연결하면 바로 배포됩니다.

## 파일 구성

```
index.html               화면 구조
style.css                디자인
app.js                   게임 로직, 기록 화면
store.js                 기록 저장 (이 기기 + Supabase 동기화)
config.js                Supabase 연결 정보 (직접 채워 넣기)
supabase/schema.sql      Supabase에 만들 테이블 (처음 만들 때)
supabase/migration_study.sql  공부 모드용 추가 테이블 (기존 프로젝트에 한 번 실행)
data/words.js            VOCA 데이터 (GMAT_VOCA.xlsx에서 변환)
data/rcsets.js           RC set 데이터 (GMAT_VOCA_RC_유의어_리스트.xlsx에서 변환)
scripts/convert_xlsx.py  VOCA 엑셀 → data/words.js
scripts/convert_rc.py    RC set 엑셀 → data/rcsets.js
```

## 배포 (GitHub + Vercel)

1. GitHub에서 새 저장소를 만들고 이 폴더의 파일을 모두 올립니다.
2. vercel.com → **Add New… → Project** → 방금 만든 저장소를 Import 합니다.
3. Framework Preset은 **Other**, Build Command와 Output Directory는 비워 둔 채 **Deploy**.
4. 이후 GitHub에 push할 때마다 자동으로 다시 배포됩니다.

로컬에서는 `index.html`을 더블클릭해도 실행됩니다.

## 단어장 수정하기

엑셀을 고친 뒤 아래 명령으로 데이터를 다시 만들고 push 하면 됩니다.

```bash
pip install openpyxl
python scripts/convert_xlsx.py GMAT_VOCA.xlsx
python scripts/convert_rc.py GMAT_VOCA_RC_유의어_리스트.xlsx
```

변환할 때 발음 기호의 깨진 문자(ӕ, Ʒ, |)를 æ, ʒ, ˈ 로 바꾸고,
DERIVATIVE 열에서 두 단어가 붙어 있는 경우(예: `suspiciousskepticism`)를 쉼표로 나눕니다.

## 게임 규칙

- Day를 1개 이상 고르고, 방법(뜻 맞히기 / 유의어·파생어 맞히기)을 선택해 시작
- 유의어·파생어 모드: 보기마다 단어 하나. "유의어·파생어인 것은?" 또는 "아닌 것은?"이 무작위로 출제
  (DERIVATIVE 단어가 3개 이상일 때만 "아닌 것은?" 문제가 나옴, DERIVATIVE가 없는 단어는 제외)
- 4지선다, 단어당 60초. 시간이 지나면 오답 처리
- 답을 고르면 카드가 뒤집히고, '다음 단어'를 눌러야 넘어감
- 힌트를 누르면 예문(EXAMPLE)이 보임
- 틀리면 카드가 뒤집히며 정답·뜻·예문을 바로 보여줌
- 한 라운드 안에서 맞힌 단어는 다시 나오지 않고, 틀린 단어는 뒤쪽에 다시 섞여 나옴
- 목숨 3개, 모두 잃으면 Game over → 틀린 단어만 다시 학습 가능
- 멈춤 버튼(또는 Esc)으로 언제든 일시정지. 다른 탭으로 가면 자동으로 멈춤

### 단축키

| 키 | 동작 |
|---|---|
| 1 ~ 4 | 보기 선택 |
| H | 힌트 |
| Enter | 다음 단어 |
| Esc / P | 멈춤 / 계속 |

오른쪽 위 ☀️/🌙 버튼으로 낮·밤 모드를 바꿀 수 있고, 선택은 저장됩니다.
한글은 Pretendard, 영어 단어와 숫자는 JetBrains Mono(Google Fonts)를 사용합니다.

## 로그인 · 기록 저장 (Supabase)

config.js가 비어 있으면 로그인 없이 이 기기에만 기록이 저장됩니다.
아래를 한 번 해두면 구글/이메일로 로그인하고 폰·PC 사이에 기록이 이어집니다.

### 1. 프로젝트 만들기
1. supabase.com 가입 → **New project** (Region은 Northeast Asia (Seoul) 추천, DB 비밀번호는 아무거나 저장해 두기)
2. 만들어지면 왼쪽 메뉴 **SQL Editor** → `supabase/schema.sql` 내용을 전부 붙여넣고 **Run**

### 2. config.js 채우기
1. 상단 **Connect** 버튼(또는 Project Settings → API Keys)에서
   - Project URL (`https://xxxx.supabase.co`)
   - Publishable key (`sb_publishable_...`) 또는 anon public key
2. `config.js`의 `SUPABASE_URL`, `SUPABASE_KEY`에 붙여넣고 GitHub에 올리기
   (이 두 값은 공개돼도 괜찮습니다. 기록은 RLS로 본인만 읽고 쓸 수 있어요. **service_role / secret key는 절대 넣지 마세요.**)

### 3. 로그인 후 돌아올 주소 등록
Authentication → **URL Configuration**
- Site URL: `https://내프로젝트.vercel.app`
- Redirect URLs: `https://내프로젝트.vercel.app/**` 추가

여기까지 하면 **이메일 로그인**(메일로 받은 링크 클릭)은 바로 됩니다.

### 4. Google 로그인 켜기 (선택)
1. console.cloud.google.com → 프로젝트 만들기 → **APIs & Services → OAuth consent screen** 설정 (External, 앱 이름·이메일만 입력)
2. **Credentials → Create credentials → OAuth client ID** → Web application
   - Authorized JavaScript origins: `https://내프로젝트.vercel.app`
   - Authorized redirect URIs: Supabase의 Authentication → Sign In / Providers → Google 화면에 나오는 Callback URL (`https://xxxx.supabase.co/auth/v1/callback`)
3. 발급된 Client ID / Client Secret을 Supabase의 Google provider에 붙여넣고 Enable → Save

### 저장되는 기록
- 단어별: 맞힌 횟수, 틀린 횟수, 마지막으로 본 시간 (뜻 / 유의어 모드 따로)
- 날짜별: 푼 단어 수, 정답 수, 학습 시간 → 연속 학습일, 최근 14일 그래프
- 학습 한 판마다: 모드, Day, 맞힘/틀림/힌트, 결과
- 닉네임

### 규칙
- 게임 출제 순서: 헷갈리는 단어와 자주 틀린 단어가 먼저, 나머지는 무작위
- 로그인 전에 공부한 기록은 첫 로그인 때 계정으로 옮겨짐
- 인터넷이 끊겨도 기기에 먼저 저장하고, 연결되면 다시 올림

## 화면 구성

1. **첫 화면:** ○○님의 기록(변신 캐릭터, 연속 학습일, 오늘의 조건, 오늘 푼 문제 / 헷갈리는 단어 / 어려운 단어)과
   **VOCA / RC set** 박스. 각 박스 안의 **Study mode / Game mode**를 누르면 시작합니다.
2. **Day 선택 화면:** Day를 고르고 옵션을 정한 뒤 시작. 오른쪽 위 "단어장"으로 그 덱의 단어장을 엽니다.

## 연속 학습 기준

하루 안에 **VOCA Day 1개(100장)**와 **RC set Day 1개(30세트)**를 공부 모드에서 **둘 다 끝까지** 보면 그날이 인정됩니다.
어느 Day든 상관없고, 중간에 나갔다 와도 그날 안에 다 보면 됩니다. 게임은 세지 않습니다.
(규칙이 바뀌기 전 기록은 공부한 날이면 인정)

연속 학습일이 쌓이면 평범한 수험생이 마법소녀로 변신합니다.
1일 첫 반짝임 → 3일 마법 리본 → 7일 요술봉 → 14일 변신 드레스 → 30일 별빛 날개 → 100일 별의 왕관.

## Study mode

- **VOCA:** 카드를 누르면 뒤집힘. 앞면은 단어 또는 뜻
- **RC set:** 뒤집기 없이 한 장에 표제어, 난이도, 등장 횟수, 뜻 번호별 유의어가 바로 보임
- **애매** = 헷갈리는 단어, **어렵** = 어려운 단어 (다시 누르면 해제). VOCA와 RC set은 따로 관리
- **RC set 유의어 체크:** 카드의 유의어 칩을 누르면 그 유의어만 '헷갈리는 유의어'로 체크 (세트별). RC 게임에서 보기로 더 자주 나옴
- **카드 / 리스트** 전환 (위쪽 메뉴는 고정). 리스트 각 줄의 애매/어렵을 한 번 눌러 바로 체크, 단어를 누르면 그 카드로 이동
- 볼 단어: 전체 / 애매 / 어렵 / 애매+어렵, 순서대로 또는 섞기
- PC 단축키: ← → 넘기기, 스페이스 뒤집기(VOCA), 1 애매, 2 어렵, L 카드/리스트, Esc 나가기
- Day 칸 막대 = 공부 모드에서 한 번이라도 본 카드 비율, 배지 = 애매(노랑) / 어렵(빨강) 수
- 단어장: 헷갈리는 단어 / 어려운 단어 (RC set은 헷갈리는 유의어 탭 추가)

## Game mode

- **VOCA:** 뜻 맞히기 / 유의어·파생어 맞히기
- **RC set:** "표제어의 유의어인 것은?"과 "유의어가 아닌 것은?"이 무작위. 힌트는 예문(있으면) 또는 뜻 앞부분
- 목숨 3개, 문제당 60초, 어렵 → 애매 → 자주 틀린 단어 순으로 먼저 출제

## 업데이트할 때
Supabase SQL Editor에서 `supabase/migration.sql`을 실행하세요(여러 번 실행해도 안전).
실행 전에도 앱은 동작하지만 일부 기록(체크, RC 게임 기록, 오늘의 조건)은 이 기기에만 저장되고, 실행 후 다음 접속 때 계정으로 올라갑니다.
