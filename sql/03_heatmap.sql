-- Share of each brand's reviews that complain about (or praise) each topic.
create or replace table heatmap as
with n as (select brand, count(*) as n from facts where in_window group by brand)
select m.brand, m.aspect,
       round(count(*) filter (where m.polarity = 'negative') / any_value(n.n), 4) as negative_share,
       round(count(*) filter (where m.polarity = 'positive') / any_value(n.n), 4) as positive_share,
       count(*) filter (where m.polarity = 'negative') as negative_mentions
from mentions m join n using (brand)
where m.in_window
group by m.brand, m.aspect
order by m.brand, negative_share desc, m.aspect;
