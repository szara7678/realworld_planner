## 웹 UI 사용법

- 서버 실행: `cd /home/aaron/code/realworld_planner && ./run.sh`
- 접속: `http://127.0.0.1:8765/graph-editor.html`
- 같은 네트워크 접속: 서버 콘솔에 출력되는 `http://<내IP>:8765/graph-editor.html`
- 노드 드래그로 배치 변경, 배경 드래그로 캔버스 이동, 마우스 휠로 확대/축소 가능
- `엣지 연결` 버튼을 누른 뒤 노드 두 개를 순서대로 클릭하면 관계가 추가된다
- 변경 내용은 브라우저 `localStorage`에 자동 저장된다
- `서버 저장`은 로컬 서버 모드에서만 `graph-state.json`에 반영된다
- `JSON 내보내기` / `JSON 가져오기`로 데이터 백업 및 교체 가능
- 검색 결과의 `사용된 정보` 모달에서 실제로 참조한 노드와 엣지를 확인할 수 있다

## GitHub Pages 배포

- 이 폴더는 이제 정적 배포를 지원한다
- `index.html`이 있어서 GitHub Pages 루트 URL로 바로 접속 가능하다
- 서버가 없으면 `graph-state.json`을 읽고 브라우저 내 로컬 검색으로 동작한다
- 설정 모달에 OpenRouter API 키를 넣으면 GitHub Pages에서도 브라우저에서 직접 OpenRouter 호출이 가능하다

배포 순서

1. `realworld_planner` 폴더 내용을 GitHub 저장소 루트에 올린다
2. GitHub 저장소에서 `Settings -> Pages` 로 들어간다
3. `Deploy from a branch` 를 선택한다
4. 브랜치는 `main` 또는 `master`, 폴더는 `/ (root)` 를 선택한다
5. 저장 후 배포 URL `https://<계정명>.github.io/<저장소명>/` 로 접속한다

주의

- GitHub Pages에서는 `server.py`가 실행되지 않으므로 `서버 저장`은 브라우저 로컬 저장만 된다
- GitHub Pages에서 영구 반영이 필요하면 `JSON 내보내기`로 받은 파일을 `graph-state.json`에 덮어써서 다시 커밋해야 한다
- 브라우저에서 직접 OpenRouter를 쓰는 방식은 API 키가 클라이언트에 들어가므로 개인용/테스트용으로만 쓰는 게 맞다

## OpenRouter 예시

```bash
cd /home/aaron/code/realworld_planner
OPENROUTER_API_KEY=your_key_here ./run.sh
```

## 데이터 주의

- 항공권/숙박은 검색 인덱스 기준 참고값이라 실제 결제 직전 변동될 수 있다
- PUS -> FUK `2026-03-23` 정확한 동일 날짜 검색 결과는 인덱스 확보가 약해 근접 날짜 값을 사용했다
- 대마도 시나리오는 사용자가 직접 제시한 왕복 12만 원 및 시간표를 우선 반영했다

## 여행 온톨로지 구조 (범용)

- `ontology/schema/node-types.json`: 노드 타입과 기본 속성 정의
- `ontology/schema/edge-types.json`: 기본 엣지 타입 정의
- `ontology/countries/japan/japan.travel-graph.json`: 일본 시작 데이터셋 포인터
- `graph-state.json`: UI에서 바로 사용하는 일본 시드 그래프
- `travel-ontology.cypher`: Neo4j 적재용 범용 스키마 + 일본 샘플 데이터

이번 개편으로 기존 시나리오 중심 구조에서 `Country > Region > City > District` 계층과
문화/축제/음식/맛집/교통허브를 연결하는 범용 구조로 변경했다.
