# 그래프 노드·엣지 및 플래너 연결 가이드

`realworld_planner`는 이제 단순 지식 검색 그래프가 아니라,  
`일반 여행 지식 그래프 + 제약 기반 플래너 + 출처/관측값 그래프`를 함께 다룬다.

## 1. 노드 레이어

### Knowledge

- `Country`, `Region`, `Prefecture`, `City`, `District`, `TransitHub`
- `Attraction`, `Restaurant`, `Cuisine`, `Lodging`, `SeasonalEvent`
- `ExperienceTheme`, `TravelRule`, `PassProduct`

이 레이어는 일본 일반 여행 지식의 기반이다.  
도시가 어떤 테마와 잘 맞는지, 어떤 허브와 연결되는지, 대표 명소·맛집·숙소가 무엇인지 담는다.

### Planning

- `PlannerSession`, `Constraint`, `Preference`
- `CandidatePlan`, `PlanDay`, `TransportOption`, `StayOption`, `ActivityOption`, `BudgetSummary`

이 레이어는 사용자가 제약을 넣었을 때 실제 플랜 후보를 좁혀 가는 데 쓰인다.

### Evidence

- `Source`, `Observation`

항공권 가격, 귀국 시간, 숙소 요금처럼 바뀌는 값은 `Observation`으로 저장한다.  
엔티티 노드에는 최신 대표값을 직접 덮어쓰지 않고, 서버가 읽을 때 `latest_values`와 `evidence_summary`를 계산한다.

## 2. 공통 필드

모든 노드는 아래 필드를 가질 수 있다.

- `id`, `type`, `title`
- `aliases[]`, `tags[]`
- `status`, `notes`
- `created_at`, `updated_at`
- `confidence`
- `ext{}`

실제 타입별 속성은 `properties{}`에 들어간다.  
새로운 필드가 들어왔는데 표준 스키마에 아직 없다면 먼저 `ext{}`에 넣고, 반복 사용되면 스키마로 승격하는 전제를 둔다.

## 3. 주요 엣지

### 지역/소속

- `CONTAINS`
- `LOCATED_IN`
- `NEAR`
- `CONNECTED_TO`

### 지식 연결

- `HAS_ATTRACTION`
- `HAS_RESTAURANT`
- `HAS_LODGING`
- `HAS_EVENT`
- `HAS_TRANSIT_HUB`
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

## 4. 검색 흐름

`POST /api/search`

1. 쿼리와 노드의 `title`, `aliases`, `tags`, `notes`, `properties`, `latest_values`를 함께 본다.
2. 타입 가중치와 연결 노드 매칭, 최신성, 신뢰도를 같이 점수화한다.
3. 매칭 노드에 붙은 엣지를 골라 `matched_edges`로 반환한다.

즉, 이제 검색은 `제목 문자열 매칭`만이 아니라 `타입 + 관계 + 최신 근거`를 함께 반영한다.

## 5. 플래너 흐름

`POST /api/plan/step`

1. 사용자 입력에서 `Constraint`와 `Preference`를 정규화한다.
2. 세션 상태를 갱신한다.
3. 하드 제약으로 도시 후보를 컷오프한다.
4. 도시별로 교통/숙소/활동/근거를 확장해 `CandidatePlan`을 계산한다.
5. 아직 결정되지 않은 단계만 질문한다.

현재 기본 단계는 아래 순서다.

1. `city`
2. `transport`
3. `stay`
4. `activity`
5. `summary`

각 단계 응답에는 다음이 포함된다.

- `answer`: 사용자에게 보여줄 설명
- `recommendations`: 현재 추천안
- `alternatives`: 대안 후보
- `next_question`: 다음에 입력해야 할 정보
- `matches`, `matched_edges`: 실제 사용된 그래프 근거

## 6. 샘플 세션 보존 방식

예전 후쿠오카/대마도/오사카 비교는 삭제하지 않고 `session_japan_shorttrip`로 남겨뒀다.

- `PlannerSession`: `session_japan_shorttrip`
- `Constraint`: 출발지, 출발 가능 시각, 일본 출발 제한, 예산
- `Preference`: 미식, 쇼핑
- `CandidatePlan`: 후쿠오카, 대마도, 오사카

즉, 이전 데이터는 코어 지식 그래프를 덮어쓰지 않고,  
새 플래너 레이어 아래의 예시 세션으로 흡수됐다.

## 7. UI에서 주의할 점

- 서버 모드에서는 `server.py`가 세션과 검색을 처리한다.
- 정적 모드에서는 `planner-static.js`가 브라우저 내부에서 같은 단계형 플래너 흐름을 로컬로 유지한다.
- GitHub Pages에서는 플래너 세션이 브라우저 `localStorage`에 저장된다.
- `Observation.properties.value`는 JSON 객체일 수 있으므로, 인스펙터에서는 JSON 문자열로 수정해야 한다.
