\set ON_ERROR_STOP on
-- REVIEW ONLY. NOT a migration. Do not run until owner approves execution AND
-- confirms publication rights for every referenced asset. No existing row changes.
\if :{?nookstep_catalog_approved}
\else
  \echo 'STOP: explicit catalog execution approval is required.'
  do $$ begin raise exception 'Catalog deployment requires affirmative operator and artwork review flags.'; end $$;
\endif
\if :{?nookstep_art_rights_verified}
\else
  \echo 'STOP: verified artwork publication rights are required.'
  do $$ begin raise exception 'Catalog deployment requires affirmative operator and artwork review flags.'; end $$;
\endif
\if :nookstep_catalog_approved
\else
  do $$ begin raise exception 'Catalog deployment requires affirmative operator and artwork review flags.'; end $$;
\endif
\if :nookstep_art_rights_verified
\else
  do $$ begin raise exception 'Catalog deployment requires affirmative operator and artwork review flags.'; end $$;
\endif
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
create temporary table proposed_catalog (like public.shop_items including defaults) on commit drop;
insert into proposed_catalog(id,name,category,price_coins,surface_type,room_kind,asset_path,is_active,sort_order) values
 ('nook-chair-01','Study chair','Seating',3,'floor','chair','/assets/room/normalized/chair/chair-frontLeft.png',true,10),
 ('nook-desk-01','Study desk','Desks',10,'floor','desk','/assets/room/normalized/desk/desk-frontLeft.png',true,20),
 ('nook-lamp-01','Standing lamp','Lighting',6,'floor','lamp','/assets/room/normalized/lamp/lamp-frontLeft.png',true,30),
 ('nook-sofa-01','Cozy sofa','Seating',15,'floor','sofa','/assets/room/normalized/sofa/sofa-frontLeft.png',true,40),
 ('nook-books-01','Little book stack','Tabletop',2,'tabletop','books','/assets/room/decorations/books-01.png',true,50),
 ('nook-candle-01','Desk candle','Tabletop',2,'tabletop','candle','/assets/room/decorations/candle-01.png',true,60),
 ('nook-painting-01','Framed painting','Wall art',5,'wall','painting','/assets/room/wall-decorations/painting/painting-left.png',true,70);
update proposed_catalog set asset_variants = jsonb_build_object(
 'frontLeft',format('/assets/room/normalized/%s/%s-frontLeft.png',room_kind,room_kind),
 'frontRight',format('/assets/room/normalized/%s/%s-frontRight.png',room_kind,room_kind),
 'backLeft',format('/assets/room/normalized/%s/%s-backLeft.png',room_kind,room_kind),
 'backRight',format('/assets/room/normalized/%s/%s-backRight.png',room_kind,room_kind)) where surface_type='floor';
update proposed_catalog set asset_variants = jsonb_build_object('left','/assets/room/wall-decorations/painting/painting-left.png','right','/assets/room/wall-decorations/painting/painting-right.png') where surface_type='wall';
-- Serialize catalog administration; reject drift instead of repricing existing IDs.
lock table public.shop_items in share row exclusive mode;
do $$ begin
 if exists(select 1 from proposed_catalog p join public.shop_items c using(id)
   where (c.name,c.category,c.price_coins,c.surface_type,c.room_kind,c.asset_path,c.asset_variants,c.is_active,c.sort_order)
     is distinct from (p.name,p.category,p.price_coins,p.surface_type,p.room_kind,p.asset_path,p.asset_variants,p.is_active,p.sort_order)) then
   raise exception 'Catalog ID conflicts with existing metadata. Review; no existing rows were changed.';
 end if;
end $$;
insert into public.shop_items(id,name,category,price_coins,surface_type,room_kind,asset_path,asset_variants,is_active,sort_order)
 select id,name,category,price_coins,surface_type,room_kind,asset_path,asset_variants,is_active,sort_order
 from proposed_catalog on conflict(id) do nothing;
commit;
