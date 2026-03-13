# 그래프 노드·엣지 및 플래너 연결 가이드

`realworld_planner`는 `일반 여행 지식 그래프 + 제약 기반 미니 플랜 플래너 + 출처/관측값 그래프`를 한 화면에서 다룬다.  
현재 제품 경로는 GitHub Pages 기준의 정적 런타임이며, 브라우저 안에서 검색·플래닝·편집이 모두 돌아간다.

## 1. 그래프 레이어

### Knowledge

- `Country`, `Region`, `Prefecture`, `City`, `District`, `TransitHub`
- `Attraction`, `Restaurant`, `Cuisine`, `Lodging`, `SeasonalEvent`
- `ExperienceTheme`, `TravelRule`, `PassProduct`

이 레이어는 일본 일반 여행 지식의 기반이다.  
도시가 어떤 테마와 맞는지, 어떤 허브와 연결되는지, 대표 명소·맛집·숙소가 무엇인지 담는다.

### Planning

- `PlannerSession`, `UserProfile`, `Constraint`, `Preference`
- `CandidatePlan`, `PlanDay`, `TransportOption`, `StayOption`, `ActivityOption`, `BudgetSummary`

이 레이어는 사용자가 제약을 넣었을 때 실제 플랜 후보를 좁혀 가는 데 쓰인다.  
Pages-only 런타임에서는 현재 사용자 상태를 `UserProfile`과 연결 노드로 그래프에 동기화한다.

### Evidence

- `Source`, `Observation`

항공권 가격, 귀국 시간, 숙소 요금처럼 바뀌는 값은 `Observation`으로 저장한다.  
엔티티 노드에는 최신 대표값을 직접 덮어쓰지 않고, 브라우저가 읽을 때 `latest_values`와 `evidence_summary`를 계산한다.

## 2. 공통 필드

모든 노드는 아래 필드를 가질 수 있다.

- `id`, `type`, `title`
- `aliases[]`, `tags[]`
- `status`, `notes`
- `confidence`
- `ext{}`

실제 타입별 값은 `properties{}`에 들어간다.  
표준 스키마가 아닌 신규 필드는 우선 `ext{}`에 넣고, 반복 사용되면 승격하는 전제를 둔다.

## 3. 핵심 엣지

### 지역/소속

- `CONTAINS`
- `LOCATED_IN`
- `NEAR`
- `CONNECTED_TO`
- `HAS_TRANSIT_HUB`

### 지식 연결

- `HAS_ATTRACTION`
- `HAS_RESTAURANT`
- `HAS_LODGING`
- `HAS_EVENT`
- `MATCHES_THEME`
- `SUBJECT_TO_RULE`

### 플래닝 연결

- `HAS_CONSTRAINT`
- `HAS_PREFERENCE`
- `GENERATED_PLAN`
- `CHOOSES_TRANSPORT`
- `CHOOSES_STAY`
- `CHOOSES_ACTIVITY`
- `SATISFIES`
- `CONFLICTS_WITH`
- `ALTERNATIVE_TO`

### 근거/갱신

- `SUPPORTED_BY`
- `OBSERVED_FROM`
- `VALID_DURING`
- `SUPERSEDES`

## 4. 검색과 QA

정적 모드의 검색은 `/api/search`가 아니라 브라우저 내부 matcher로 동작한다.

검색 시 아래를 함께 본다.

- `title`, `aliases`, `tags`, `notes`
- `properties`, `latest_values`, `ext`
- 타입 가중치
- 신뢰도와 최신성
- 현재 선택된 미니 플랜의 도시/활동 문맥

현재 미니 플랜이 있으면 검색 우선순위는 아래 순서다.

1. 현재 도시/권역 안의 노드
2. 현재 플랜 활동과 연결된 테마/맛집/숙소
3. 전체 그래프

그래서 `대마도에는 횟집이 뭐가 맛있어` 같은 질문은 현재 플랜을 유지한 채 대마도 seafood 식당 노드 중심으로 답한다.

## 5. 플래너 흐름

현재 플래너는 고정 단계형 `도시 -> 이동 -> 숙소 -> 활동`이 아니다.  
후보는 `완성된 미니 플랜 skeleton` 단위로 다룬다.

예:

- `후쿠오카 + 항공 + 하카타 숙소 + 텐진/캐널시티`
- `대마도 + 배편 + 히타카츠 숙소 + 쇼핑/해산물`
- `오사카 + 항공 + 난바 숙소 + 쇼핑/먹거리`

상태 흐름은 아래 4단계다.

1. `collect`
2. `disambiguate`
3. `summary`
4. `explain`

### collect

실행 가능성을 위한 최소 하드 제약을 받는다.

- `origin`
- `depart_after`
- `return_depart_before`
- `total_budget_max`
- 필요하면 `themes`

### disambiguate

남은 상위 후보들을 가장 크게 가르는 질문 1개를 던진다.

예:

- `비행보다 배도 괜찮아요?`
- `이동 시간을 줄이는 게 중요해요, 예산이 더 중요해요?`
- `숙소는 가성비가 우선인가요, 위치가 우선인가요?`
- `쇼핑보다 음식 비중이 더 높아요?`

질문 선택에는 후보 간 이동시간 차이, 숙소 가격 차이, route mode 차이 같은 관측값 민감도를 반영한다.

### summary

현재 우세한 미니 플랜을 요약한다.

- 이동
- 숙소
- 활동
- 예상 총액
- 추천 이유
- 남은 충돌
- 대안 1개 이상

### explain

현재 선택된 플랜을 유지한 채 세부 설명이나 사실 질문에 답한다.

예:

- `기본 이동안이 뭐야`
- `왜 이 플랜이 1순위야`
- `대마도에는 횟집이 뭐가 맛있어`

## 6. inline plan edit

현재 선택된 플랜이 있으면 같은 도시/권역 안에서 즉시 수정할 수 있다.

### 추가

- `그럼 호마레 스시도 가자`
- `여기도 넣자`

동작:

- 현재 도시 안의 `Restaurant/Attraction/ActivityOption`을 찾는다.
- 현재 플랜의 선택 활동 목록에 append 한다.
- 총액, 설명, 하이라이트 노드를 즉시 갱신한다.

### 교체

- `이거 대신 미나토 식당 가자`
- `이 숙소 대신 저거`

동작:

- 같은 도시/권역이면 현재 활동 또는 숙소 슬롯을 교체한다.
- 다른 도시면 즉시 교체하지 않고 `재계획 필요`로 처리한다.

## 7. UI 연결

### 클러스터 버블 뷰

기본 캔버스는 2.5D 느낌의 클러스터 버블 뷰다.

- `Country / City / Transport / Lodging / Activity / Evidence / Planner` 버블로 묶는다.
- 기본은 접혀 있다.
- 클릭한 클러스터만 펼친다.
- 검색/플래너에서 쓰인 노드는 접힌 상태에서도 버블 바깥으로 튀어나온다.

### 현재 플랜 오버레이

현재 선택된 미니 플랜이 있으면 아래 순서로 별도 라인을 그린다.

- `transport -> stay -> activities -> city`

이 오버레이는 일반 edge보다 위에 그려지며, 현재 플랜의 구성 노드를 빠르게 읽게 해준다.

## 8. 샘플 세션과 데이터 보존

예전 후쿠오카/대마도/오사카 비교는 삭제하지 않고 `session_japan_shorttrip`로 남겨뒀다.

- `PlannerSession`: `session_japan_shorttrip`
- `Constraint`: 출발지, 출발 가능 시각, 일본 출발 제한, 예산
- `Preference`: 미식, 쇼핑
- `CandidatePlan`: 후쿠오카, 대마도, 오사카

즉, 이전 비교 데이터는 코어 지식 그래프를 덮어쓰지 않고 예시 세션으로 흡수됐다.

## 9. Pages-only 런타임 주의점

- 제품 경로에는 서버 API가 없다.
- 세션과 수정 상태는 브라우저 `localStorage`에 저장된다.
- `graph-state.json`이 정본 시드이고, 사용 중 변경은 로컬에만 남는다.
- `legacy_backend/`는 이전 Python API 구조를 보관한 폴더다.
- `Observation.properties.value`는 JSON 객체일 수 있으므로, 인스펙터에서는 JSON 문자열로 수정해야 한다.
