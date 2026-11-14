-- One row per review with its best available label, and one row per topic mention.
create or replace table facts as
select r.review_id, r.brand, r.sector, r.source, r.rating, r."at", r.app_version, r.replied, r.title, r.text,
       s.sentiment, s.churn, s.severity, s.after_update, s.aspects, s.competitors, s.label_source,
       r."at" >= (select max("at") from read_parquet('{store}/reviews/*.parquet')) - interval '{window} days' as in_window
from read_parquet('{store}/reviews/*.parquet') r
join read_parquet('{store}/scored.parquet') s using (review_id);

create or replace table mentions as
select review_id, brand, sector, rating, "at", in_window,
       json_extract_string(a, '$[0]') as aspect,
       json_extract_string(a, '$[1]') as polarity
from (select *, unnest(json_extract(aspects, '$[*]')) as a from facts);
