import { vec, type Vec } from '../physics';

/** Art geometry is independent of the corresponding physical collision body. */
export type ArtBounds = Readonly<{ x: number; y: number; width: number; height: number }>;
export type ArtImageId = 'shop-tar' | 'shop-rust' | 'shop-concrete' | 'tree-worn' | 'shop-havana' | 'shop-market' | 'shop-walkup' | 'shop-art-deco' | 'shop-condo' | 'shop-courtyard' | 'shop-loft' | 'shop-shipyard' | 'shop-renovation' | 'civic-barracks' | 'freight-depot' | 'fuel-station' | 'villa-tile' | 'villa-glass' | 'villa-annex' | 'fairway-club' | 'port-office' | 'bonded-warehouse' | 'hotel-sandpiper' | 'hotel-pacific' | 'hotel-sunset';
export type PropArtwork = Readonly<{
  image: ArtImageId;
  layer: 'structure';
  bounds: ArtBounds;
  rotation?: number;
  /** Optional runtime-only roof sign. Never bake a campaign or business name into an asset. */
  sign?: 'shop' | 'facility' | 'hotel';
  /** Convex silhouette for sun shadows and optional directed-light occlusion. */
  silhouette: readonly Vec[];
  occluder?: readonly Vec[];
}>;
export type ArtProp = { id?: number; sourceId?: string; artDistrict?: string; kind: string; body: { position: Vec; angle?: number; w: number; h: number } };

function roof(image: ArtImageId, w: number, h: number, sign?: PropArtwork['sign']): PropArtwork {
  // A 0.3 m rim on each edge gives roofs a slight overhang without altering physics.
  const x = -(w + 0.6) / 2, y = -(h + 0.6) / 2, right = -x, bottom = -y;
  const outline = [vec(x, y), vec(right, y), vec(right, bottom), vec(x, bottom)];
  return { image, layer: 'structure', bounds: { x, y, width: w + 0.6, height: h + 0.6 }, sign, silhouette: outline, occluder: outline };
}
export const propArtwork = {
  shop: roof('shop-tar', 10, 10, 'shop'),
  shopRust: roof('shop-rust', 10, 10, 'shop'),
  shopConcrete: roof('shop-concrete', 10, 10, 'shop'),
  shopHavana: roof('shop-havana', 10, 10, 'shop'),
  shopMarket: roof('shop-market', 10, 10, 'shop'),
  shopWalkup: roof('shop-walkup', 10, 10, 'shop'),
  shopArtDeco: roof('shop-art-deco', 10, 10, 'shop'),
  shopCondo: roof('shop-condo', 10, 10, 'shop'),
  shopCourtyard: roof('shop-courtyard', 10, 10, 'shop'),
  shopLoft: roof('shop-loft', 10, 10, 'shop'),
  shopShipyard: roof('shop-shipyard', 10, 10, 'shop'),
  shopRenovation: roof('shop-renovation', 10, 10, 'shop'),
  civicBarracks: roof('civic-barracks', 23, 10, 'facility'),
  freightDepot: roof('freight-depot', 23, 10, 'facility'),
  fuelStation: roof('fuel-station', 10, 10, 'facility'),
  villaTile: roof('villa-tile', 16, 10),
  villaGlass: roof('villa-glass', 16, 10),
  villaAnnex: roof('villa-annex', 6, 3),
  fairwayClub: roof('fairway-club', 10, 14),
  portOffice: roof('port-office', 6, 6, 'facility'),
  bondedWarehouse: roof('bonded-warehouse', 28, 12, 'facility'),
  hotelSandpiper: roof('hotel-sandpiper', 33, 10, 'hotel'),
  hotelPacific: roof('hotel-pacific', 33, 11, 'hotel'),
  hotelSunset: roof('hotel-sunset', 31, 12, 'hotel'),
  tree: { image: 'tree-worn', layer: 'structure', bounds: { x: -2.6, y: -2.6, width: 5.2, height: 5.2 }, silhouette: Array.from({ length: 12 }, (_, i) => vec(Math.cos(i * Math.PI / 6) * 2.4, Math.sin(i * Math.PI / 6) * 2.4)) },
} as const satisfies Record<string, PropArtwork>;

const legacyShops = [propArtwork.shop, propArtwork.shopRust, propArtwork.shopConcrete];
/** Deliberate material/age mixtures, rather than homogeneous wealth-color filters. */
const districtShops: Record<string, readonly PropArtwork[]> = {
  'OLD TOWN': [propArtwork.shopHavana, propArtwork.shopWalkup, propArtwork.shop, propArtwork.shopMarket, propArtwork.shopArtDeco, propArtwork.shopConcrete],
  'MARKET QUARTER': [propArtwork.shopMarket, propArtwork.shopRust, propArtwork.shopShipyard, propArtwork.shopHavana, propArtwork.shop, propArtwork.shopWalkup],
  'MIDTOWN': [propArtwork.shopArtDeco, propArtwork.shopCondo, propArtwork.shopRenovation, propArtwork.shopLoft, propArtwork.shopConcrete, propArtwork.shopArtDeco],
  'GARDEN DISTRICT': [propArtwork.shopCourtyard, propArtwork.shopCondo, propArtwork.shopWalkup, propArtwork.shopRenovation, propArtwork.shopArtDeco, propArtwork.shopConcrete],
  'THE DOCKS': [propArtwork.shopShipyard, propArtwork.shopRust, propArtwork.shopLoft, propArtwork.shop, propArtwork.shopMarket, propArtwork.shopConcrete],
  'EAST VILLAGE': [propArtwork.shopWalkup, propArtwork.shopRenovation, propArtwork.shopLoft, propArtwork.shopConcrete, propArtwork.shopHavana, propArtwork.shopMarket],
};
const trees = Array.from({ length: 4 }, (_, i) => ({ ...propArtwork.tree, rotation: i * Math.PI / 2 }));
export const asphaltArtwork = { image: 'asphalt', layer: 'ground', tileMetres: 48 } as const;

/** Selection consumes no gameplay RNG and never keys on a business's display label. */
function appearanceSeed(prop: ArtProp): number {
  const identity = prop.sourceId ?? String(prop.id ?? `${prop.body.position.x},${prop.body.position.y}`);
  let seed = 2166136261;
  for (let i = 0; i < identity.length; i++) seed = Math.imul(seed ^ identity.charCodeAt(i), 16777619);
  return seed >>> 0;
}

export function artworkFor(prop: ArtProp): PropArtwork | undefined {
  const { position: p, w, h } = prop.body;
  const seed = appearanceSeed(prop);
  const city = p.x >= 0 && p.x <= 240 && p.y >= 0 && p.y <= 240;
  if (city && prop.kind === 'building' && w === 10 && h === 10) {
    const palette = districtShops[prop.artDistrict ?? ''] ?? legacyShops;
    return palette[seed % palette.length];
  }
  if (city && prop.kind === 'tree') return trees[seed % trees.length];
  if (prop.kind === 'barracks' && w === 23 && h === 10) return propArtwork.civicBarracks;
  if (prop.kind === 'shed' && w === 23 && h === 10) return propArtwork.freightDepot;
  if (prop.kind === 'station' && w === 10 && h === 10) return propArtwork.fuelStation;
  // Villa and annex share an authored source ID, but differ in physical size.
  if (prop.kind === 'building' && prop.sourceId?.startsWith('villa-')) {
    if (w === 16 && h === 10) return seed % 2 ? propArtwork.villaTile : propArtwork.villaGlass;
    if (w === 6 && h === 3) return propArtwork.villaAnnex;
  }
  if (prop.kind !== 'building') return;
  if (w === 10 && h === 14) return propArtwork.fairwayClub;
  if (p.y < 0 && w === 6 && h === 6) return propArtwork.portOffice;
  if (p.y < 0 && w === 28 && h === 12) return propArtwork.bondedWarehouse;
  if (p.y > 240) {
    if (w === 33 && h === 10) return propArtwork.hotelSandpiper;
    if (w === 33 && h === 11) return propArtwork.hotelPacific;
    if (w === 31 && h === 12) return propArtwork.hotelSunset;
  }
}
export function artRadius(prop: ArtProp): number {
  const b = artworkFor(prop)?.bounds;
  // Include maximum sun displacement so off-screen roofs retain their cast shadows.
  const radius = b ? Math.hypot(Math.max(Math.abs(b.x), Math.abs(b.x + b.width)), Math.max(Math.abs(b.y), Math.abs(b.y + b.height))) + 3 : 0;
  return Math.max(prop.body.w, prop.body.h, radius);
}
