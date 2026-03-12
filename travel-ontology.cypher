// Constraint-driven travel graph schema for Neo4j
CREATE CONSTRAINT country_id IF NOT EXISTS FOR (n:Country) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT region_id IF NOT EXISTS FOR (n:Region) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT prefecture_id IF NOT EXISTS FOR (n:Prefecture) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT city_id IF NOT EXISTS FOR (n:City) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT district_id IF NOT EXISTS FOR (n:District) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT hub_id IF NOT EXISTS FOR (n:TransitHub) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT attraction_id IF NOT EXISTS FOR (n:Attraction) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT restaurant_id IF NOT EXISTS FOR (n:Restaurant) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT lodging_id IF NOT EXISTS FOR (n:Lodging) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT event_id IF NOT EXISTS FOR (n:SeasonalEvent) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT theme_id IF NOT EXISTS FOR (n:ExperienceTheme) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT rule_id IF NOT EXISTS FOR (n:TravelRule) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT pass_id IF NOT EXISTS FOR (n:PassProduct) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT session_id IF NOT EXISTS FOR (n:PlannerSession) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT constraint_id IF NOT EXISTS FOR (n:Constraint) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT preference_id IF NOT EXISTS FOR (n:Preference) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT candidate_id IF NOT EXISTS FOR (n:CandidatePlan) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT transport_id IF NOT EXISTS FOR (n:TransportOption) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT source_id IF NOT EXISTS FOR (n:Source) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT observation_id IF NOT EXISTS FOR (n:Observation) REQUIRE n.id IS UNIQUE;

MERGE (jp:Country {id: 'country_japan'})
SET jp.name = 'Japan',
    jp.country_code = 'JP',
    jp.currency = 'JPY',
    jp.language = 'Japanese';

MERGE (kanto:Region {id: 'region_kanto'})
SET kanto.name = 'Kanto', kanto.region_kind = 'metropolitan';
MERGE (kansai:Region {id: 'region_kansai'})
SET kansai.name = 'Kansai', kansai.region_kind = 'historic';
MERGE (kyushu:Region {id: 'region_kyushu'})
SET kyushu.name = 'Kyushu', kyushu.region_kind = 'short-haul';
MERGE (hokkaido:Region {id: 'region_hokkaido'})
SET hokkaido.name = 'Hokkaido', hokkaido.region_kind = 'nature';

MERGE (tokyo_pref:Prefecture {id: 'prefecture_tokyo'})
SET tokyo_pref.name = 'Tokyo-to';
MERGE (osaka_pref:Prefecture {id: 'prefecture_osaka'})
SET osaka_pref.name = 'Osaka-fu';
MERGE (kyoto_pref:Prefecture {id: 'prefecture_kyoto'})
SET kyoto_pref.name = 'Kyoto-fu';
MERGE (fukuoka_pref:Prefecture {id: 'prefecture_fukuoka'})
SET fukuoka_pref.name = 'Fukuoka-ken';
MERGE (hokkaido_pref:Prefecture {id: 'prefecture_hokkaido'})
SET hokkaido_pref.name = 'Hokkaido';

MERGE (tokyo:City {id: 'city_tokyo'})
SET tokyo.name = 'Tokyo', tokyo.typical_budget_krw = 750000;
MERGE (osaka:City {id: 'city_osaka'})
SET osaka.name = 'Osaka', osaka.typical_budget_krw = 590000;
MERGE (kyoto:City {id: 'city_kyoto'})
SET kyoto.name = 'Kyoto', kyoto.typical_budget_krw = 620000;
MERGE (fukuoka:City {id: 'city_fukuoka'})
SET fukuoka.name = 'Fukuoka', fukuoka.typical_budget_krw = 500000;
MERGE (sapporo:City {id: 'city_sapporo'})
SET sapporo.name = 'Sapporo', sapporo.typical_budget_krw = 800000;
MERGE (tsushima:City {id: 'city_tsushima'})
SET tsushima.name = 'Tsushima', tsushima.typical_budget_krw = 310000;

MERGE (hnd:TransitHub {id: 'hub_hnd'})
SET hnd.name = 'Haneda Airport', hnd.hub_code = 'HND';
MERGE (kix:TransitHub {id: 'hub_kix'})
SET kix.name = 'Kansai International Airport', kix.hub_code = 'KIX';
MERGE (fuk:TransitHub {id: 'hub_fuk'})
SET fuk.name = 'Fukuoka Airport', fuk.hub_code = 'FUK';
MERGE (cts:TransitHub {id: 'hub_cts'})
SET cts.name = 'New Chitose Airport', cts.hub_code = 'CTS';
MERGE (icn:TransitHub {id: 'hub_icn'})
SET icn.name = 'Incheon International Airport', icn.hub_code = 'ICN';
MERGE (pus:TransitHub {id: 'hub_pus'})
SET pus.name = 'Busan departure pool', pus.hub_code = 'PUS';
MERGE (hit:TransitHub {id: 'hub_hit'})
SET hit.name = 'Hitakatsu Port', hit.hub_code = 'HIT';

MERGE (food:ExperienceTheme {id: 'theme_food'})
SET food.name = 'Food';
MERGE (shopping:ExperienceTheme {id: 'theme_shopping'})
SET shopping.name = 'Shopping';
MERGE (history:ExperienceTheme {id: 'theme_history'})
SET history.name = 'History';
MERGE (nightlife:ExperienceTheme {id: 'theme_nightlife'})
SET nightlife.name = 'Nightlife';
MERGE (nature:ExperienceTheme {id: 'theme_nature'})
SET nature.name = 'Nature';
MERGE (onsen:ExperienceTheme {id: 'theme_onsen'})
SET onsen.name = 'Onsen';

MERGE (ichiran:Restaurant {id: 'restaurant_ichiran'})
SET ichiran.name = 'Ichiran Tenjin', ichiran.meal_budget_krw = 15000;
MERGE (kukuru:Restaurant {id: 'restaurant_kukuru'})
SET kukuru.name = 'Kukuru Dotonbori', kukuru.meal_budget_krw = 12000;
MERGE (sushidai:Restaurant {id: 'restaurant_sushidai'})
SET sushidai.name = 'Sushi Dai', sushidai.meal_budget_krw = 65000;

MERGE (fushimi:Attraction {id: 'attraction_fushimi'})
SET fushimi.name = 'Fushimi Inari Shrine', fushimi.typical_budget_krw = 12000;
MERGE (ohori:Attraction {id: 'attraction_ohori'})
SET ohori.name = 'Ohori Park', ohori.typical_budget_krw = 7000;

MERGE (hotel_fukuoka:Lodging {id: 'lodging_fukuoka_hakata'})
SET hotel_fukuoka.name = 'Hakata Business Hotel';
MERGE (hotel_osaka:Lodging {id: 'lodging_osaka_namba'})
SET hotel_osaka.name = 'Namba Stay';
MERGE (hotel_tokyo:Lodging {id: 'lodging_tokyo_ueno'})
SET hotel_tokyo.name = 'Ueno Business Hotel';

MERGE (buffer_rule:TravelRule {id: 'rule_airport_buffer'})
SET buffer_rule.name = 'International airport buffer';
MERGE (onsen_rule:TravelRule {id: 'rule_onsen_manners'})
SET onsen_rule.name = 'Onsen manners';

MERGE (kyushu_pass:PassProduct {id: 'pass_kyushu'})
SET kyushu_pass.name = 'JR Kyushu Rail Pass', kyushu_pass.price_krw = 175000;

MERGE (tx_icn_fuk:TransportOption {id: 'transport_icn_fuk'})
SET tx_icn_fuk.mode = 'flight', tx_icn_fuk.from_ref = 'hub_icn', tx_icn_fuk.to_ref = 'hub_fuk';
MERGE (tx_fuk_icn:TransportOption {id: 'transport_fuk_icn'})
SET tx_fuk_icn.mode = 'flight', tx_fuk_icn.from_ref = 'hub_fuk', tx_fuk_icn.to_ref = 'hub_icn';
MERGE (tx_icn_kix:TransportOption {id: 'transport_icn_kix'})
SET tx_icn_kix.mode = 'flight', tx_icn_kix.from_ref = 'hub_icn', tx_icn_kix.to_ref = 'hub_kix';
MERGE (tx_kix_icn:TransportOption {id: 'transport_kix_icn'})
SET tx_kix_icn.mode = 'flight', tx_kix_icn.from_ref = 'hub_kix', tx_kix_icn.to_ref = 'hub_icn';
MERGE (tx_pus_hit:TransportOption {id: 'transport_pus_hit'})
SET tx_pus_hit.mode = 'ferry', tx_pus_hit.from_ref = 'hub_pus', tx_pus_hit.to_ref = 'hub_hit';
MERGE (tx_hit_pus:TransportOption {id: 'transport_hit_pus'})
SET tx_hit_pus.mode = 'ferry', tx_hit_pus.from_ref = 'hub_hit', tx_hit_pus.to_ref = 'hub_pus';

MERGE (src_jnto:Source {id: 'source_jnto'})
SET src_jnto.name = 'JNTO', src_jnto.url = 'https://www.japan.travel/';
MERGE (src_sky:Source {id: 'source_skyscanner'})
SET src_sky.name = 'Flight snapshot', src_sky.url = 'https://www.skyscanner.net/';
MERGE (src_hotel:Source {id: 'source_hotels'})
SET src_hotel.name = 'Hotel snapshot', src_hotel.url = 'https://www.hotels.com/';
MERGE (src_user:Source {id: 'source_user_note'})
SET src_user.name = 'User note', src_user.url = 'user-provided';

MERGE (obs_icn_fuk:Observation {id: 'obs_tx_icn_fuk_20260322'})
SET obs_icn_fuk.subject_ref = 'transport_icn_fuk',
    obs_icn_fuk.metric = 'fare_quote',
    obs_icn_fuk.price_krw = 168000,
    obs_icn_fuk.depart_at = '2026-03-22T18:50:00+09:00',
    obs_icn_fuk.observed_at = '2026-03-12T10:00:00+09:00';
MERGE (obs_fuk_icn:Observation {id: 'obs_tx_fuk_icn_20260324'})
SET obs_fuk_icn.subject_ref = 'transport_fuk_icn',
    obs_fuk_icn.metric = 'fare_quote',
    obs_fuk_icn.price_krw = 171000,
    obs_fuk_icn.depart_at = '2026-03-24T15:20:00+09:00',
    obs_fuk_icn.observed_at = '2026-03-12T10:05:00+09:00';
MERGE (obs_osaka:Observation {id: 'obs_tx_icn_kix_20260322'})
SET obs_osaka.subject_ref = 'transport_icn_kix',
    obs_osaka.metric = 'fare_quote',
    obs_osaka.price_krw = 211000,
    obs_osaka.depart_at = '2026-03-22T19:05:00+09:00',
    obs_osaka.observed_at = '2026-03-12T10:10:00+09:00';
MERGE (obs_osaka_back:Observation {id: 'obs_tx_kix_icn_20260324'})
SET obs_osaka_back.subject_ref = 'transport_kix_icn',
    obs_osaka_back.metric = 'fare_quote',
    obs_osaka_back.price_krw = 196000,
    obs_osaka_back.depart_at = '2026-03-24T12:10:00+09:00',
    obs_osaka_back.observed_at = '2026-03-12T10:15:00+09:00';
MERGE (obs_tsushima:Observation {id: 'obs_tx_pus_hit_20260323'})
SET obs_tsushima.subject_ref = 'transport_pus_hit',
    obs_tsushima.metric = 'fare_quote',
    obs_tsushima.price_krw = 120000,
    obs_tsushima.depart_at = '2026-03-23T08:40:00+09:00',
    obs_tsushima.observed_at = '2026-03-12T09:00:00+09:00';

MERGE (sample_session:PlannerSession {id: 'session_japan_shorttrip'})
SET sample_session.name = 'March short trip sample', sample_session.status = 'sample';
MERGE (origin_constraint:Constraint {id: 'constraint_origin_icn'})
SET origin_constraint.constraint_kind = 'origin', origin_constraint.value = 'hub_icn';
MERGE (depart_constraint:Constraint {id: 'constraint_depart_after_20260322_1800'})
SET depart_constraint.constraint_kind = 'depart_after', depart_constraint.value = '2026-03-22T18:00:00+09:00';
MERGE (return_constraint:Constraint {id: 'constraint_return_before_20260324_1900'})
SET return_constraint.constraint_kind = 'return_depart_before', return_constraint.value = '2026-03-24T19:00:00+09:00';
MERGE (budget_constraint:Constraint {id: 'constraint_budget_700000'})
SET budget_constraint.constraint_kind = 'total_budget_max', budget_constraint.value = 700000;
MERGE (food_pref:Preference {id: 'pref_food'})
SET food_pref.preference_kind = 'themes', food_pref.value = 'theme_food';
MERGE (shopping_pref:Preference {id: 'pref_shopping'})
SET shopping_pref.preference_kind = 'themes', shopping_pref.value = 'theme_shopping';

MERGE (candidate_fukuoka:CandidatePlan {id: 'sample_candidate_fukuoka'})
SET candidate_fukuoka.city_ref = 'city_fukuoka', candidate_fukuoka.score = 92, candidate_fukuoka.estimated_total_krw = 492000;
MERGE (candidate_osaka:CandidatePlan {id: 'sample_candidate_osaka'})
SET candidate_osaka.city_ref = 'city_osaka', candidate_osaka.score = 84, candidate_osaka.estimated_total_krw = 590000;
MERGE (candidate_tsushima:CandidatePlan {id: 'sample_candidate_tsushima'})
SET candidate_tsushima.city_ref = 'city_tsushima', candidate_tsushima.score = 78, candidate_tsushima.estimated_total_krw = 337000;

MERGE (jp)-[:CONTAINS]->(kanto);
MERGE (jp)-[:CONTAINS]->(kansai);
MERGE (jp)-[:CONTAINS]->(kyushu);
MERGE (jp)-[:CONTAINS]->(hokkaido);
MERGE (kanto)-[:CONTAINS]->(tokyo_pref);
MERGE (kansai)-[:CONTAINS]->(osaka_pref);
MERGE (kansai)-[:CONTAINS]->(kyoto_pref);
MERGE (kyushu)-[:CONTAINS]->(fukuoka_pref);
MERGE (hokkaido)-[:CONTAINS]->(hokkaido_pref);
MERGE (tokyo_pref)-[:CONTAINS]->(tokyo);
MERGE (osaka_pref)-[:CONTAINS]->(osaka);
MERGE (kyoto_pref)-[:CONTAINS]->(kyoto);
MERGE (fukuoka_pref)-[:CONTAINS]->(fukuoka);
MERGE (hokkaido_pref)-[:CONTAINS]->(sapporo);

MERGE (tokyo)-[:HAS_TRANSIT_HUB]->(hnd);
MERGE (osaka)-[:HAS_TRANSIT_HUB]->(kix);
MERGE (fukuoka)-[:HAS_TRANSIT_HUB]->(fuk);
MERGE (sapporo)-[:HAS_TRANSIT_HUB]->(cts);
MERGE (tsushima)-[:HAS_TRANSIT_HUB]->(hit);
MERGE (kyoto)-[:NEAR]->(kix);

MERGE (tokyo)-[:MATCHES_THEME]->(shopping);
MERGE (tokyo)-[:MATCHES_THEME]->(nightlife);
MERGE (osaka)-[:MATCHES_THEME]->(food);
MERGE (osaka)-[:MATCHES_THEME]->(shopping);
MERGE (osaka)-[:MATCHES_THEME]->(nightlife);
MERGE (kyoto)-[:MATCHES_THEME]->(history);
MERGE (fukuoka)-[:MATCHES_THEME]->(food);
MERGE (fukuoka)-[:MATCHES_THEME]->(shopping);
MERGE (sapporo)-[:MATCHES_THEME]->(food);
MERGE (sapporo)-[:MATCHES_THEME]->(nature);
MERGE (tsushima)-[:MATCHES_THEME]->(nature);

MERGE (fukuoka)-[:HAS_RESTAURANT]->(ichiran);
MERGE (osaka)-[:HAS_RESTAURANT]->(kukuru);
MERGE (tokyo)-[:HAS_RESTAURANT]->(sushidai);
MERGE (kyoto)-[:HAS_ATTRACTION]->(fushimi);
MERGE (fukuoka)-[:HAS_ATTRACTION]->(ohori);
MERGE (fukuoka)-[:HAS_LODGING]->(hotel_fukuoka);
MERGE (osaka)-[:HAS_LODGING]->(hotel_osaka);
MERGE (tokyo)-[:HAS_LODGING]->(hotel_tokyo);
MERGE (ichiran)-[:MATCHES_THEME]->(food);
MERGE (kukuru)-[:MATCHES_THEME]->(food);
MERGE (kukuru)-[:MATCHES_THEME]->(nightlife);
MERGE (sushidai)-[:MATCHES_THEME]->(food);
MERGE (fushimi)-[:MATCHES_THEME]->(history);
MERGE (ohori)-[:MATCHES_THEME]->(nature);
MERGE (hotel_fukuoka)-[:MATCHES_THEME]->(food);
MERGE (hotel_osaka)-[:MATCHES_THEME]->(nightlife);
MERGE (hotel_tokyo)-[:MATCHES_THEME]->(shopping);

MERGE (jp)-[:SUBJECT_TO_RULE]->(buffer_rule);
MERGE (onsen)-[:SUBJECT_TO_RULE]->(onsen_rule);
MERGE (kyushu_pass)-[:CONNECTED_TO]->(kyushu);

MERGE (icn)-[:CONNECTED_TO]->(tx_icn_fuk);
MERGE (tx_icn_fuk)-[:CONNECTED_TO]->(fuk);
MERGE (fuk)-[:CONNECTED_TO]->(tx_fuk_icn);
MERGE (tx_fuk_icn)-[:CONNECTED_TO]->(icn);
MERGE (icn)-[:CONNECTED_TO]->(tx_icn_kix);
MERGE (tx_icn_kix)-[:CONNECTED_TO]->(kix);
MERGE (kix)-[:CONNECTED_TO]->(tx_kix_icn);
MERGE (tx_kix_icn)-[:CONNECTED_TO]->(icn);
MERGE (pus)-[:CONNECTED_TO]->(tx_pus_hit);
MERGE (tx_pus_hit)-[:CONNECTED_TO]->(hit);
MERGE (hit)-[:CONNECTED_TO]->(tx_hit_pus);
MERGE (tx_hit_pus)-[:CONNECTED_TO]->(pus);

MERGE (tx_icn_fuk)-[:SUPPORTED_BY]->(obs_icn_fuk);
MERGE (tx_fuk_icn)-[:SUPPORTED_BY]->(obs_fuk_icn);
MERGE (tx_icn_kix)-[:SUPPORTED_BY]->(obs_osaka);
MERGE (tx_kix_icn)-[:SUPPORTED_BY]->(obs_osaka_back);
MERGE (tx_pus_hit)-[:SUPPORTED_BY]->(obs_tsushima);
MERGE (obs_icn_fuk)-[:OBSERVED_FROM]->(src_sky);
MERGE (obs_fuk_icn)-[:OBSERVED_FROM]->(src_sky);
MERGE (obs_osaka)-[:OBSERVED_FROM]->(src_sky);
MERGE (obs_osaka_back)-[:OBSERVED_FROM]->(src_sky);
MERGE (obs_tsushima)-[:OBSERVED_FROM]->(src_user);
MERGE (jp)-[:SUPPORTED_BY]->(src_jnto);

MERGE (sample_session)-[:HAS_CONSTRAINT]->(origin_constraint);
MERGE (sample_session)-[:HAS_CONSTRAINT]->(depart_constraint);
MERGE (sample_session)-[:HAS_CONSTRAINT]->(return_constraint);
MERGE (sample_session)-[:HAS_CONSTRAINT]->(budget_constraint);
MERGE (sample_session)-[:HAS_PREFERENCE]->(food_pref);
MERGE (sample_session)-[:HAS_PREFERENCE]->(shopping_pref);
MERGE (sample_session)-[:GENERATED_PLAN]->(candidate_fukuoka);
MERGE (sample_session)-[:GENERATED_PLAN]->(candidate_osaka);
MERGE (sample_session)-[:GENERATED_PLAN]->(candidate_tsushima);
MERGE (candidate_fukuoka)-[:CHOOSES_TRANSPORT]->(tx_icn_fuk);
MERGE (candidate_fukuoka)-[:CHOOSES_TRANSPORT]->(tx_fuk_icn);
MERGE (candidate_fukuoka)-[:CHOOSES_STAY]->(hotel_fukuoka);
MERGE (candidate_fukuoka)-[:SATISFIES]->(budget_constraint);
MERGE (candidate_osaka)-[:CHOOSES_TRANSPORT]->(tx_icn_kix);
MERGE (candidate_osaka)-[:CHOOSES_TRANSPORT]->(tx_kix_icn);
MERGE (candidate_osaka)-[:CHOOSES_STAY]->(hotel_osaka);
MERGE (candidate_osaka)-[:SATISFIES]->(budget_constraint);
MERGE (candidate_tsushima)-[:CHOOSES_TRANSPORT]->(tx_pus_hit);
MERGE (candidate_tsushima)-[:CHOOSES_TRANSPORT]->(tx_hit_pus);
MERGE (candidate_tsushima)-[:CONFLICTS_WITH]->(origin_constraint);
MERGE (candidate_osaka)-[:ALTERNATIVE_TO]->(candidate_fukuoka);
MERGE (candidate_tsushima)-[:ALTERNATIVE_TO]->(candidate_fukuoka);
