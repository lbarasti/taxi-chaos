import { vec, type Vec } from '../physics';
import type {
  ArtworkCatalogue, ArtworkOutline, ArtworkPresentation, ArtworkRecord, ArtworkSilhouette, ArtworkSource, ArtworkTemplate,
  AttachedFeature, BuildingCatalogue, BuildingDefinition, BuildingFallback, BuildingSign, CatalogueSources, CompiledBuilding, CompiledObject,
  GroundArtwork, NormalizedOutline, ObjectCatalogue, ObjectDefinition, ObjectPlacementRecord, ObjectRecord, PixelCrop,
  PlacementRecord, PropArtwork, ResolvedFeature,
} from './schema';

const CIRCLE_POINTS = 12;
const FALLBACKS: readonly BuildingFallback[] = ['shop', 'commercial', 'terraced', 'wards'];

/** Appearance uses stable identity, never the simulation's random stream or display labels. */
export function appearanceSeed(identity: string): number {
  let seed = 2166136261;
  for (let i = 0; i < identity.length; i++) seed = Math.imul(seed ^ identity.charCodeAt(i), 16777619);
  return seed >>> 0;
}

/** Deep-freeze compiled catalogue geometry. Templates and their arrays are shared by
 * every placement and must never be mutated by a renderer or preview. */
function frozen<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}

/** Keep a legacy absolute image, its sun silhouette and its light blocker aligned. */
export function scaleArtwork(art: PropArtwork, sx: number, sy: number): PropArtwork {
  const point = (p: Vec) => vec(p.x * sx, p.y * sy), b = art.bounds;
  return {
    ...art,
    bounds: { x: b.x * sx, y: b.y * sy, width: b.width * sx, height: b.height * sy },
    silhouette: art.silhouette.map(point),
    occluder: art.occluder?.map(point),
  };
}

/** An authored crop wins over the measured one; both stay inside the source. The
 * returned rectangle is a detached copy, never a reference to authored content. */
function resolveCrop(crop: PixelCrop | undefined, source?: ArtworkSource, id = 'artwork'): PixelCrop | undefined {
  if (!crop) return undefined;
  const positive = [crop.x, crop.y, crop.width, crop.height].every(n => Number.isFinite(n)) && crop.x >= 0 && crop.y >= 0 && crop.width > 0 && crop.height > 0;
  const inside = !source || crop.x + crop.width <= source.width && crop.y + crop.height <= source.height;
  const where = source ? ` inside its ${source.width}×${source.height} source` : ' with a positive size';
  if (!positive || !inside) throw new Error(`Artwork ${id}: crop ${JSON.stringify(crop)} must stay${where}`);
  return { x: crop.x, y: crop.y, width: crop.width, height: crop.height };
}

/** The authored crop for an object: its own override, otherwise the measured padding. */
function sourceCrop(record: Readonly<{ id: string; crop?: PixelCrop }>, source?: ArtworkSource): PixelCrop | undefined {
  return resolveCrop(record.crop ?? source?.crop, source, record.id);
}

function isWholeSource(crop: PixelCrop | undefined, source?: ArtworkSource): boolean {
  return !!source && !!crop && crop.x === 0 && crop.y === 0 && crop.width === source.width && crop.height === source.height;
}

/** Default geometry is centred; a width-only size keeps the cropped source aspect. */
function resolveMetres(record: ArtworkRecord, crop?: PixelCrop): { width: number; height: number } {
  if (record.metres === undefined) throw new Error(`Artwork ${record.id}: structure artwork needs a metre size`);
  const size = typeof record.metres === 'number' ? { width: record.metres, height: undefined } : record.metres;
  if (!Number.isFinite(size.width) || size.width <= 0) throw new Error(`Artwork ${record.id}: invalid metre width`);
  const aspect = crop ? crop.height / crop.width : undefined;
  const height = size.height ?? (aspect === undefined ? undefined : size.width * aspect);
  if (height === undefined) throw new Error(`Artwork ${record.id}: declare an explicit height, or provide the measured source so a width-only size keeps its aspect`);
  if (!Number.isFinite(height) || height <= 0) throw new Error(`Artwork ${record.id}: invalid metre height`);
  return { width: size.width, height };
}

type CircleSilhouette = Readonly<{ shape: 'circle'; radius: number; points?: number }>;
const isCircle = (spec: ArtworkSilhouette): spec is CircleSilhouette => typeof spec === 'object' && !Array.isArray(spec);

/** Validate and materialize an outline. Explicit points are copied by `resolveSilhouette`
 * and every caller receives fresh vectors, so shared templates stay immutable. */
function resolveSilhouette(spec: ArtworkSilhouette | undefined, width: number, height: number): readonly Vec[] {
  const rectangle = () => [vec(-width / 2, -height / 2), vec(width / 2, -height / 2), vec(width / 2, height / 2), vec(-width / 2, height / 2)];
  if (spec === undefined || spec === 'bounds') return rectangle();
  if (isCircle(spec)) {
    const points = spec.points ?? CIRCLE_POINTS;
    if (!Number.isInteger(points) || points < 3 || !Number.isFinite(spec.radius) || spec.radius <= 0) throw new Error('invalid circle silhouette');
    const step = Math.PI * 2 / points;
    return Array.from({ length: points }, (_, i) => vec(Math.cos(i * step) * spec.radius, Math.sin(i * step) * spec.radius));
  }
  if (!spec.length) throw new Error('silhouette needs at least one point');
  if (!spec.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))) throw new Error('silhouette points must be finite');
  return spec.map(p => vec(p.x, p.y));
}

const BOUNDS_OUTLINE: NormalizedOutline = Object.freeze({
  shape: 'path' as const,
  points: Object.freeze([vec(-0.5, -0.5), vec(0.5, -0.5), vec(0.5, 0.5), vec(-0.5, 0.5)] as Vec[]),
});

function outlinePath(points: readonly Vec[], id: string): NormalizedOutline {
  if (!Array.isArray(points) || !points.length) throw new Error(`Object ${id}: outline needs at least one point`);
  if (!points.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))) throw new Error(`Object ${id}: outline points must be finite`);
  return { shape: 'path', points: points.map(p => vec(p.x, p.y)) };
}

/** Validate and materialize an authored normalized outline, eagerly rejecting bad
 * arrays before any map is built. Returned points are detached copies. */
function normalizeOutline(outline: ArtworkOutline | undefined, id: string): NormalizedOutline {
  if (outline === undefined || outline === 'bounds') return BOUNDS_OUTLINE;
  if (Array.isArray(outline)) return outlinePath(outline, id);
  const shape = outline as { shape?: string; points?: unknown; radius?: number };
  if (shape.shape === 'circle') {
    const points = shape.points ?? CIRCLE_POINTS;
    if (!Number.isInteger(points) || (points as number) < 3 || !Number.isFinite(shape.radius) || (shape.radius ?? 0) <= 0) throw new Error(`Object ${id}: invalid artwork outline`);
    return { shape: 'circle', radius: shape.radius!, points: points as number };
  }
  return outlinePath(shape.points as readonly Vec[], id);
}

/** Reuse a legacy record's absolute silhouette as normalized fractions of its own
 * authored art extent, so a resized type keeps the same relative shape. */
function normalizeLegacySilhouette(spec: ArtworkSilhouette | undefined, width: number, height: number): NormalizedOutline {
  if (spec === undefined || spec === 'bounds') return BOUNDS_OUTLINE;
  if (isCircle(spec)) return { shape: 'circle', radius: spec.radius / (Math.min(width, height) / 2), points: spec.points ?? CIRCLE_POINTS };
  return { shape: 'path', points: spec.map(p => vec(p.x / width, p.y / height)) };
}

/** Resolve a normalized outline against one concrete art extent. Fresh vectors are
 * allocated every call, so instances never share mutable geometry. */
function resolveOutline(spec: NormalizedOutline, width: number, height: number): readonly Vec[] {
  if (spec.shape === 'circle') {
    const radius = spec.radius * Math.min(width, height) / 2, step = Math.PI * 2 / spec.points;
    return Array.from({ length: spec.points }, (_, i) => vec(Math.cos(i * step) * radius, Math.sin(i * step) * radius));
  }
  return spec.points.map(p => vec(p.x * width, p.y * height));
}

/** Normalize one legacy authored image record into centred, metre-space drawing geometry. */
export function compileStructureArtwork(record: ArtworkRecord, source?: ArtworkSource): PropArtwork {
  if (record.layer !== 'structure') throw new Error(`Artwork ${record.id}: expected structure artwork`);
  const crop = sourceCrop(record, source);
  const { width, height } = resolveMetres(record, crop);
  const silhouette = resolveSilhouette(record.silhouette, width, height);
  return {
    image: record.id,
    layer: 'structure',
    bounds: { x: -width / 2, y: -height / 2, width, height },
    ...(crop && !isWholeSource(crop, source) ? { source: crop } : {}),
    silhouette,
    ...(record.castsShadow === false ? { castsShadow: false } : {}),
    ...(record.occluder ? { occluder: silhouette } : {}),
  };
}

/** Compile every legacy image record. IDs are stable and must be unique. */
export function compileArtworkCatalogue(records: readonly ArtworkRecord[], sources: CatalogueSources = {}): ArtworkCatalogue {
  const structures: Record<string, PropArtwork> = {}, ground: Record<string, GroundArtwork> = {};
  for (const record of records) {
    if (record.id in structures || record.id in ground) throw new Error(`Artwork ${record.id}: duplicate ID`);
    if (record.layer === 'ground') {
      if (!record.tileMetres || !(record.tileMetres > 0)) throw new Error(`Artwork ${record.id}: ground tiles need a positive tile size`);
      ground[record.id] = { image: record.id, layer: 'ground', tileMetres: record.tileMetres };
    } else structures[record.id] = compileStructureArtwork(record, sources[record.id]);
  }
  return frozen({ structures, ground });
}

function validatePresentation(presentation: ArtworkPresentation, id: string): void {
  if (presentation.fit !== undefined && presentation.fit !== 'contain' && presentation.fit !== 'stretch') throw new Error(`Object ${id}: invalid artwork fit`);
  for (const [axis, value] of [['width', presentation.width], ['height', presentation.height]] as const) {
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) throw new Error(`Object ${id}: invalid artwork ${axis} factor`);
  }
  for (const value of [presentation.offset?.x, presentation.offset?.y]) {
    if (value !== undefined && !Number.isFinite(value)) throw new Error(`Object ${id}: invalid artwork offset`);
  }
  if (presentation.outline !== undefined) normalizeOutline(presentation.outline, id);
}

/** Build an immutable normalized template from a measured source. Templates retain no
 * absolute footprint: `deriveArtwork` resolves them against each instance. */
function artworkTemplate(id: string, image: string, crop: PixelCrop | undefined, source: ArtworkSource | undefined, presentation: ArtworkPresentation, outline: NormalizedOutline): ArtworkTemplate {
  validatePresentation(presentation, id);
  const aspect = crop ? crop.width / crop.height : undefined;
  const fit = presentation.fit ?? 'contain';
  if (fit === 'contain' && !aspect) throw new Error(`Object ${id}: a centred aspect fit needs a measured source or explicit artwork width and height`);
  return frozen({
    image,
    ...(crop && !isWholeSource(crop, source) ? { source: crop } : {}),
    aspect: aspect ?? 1,
    fit,
    ...(presentation.width === undefined ? {} : { width: presentation.width }),
    ...(presentation.height === undefined ? {} : { height: presentation.height }),
    offset: { x: presentation.offset?.x ?? 0, y: presentation.offset?.y ?? 0 },
    outline,
    occluder: presentation.occluder === true,
    castsShadow: presentation.castsShadow !== false,
  });
}

function validateBuilding(record: ObjectRecord): void {
  if (!Number.isFinite(record.width) || !Number.isFinite(record.height) || record.width <= 0 || record.height <= 0) throw new Error(`Building type ${record.id}: invalid footprint or storeys`);
  if (record.storeys === undefined || !Number.isFinite(record.storeys) || record.storeys <= 0) throw new Error(`Building type ${record.id}: invalid footprint or storeys`);
  if (record.fallback === undefined || !FALLBACKS.includes(record.fallback)) throw new Error(`Building type ${record.id}: invalid fallback`);
  const sign = record.sign;
  if (!sign || ![sign.width, sign.inset, sign.size].every(n => Number.isFinite(n) && n >= 0) || !sign.color) throw new Error(`Building type ${record.id}: invalid sign`);
  if (sign.offset !== undefined && (!Number.isFinite(sign.offset.x) || !Number.isFinite(sign.offset.y) || Math.abs(sign.offset.x) > 0.5 || Math.abs(sign.offset.y) > 0.5)) throw new Error(`Building type ${record.id}: invalid sign offset`);
}

/** Compile every authored object type. A direct `image` is measured through the shared
 * inline manifest; `variants` resolve legacy artwork by stable ID. */
export function compileObjectCatalogue(
  records: readonly ObjectRecord[],
  sources: CatalogueSources = {},
  legacy: readonly ArtworkRecord[] = [],
): Readonly<Record<string, ObjectDefinition>> {
  const legacyById = new Map(legacy.map(record => [record.id, record]));
  const definitions: Record<string, ObjectDefinition> = {};
  for (const record of records) {
    if (!record.id || record.id in definitions) throw new Error(`Object ${record.id}: duplicate ID`);
    if (!Number.isFinite(record.width) || !Number.isFinite(record.height) || record.width <= 0 || record.height <= 0) throw new Error(`Object ${record.id}: invalid footprint`);
    if (record.image !== undefined && record.variants !== undefined) throw new Error(`Object ${record.id}: choose a direct image or shared variants, not both`);
    if (record.kind === 'building') validateBuilding(record);
    else if (record.storeys !== undefined || record.fallback !== undefined || record.sign !== undefined) throw new Error(`Object ${record.id}: only buildings declare storeys, fallback or sign`);
    if (record.artworkScale !== undefined && (!Number.isFinite(record.artworkScale) || record.artworkScale <= 0)) throw new Error(`Object ${record.id}: invalid artwork scale`);

    const presentation = record.artwork ?? {};
    validatePresentation(presentation, record.id);
    const templates: ArtworkTemplate[] = [];
    if (record.image !== undefined) {
      if (!record.image) throw new Error(`Object ${record.id}: empty image path`);
      const source = sources[record.id];
      templates.push(artworkTemplate(record.id, record.id, sourceCrop(record, source), source, presentation, normalizeOutline(presentation.outline, record.id)));
    } else if (record.variants !== undefined) {
      if (!record.variants.length) throw new Error(`Object ${record.id}: variants need at least one artwork ID`);
      for (const variantId of record.variants) {
        const variant = legacyById.get(variantId);
        if (!variant) throw new Error(`Object ${record.id}: unknown artwork ${variantId}`);
        if (variant.layer !== 'structure') throw new Error(`Object ${record.id}: artwork ${variantId} is not structure artwork`);
        const source = sources[variantId], variantCrop = sourceCrop(variant, source);
        const variantMetres = resolveMetres(variant, variantCrop);
        // Reuse a variant's authored silhouette/shadow defaults unless the type overrides them.
        const outline = presentation.outline !== undefined
          ? normalizeOutline(presentation.outline, record.id)
          : normalizeLegacySilhouette(variant.silhouette, variantMetres.width, variantMetres.height);
        templates.push(artworkTemplate(record.id, variantId, variantCrop, source, {
          ...presentation,
          occluder: presentation.occluder ?? variant.occluder,
          castsShadow: presentation.castsShadow ?? variant.castsShadow,
        }, outline));
      }
    } else if (presentation.fit === 'stretch' || presentation.width !== undefined || presentation.height !== undefined) {
      throw new Error(`Object ${record.id}: artwork presentation needs an image or variants`);
    }

    definitions[record.id] = frozen({
      id: record.id,
      kind: record.kind,
      width: record.width,
      height: record.height,
      ...(record.storeys === undefined ? {} : { storeys: record.storeys }),
      ...(templates.length ? { artwork: templates } : {}),
      ...(record.kind === 'building' ? { presentation: {
        fallback: record.fallback!, sign: record.sign!,
        ...(record.frontage === undefined ? {} : { frontage: record.frontage }),
        ...(record.apron === undefined ? {} : { apron: record.apron }),
      } } : {}),
      ...(record.artworkScale === undefined ? {} : { artworkScale: record.artworkScale }),
      ...(record.features === undefined ? {} : { features: record.features }),
    });
  }
  return definitions;
}

/** Resolve building definitions from the same object records and templates. */
export function compileBuildingCatalogue(
  records: readonly ObjectRecord[],
  sources: CatalogueSources = {},
  legacy: readonly ArtworkRecord[] = [],
): Readonly<Record<string, BuildingDefinition>> {
  const objects = compileObjectCatalogue(records, sources, legacy);
  const buildings: Record<string, BuildingDefinition> = {};
  for (const [id, definition] of Object.entries(objects)) {
    if (definition.kind === 'building') buildings[id] = definition as BuildingDefinition;
  }
  return frozen(buildings);
}

/** Resolve immutable normalized artwork against one concrete footprint. The returned
 * bounds, source crop and outline are freshly allocated, so callers and map freezing
 * can never mutate the shared template or another instance. */
export function deriveArtwork(template: ArtworkTemplate, width: number, height: number, scale = 1): PropArtwork {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error(`Artwork ${template.image}: invalid footprint`);
  if (!Number.isFinite(scale) || scale <= 0) throw new Error(`Artwork ${template.image}: invalid artwork scale`);
  let artWidth: number, artHeight: number;
  if (template.fit === 'stretch') {
    artWidth = width; artHeight = height;
  } else {
    const footprintAspect = width / height;
    if (template.aspect >= footprintAspect) { artWidth = width; artHeight = width / template.aspect; }
    else { artHeight = height; artWidth = height * template.aspect; }
  }
  if (template.width !== undefined) artWidth = width * template.width;
  if (template.height !== undefined) artHeight = height * template.height;
  artWidth *= scale; artHeight *= scale;
  if (!Number.isFinite(artWidth) || !Number.isFinite(artHeight) || artWidth <= 0 || artHeight <= 0) throw new Error(`Artwork ${template.image}: invalid resolved size`);
  const centerX = template.offset.x * width, centerY = template.offset.y * height;
  const bounds = { x: centerX - artWidth / 2, y: centerY - artHeight / 2, width: artWidth, height: artHeight };
  const silhouette = resolveOutline(template.outline, artWidth, artHeight);
  return {
    image: template.image,
    layer: 'structure',
    bounds,
    ...(template.source ? { source: { ...template.source } } : {}),
    silhouette,
    ...(template.castsShadow === false ? { castsShadow: false } : {}),
    ...(template.occluder ? { occluder: silhouette } : {}),
  };
}

function validSign(sign: Partial<BuildingSign> | undefined): void {
  if (!sign) return;
  for (const value of [sign.width, sign.inset, sign.size]) {
    if (value !== undefined && !Number.isFinite(value)) throw new Error('invalid sign geometry');
  }
  if (sign.offset !== undefined && (!Number.isFinite(sign.offset.x) || !Number.isFinite(sign.offset.y) || Math.abs(sign.offset.x) > 0.5 || Math.abs(sign.offset.y) > 0.5)) throw new Error('invalid sign offset');
}

/** Resolve a placement's local attached features against one concrete footprint. IDs stay
 * stable, offsets stay finite and unique; bounds are reported by `validateMap`. */
export function resolveFeatures(features: readonly AttachedFeature[] | undefined, id: string, width: number, height: number, position: Vec, angle: number): readonly ResolvedFeature[] {
  if (features === undefined) return [];
  if (!Array.isArray(features) || features.length > 8) throw new Error(`Object ${id}: expected at most 8 attached features`);
  const seen = new Set<string>();
  return features.map(feature => {
    if (!feature || typeof feature.id !== 'string' || feature.id.length > 60 || !/^[a-z][a-z0-9-]*$/.test(feature.id)) throw new Error(`Object ${id}: invalid attached feature ID`);
    if (seen.has(feature.id)) throw new Error(`Object ${id}: duplicate attached feature ${feature.id}`);
    seen.add(feature.id);
    if (feature.role !== 'service' && feature.role !== 'sign') throw new Error(`Object ${id}: feature ${feature.id} has an unknown role`);
    if (!feature.offset || !Number.isFinite(feature.offset.x) || !Number.isFinite(feature.offset.y)) throw new Error(`Object ${id}: feature ${feature.id} needs a finite offset`);
    if (feature.label !== undefined && (typeof feature.label !== 'string' || feature.label.length > 160)) throw new Error(`Object ${id}: feature ${feature.id} label must be at most 160 characters`);
    const local = vec(feature.offset.x * width, feature.offset.y * height), cos = Math.cos(angle), sin = Math.sin(angle);
    return {
      id: feature.id, role: feature.role, offset: { x: feature.offset.x, y: feature.offset.y },
      position: vec(position.x + local.x * cos - local.y * sin, position.y + local.x * sin + local.y * cos),
      ...(feature.label === undefined ? {} : { label: feature.label }),
    };
  });
}

/** Generic compiled silhouette for a prop without artwork: its collision rectangle. */
function footprintSilhouette(width: number, height: number): readonly Vec[] {
  return [vec(-width / 2, -height / 2), vec(width / 2, -height / 2), vec(width / 2, height / 2), vec(-width / 2, height / 2)];
}

/** Compile one placement of any catalogue object type (building or prop). The
 * resolved footprint drives collision; artwork, shadow silhouette, light blocker and
 * culling radius all follow the same resolved size. Unknown references fail by ID. */
export function compileObjectPlacement(placement: ObjectPlacementRecord, catalogue: ObjectCatalogue): CompiledObject {
  const definition = catalogue[placement.type];
  if (!definition) throw new Error(`Object ${placement.id}: unknown type ${placement.type}`);
  const width = placement.width ?? definition.width, height = placement.height ?? definition.height;
  if ([width, height].some(n => !Number.isFinite(n) || n <= 0)) throw new Error(`Object ${placement.id}: invalid footprint`);
  if (placement.artworkScale !== undefined && (!Number.isFinite(placement.artworkScale) || placement.artworkScale <= 0)) throw new Error(`Object ${placement.id}: invalid artwork scale`);
  if (!placement.position || !Number.isFinite(placement.position.x) || !Number.isFinite(placement.position.y)) throw new Error(`Object ${placement.id}: invalid position`);
  const angle = placement.angle ?? 0;
  if (!Number.isFinite(angle)) throw new Error(`Object ${placement.id}: invalid angle`);
  const features = resolveFeatures(placement.features ?? definition.features, placement.id, width, height, placement.position, angle);
  const selected = definition.artwork?.[appearanceSeed(placement.id) % definition.artwork.length];
  const artwork = selected ? deriveArtwork(selected, width, height, placement.artworkScale ?? definition.artworkScale ?? 1) : undefined;
  return {
    id: placement.id, type: placement.type, kind: definition.kind,
    position: { ...placement.position }, angle, width, height,
    ...(artwork ? { artwork } : {}),
    ...(definition.storeys === undefined ? {} : { storeys: definition.storeys }),
    ...(definition.presentation === undefined ? {} : { presentation: definition.presentation }),
    silhouette: artwork?.silhouette ?? footprintSilhouette(width, height),
    features,
  };
}

/** Compile one building placement. Resizing its footprint updates collision and
 * artwork together; `artworkScale` changes only the drawn extent. A non-building
 * type reports a clear error instead of failing later on missing building fields. */
export function compilePlacement(placement: PlacementRecord<string>, catalogue: ObjectCatalogue): CompiledBuilding {
  const compiledDefinition = catalogue[placement.type];
  if (!compiledDefinition) throw new Error(`Building ${placement.id}: unknown type ${placement.type}`);
  if (compiledDefinition.kind !== 'building') throw new Error(`Building ${placement.id}: type ${placement.type} is ${compiledDefinition.kind} artwork; compile props with compileObjectPlacement`);
  const definition = compiledDefinition as BuildingDefinition;
  validSign(placement.sign);
  const compiled = compileObjectPlacement(placement, catalogue);
  const { width, height, features } = compiled;
  const { sign, replaceBlock, width: _width, height: _height, storeys: _storeys, artworkScale: _scale, features: _features, ...instance } = structuredClone(placement);
  const entrance = features.find(feature => feature.role === 'service')?.position;
  return { ...instance, width, height, storeys: placement.storeys ?? definition.storeys, artwork: compiled.artwork,
    presentation: { ...definition.presentation, sign: { ...definition.presentation.sign, ...sign } },
    silhouette: [vec(-width / 2 - 0.25, -height / 2 - 0.6), vec(width / 2, -height / 2 - 0.6), vec(width / 2, height / 2), vec(-width / 2 - 0.25, height / 2)],
    features,
    ...(entrance === undefined ? {} : { recoveryEntrance: { ...entrance } }),
  };
}
