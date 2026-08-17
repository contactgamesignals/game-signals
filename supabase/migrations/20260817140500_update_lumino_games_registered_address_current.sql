update public.billing_seller_profiles
set registered_address = 'ul. Kazimierza Morawskiego 5/127, 30-102 Kraków, Małopolskie, Poland',
    updated_at = now()
where legal_name = 'Lumino Games sp. z o.o.'
  and active = true;
