# Project Dugout

야구단 단장 시뮬레이션. **선수의 진짜 능력은 아무도 모릅니다** — 플레이어도, AI 구단도
스카우트의 추정치로만 판단합니다.

플레이: **https://baseball.ysw.kr**

빌드 도구 없이 브라우저에서 그대로 돌아갑니다. 서버가 없고, 세이브는 브라우저에 자동 저장됩니다.

## 구조

```
web/            정적 배포본 (GitHub Pages 가 이 폴더를 서빙한다)
  js/core/      시뮬레이션 코어 — UI 를 전혀 모른다
    pa.js         타석 확률 엔진 (로그오즈 가산 모델)
    game.js       진루 모델 · 이닝 루프 · 투수 교체 AI
    season.js     일정 · 기록 집계 · WAR · 포스트시즌
    development.js 성장/노화 (능력마다 노화 곡선이 다르다)
    injury.js     부상 발생/심각도/영구 손상
    scouting.js   스카우팅 오차 (72%는 리그 전체가 공유)
    draft.js      아마추어 드래프트
    contract.js   계약 · 서비스타임 · 보유권 · 구단 재정
    market.js     FA 시장 · 트레이드 AI
    league.js     다년 리그 루프
    api.js        JSON API — UI 가 소비하는 유일한 경계면
  js/ui.js      화면
  js/save.js    자동저장 직렬화

proto/          Python 참조 구현 + 검증 하네스 + 설계 문서
```

## 설계 문서

`proto/DESIGN_*.md` 에 각 시스템의 수식, 계수 표, 검증 결과, 알려진 한계가 있습니다.

| 문서 | 내용 |
|---|---|
| `DESIGN_PA.md` | 타석 수식과 계수 표 |
| `DESIGN_GAME.md` | 진루 모델, 투수 교체 |
| `DESIGN_SEASON.md` | 일정, 실점 귀속, 게임 내부 WAR |
| `DESIGN_DEV.md` | 능력별 노화 곡선 |
| `DESIGN_INJURY.md` | 부상 2단계 모델과 영구 손상 |
| `DESIGN_DRAFT.md` | 스카우팅 오차, 드래프트 검증 (대조군 실험 포함) |
| `DESIGN_MARKET.md` | 계약·FA·트레이드 |
| `DESIGN_UI.md` | API 계약과 화면 설계 |
| `DESIGN_SAVE.md` | 자동저장 직렬화 |

## 검증

Python 참조 구현으로 시뮬레이션을 보정했습니다. 60시즌을 돌려도 리그 환경이 표류하지 않습니다.

목표는 **최근 KBO** 입니다. 2026 시즌 진행분의 10구단 합계에서 직접 계산한
값(타율 .269 · 득점 5.12 · 안타 9.28 · 홈런 0.95 · K/9 7.75 · BB/9 3.79)을 기준으로 맞췄습니다.

```
4000경기   타율 .267   득점 4.97   안타 9.34   홈런 1.02   K/9 7.75   BB/9 3.78
30시즌     타율 .268 → .267   득점 5.03 → 4.90   표류 없음
           우승 구단 7/10 · 1~10위 승률차 0.27 → 0.29 (경쟁 균형 유지)
타자 WAR 정점 28세     주력은 21세 정점 후 38세까지 -14점, 제구는 오히려 상승
드래프트 1라운드 평균 12.4 WAR / 4라운드 0.9 — 전체 1순위도 13%는 실패
```

`web/js/core/_valgames.mjs` 로 경기 엔진을, `proto/` 의 파이썬 검증기로
성장·부상·드래프트·시장을 재현할 수 있습니다.

```
node web/js/core/_valgames.mjs 4000
cd proto && python3 validate_dev.py   # 성장 · 노화
```

## 라이선스

MIT. 자세한 것은 [LICENSE](LICENSE).

글꼴 IBM Plex Mono 는 SIL Open Font License 1.1 (`web/fonts/OFL.txt`).

구단·선수·기록은 모두 가상입니다. 한국 프로야구의 제도와 리듬을 참고했지만
실존하는 구단·단체·인물과는 관련이 없고, 어느 곳으로부터도 승인받지 않았습니다.
