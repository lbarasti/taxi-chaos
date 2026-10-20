import { Body, contact, dist, vec, type Vec } from '../physics';
import { World } from '../world/world';
import { artworkFor, artRadius } from '../artwork/catalogue';
import { compileMap, type CompiledMap } from '../map/compile';
import { authoredCollection, descriptorBody, entities, entityPosition } from '../map/operations';
import type { AuthoredDescriptor, MapDocument } from '../map/schema';
import { validateMap, type Finding, type Validation } from '../map/validation';
import { artworkInline, artworkSources } from './generated';
import type {
  ArtBounds, ArtworkRenderOrder, CompiledObject, ObjectCatalogue, PixelCrop, PropArtwork, PropKind, ResolvedFeature,
} from './schema';

/** Reused by the browser preview and the CLI. Everything here is DOM-free: it compiles,
 * validates and inspects the same immutable map authority the game consumes, so a
 * screenshot can never disagree with collision, shadows, lighting or culling. */

export type AuthoringArtwork = Readonly<{
  image: string;
  bounds: ArtBounds;
  anchor: Vec;
  silhouette: readonly Vec[];
  source?: PixelCrop;
  occluder?: readonly Vec[];
  castsShadow: boolean;
  renderOrder: ArtworkRenderOrder;
  rotation: number;
  /** Present only for direct images / variants that the generated inline manifest owns. */
  manifest: Readonly<{ inline: boolean; measured: boolean }>;
}>;

export type AuthoringKind = PropKind | 'vehicle';

export type AuthoringBody = Readonly<{
  propId: number | null;
  kind: AuthoringKind;
  label: string;
  position: Vec;
  angle: number;
  width: number;
  height: number;
  artwork?: AuthoringArtwork;
  cullingRadius: number;
  features: readonly ResolvedFeature[];
}>;

export type AuthoringRoute = Readonly<{
  id: string;
  name: string;
  category: 'city' | 'country' | 'villa';
  points: readonly Vec[];
  distance: number;
  closest: Vec;
  conflicts: readonly string[];
}>;

export type AuthoringBlocker = Readonly<{
  entityId: string;
  kind: PropKind;
  label: string;
  position: Vec;
  width: number;
  height: number;
  angle: number;
  distance: number;
  penetration: number;
}>;

export type AuthoringReport = Readonly<{
  version: 1;
  revision: string;
  entity: Readonly<{
    id: string;
    type: string | null;
    kind: AuthoringKind;
    collection: string | null;
    label: string;
    position: Vec;
    bodies: readonly AuthoringBody[];
  }>;
  artwork: AuthoringArtwork | null;
  shadow: Readonly<{ casts: boolean; silhouette: readonly Vec[] }> | null;
  lightBlocker: Readonly<{ silhouette: readonly Vec[] }> | null;
  cullingRadius: number;
  features: readonly ResolvedFeature[];
  nearbyRoutes: readonly AuthoringRoute[];
  routeConflicts: readonly Finding[];
  blockers: readonly AuthoringBlocker[];
  findings: readonly Finding[];
  nearbyFindings: readonly Finding[];
  validation: Validation;
  preview: Readonly<{ allowed: boolean; reason: string | null }>;
  map: Readonly<{
    schemaVersion: 5;
    counts: Readonly<{ parking: number; trafficSpawns: number; objectPlacements: number; points: number; roads: number }>;
    budgets: Readonly<{ parking: number; trafficSpawns: number; objectPlacements: number; routeLength: number }>;
    withinBudgets: boolean;
  }>;
}>;

export type AuthoringContext = Readonly<{ map?: CompiledMap; world?: World; validation?: Validation }>;

const ROUTE_RADIUS = 26;
const FINDING_RADIUS = 24;

const clonePoint = (p: Vec): Vec => vec(p.x, p.y);
const clonePoints = (points: readonly Vec[]): readonly Vec[] => points.map(clonePoint);

function artworkSummary(art: PropArtwork | undefined): AuthoringArtwork | undefined {
  if (!art) return undefined;
  return {
    image: art.image,
    bounds: { x: art.bounds.x, y: art.bounds.y, width: art.bounds.width, height: art.bounds.height },
    anchor: clonePoint(art.anchor),
    silhouette: clonePoints(art.silhouette),
    ...(art.source ? { source: { x: art.source.x, y: art.source.y, width: art.source.width, height: art.source.height } } : {}),
    ...(art.occluder ? { occluder: clonePoints(art.occluder) } : {}),
    castsShadow: art.castsShadow !== false,
    renderOrder: art.renderOrder ?? 'below-actors',
    rotation: art.rotation ?? 0,
    manifest: { inline: Object.hasOwn(artworkInline, art.image), measured: Object.hasOwn(artworkSources, art.image) },
  };
}

function features(features: readonly ResolvedFeature[] | undefined): readonly ResolvedFeature[] {
  return (features ?? []).map(feature => ({
    id: feature.id, role: feature.role, offset: clonePoint(feature.offset), position: clonePoint(feature.position),
    ...(feature.label === undefined ? {} : { label: feature.label }),
  }));
}

function descriptorType(value: unknown): string | null {
  return value && typeof value === 'object' && 'type' in value && typeof (value as { type?: unknown }).type === 'string'
    ? (value as { type: string }).type
    : null;
}

function descriptorLabel(value: unknown, fallback: string): string {
  if (!value || typeof value !== 'object') return fallback;
  if ('label' in value && typeof (value as { label?: unknown }).label === 'string') return (value as { label: string }).label;
  if ('name' in value && typeof (value as { name?: unknown }).name === 'string') return (value as { name: string }).name;
  return fallback;
}

function collectionOf(document: MapDocument, id: string): string | null {
  const authored=authoredCollection(document,id); if(authored)return authored;
  if (document.objectPlacements.some(h => h.id === id)) return 'objectPlacements';
  if (document.villas.some(v => v.id === id)) return 'villas';
  if (document.parking.some(p => p.id === id)) return 'parking';
  if (document.trafficSpawns.some(t => t.id === id)) return 'trafficSpawns';
  if (document.stops.some(s => s.id === id)) return 'stops';
  if (document.points.some(p => p.id === id)) return 'points';
  if (document.ridges.some(r => r.id === id)) return 'ridges';
  if (document.labels.some(l => l.id === id)) return 'labels';
  return null;
}

function bodySummary(prop: World['props'][number]): AuthoringBody {
  const art = artworkFor(prop);
  return {
    propId: prop.id,
    kind: prop.kind,
    label: prop.label,
    position: clonePoint(prop.body.position),
    angle: prop.body.angle,
    width: prop.body.w,
    height: prop.body.h,
    ...(art ? { artwork: artworkSummary(art) } : {}),
    cullingRadius: artRadius(prop),
    features: features(prop.features),
  };
}

function objectBody(object: CompiledObject, propId: number | null): AuthoringBody {
  return {
    propId,
    kind: object.kind,
    label: '',
    position: clonePoint(object.position),
    angle: object.angle,
    width: object.width,
    height: object.height,
    ...(object.artwork ? { artwork: artworkSummary(object.artwork) } : {}),
    // Share the renderer's culling radius helper, so the report, the renderer's
    // visibility test and the map preview all cull with the same compiled geometry.
    cullingRadius: object.artwork
      ? artRadius({ kind: object.kind, body: { position: object.position, w: object.width, h: object.height }, artwork: object.artwork })
      : Math.max(object.width, object.height),
    features: features(object.features),
  };
}

function pointSegmentDistance(p: Vec, a: Vec, b: Vec): { distance: number; closest: Vec } {
  const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2));
  const closest = vec(a.x + dx * t, a.y + dy * t);
  return { distance: dist(p, closest), closest };
}

function polylineDistance(p: Vec, points: readonly Vec[]): { distance: number; closest: Vec } {
  let best = { distance: Infinity, closest: clonePoint(points[0] ?? p) };
  for (let i = 1; i < points.length; i++) {
    const candidate = pointSegmentDistance(p, points[i - 1], points[i]);
    if (candidate.distance < best.distance) best = candidate;
  }
  return best;
}

function routeList(map: CompiledMap, position: Vec, findings: readonly Finding[], entityId: string): readonly AuthoringRoute[] {
  const routes: { id: string; name: string; category: AuthoringRoute['category']; points: readonly Vec[] }[] = [
    ...map.city.roads.map(road => ({ id: road.id, name: road.id, category: 'city' as const, points: [road.from, road.to] })),
    ...map.country.COUNTRY_ROADS.map(road => ({ id: road.id, name: road.name, category: 'country' as const, points: road.points })),
    ...map.country.VILLA_DRIVES.map((points, index) => ({ id: map.country.VILLAS[index].id, name: `Drive · ${map.country.VILLAS[index].name}`, category: 'villa' as const, points })),
  ];
  return routes.flatMap(route => {
    const nearest = polylineDistance(position, route.points);
    if (nearest.distance > ROUTE_RADIUS) return [];
    return [{
      id: route.id, name: route.name, category: route.category, points: clonePoints(route.points),
      distance: nearest.distance, closest: clonePoint(nearest.closest),
      conflicts: findings.filter(f => f.entityIds.includes(entityId) && f.entityIds.includes(route.id)).map(f => f.code),
    }];
  }).sort((a, b) => a.distance - b.distance).slice(0, 12);
}

function blockersFor(map: CompiledMap, world: World, entityId: string, bodies: readonly AuthoringBody[], position: Vec): readonly AuthoringBlocker[] {
  const seen = new Set<string>(), blockers: AuthoringBlocker[] = [];
  for (const summary of bodies) {
    const probe = new Body(summary.position.x, summary.position.y, Infinity, summary.width + 6, summary.height + 6);
    probe.angle = summary.angle;
    for (const prop of world.hash.query(probe)) {
      if (prop.sourceId === entityId) continue;
      const key = prop.sourceId ?? `runtime-prop-${prop.id}`;
      if (seen.has(key)) continue;
      const own = new Body(summary.position.x, summary.position.y, Infinity, summary.width, summary.height);
      own.angle = summary.angle;
      const penetration = contact(own, prop.body)?.depth ?? 0;
      // Only report props that collide with this body or sit inside the six-metre
      // authoring halo; distant road clutter stays out of the compact report.
      if (penetration <= 0 && dist(prop.body.position, summary.position) > Math.max(summary.width, summary.height) / 2 + 3) continue;
      seen.add(key);
      blockers.push({
        entityId: key, kind: prop.kind, label: prop.label,
        position: clonePoint(prop.body.position), width: prop.body.w, height: prop.body.h, angle: prop.body.angle,
        distance: dist(prop.body.position, position), penetration,
      });
    }
  }
  return blockers.sort((a, b) => b.penetration - a.penetration || a.distance - b.distance).slice(0, 24);
}

/** Inspect one stable entity ID against the shared compiled map. The report is a detached
 * view: it never hands out catalogue or map geometry that a caller could mutate. */
export function inspectAuthoring(
  document: MapDocument,
  entityId: string,
  catalogue: ObjectCatalogue,
  context: AuthoringContext = {},
): AuthoringReport {
  const map = context.map ?? compileMap(document, catalogue);
  const world = context.world ?? new World(map);
  const validation = context.validation ?? validateMap(document, map, world);
  const compiled = map.objects[entityId];
  const childIds = new Set(map.boundaryPlacements.filter(p=>p.ruleId===entityId).map(p=>p.id));
  const props = world.props.filter(prop => prop.sourceId === entityId || prop.sourceId && childIds.has(prop.sourceId));
  const cityBuilding = map.city.buildings.find(building => building.id === entityId);
  const descriptor = entities(document).find(entity => entity.id === entityId);
  const position = compiled?.position ?? props[0]?.body.position ?? entityPosition(document, entityId);
  if (!position && !descriptor) throw new Error(`Unknown entity ID: ${entityId}. Use --list to see stable IDs.`);

  let bodies: AuthoringBody[] = props.length
    ? props.map(bodySummary)
    : compiled
      ? [objectBody(compiled, null)]
      : [];
  if (!bodies.length && descriptor && 'position' in descriptor && ('model' in descriptor || descriptorType(descriptor))) {
    // Parking bays and traffic spawns are physical vehicles rather than catalogue
    // artwork; they still have a stable ID and a shared descriptor body.
    const physical = descriptor as Extract<AuthoredDescriptor, { position: Vec; angle: number }>;
    const body = descriptorBody(physical, catalogue);
    bodies = [{
      propId: null,
      kind: 'model' in physical ? 'vehicle' : catalogue[physical.type].kind,
      label: descriptorLabel(physical, entityId),
      position: clonePoint(body.position), angle: body.angle, width: body.w, height: body.h,
      cullingRadius: Math.max(body.w, body.h), features: [],
    }];
  }
  if (!bodies.length) throw new Error(`Entity ${entityId} has no compiled physical body`);

  const primary = bodies[0];
  const entityFindings = validation.findings.filter(finding => finding.entityIds.includes(entityId));
  const nearbyFindings = validation.findings.filter(finding =>
    !finding.entityIds.includes(entityId)
    && finding.position
    && dist(finding.position, primary.position) <= FINDING_RADIUS);
  const artwork = primary.artwork ?? null;
  const blocked = validation.errors > 0;
  const routeWork = document.trafficSpawns.reduce((sum, spawn) =>
    sum + spawn.path.reduce((length, point, index) => length + dist(point, index ? spawn.path[index - 1] : spawn.position), 0), 0);
  const budgets = { parking: 200, trafficSpawns: 60, objectPlacements: 500, routeLength: 10000 };
  const counts = {
    parking: document.parking.length, trafficSpawns: document.trafficSpawns.length,
    objectPlacements: document.objectPlacements.length, points: document.points.length, roads: document.roads.length,
  };
  return {
    version: 1,
    revision: map.revision,
    entity: {
      id: entityId,
      type: descriptorType(descriptor) ?? compiled?.type ?? cityBuilding?.type ?? null,
      kind: primary.kind,
      collection: collectionOf(document, entityId),
      label: primary.label || entityId,
      position: clonePoint(primary.position),
      bodies,
    },
    artwork,
    shadow: artwork ? { casts: artwork.castsShadow, silhouette: clonePoints(artwork.silhouette) } : null,
    lightBlocker: artwork?.occluder ? { silhouette: clonePoints(artwork.occluder) } : null,
    cullingRadius: Math.max(...bodies.map(body => body.cullingRadius)),
    features: primary.features,
    nearbyRoutes: routeList(map, primary.position, validation.findings, entityId),
    routeConflicts: validation.findings.filter(finding => finding.entityIds.includes(entityId)
      && ['road-blocked', 'traffic-route-blocked', 'walking-entrance-blocked', 'unreachable-spawn', 'unreachable-stop', 'spawn-blocked', 'spawn-overlap'].includes(finding.code)),
    blockers: blockersFor(map, world, entityId, bodies, primary.position),
    findings: entityFindings,
    nearbyFindings,
    validation,
    preview: {
      allowed: !blocked,
      reason: blocked ? `${validation.errors} map validation error${validation.errors === 1 ? '' : 's'} block gameplay preview; fix the named findings first.` : null,
    },
    map: {
      schemaVersion: 5,
      counts,
      budgets,
      withinBudgets: counts.parking <= budgets.parking
        && counts.trafficSpawns <= budgets.trafficSpawns && counts.objectPlacements <= budgets.objectPlacements && routeWork <= budgets.routeLength,
    },
  };
}

export type AuthoringList = Readonly<{
  version: 1;
  revision: string;
  types: readonly Readonly<{ id: string; kind: PropKind; width: number; height: number; image: string | null; variants: readonly string[]; artwork: boolean }>[];
  entities: readonly Readonly<{
    id: string; type: string | null; kind: AuthoringKind; collection: string | null;
    label: string; position: Vec; bodies: number;
  }>[];
}>;

/** List catalogue types and every stable placed entity. Generated city/villa/home props
 * are included through their authored `sourceId`, so `--entity` can target them too. */
export function listAuthoring(document: MapDocument, catalogue: ObjectCatalogue, context: AuthoringContext = {}): AuthoringList {
  const map = context.map ?? compileMap(document, catalogue);
  const world = context.world ?? new World(map);
  const byId = new Map<string, AuthoringList['entities'][number]>();
  for (const prop of world.props) {
    if (!prop.sourceId) continue;
    const previous = byId.get(prop.sourceId);
    if (previous) {
      byId.set(prop.sourceId, { ...previous, bodies: previous.bodies + 1 });
      continue;
    }
    const compiled = map.objects[prop.sourceId];
    const descriptor = entities(document).find(entity => entity.id === prop.sourceId);
    byId.set(prop.sourceId, {
      id: prop.sourceId,
      type: descriptorType(descriptor) ?? compiled?.type ?? prop.building?.type ?? null,
      kind: prop.kind,
      collection: collectionOf(document, prop.sourceId),
      label: prop.label || prop.sourceId,
      position: clonePoint(prop.body.position),
      bodies: 1,
    });
  }
  for (const rule of document.boundaryPlacements) {
    const children=new Set(map.boundaryPlacements.filter(p=>p.ruleId===rule.id).map(p=>p.id));
    const props=world.props.filter(p=>p.sourceId&&children.has(p.sourceId));
    if(props.length)byId.set(rule.id,{id:rule.id,type:rule.type,kind:props[0].kind,collection:'boundaryPlacements',label:rule.id,position:clonePoint(props[0].body.position),bodies:props.length});
  }
  for (const id of ['parking', 'trafficSpawns'] as const) for (const descriptor of document[id]) {
    if (byId.has(descriptor.id)) continue;
    const body = descriptorBody(descriptor, catalogue);
    byId.set(descriptor.id, {
      id: descriptor.id, type: null, kind: 'vehicle', collection: id,
      label: descriptor.id, position: clonePoint(body.position), bodies: 1,
    });
  }
  return {
    version: 1,
    revision: map.revision,
    types: Object.values(catalogue).map(definition => ({
      id: definition.id,
      kind: definition.kind,
      width: definition.width,
      height: definition.height,
      image: definition.artwork?.[0]?.image && definition.artwork[0].image === definition.id ? definition.artwork[0].image : null,
      variants: definition.artwork?.filter(template => template.image !== definition.id).map(template => template.image) ?? [],
      artwork: !!definition.artwork,
    })).sort((a, b) => a.id.localeCompare(b.id)),
    entities: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
}
