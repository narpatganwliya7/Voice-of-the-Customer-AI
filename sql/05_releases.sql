-- Release radar: how each app version landed compared with the one before it.
-- "Before it" means the next lower version number (11.6.0 < 11.7.1 < 11.7.2), not the version
-- whose first review came earlier: staged rollouts and the start of the data make dates tie or cross.
create or replace table releases as
with v as (
  select brand, app_version, min("at")::date as first_seen, count(*) as reviews,
         round(avg(rating), 2) as avg_rating,
         round(avg((sentiment = 'negative')::int), 3) as negative_share,
         round(avg((after_update)::int), 3) as after_update_share
  from facts
  where source = 'google_play' and app_version is not null
  group by brand, app_version
  having count(*) >= 25
),
k as (
  select *, list_transform(string_split(regexp_extract(app_version, '^[0-9]+(\.[0-9]+)*'), '.'),
                           lambda x: try_cast(x as bigint)) as version_key
  from v
)
select * exclude (version_key),
       lag(app_version) over w as previous_version,
       round(negative_share - lag(negative_share) over w, 3) as negative_change,
       round(avg_rating - lag(avg_rating) over w, 2) as rating_change
from k
window w as (partition by brand order by version_key, first_seen, app_version)
order by brand, version_key, first_seen, app_version;
