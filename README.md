## 웹 UI 사용법

- 서버 실행: `cd /home/aaron/code/vacation && ./run.sh`
- 접속: `http://127.0.0.1:8765/graph-editor.html`
- 같은 네트워크 접속: 서버 콘솔에 출력되는 `http://<내IP>:8765/graph-editor.html`
- [graph-editor.html](/home/aaron/code/vacation/graph-editor.html#L1) 은 정적 파일이지만, 공유 편집은 `server.py`로 띄운 뒤 접속해야 한다.
- 노드 드래그로 배치 변경, 배경 드래그로 캔버스 이동, 마우스 휠로 확대/축소 가능.
- 왼쪽 Inspector에서 제목, 타입, 메모, 속성 JSON을 바로 수정할 수 있다.
- `엣지 연결` 버튼을 누른 뒤 노드 두 개를 순서대로 클릭하면 관계가 추가된다.
- 변경 내용은 브라우저 `localStorage`에 자동 저장되고, `서버 저장` 버튼으로 `graph-state.json`에 반영된다.
- `JSON 내보내기` / `JSON 가져오기`로 데이터 백업 및 교체 가능.
- `Ontology Search` 패널에서 질문을 넣으면 그래프 로컬 검색을 먼저 수행한다.
- `.env`에 `OPENROUTER_API_KEY`가 있으면 서버가 자동으로 읽는다.
- OpenRouter를 쓰려면 서버 환경변수 `OPENROUTER_API_KEY`를 넣거나, UI에서 임시 키를 직접 입력하면 된다.
- 검색 결과 아래 `사용된 정보` 카드에서 실제로 참조한 노드와 엣지를 강조해서 보여준다.
- 그래프 데이터에는 별도 `평결` 노드를 두지 않고, 시나리오와 근거 노드 중심으로 비교하게 구성했다.

## OpenRouter 예시

```bash
cd /home/aaron/code/vacation
OPENROUTER_API_KEY=your_key_here ./run.sh
```

주의

- UI에 API 키를 입력하면 그 요청에 한해 서버로 전달된다.
- 서버 환경변수로 넣는 방식이 더 안전하다.

## 주의

- 항공권/숙박은 검색 인덱스 기준 참고값이라 실제 결제 직전 변동될 수 있다.
- PUS -> FUK `2026-03-23` 정확한 동일 날짜 검색 결과는 인덱스 확보가 약해 근접 날짜 값을 사용했다.
- 대마도 시나리오는 사용자가 직접 제시한 왕복 12만 원 및 시간표를 우선 반영했다.
