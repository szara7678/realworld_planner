// Generic travel ontology schema
CREATE CONSTRAINT country_id IF NOT EXISTS FOR (n:Country) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT region_id IF NOT EXISTS FOR (n:Region) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT city_id IF NOT EXISTS FOR (n:City) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT district_id IF NOT EXISTS FOR (n:District) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT culture_id IF NOT EXISTS FOR (n:Culture) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT festival_id IF NOT EXISTS FOR (n:Festival) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT cuisine_id IF NOT EXISTS FOR (n:Cuisine) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT restaurant_id IF NOT EXISTS FOR (n:Restaurant) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT attraction_id IF NOT EXISTS FOR (n:Attraction) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT transit_id IF NOT EXISTS FOR (n:TransitHub) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT tip_id IF NOT EXISTS FOR (n:TravelTip) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT ref_id IF NOT EXISTS FOR (n:Reference) REQUIRE n.id IS UNIQUE;

// Country
MERGE (jp:Country {id: 'country_japan'})
SET jp.name = 'Japan',
    jp.iso2 = 'JP',
    jp.capital = 'Tokyo',
    jp.currency = 'JPY',
    jp.language = 'Japanese';

// Regions
MERGE (kanto:Region {id: 'region_kanto'})
SET kanto.name = 'Kanto',
    kanto.region_level = 'region',
    kanto.local_admin_type = '도/광역권';
MERGE (kansai:Region {id: 'region_kansai'})
SET kansai.name = 'Kansai',
    kansai.region_level = 'region',
    kansai.local_admin_type = '부·현';
MERGE (kyushu:Region {id: 'region_kyushu'})
SET kyushu.name = 'Kyushu',
    kyushu.region_level = 'region',
    kyushu.local_admin_type = '현';

// Cities
MERGE (tokyo:City {id: 'city_tokyo'})
SET tokyo.name = 'Tokyo', tokyo.prefecture = 'Tokyo-to', tokyo.city_class = 'metropolis';
MERGE (osaka:City {id: 'city_osaka'})
SET osaka.name = 'Osaka', osaka.prefecture = 'Osaka-fu', osaka.city_class = 'designated city';
MERGE (kyoto:City {id: 'city_kyoto'})
SET kyoto.name = 'Kyoto', kyoto.prefecture = 'Kyoto-fu', kyoto.city_class = 'designated city';
MERGE (fukuoka:City {id: 'city_fukuoka'})
SET fukuoka.name = 'Fukuoka', fukuoka.prefecture = 'Fukuoka-ken', fukuoka.city_class = 'designated city';

// Districts
MERGE (shinjuku:District {id: 'district_shinjuku'})
SET shinjuku.name = 'Shinjuku', shinjuku.admin_unit = 'special ward';
MERGE (dotonbori:District {id: 'district_dotonbori'})
SET dotonbori.name = 'Dotonbori', dotonbori.admin_unit = 'district';
MERGE (gion:District {id: 'district_gion'})
SET gion.name = 'Gion', gion.admin_unit = 'district';
MERGE (tenjin:District {id: 'district_tenjin'})
SET tenjin.name = 'Tenjin', tenjin.admin_unit = 'district';

// Culture / Festival / Cuisine
MERGE (onsen:Culture {id: 'culture_onsen'})
SET onsen.name = 'Onsen Culture', onsen.etiquette = 'shower first, no towel in bath';
MERGE (omotenashi:Culture {id: 'culture_omotenashi'})
SET omotenashi.name = 'Omotenashi', omotenashi.travel_impact = 'high hospitality expectation';
MERGE (gion_matsuri:Festival {id: 'festival_gion'})
SET gion_matsuri.name = 'Gion Matsuri', gion_matsuri.month = 'July';
MERGE (dontaku:Festival {id: 'festival_dontaku'})
SET dontaku.name = 'Hakata Dontaku', dontaku.month = 'May';
MERGE (ramen:Cuisine {id: 'cuisine_ramen'})
SET ramen.name = 'Ramen', ramen.style = 'tonkotsu/shoyu/miso';
MERGE (sushi:Cuisine {id: 'cuisine_sushi'})
SET sushi.name = 'Sushi', sushi.style = 'kaiten/omakase';

// Restaurants / attraction / transit
MERGE (ichiran:Restaurant {id: 'rest_ichiran'})
SET ichiran.name = 'Ichiran Tenjin', ichiran.category = 'ramen', ichiran.price_range = '¥~¥¥';
MERGE (kukuru:Restaurant {id: 'rest_dotonbori_kukuru'})
SET kukuru.name = 'Kukuru Dotonbori', kukuru.category = 'takoyaki', kukuru.price_range = '¥';
MERGE (fushimi:Attraction {id: 'spot_fushimi'})
SET fushimi.name = 'Fushimi Inari Shrine', fushimi.theme = 'shrine';
MERGE (nrt:TransitHub {id: 'transit_nrt'})
SET nrt.name = 'Narita International Airport', nrt.hub_type = 'airport';
MERGE (kix:TransitHub {id: 'transit_kix'})
SET kix.name = 'Kansai International Airport', kix.hub_type = 'airport';
MERGE (fuk:TransitHub {id: 'transit_fuk'})
SET fuk.name = 'Fukuoka Airport', fuk.hub_type = 'airport';
MERGE (railpass:TravelTip {id: 'tip_railpass'})
SET railpass.question_type = 'transport budget', railpass.rule = 'check pass if long-distance shinkansen >= 2 rides';
MERGE (jnto:Reference {id: 'ref_jnto'})
SET jnto.url = 'https://www.japan.travel/en/', jnto.source_type = 'official';

// Generic edges
MERGE (jp)-[:HAS_REGION]->(kanto);
MERGE (jp)-[:HAS_REGION]->(kansai);
MERGE (jp)-[:HAS_REGION]->(kyushu);
MERGE (kanto)-[:HAS_CITY]->(tokyo);
MERGE (kansai)-[:HAS_CITY]->(osaka);
MERGE (kansai)-[:HAS_CITY]->(kyoto);
MERGE (kyushu)-[:HAS_CITY]->(fukuoka);
MERGE (tokyo)-[:HAS_DISTRICT]->(shinjuku);
MERGE (osaka)-[:HAS_DISTRICT]->(dotonbori);
MERGE (kyoto)-[:HAS_DISTRICT]->(gion);
MERGE (fukuoka)-[:HAS_DISTRICT]->(tenjin);
MERGE (jp)-[:HAS_CULTURE]->(onsen);
MERGE (jp)-[:HAS_CULTURE]->(omotenashi);
MERGE (kyoto)-[:HOSTS_FESTIVAL]->(gion_matsuri);
MERGE (fukuoka)-[:HOSTS_FESTIVAL]->(dontaku);
MERGE (jp)-[:HAS_CUISINE]->(ramen);
MERGE (jp)-[:HAS_CUISINE]->(sushi);
MERGE (tenjin)-[:HAS_RESTAURANT]->(ichiran);
MERGE (dotonbori)-[:HAS_RESTAURANT]->(kukuru);
MERGE (ramen)-[:SERVES]->(ichiran);
MERGE (kyoto)-[:HAS_ATTRACTION]->(fushimi);
MERGE (tokyo)-[:HAS_TRANSIT_HUB]->(nrt);
MERGE (osaka)-[:HAS_TRANSIT_HUB]->(kix);
MERGE (fukuoka)-[:HAS_TRANSIT_HUB]->(fuk);
MERGE (railpass)-[:APPLIES_TO]->(kanto);
MERGE (railpass)-[:APPLIES_TO]->(kansai);
MERGE (jp)-[:SUPPORTED_BY]->(jnto);
