-- Daily complaint volume against each brand's own trailing 28-day baseline.
create or replace table daily as
with d as (
  select brand, "at"::date as day, count(*) as reviews,
         count(*) filter (where sentiment = 'negative') as negative
  from facts group by 1, 2
)
select *,
       avg(negative) over w as baseline,
       stddev_samp(negative) over w as baseline_sd
from d
window w as (partition by brand order by day rows between 28 preceding and 1 preceding)
order by brand, day;

create or replace table spikes as
select brand, day, reviews, negative, round(baseline, 1) as baseline,
       round((negative - baseline) / greatest(baseline_sd, sqrt(greatest(baseline, 1))), 2) as z
from daily
where baseline is not null and negative >= 8
  and (negative - baseline) / greatest(baseline_sd, sqrt(greatest(baseline, 1))) >= 3
order by z desc;
