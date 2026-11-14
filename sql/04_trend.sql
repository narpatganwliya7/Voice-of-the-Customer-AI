-- Weekly trend per brand, and per brand x topic.
create or replace table weekly as
select brand, date_trunc('week', "at")::date as week, count(*) as reviews,
       round(avg(rating), 3) as avg_rating,
       round(avg((sentiment = 'negative')::int), 4) as negative_share
from facts
group by brand, week
order by brand, week;

create or replace table weekly_topics as
with w as (select brand, date_trunc('week', "at")::date as week, count(*) as n from facts group by 1, 2),
     m as (select brand, aspect, polarity, date_trunc('week', "at")::date as week from mentions)
select m.brand, m.week, m.aspect,
       round(count(*) filter (where m.polarity = 'negative') / any_value(w.n), 4) as negative_share,
       any_value(w.n) as reviews
from m join w using (brand, week)
group by m.brand, m.week, m.aspect;
