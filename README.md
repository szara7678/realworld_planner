## Realworld Planner

`realworld_planner`는 일본 일반 여행 지식 그래프 위에 `Pages-only 제약 기반 플래너`를 얹은 웹 워크스페이스다.  
지식 검색과 여행 플랜 생성이 분리되어 있고, 플래너는 `완성된 미니 플랜 후보`를 기준으로 현재 후보를 가장 크게 가르는 질문을 한 번씩 던지며 좁혀 간다.

## 실행

- 로컬 정적 서버: `cd /home/aaron/personal/realworld_planner && ./run.sh`
- 접속: `http://127.0.0.1:8765/graph-editor.html`
- GitHub Pages: 정적 파일만 올리면 동일한 기능이 동작한다.

## 채팅 사용 예시

- 지식 검색: `후쿠오카에서 미식 여행하기 좋은 구역과 대표 음식 보여줘`
- 플래너 시작: `인천에서 3/22 18시 이후 출발, 일본에서 3/24 19시 이전 출발, 최대 예산 70만원, 미식+쇼핑 위주`
- 후보 분할 질문 응답: `배편도 괜찮아`, `숙소는 가성비`, `쇼핑보다 음식`
- 플랜 설명: `기본 이동안이 뭐야`, `왜 이 플랜을 추천했어`
- 플랜 유지형 QA: `대마도에는 횟집이 맛있는 게 뭐 있어`
- 즉시 편집: `그럼 호마레 스시도 가자`, `이거 대신 미나토 식당 가자`
- 다시 시작: `새 플랜`

## 현재 동작

- 모든 검색, 플래닝, 그래프 탐색은 브라우저 내부에서 실행된다.
- 제품 경로에는 `/api/*`가 없다. `graph-state.json`, `graph-data.js`, `frontend/planner/*`, `frontend/editor/*`, `graph-editor.js`만으로 동작한다.
- 저장은 브라우저 `localStorage` 기준이고, 필요하면 JSON 내보내기로 백업한다.
- Python 코드는 `legacy_backend/`에 보관만 하고, GitHub Pages 동작에는 필요하지 않다.

## 폴더 구조

- `frontend/shared`: 그래프 hydrate, 로컬 검색, 문자열 매칭 같은 공통 데이터 유틸
- `frontend/planner/constants.js`: 플래너 상수와 표시 라벨
- `frontend/planner/parsers.js`: 제약/질문/편집 intent 파싱
- `frontend/planner/candidates.js`: 미니 플랜 후보 생성, factual QA, inline edit 반영
- `frontend/planner/engine.js`: `collect -> disambiguate -> summary/explain` 상태 전이
- `frontend/editor/cluster-view.js`: 클러스터 버블 뷰와 현재 플랜 오버레이
- `frontend/editor/chat-controller.js`: 질문 제출, planner/search 실행, 채팅 렌더
- `frontend/editor/detail-panel.js`: 노드/엣지 상세 모달과 속성 편집
- `frontend/editor/viewport-controller.js`: pan/zoom/fit 제어
- `frontend/editor/storage-controller.js`: 그래프 load/save/import/export, 세션 restore
- `frontend/editor/app-shell.js`: 상단 메타와 채팅 높이 같은 셸 렌더
- `frontend/editor/planner-profile.js`: 현재 사용자 제약/선호를 그래프 노드로 동기화
- `legacy_backend`: 이전 Python API/플래너 백엔드 보관
- `graph-state.json`: 현재 UI와 정적 플래너가 쓰는 일본 시드 그래프
- `graph-data.js`: 정적 모드 최소 시드 + 스키마 폴백
- `ontology/schema/*`: 노드/엣지 타입 정의

## 그래프 레이어

- `Knowledge`: 국가, 지역, 도시, 허브, 명소, 맛집, 숙소, 테마, 룰
- `Planning`: 세션, 제약, 선호, 후보 플랜 skeleton, 이동/숙소/활동 선택 상태
- `Evidence`: 출처, 관측값

가격·시간표·숙소 요금 같은 가변 값은 엔티티 본체에 덮어쓰지 않고 `Observation`으로 저장한다.  
정적 모드에서도 브라우저가 그래프를 읽을 때 관측값을 모아 `latest_values`와 `evidence_summary`를 다시 계산한다.

## 플래너 상태 흐름

- `collect`: 실행 가능성을 위한 최소 하드 제약 수집
- `disambiguate`: 남은 미니 플랜 후보를 가장 크게 가르는 질문 1개 제시
- `summary`: 현재 우세한 플랜 skeleton 요약
- `explain`: 현재 선택 플랜을 유지한 채 상세 설명 또는 지식 QA

중간에 자유 질문이 들어와도 현재 플랜이 있으면 기본적으로 `플랜 유지 + 답변`으로 처리한다.  
같은 도시/권역 노드라면 `여기도 가자`, `이거 대신 저거 가자`로 바로 반영한다.

## 샘플 데이터

- 일반 일본 지식: 도쿄, 요코하마, 오사카, 교토, 고베, 후쿠오카, 벳푸, 나하, 나고야, 삿포로, 하코다테, 대마도
- 제약 기반 플래너용 근거: 인천/부산 출발 교통 옵션, 왕복 항공/배편 관측값, 도시별 숙소 가격 관측값
- 대마도 보강 데이터: 횟집/사시미/해산물 식당 노드와 alias, 쇼핑 활동 노드
- 이전 비교 데이터 보존: `session_japan_shorttrip` 아래 후쿠오카/대마도/오사카 샘플 후보
 
## GitHub Pages

- `index.html`이 있어 정적 배포는 가능하다.
- GitHub Pages에서는 `graph-state.json`과 `frontend/planner/*`를 기준으로 `하드 제약 수집 -> 후보 분할 질문 -> 미니 플랜 요약/설명 -> inline edit` 흐름이 동작한다.
- 정적 모드 플래너 세션은 브라우저 `localStorage`에 저장된다.
- OpenRouter는 선택사항이고, 없어도 로컬 그래프/로컬 플래너만으로 질문과 플랜 후보 생성이 가능하다.

## UI 뷰

- 기본 캔버스는 `클러스터 버블 뷰`로 열린다.
- `Country / City / Transport / Lodging / Activity / Evidence / Planner` 묶음이 2.5D 버블처럼 접혀 있고, 클릭한 클러스터만 펼쳐진다.
- 검색/플래너에서 현재 사용 중인 노드는 접힌 상태에서도 버블 바깥으로 튀어나와 강조된다.
- 현재 선택된 미니 플랜의 `transport -> stay -> activities -> city` 경로는 별도 오버레이 라인으로 그려진다.
- 상단 `◎` 버튼으로 기존 자유 배치 뷰와 클러스터 뷰를 전환할 수 있다.

## 참고 문서

- 노드/엣지/플래너 연결 방식: **[docs/GRAPH_NODES_EDGES_GUIDE.md](docs/GRAPH_NODES_EDGES_GUIDE.md)**
