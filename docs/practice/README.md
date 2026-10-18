# 구글 워크스페이스 실습 트랙 (GW01~GW07)

한 걸음 서재 · 튜토리얼 플레이그라운드를 직접 운영하면서 구글 도구를 익히는 실습 7개입니다.
각 실습의 단계 원본은 [`content/gw-track.json`](../../content/gw-track.json)에 있습니다.

**시작 순서 추천**: GW01 → GW02 (코드 관리) → GW03 (콘텐츠 편집) → GW04·GW05 (기록 보기) → GW06 (AI 초안) → GW07 (수업 배포)

## 실습 목록

| 코드 | 실습 | 쓰는 구글 도구 | 단계 | 예상 시간* |
| --- | --- | --- | --- | --- |
| GW01 | clasp로 Apps Script 프로젝트를 내 컴퓨터와 GitHub에서 관리하기 | Apps Script, clasp | 8 | 16분 |
| GW02 | GitHub Actions로 Apps Script 자동 배포하기 | Apps Script, clasp, (GitHub Actions) | 8 | 16분 |
| GW03 | 구글 시트를 콘텐츠 관리 도구로 쓰기 | Google Sheets, Apps Script 웹 앱, Google Drive | 7 | 14분 |
| GW04 | Looker Studio로 학습 기록 대시보드 만들기 | Data Studio(옛 이름 Looker Studio), Google Sheets | 8 | 16분 |
| GW05 | Colab에서 학습 기록 분석하기 | Google Colab, Google Sheets | 7 | 14분 |
| GW06 | AI Studio에서 Gemini API 키 만들고 단계 초안 받기 | Google AI Studio, Gemini API, Colab, Apps Script | 8 | 16분 |
| GW07 | Classroom 수업에 튜토리얼 링크 나눠 주기 | Google Classroom, Google Sheets | 7 | 14분 |

\* 예상 시간은 "단일 행동 수 × 2분"으로 잡은 편집 추정입니다. 실제로 재 본 값이 아닙니다.

> 참고: Looker Studio는 2026년 4월에 이름이 **Data Studio**로 바뀌었습니다. 주소는 https://datastudio.google.com 이고, 옛 주소 lookerstudio.google.com은 새 주소로 넘어갑니다.

## Colab 노트북

| 노트북 | 하는 일 | 함께 쓰는 실습 | 열기 |
| --- | --- | --- | --- |
| `01_access_log_analysis.ipynb` | `access_log`로 날짜별 조회 수, 튜토리얼 순위, 사용자 수, 429 횟수 보기 | GW05 | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/Reasonofmoon/hangeorum-playground/blob/main/notebooks/01_access_log_analysis.ipynb) |
| `02_gemini_step_drafts.ipynb` | Gemini(`gemini-3.8-flash`)로 단계 초안 JSON을 받고 `steps` 탭용 CSV 만들기 | GW06 | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/Reasonofmoon/hangeorum-playground/blob/main/notebooks/02_gemini_step_drafts.ipynb) |
| `03_catalog_quality_check.ipynb` | 대체 텍스트 누락, 빈 `expected`/`recovery`, 단계 0개, `code` 중복 점검 | GW03 | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/Reasonofmoon/hangeorum-playground/blob/main/notebooks/03_catalog_quality_check.ipynb) |

## 꼭 지킬 것

- **비밀값은 저장소에 올리지 않습니다.** `.clasprc.json`(Google 로그인 토큰)은 GitHub 저장소 시크릿 `CLASPRC_JSON`에만, Gemini API 키는 Colab **Secrets**나 Apps Script **Script Properties**에만 둡니다.
- **AI 초안은 사람이 검토한 뒤에만 게시합니다.** 메뉴 이름과 명령은 공식 문서와 대조합니다.
- **공유 보고서에 이메일 열을 넣지 않습니다.** `access_log`와 `learners`에는 개인정보가 있습니다.

## 아직 확인이 필요한 부분 (확인 필요)

- 관리자 웹 앱의 버튼 이름(저장, 게시 요청, Classroom 명단 동기화): 앱 화면과 대조해야 합니다.
- `gas-deploy.yml`이 배포 ID를 어디에 두는지(워크플로 파일 또는 시크릿).
- 개인 Google 계정으로 Classroom 명단을 동기화할 때 이메일을 받을 수 있는지. Classroom 도움말에는 개인 계정에서 "이메일 주소 표시" 기능을 쓸 수 없다고 나옵니다.
- Colab 메뉴 이름(Drive에 사본 저장, 런타임 다시 시작)과 Secrets의 노트북 접근 스위치 이름.
- Data Studio의 기본 개수 필드 이름과 `ts` 날짜 형식 변환 필요 여부.
- clasp 접근 권한을 해제하는 Google 계정 메뉴 위치.

## 공식 문서

- clasp: https://github.com/google/clasp
- Apps Script 배포: https://developers.google.com/apps-script/concepts/deployments
- GitHub Actions 시크릿: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets
- Data Studio Google Sheets 연결: https://docs.cloud.google.com/data-studio/connect-to-google-sheets
- gspread Colab 인증: https://docs.gspread.org/en/latest/advanced.html
- Gemini API 키: https://ai.google.dev/gemini-api/docs/api-key
- Gemini 모델 목록: https://ai.google.dev/gemini-api/docs/models
- Classroom 사용 한도: https://support.google.com/edu/classroom/answer/7300976
