## Realworld Planner

`realworld_planner`는 일본 일반 여행 지식 그래프 위에 제약 기반 플래너를 얹은 웹 워크스페이스다.  
지식 검색과 여행 플랜 생성이 분리되어 있고, 플래너는 `도시 선택 -> 이동 선택 -> 숙소/활동 선택` 순서로 대화형으로 좁혀 간다.

## 실행

- 서버 실행: `cd /home/aaron/personal/realworld_planner && ./run.sh`
- 접속: `http://127.0.0.1:8765/graph-editor.html`
- 같은 네트워크 접속: 서버 콘솔에 출력되는 `http://<내IP>:8765/graph-editor.html`

## 채팅 사용 예시

- 지식 검색: `후쿠오카에서 미식 여행하기 좋은 구역과 대표 음식 보여줘`
- 플래너 시작: `인천에서 3/22 18시 이후 출발, 일본에서 3/24 19시 이전 출발, 최대 예산 70만원, 미식+쇼핑 위주`
- 플래너 진행: `1번`, `숙소는 가성비`, `활동은 2번`
- 다시 시작: `새 플랜`

## 현재 동작

- `GET /api/schema`: 노드 타입, 엣지 타입, 제약/선호 타입 반환
- `GET /api/graph`: 현재 JSON 캐시 그래프 반환
- `POST /api/search`: 지식 검색과 연결 엣지 반환
- `POST /api/plan/session`: 세션 생성/제약 업데이트
- `POST /api/plan/step`: 현재 세션 기준 다음 단계 질문과 추천 후보 반환

## 데이터 구조

- `ontology/schema/node-types.json`: v2 노드 타입, 최소 필수 속성, 제약/선호 타입
- `ontology/schema/edge-types.json`: v2 엣지 타입
- `graph-state.json`: 현재 웹 UI와 서버가 쓰는 일본 시드 그래프
- `graph-data.js`: 서버 없이 열 때 쓰는 최소 시드 + 스키마 폴백
- `travel-ontology.cypher`: Neo4j 적재용 v2 샘플 스키마
- `ontology/countries/japan/japan.travel-graph.json`: 일본 시작 데이터셋 포인터

## 그래프 레이어

- `Knowledge`: 국가, 지역, 도시, 허브, 명소, 맛집, 숙소, 테마, 룰
- `Planning`: 세션, 제약, 선호, 후보 플랜, 이동 옵션
- `Evidence`: 출처, 관측값

가격·시간표·숙소 요금 같은 가변 값은 엔티티 본체에 덮어쓰지 않고 `Observation`으로 저장한다.  
서버는 그래프를 읽을 때 관측값을 모아 `latest_values`와 `evidence_summary`를 다시 계산한다.

## 샘플 데이터

- 일반 일본 지식: 도쿄, 요코하마, 오사카, 교토, 고베, 후쿠오카, 벳푸, 나하, 나고야, 삿포로, 하코다테, 대마도
- 제약 기반 플래너용 근거: 인천/부산 출발 교통 옵션, 왕복 항공/배편 관측값, 도시별 숙소 가격 관측값
- 이전 비교 데이터 보존: `session_japan_shorttrip` 아래 후쿠오카/대마도/오사카 샘플 후보
 
## GitHub Pages

- `index.html`이 있어 정적 배포는 가능하다.
- 정적 모드에서도 브라우저 내부 로컬 플래너가 동작한다.
- GitHub Pages에서는 `graph-state.json`과 `planner-static.js`를 기준으로 `도시 -> 이동 -> 숙소/활동 -> 요약` 단계를 이어갈 수 있다.
- 정적 모드 플래너 세션은 브라우저 `localStorage`에 저장된다.
- OpenRouter는 선택사항이고, 없어도 로컬 그래프/로컬 플래너만으로 질문과 플랜 후보 생성이 가능하다.

## 참고 문서

- 노드/엣지/플래너 연결 방식: **[docs/GRAPH_NODES_EDGES_GUIDE.md](docs/GRAPH_NODES_EDGES_GUIDE.md)**
