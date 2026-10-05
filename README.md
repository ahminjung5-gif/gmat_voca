# GMAT VOCA 플래시카드

`GMAT_VOCA.xlsx`의 **Day별 학습** 시트(36 Day, 3,522단어)로 만든 단어 학습 게임입니다.
빌드 과정이 없는 정적 사이트라서 GitHub에 올리고 Vercel에 연결하면 바로 배포됩니다.

## 파일 구성

```
index.html            화면 구조
style.css             디자인
app.js                게임 로직
data/words.js         단어 데이터 (엑셀에서 변환)
scripts/convert_xlsx.py  엑셀 → data/words.js 변환 스크립트
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
폰트는 Pretendard(jsDelivr CDN)를 사용합니다.
