CREATE OR REPLACE FUNCTION public.game_limit_for_plan(input_plan public.subscription_plan)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE input_plan
    WHEN 'free' THEN 0
    WHEN 'indie' THEN 1
    WHEN 'studio' THEN 5
    WHEN 'publisher' THEN 15
    WHEN 'crazy' THEN 30
  END;
$function$;
