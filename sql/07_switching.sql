-- Where unhappy customers say they are going (or compare the brand with).
create or replace table switching as
select brand as from_brand, json_extract_string(c, '$') as to_company,
       count(*) as mentions,
       count(*) filter (where churn = 'company') as leaving_mentions,
       round(avg(rating), 2) as avg_rating
from (select *, unnest(json_extract(competitors, '$[*]')) as c from facts)
where sentiment in ('negative', 'mixed') or churn = 'company'
group by 1, 2
order by mentions desc;
