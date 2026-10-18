# 한 걸음 서재 · 튜토리얼 플레이그라운드

읽고 바로 해 보는 튜토리얼 사이트입니다. 이 저장소에는 **화면 코드와 자동화**만 있습니다.
글·단계·원문은 Google Drive(소유자 `soundfury37@gmail.com`)에 있고, 로그인한 학습자에게만 API로 전달됩니다.

- 사이트: https://reasonofmoon.github.io/hangeorum-playground/
- 관리자 웹앱: `gas/admin/.exec-url` (Google 계정 로그인 필요, 권한은 Drive 공유로 결정)
- 공개 읽기 API: `gas/api/.exec-url`

## 한눈에 보는 구조

```
학습자 브라우저 ── GitHub Pages(site/) ── gate.js ──▶ 공개 API (Apps Script, 소유자 권한)
                                                     │  비로그인: 목록 + 앞 2단계
                                                     │  학습자 명단: 전체 + 워터마크 + 조회 한도
                                                     ▼
편집자 ── 관리자 웹앱 (Apps Script, 접속자 권한) ──▶ Google Drive "한 걸음 서재 CMS"
                                                     ├─ 00_관리/한걸음서재_원본 (시트)
                                                     ├─ 10_미디어_공개 (링크 공개)
                                                     ├─ 20_미디어_초안 (팀만)
                                                     ├─ 30_자료/공개 · 학습자용
                                                     ├─ 40_게시본 (운영자만 편집)
                                                     └─ 50_원문 (소유자만)
```

| 역할 | 주는 Drive 권한 | 할 수 있는 일 |
|---|---|---|
| 운영자 | `40_게시본` 폴더 편집자 | 게시, 되돌리기, 학습자 명단, AI 키 |
| 편집자 | 원본 시트·`20`·`30` 폴더 편집자 | 작성, 이미지·GIF 업로드, 링크·메일·Classroom 공유 |
| 검수자 | 원본 시트 댓글 작성자/뷰어 | 미리보기, 시트에 댓글 |
| 학습자 | 없음 (시트 `learners` 탭에 이메일) | 사이트 전체 보기 |

## 폴더

| 경로 | 내용 |
|---|---|
| `site/` | GitHub Pages로 나가는 공개 파일. 원문·데이터 없음 |
| `site-src/` | 직접 고친 공개 파일(관문 스크립트, 이용 조건 등). 빌드 때 `site/`에 덮어씀 |
| `gas/api/` | 공개 읽기 API (clasp 프로젝트) |
| `gas/admin/` | 관리자 웹앱 (clasp 프로젝트) |
| `tools/` | 빌드·워터마크·Drive 설정·점검 스크립트 |
| `content/` | 새 실습 트랙 원본(JSON). 관리자 웹앱으로 시트에 가져옴 |
| `notebooks/` | Colab 노트북 (학습 기록 분석, Gemini 단계 초안, 품질 검사) |
| `docs/` | 운영 문서와 실습 안내 |

## 자동화

| 워크플로 | 언제 | 하는 일 |
|---|---|---|
| `pages.yml` | `site/` 변경 | 원문 누출 검사 후 GitHub Pages 배포 |
| `gas-deploy.yml` | `gas/` 변경 | `clasp push` 후 같은 배포 ID 갱신(주소 유지) |
| `health.yml` | 매일 08:30 KST | 사이트·API 응답, 비로그인 미리보기 제한 점검 |

`gas-deploy.yml`은 저장소 시크릿 `CLASPRC_JSON`(clasp 로그인 파일)을 씁니다. 이 값은 Google 계정 토큰이므로 저장소 협업자를 늘릴 때 주의하세요. 필요하면 Google 계정 → 보안 → 서드파티 연결에서 clasp 접근을 끊으면 즉시 무효가 됩니다.

## 로컬에서 고치기

```powershell
npm i -g @google/clasp      # 3.x
clasp login                  # soundfury37@gmail.com
cd gas/admin; clasp push --force   # 또는 main에 push하면 Actions가 배포
```

사이트 틀을 다시 만들 때(기존 미러가 있을 때만):

```powershell
node tools/build-site.mjs ..\_mirror ..\_gated
python tools/watermark.py site
node tools/drive-setup.mjs ..\_gated ..\_build\sheet.xlsx ..\_build\drive-state.json   # 원문 갱신
```

## 복제 방지 장치

- 공개 저장소·사이트에는 원문과 데이터 파일이 없습니다(빌드와 `pages.yml`이 검사).
- 비로그인 방문자는 튜토리얼마다 앞 2단계만 받습니다. 힌트·정답 기준은 빠집니다.
- 학습자 화면에는 계정과 추적 번호가 흐리게 깔립니다. 모든 조회는 `access_log`에 남습니다.
- 6시간당 조회 한도(기본 120회)를 넘으면 잠시 막힙니다.
- 스크린샷 806장에 워터마크가 들어 있고, 새로 올리는 PNG·JPG도 자동으로 들어갑니다.
- 인쇄하면 안내 문구만 나옵니다. 완전한 차단은 불가능하며, 목적은 대량 복제를 어렵게 하고 출처를 남기는 것입니다.

© 2026 한 걸음 서재. 코드 외 콘텐츠의 무단 복제·재배포를 금지합니다.
