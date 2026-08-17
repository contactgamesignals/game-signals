update public.billing_seller_profiles
set registered_address = 'ul. Ujastek 1, 31-752 Kraków, Poland',
    updated_at = now()
where profile_key = 'lumino_games_20260814'
  and legal_name = 'Lumino Games sp. z o.o.'
  and nip = '6762600090'
  and registered_address is distinct from 'ul. Ujastek 1, 31-752 Kraków, Poland';
