-- Daily complaint volume against each brand's own baseline: the 28 calendar days before
-- (days without a review count as zero), as long as at least 14 of those days exist.
create or replace table daily as
with d as (
  select brand, "at"::date as day, count(*) as reviews,
         count(*) filter (where sentiment = 'negative') as negative
  from facts group by 1, 2
),
cal as (
  select brand, unnest(generate_series(min(day), max(day), interval 1 day))::date as day
  from d group by 1
),
filled as (
  select c.brand, c.day, coalesce(d.reviews, 0) as reviews, coalesce(d.negative, 0) as negative
  from cal c left join d using (brand, day)
)
select *,
       avg(negative) over w as baseline,
       stddev_samp(negative) over w as baseline_sd,
       count(*) over w as baseline_days
from filled
window w as (partition by brand order by day range between interval 28 days preceding and interval 1 day preceding)
order by brand, day;

create or replace table spikes as
select brand, day, reviews, negative, round(baseline, 1) as baseline,
       round((negative - baseline) / greatest(baseline_sd, sqrt(greatest(baseline, 1))), 2) as z
from daily
where baseline_days >= 14 and negative >= 8
  and (negative - baseline) / greatest(baseline_sd, sqrt(greatest(baseline, 1))) >= 3
order by z desc;
