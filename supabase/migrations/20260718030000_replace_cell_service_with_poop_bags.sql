-- Cell service is no longer an amenity. Remove the old selection before
-- narrowing the allowed codes, then make poop bags available for hosts.
delete from public.property_amenities
where amenity_code = 'cell_service';

alter table public.property_amenities
  drop constraint if exists property_amenities_amenity_code_check;

alter table public.property_amenities
  add constraint property_amenities_amenity_code_check check (amenity_code in (
    'water', 'shade', 'picnic_table', 'restroom', 'parking', 'tennis_ball',
    'frisbee', 'agility_equipment', 'swimming_pool', 'agility_course',
    'hiking_trails', 'lake_access', 'poop_bags', 'wheelchair_accessible'
  ));
