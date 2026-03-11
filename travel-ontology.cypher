MERGE (window:TripWindow {id: '2026-03-22_2026-03-24'})
SET window.depart_after = '2026-03-22T19:00:00+09:00',
    window.return_by = '2026-03-24T23:59:59+09:00',
    window.origin = 'Dongdaegu',
    window.preference = 'lowest_price';

MERGE (c1:Constraint {id: 'must_start_after_1900'})
SET c1.label = '3/22 19:00 이후 출발';
MERGE (c2:Constraint {id: 'prefer_incheon_return'})
SET c2.label = '가능하면 인천 귀국';

MERGE (dongdaegu:Place {code: 'Dongdaegu'})
SET dongdaegu.name = '동대구';
MERGE (busan:Place {code: 'Busan'})
SET busan.name = '부산';
MERGE (pus:Place {code: 'PUS'})
SET pus.name = '김해공항';
MERGE (fuk:Place {code: 'FUK'})
SET fuk.name = '후쿠오카공항';
MERGE (icn:Place {code: 'ICN'})
SET icn.name = '인천공항';
MERGE (hitakatsu:Place {code: 'HITAKATSU'})
SET hitakatsu.name = '히타카츠';
MERGE (kix:Place {code: 'KIX'})
SET kix.name = '간사이공항';

MERGE (fukuoka:Scenario {id: 'scenario_fukuoka'})
SET fukuoka.name = 'Fukuoka',
    fukuoka.total_krw_min = 429369,
    fukuoka.total_krw_max = 475904,
    fukuoka.endpoint = 'ICN',
    fukuoka.status = 'recommended';

MERGE (tsushima:Scenario {id: 'scenario_tsushima'})
SET tsushima.name = 'Tsushima',
    tsushima.total_krw_min = 262280,
    tsushima.total_krw_max = 309115,
    tsushima.endpoint = 'Busan',
    tsushima.status = 'cheapest_if_busan_return_ok';

MERGE (osaka:Scenario {id: 'scenario_osaka'})
SET osaka.name = 'Osaka',
    osaka.endpoint = 'ICN',
    osaka.status = 'not_recommended',
    osaka.reason = '2026-03-23 PUS->KIX direct unavailable in indexed search';

MERGE (ddg_busan:Transport {id: 'ddg_busan_rail'})
SET ddg_busan.mode = 'rail',
    ddg_busan.price_krw_min = 12000,
    ddg_busan.price_krw_max = 17100,
    ddg_busan.duration = '50m~1h';

MERGE (busan_lodging:Lodging {id: 'busan_budget_1n'})
SET busan_lodging.city = 'Busan',
    busan_lodging.price_krw_min = 33466,
    busan_lodging.price_krw_max = 75201,
    busan_lodging.nights = 1;

MERGE (pus_fuk:Transport {id: 'pus_fuk_flight'})
SET pus_fuk.mode = 'flight',
    pus_fuk.price_krw_min = 141000,
    pus_fuk.price_basis = 'near-date current search',
    pus_fuk.duration = '1h';

MERGE (fukuoka_lodging:Lodging {id: 'fukuoka_1n'})
SET fukuoka_lodging.city = 'Fukuoka',
    fukuoka_lodging.price_krw_min = 111093,
    fukuoka_lodging.price_krw_max = 111093,
    fukuoka_lodging.nights = 1;

MERGE (fuk_icn:Transport {id: 'fuk_icn_flight'})
SET fuk_icn.mode = 'flight',
    fuk_icn.price_krw_min = 131810,
    fuk_icn.duration = '1h30m';

MERGE (busan_hitakatsu:Transport {id: 'busan_hitakatsu_ferry'})
SET busan_hitakatsu.mode = 'ferry',
    busan_hitakatsu.price_krw_min = 120000,
    busan_hitakatsu.price_krw_max = 120000,
    busan_hitakatsu.outbound = '2026-03-23 08:40->10:00',
    busan_hitakatsu.inbound = '2026-03-24 17:10->18:30';

MERGE (tsushima_lodging:Lodging {id: 'tsushima_1n'})
SET tsushima_lodging.city = 'Hitakatsu',
    tsushima_lodging.price_krw_min = 96814,
    tsushima_lodging.price_krw_max = 96814,
    tsushima_lodging.nights = 1;

MERGE (kix_icn:Transport {id: 'kix_icn_flight'})
SET kix_icn.mode = 'flight',
    kix_icn.price_jpy_min = 13900,
    kix_icn.duration = '2h';

MERGE (e1:PriceEvidence {id: 'src_fuk_icn_20260324'})
SET e1.url = 'https://dsk.ne.jp/m/FUK-ICN/20260324/',
    e1.note = '2026-03-24 FUK->ICN 최저가 14,130엔 / 131,810원 확인';

MERGE (e2:PriceEvidence {id: 'src_pus_kix_20260323'})
SET e2.url = 'https://dsk.ne.jp/m/PUS-KIX/20260323/',
    e2.note = '2026-03-23 PUS->KIX 검색 결과 없음';

MERGE (e3:PriceEvidence {id: 'src_tsushima_user'})
SET e3.url = 'user-provided',
    e3.note = '부산 08:40->10:00 / 히타카츠 17:10->18:30 / 왕복 12만원';

MERGE (e4:PriceEvidence {id: 'src_tsushima_schedule_pattern'})
SET e4.url = 'https://ezwel.railtel.co.kr/sub/detail/703/269772',
    e4.note = '화/금 패턴에 08:40->10:00, 17:10->18:30 노출';

MERGE (best_complete:Verdict {id: 'best_complete_route'})
SET best_complete.label = 'Best Complete Route',
    best_complete.reason = '인천 귀국까지 포함하면 후쿠오카가 가장 단순하고 성립 가능성이 높음';

MERGE (best_cheapest:Verdict {id: 'best_cheapest_route'})
SET best_cheapest.label = 'Cheapest Raw Route',
    best_cheapest.reason = '최종 부산 복귀 허용 시 대마도가 총액 최저';

MERGE (window)-[:HAS_CONSTRAINT]->(c1);
MERGE (window)-[:HAS_CONSTRAINT]->(c2);
MERGE (window)-[:COMPARES]->(fukuoka);
MERGE (window)-[:COMPARES]->(tsushima);
MERGE (window)-[:COMPARES]->(osaka);

MERGE (fukuoka)-[:STARTS_AT]->(dongdaegu);
MERGE (fukuoka)-[:USES]->(ddg_busan);
MERGE (ddg_busan)-[:TO]->(busan);
MERGE (fukuoka)-[:STAYS]->(busan_lodging);
MERGE (fukuoka)-[:USES]->(pus_fuk);
MERGE (pus_fuk)-[:FROM]->(pus);
MERGE (pus_fuk)-[:TO]->(fuk);
MERGE (fukuoka)-[:STAYS]->(fukuoka_lodging);
MERGE (fukuoka)-[:USES]->(fuk_icn);
MERGE (fuk_icn)-[:FROM]->(fuk);
MERGE (fuk_icn)-[:TO]->(icn);
MERGE (fukuoka)-[:SUPPORTED_BY]->(e1);

MERGE (tsushima)-[:STARTS_AT]->(dongdaegu);
MERGE (tsushima)-[:USES]->(ddg_busan);
MERGE (tsushima)-[:STAYS]->(busan_lodging);
MERGE (tsushima)-[:USES]->(busan_hitakatsu);
MERGE (busan_hitakatsu)-[:FROM]->(busan);
MERGE (busan_hitakatsu)-[:TO]->(hitakatsu);
MERGE (tsushima)-[:STAYS]->(tsushima_lodging);
MERGE (tsushima)-[:SUPPORTED_BY]->(e3);
MERGE (tsushima)-[:SUPPORTED_BY]->(e4);

MERGE (osaka)-[:STARTS_AT]->(dongdaegu);
MERGE (osaka)-[:USES]->(ddg_busan);
MERGE (osaka)-[:SUPPORTED_BY]->(e2);
MERGE (osaka)-[:CONSIDERS]->(kix_icn);
MERGE (kix_icn)-[:FROM]->(kix);
MERGE (kix_icn)-[:TO]->(icn);

MERGE (best_complete)-[:SELECTS]->(fukuoka);
MERGE (best_cheapest)-[:SELECTS]->(tsushima);
