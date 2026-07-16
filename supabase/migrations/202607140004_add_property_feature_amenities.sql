alter table public.property_amenities
  drop constraint property_amenities_amenity_code_check;

alter table public.property_amenities
  add constraint property_amenities_amenity_code_check check (amenity_code in (
    'water', 'shade', 'picnic_table', 'restroom', 'parking', 'tennis_ball',
    'frisbee', 'agility_equipment', 'swimming_pool', 'agility_course',
    'hiking_trails', 'lake_access', 'cell_service', 'wheelchair_accessible'
  ));
