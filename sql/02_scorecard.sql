-- Brand scorecard over the comparison window.
create or replace table scorecard as
select brand, any_value(sector) as sector, count(*) as reviews,
       round(avg(rating), 2) as avg_rating,
       round(avg((sentiment = 'negative')::int), 3) as negative_share,
       round(avg((sentiment = 'positive')::int) - avg((sentiment = 'negative')::int), 3) as net_sentiment,
       round(avg((churn = 'company')::int), 4) as leaving_share,
       round(avg((severity >= 3)::int), 4) as critical_share,
       round(avg((after_update)::int), 4) as after_update_share,
       round(avg(replied::int), 3) as reply_rate
from facts
where in_window
group by brand
order by brand;
