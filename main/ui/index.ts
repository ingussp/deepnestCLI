/**
 * Main UI Entry Point
 * Orchestrates initialization of all UI modules for DeepNest
 * This file replaces the monolithic page.js with modular TypeScript components
 */

// Type imports
import type {
  UIConfig,
  ConfigObject,
  DeepNestConfig,
  DeepNestInstance,
  SvgParserInstance,
  RactiveInstance,
  NestViewData,
  NestingProgress,
  PartsViewData,
} from "./types/index.js";
import { IPC_CHANNELS } from "./types/index.js";

// Service imports
import { ConfigService, createConfigService, BOOLEAN_CONFIG_KEYS } from "./services/config.service.js";
import { PresetService, createPresetService } from "./services/preset.service.js";
import { ImportService, createImportService } from "./services/import.service.js";
import { ExportService, createExportService } from "./services/export.service.js";
import { NestingService, createNestingService } from "./services/nesting.service.js";

// Component imports
import { NavigationService, createNavigationService } from "./components/navigation.js";
import { PartsViewService, createPartsViewService } from "./components/parts-view.js";
import { NestViewService, createNestViewService } from "./components/nest-view.js";
import { SheetDialogService, createSheetDialogService } from "./components/sheet-dialog.js";

// Utility imports
import { message } from "./utils/ui-helpers.js";
import { getElement, getElements } from "./utils/dom-utils.js";

/**
 * IPC renderer interface for Electron communication
 */
interface IpcRenderer {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  send(channel: string, ...args: unknown[]): void;
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
}

/**
 * Helper type for casting getSync() results
 */
type ConfigResult = UIConfig;

/**
 * Window is already augmented in index.d.ts
 * We use type assertion when setting globals that have different types
 */
declare const Ractive: { DEBUG: boolean };
declare const interact: (selector: string) => {
  resizable(options: {
    preserveAspectRatio: boolean;
    edges: { left: boolean; right: boolean; bottom: boolean; top: boolean };
  }): {
    on(event: string, handler: (event: { rect: { width: number } }) => void): void;
  };
};

/**
 * Node.js module interfaces for Electron context
 */
declare function require(module: string): unknown;

/**
 * Global DeepNest instance (set by deepnest.js)
 * Access via getDeepNest() helper to get proper typing
 */
declare let DeepNest: DeepNestInstance;

/**
 * Global SvgParser instance
 */
declare let SvgParser: SvgParserInstance;

/**
 * Get the DeepNest global with proper typing
 */
function getDeepNest(): DeepNestInstance {
  return DeepNest;
}

/**
 * Get the SvgParser global with proper typing
 */
function getSvgParser(): SvgParserInstance {
  return SvgParser;
}

/**
 * Execute a callback when the DOM is ready
 * @param fn - The callback function to execute
 */
function ready(fn: () => void | Promise<void>): void {
  if (document.readyState !== "loading") {
    void fn();
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      void fn();
    });
  }
}

/**
 * Module instances for cross-module communication
 */
let configService: ConfigService;
let presetService: PresetService;
let importService: ImportService;
let exportService: ExportService;
let nestingService: NestingService;
let navigationService: NavigationService;
let partsViewService: PartsViewService;
let nestViewService: NestViewService;
let sheetDialogService: SheetDialogService;

/**
 * CLI job input types
 */
interface CliPartInput {
  id?: string;
  path?: string;
  points?: CliPointInput[];
  quantity?: number;
  rotations?: number;
  _ip_nesting?: Record<string, unknown>;
}

interface CliPointInput {
  x: number;
  y: number;
}

interface CliRectSheetInput {
  type?: "rect";
  width: number;
  height: number;
  quantity?: number;
}

interface CliPolygonSheetInput {
  type: "polygon";
  outer: CliPointInput[];
  holes?: CliPointInput[][];
  quantity?: number;
}

type CliSheetInput = CliRectSheetInput | CliPolygonSheetInput;

interface CliSettingsInput {
  // Nesting configuration
  units?: "inch" | "mm";
  spacing?: number;
  partToSheet?: number;
  partToHole?: number;
  curveTolerance?: number;
  placementType?: "gravity" | "box" | "convexhull";
  simplify?: boolean;
  threads?: number;

  // Import / Export
  useSvgPreProcessor?: boolean;
  scale?: number;
  endpointTolerance?: number;
  dxfImportScale?: number;
  dxfExportScale?: number;
  exportWithSheetBoundboarders?: boolean;
  exportWithSheetsSpace?: boolean;
  exportWithSheetsSpaceValue?: number;

  // Laser options
  mergeLines?: boolean;
  timeRatio?: number;

  // Meta-heuristic fine tuning
  populationSize?: number;
  mutationRate?: number;

  // Other settings
  useQuantityFromFileName?: boolean;
}

interface CliOutputInput {
  resultJson?: string;
}

interface CliJobInput {
  settings?: CliSettingsInput;
  sheets?: CliSheetInput[];
  parts?: CliPartInput[];
  autoStart?: boolean;
  output?: CliOutputInput;
}

interface CliInputEnvelope {
  path: string | null;
  data: unknown;
  error: string | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isCliJobInput(value: unknown): value is CliJobInput {
  if (!isObject(value)) {
    return false;
  }

  const maybeParts = value.parts;
  const maybeSheets = value.sheets;
  const maybeSettings = value.settings;
  const maybeAutoStart = value.autoStart;
  const maybeOutput = value.output;

const validParts =
  maybeParts === undefined ||
  (Array.isArray(maybeParts) && maybeParts.every(isCliPartInput));

  const validSheets =
	  maybeSheets === undefined ||
	  (Array.isArray(maybeSheets) && maybeSheets.every(isCliSheetInput));

  const validSettings =
    maybeSettings === undefined || isObject(maybeSettings);

  const validAutoStart =
    maybeAutoStart === undefined || typeof maybeAutoStart === "boolean";

  const validOutput =
    maybeOutput === undefined ||
    (isObject(maybeOutput) &&
      (maybeOutput.resultJson === undefined ||
        typeof maybeOutput.resultJson === "string"));

  return validParts && validSheets && validSettings && validAutoStart && validOutput;
}

function isCliPartInput(value: unknown): value is CliPartInput {
  if (!isObject(value)) {
    return false;
  }

  const hasPath = typeof value.path === "string" && value.path.trim().length > 0;
  const hasPoints = isPointArray(value.points);

  if (!hasPath && !hasPoints) {
    return false; // vajag vismaz vienu no abiem
  }

  if (
    value.quantity !== undefined &&
    !(typeof value.quantity === "number" && Number.isInteger(value.quantity) && value.quantity > 0)
  ) {
    return false;
  }

  if (
    value.rotations !== undefined &&
    !(typeof value.rotations === "number" &&
      Number.isInteger(value.rotations) &&
      value.rotations > 0 &&
      value.rotations <= 32)
  ) {
    return false;
  }

  return true;
}

function isCliPointInput(value: unknown): value is CliPointInput {
  return (
    isObject(value) &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y)
  );
}

function isPointArray(value: unknown): value is CliPointInput[] {
  return Array.isArray(value) && value.length >= 3 && value.every(isCliPointInput);
}

function isHoleArray(value: unknown): value is CliPointInput[][] {
  return Array.isArray(value) && value.every(isPointArray);
}

function isCliRectSheetInput(value: unknown): value is CliRectSheetInput {
  return (
    isObject(value) &&
    (value.type === undefined || value.type === "rect") &&
    typeof value.width === "number" &&
    Number.isFinite(value.width) &&
    value.width > 0 &&
    typeof value.height === "number" &&
    Number.isFinite(value.height) &&
    value.height > 0 &&
    (value.quantity === undefined ||
      (typeof value.quantity === "number" &&
        Number.isInteger(value.quantity) &&
        value.quantity > 0))
  );
}

function isCliPolygonSheetInput(value: unknown): value is CliPolygonSheetInput {
  return (
    isObject(value) &&
    value.type === "polygon" &&
    isPointArray(value.outer) &&
    (value.holes === undefined || isHoleArray(value.holes)) &&
    (value.quantity === undefined ||
      (typeof value.quantity === "number" &&
        Number.isInteger(value.quantity) &&
        value.quantity > 0))
  );
}

function isCliSheetInput(value: unknown): value is CliSheetInput {
  return isCliRectSheetInput(value) || isCliPolygonSheetInput(value);
}

async function getCliInput(): Promise<CliInputEnvelope | null> {
  console.log("[cli-input][renderer] getCliInput() called");

  if (!ipcRenderer) {
    console.warn("[cli-input][renderer] ipcRenderer is not available");
    return null;
  }

  try {
    const result = (await ipcRenderer.invoke("get-cli-input")) as CliInputEnvelope | null;
    console.log("[cli-input][renderer] getCliInput() result:", result);
    return result;
  } catch (error) {
    console.error("[cli-input][renderer] Failed to fetch CLI input:", error);
    return null;
  }
}

function normalizeCliSettingsForInternalConfig(
  settings: CliSettingsInput
): Partial<CliSettingsInput> {
  const normalized: Partial<CliSettingsInput> = { ...settings };

  const units = settings.units ?? configService.getSync("units") ?? "inch";

  // GUI shows scale as units per current unit.
  // Internal config stores scale as units per inch.
  if (typeof settings.scale === "number") {
    normalized.scale = units === "mm" ? settings.scale * 25.4 : settings.scale;
  }

  // GUI shows these values in the currently selected units.
  // Internal config stores them in SVG units using current conversion.
  const scaleForConversion =
    typeof normalized.scale === "number"
      ? normalized.scale
      : Number(configService.getSync("scale")) || 72;

  const conversion = units === "mm" ? scaleForConversion / 25.4 : scaleForConversion;

  const convertDistanceSetting = (
    key:
      | "spacing"
	  | "partToSheet"
	  | "partToHole"
      | "curveTolerance"
      | "endpointTolerance"
      | "exportWithSheetsSpaceValue"
  ): void => {
    const value = settings[key];
    if (typeof value === "number") {
      normalized[key] = value * conversion;
    }
  };

  convertDistanceSetting("spacing");
  convertDistanceSetting("partToSheet");
  convertDistanceSetting("partToHole");
  convertDistanceSetting("curveTolerance");
  convertDistanceSetting("endpointTolerance");
  convertDistanceSetting("exportWithSheetsSpaceValue");

  return normalized;
}

function applyCliSettings(settings: CliSettingsInput): void {
  console.log("[cli-input][renderer] applyCliSettings() start", settings);

  if (!configService) {
    console.warn("[cli-input][renderer] configService is missing");
    return;
  }

  const normalizedSettings = normalizeCliSettingsForInternalConfig(settings);

  const allowedKeys: Array<keyof CliSettingsInput> = [
    // Nesting configuration
    "units",
    "spacing",
	"partToSheet",
	"partToHole",
    "curveTolerance",
    "placementType",
    "simplify",
    "threads",

    // Import / Export
    "useSvgPreProcessor",
    "scale",
    "endpointTolerance",
    "dxfImportScale",
    "dxfExportScale",
    "exportWithSheetBoundboarders",
    "exportWithSheetsSpace",
    "exportWithSheetsSpaceValue",

    // Laser options
    "mergeLines",
    "timeRatio",

    // Meta-heuristic fine tuning
    "populationSize",
    "mutationRate",

    // Other settings
    "useQuantityFromFileName",
  ];

  for (const key of allowedKeys) {
    const value = normalizedSettings[key];
    if (value !== undefined) {
      (
        configService as unknown as {
          setSync: (key: string, value: unknown) => void;
        }
      ).setSync(key, value);
    }
  }

  const deepNest = getDeepNest();
  if (deepNest && typeof deepNest.config === "function") {
    deepNest.config(configService.getSync() as Partial<DeepNestConfig>);
  }

  const cfgValues = configService.getSync() as unknown as ConfigResult;
  updateForm(cfgValues);

  console.log(
    "[cli-input][renderer] applyCliSettings() done",
    normalizedSettings
  );
}

function getCliSheetConversionFactor(): number {
  const units = configService.getSync("units");
  const scale = Number(configService.getSync("scale")) || 72;

  if (units === "mm") {
    return scale / 25.4;
  }

  return scale;
}

function reversePoints(points: CliPointInput[]): CliPointInput[] {
  return [...points].reverse();
}

function polygonSignedArea(points: CliPointInput[]): number {
  let area = 0;

  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    area += p1.x * p2.y - p2.x * p1.y;
  }

  return area / 2;
}

function ensureClockwise(points: CliPointInput[]): CliPointInput[] {
  return polygonSignedArea(points) < 0 ? [...points] : reversePoints(points);
}

function ensureCounterClockwise(points: CliPointInput[]): CliPointInput[] {
  return polygonSignedArea(points) > 0 ? [...points] : reversePoints(points);
}

function polygonPointsToPath(points: CliPointInput[], conversion: number): string {
  if (!points.length) {
    return "";
  }

  const first = points[0];
  let d = `M ${first.x * conversion} ${first.y * conversion}`;

  for (let i = 1; i < points.length; i++) {
    const point = points[i];
    d += ` L ${point.x * conversion} ${point.y * conversion}`;
  }

  d += " Z";
  return d;
}

function createPolygonPartSvg(points: CliPointInput[]): string {
  const conversion = getCliSheetConversionFactor();
  const normalizedOuter = ensureClockwise(points);
  const d = polygonPointsToPath(normalizedOuter, conversion);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg">`,
    `<path d="${d}" fill="#000000" stroke="#000000" />`,
    `</svg>`,
  ].join("");
}

function addCliPolygonPart(points: CliPointInput[]): boolean {
  const deepNest = getDeepNest();

  if (!deepNest || !Array.isArray(deepNest.parts)) {
    console.warn("[cli-input][renderer] deepNest not available for polygon part");
    return false;
  }

  if (!Array.isArray(points) || points.length < 3) {
    console.warn("[cli-input][renderer] Invalid polygon part points");
    return false;
  }

  const svgString = createPolygonPartSvg(points);
  const importedParts = deepNest.importsvg(null, null, svgString);

  return importedParts.length > 0;
}

function createPolygonSheetSvg(
  outer: CliPointInput[],
  holes: CliPointInput[][] = []
): string {
  const conversion = getCliSheetConversionFactor();

  // Outer contour one direction, holes opposite direction
  const normalizedOuter = ensureClockwise(outer);
  const normalizedHoles = holes.map((hole) => ensureCounterClockwise(hole));

  const outerPath = polygonPointsToPath(normalizedOuter, conversion);
  const holesPath = normalizedHoles
    .map((hole) => polygonPointsToPath(hole, conversion))
    .join(" ");

  const d = `${outerPath} ${holesPath}`.trim();

  return [
    `<svg xmlns="http://www.w3.org/2000/svg">`,
	`<path d="${d}" class="sheet" fill="#000000" stroke="#000000" fill-rule="evenodd" />`,
    `</svg>`,
  ].join("");
}

function addCliPolygonSheet(
  outer: CliPointInput[],
  holes: CliPointInput[][] = []
): boolean {
  const deepNest = getDeepNest();

  if (!deepNest || !Array.isArray(deepNest.parts)) {
    console.warn("[cli-input][renderer] deepNest not available for polygon sheet");
    return false;
  }

  if (!Array.isArray(outer) || outer.length < 3) {
    console.warn("[cli-input][renderer] Invalid polygon sheet outer contour");
    return false;
  }

  if (!Array.isArray(holes)) {
    console.warn("[cli-input][renderer] Invalid polygon sheet holes array");
    return false;
  }

  const svgString = createPolygonSheetSvg(outer, holes);
  const parts = deepNest.importsvg(null, null, svgString);

  if (parts.length > 0) {
    const sheet = parts[0];
    sheet.sheet = true;
    return true;
  }

  return false;
}

function loadCliSheets(sheets: CliSheetInput[]): void {
  console.log("[cli-input][renderer] loadCliSheets() start", sheets);

  if (!sheetDialogService) {
    console.warn("[cli-input][renderer] sheetDialogService is missing");
    return;
  }

  for (const sheet of sheets) {
    console.log("[cli-input][renderer] Adding sheet:", sheet);

    const quantity =
      typeof sheet.quantity === "number" && sheet.quantity > 0
        ? Math.floor(sheet.quantity)
        : 1;

    if (isCliPolygonSheetInput(sheet)) {
	  for (let i = 0; i < quantity; i++) {
		const ok = addCliPolygonSheet(sheet.outer, sheet.holes ?? []);
		if (!ok) {
		  console.warn("[cli-input][renderer] Failed to add polygon sheet", sheet);
		}
	  }
	  continue;
	}

    if (isCliRectSheetInput(sheet)) {
      for (let i = 0; i < quantity; i++) {
        if (sheet.width > 0 && sheet.height > 0) {
          sheetDialogService.addSheet(sheet.width, sheet.height);
        } else {
          console.warn("[cli-input][renderer] Invalid rectangular sheet", sheet);
        }
      }
      continue;
    }

    console.warn("[cli-input][renderer] Unsupported sheet definition", sheet);
  }

  if (partsViewService) {
    partsViewService.update();
    partsViewService.attachSort?.();
    partsViewService.applyZoom?.();
  }

  resize();

  console.log("[cli-input][renderer] loadCliSheets() done");
}

async function loadCliParts(parts: CliPartInput[]): Promise<void> {
  console.log("[cli-input][renderer] loadCliParts() start", parts);

	for (const part of parts) {
	  if (typeof part.path === "string" && part.path.trim().length > 0) {
		console.log("[cli-input][renderer] Importing file part:", part.path);
		const deepNest = getDeepNest();
		const beforeCount = deepNest.parts.length;

		await importService.processFile(part.path);

		const added = deepNest.parts.slice(beforeCount).filter((p) => !p.sheet);
		added.forEach((p, idx) => {
		  cliImportedPartRefs.push({
			deepNestPartRef: p,
			inputPart: part,
			instanceIndex: idx,
		  });
		});
		continue;
	  }

	  if (Array.isArray(part.points) && part.points.length >= 3) {
		console.log("[cli-input][renderer] Importing polygon points part");
		const deepNest = getDeepNest();
		const beforeCount = deepNest.parts.length;
		const ok = addCliPolygonPart(part.points);

		if (ok) {
		  const added = deepNest.parts.slice(beforeCount).filter((p) => !p.sheet);
		  added.forEach((p, idx) => {
			cliImportedPartRefs.push({
			  deepNestPartRef: p,
			  inputPart: part,
			  instanceIndex: idx,
			});
		  });
		}
		if (!ok) {
		  console.warn("[cli-input][renderer] Failed to add polygon points part", part);
		}
		continue;
	  }

	  console.warn("[cli-input][renderer] Unsupported part definition", part);
	}

  if (partsViewService) {
    partsViewService.update();
    partsViewService.attachSort();
    partsViewService.applyZoom();
  }

  resize();

  console.log("[cli-input][renderer] loadCliParts() done");
}

function applyCliQuantities(parts: CliPartInput[]): void {
  console.log("[cli-input][renderer] applyCliQuantities() start", parts);

  const deepNest = getDeepNest();
  if (!deepNest || !Array.isArray(deepNest.parts)) {
    console.warn("[cli-input][renderer] deepNest.parts not available");
    return;
  }

  for (const ref of cliImportedPartRefs) {
    const deepNestPart = ref.deepNestPartRef as {
      quantity?: number;
      rotations?: number;
      sheet?: boolean;
    };

    if (deepNestPart.sheet) {
      continue;
    }

    if (typeof ref.inputPart.quantity === "number") {
      deepNestPart.quantity = ref.inputPart.quantity;
    }

    if (typeof ref.inputPart.rotations === "number") {
      deepNestPart.rotations = ref.inputPart.rotations;
    }
  }

  if (partsViewService) {
    partsViewService.update();
  }

  console.log("[cli-input][renderer] applyCliQuantities() done");
}

interface CliNestPlacement {
  x: number;
  y: number;
  id: number;
  rotation: number;
  source: number;
  filename?: string;
  mergedLength?: number;
  mergedSegments?: unknown[];
}

interface CliNestSheetPlacement {
  sheet: number;
  sheetid?: string;
  sheetplacements: CliNestPlacement[];
}

interface CliNestResult {
  placements: CliNestSheetPlacement[];
  fitness?: number;
  area?: number;
  totalarea?: number;
  mergedLength?: number;
  utilisation?: number;
  index?: number;
  selected?: boolean;
}

function rotatePoint(point: CliPointInput, angleDeg: number): CliPointInput {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

function transformPoints(
  points: CliPointInput[],
  tx: number,
  ty: number,
  rotationDeg: number
): CliPointInput[] {
  return points.map((p) => {
    const r = rotatePoint(p, rotationDeg);
    return {
      x: r.x + tx,
      y: r.y + ty,
    };
  });
}

function getPartMeta(part: CliPartInput, fallbackSourceIndex: number) {
  const ip = part._ip_nesting as Record<string, unknown> | undefined;

  const sourcePartIndex =
    typeof ip?.source_part_index === "number" ? (ip.source_part_index as number) : fallbackSourceIndex;

  const partId =
    typeof ip?.part_id === "string"
      ? (ip.part_id as string)
      : typeof part.id === "string"
      ? part.id
      : `part_${sourcePartIndex}`;

  const previewObjectName =
    typeof ip?.preview_object_name === "string" ? (ip.preview_object_name as string) : null;

  const sourceType =
    typeof ip?.source_type === "string" ? (ip.source_type as string) : null;

  return { sourcePartIndex, partId, previewObjectName, sourceType };
}

function getSelectedOrBestNestResult(): CliNestResult | null {
  const deepNest = getDeepNest() as unknown as {
    nests?: CliNestResult[];
  };

  if (!deepNest || !Array.isArray(deepNest.nests) || deepNest.nests.length === 0) {
    return null;
  }

  const selected = deepNest.nests.find((nest) => nest.selected);
  if (selected) {
    return selected;
  }

  return deepNest.nests[deepNest.nests.length - 1] || null;
}

let lastResultSignature = "";

let cliJobContext: CliJobInput | null = null;

let cliImportedPartRefs: Array<{
  deepNestPartRef: unknown;
  inputPart: CliPartInput;
  instanceIndex: number;
}> = [];

async function syncSelectedNestToResultJson(
  cliInputPath: string | null,
  requestedOutputPath?: string
): Promise<void> {
  const result = getSelectedOrBestNestResult();
  if (!result) {
    return;
  }

  const payload = createCliResultPayload(cliInputPath, result);
  const signature = JSON.stringify(payload);

  if (signature === lastResultSignature) {
    return;
  }

  lastResultSignature = signature;
  await writeCliResultJson(requestedOutputPath, payload);
}

function createCliResultPayload(
  cliInputPath: string | null,
  result: CliNestResult
): Record<string, unknown> {

  const placements = (result.placements || []).map((sheetPlacement) => ({
    sheet: sheetPlacement.sheet,
    sheetId: sheetPlacement.sheetid || null,
    parts: (sheetPlacement.sheetplacements || []).map((part) => ({
      id: part.id,
      source: part.source,
      filename: part.filename || null,
      x: part.x,
      y: part.y,
      rotation: part.rotation,
      mergedLength: part.mergedLength ?? 0,
      mergedSegments: part.mergedSegments ?? [],
    })),
  }));

	const enrichedPlacements = (result.placements || []).map((sheetPlacement) => {
	  const perPartInstanceCounter = new Map<string, number>();

	  const parts = (sheetPlacement.sheetplacements || []).map((placedPart) => {
		const sourceCandidate = cliJobContext?.parts?.[placedPart.source] ?? null;
		const sourcePart = sourceCandidate ?? cliJobContext?.parts?.[0] ?? null;

		const meta = sourcePart
		  ? getPartMeta(sourcePart, placedPart.source)
		  : {
			  sourcePartIndex: placedPart.source,
			  partId: `part_${placedPart.source}`,
			  previewObjectName: null,
			  sourceType: null,
			};

		const currentInstance = perPartInstanceCounter.get(meta.partId) ?? 0;
		perPartInstanceCounter.set(meta.partId, currentInstance + 1);

		const stableId = `${meta.partId}_instance_${currentInstance}`;
		const originalPoints = Array.isArray(sourcePart?.points) ? sourcePart.points : [];
		const transformedPoints =
		  originalPoints.length > 0
			? transformPoints(originalPoints, placedPart.x, placedPart.y, placedPart.rotation)
			: [];

		return {
		  id: stableId,
		  placed: true,
		  x: placedPart.x,
		  y: placedPart.y,
		  rotation: placedPart.rotation,
		  sheetId: sheetPlacement.sheetid || null,
		  sheetIndex: sheetPlacement.sheet,

		  sourcePart: {
			source_part_index: meta.sourcePartIndex,
			part_id: meta.partId,
			preview_object_name: meta.previewObjectName,
			source_type: meta.sourceType,
			instance_index: currentInstance,
			_ip_nesting: sourcePart?._ip_nesting ?? null,
		  },

		  placement: {
			id: placedPart.id,
			source: placedPart.source,
			filename: placedPart.filename || null,
			mergedLength: placedPart.mergedLength ?? 0,
			mergedSegments: placedPart.mergedSegments ?? [],
		  },

		  originalPoints,
		  transformedPoints,
		};
	  });

	  return {
		sheet: sheetPlacement.sheet,
		sheetId: sheetPlacement.sheetid || null,
		parts,
	  };
	});

  return {
    // Existing output metadata
    success: true,
    generatedAt: new Date().toISOString(),
    inputPath: cliInputPath,
    fitness: result.fitness ?? null,
    area: result.area ?? null,
    totalarea: result.totalarea ?? null,
    mergedLength: result.mergedLength ?? 0,
    utilisation: result.utilisation ?? null,
    index: result.index ?? null,

    // Keep legacy/simple placements
    placements,

    // New rich placement payload
    enrichedPlacements,

    // Echo back full input context for downstream integrations
    inputContext: cliJobContext ?? null,

    // Convenience mirror for quick access
	schema_version: (cliJobContext as Record<string, unknown> | null)?.schema_version ?? null,
	job_id: (cliJobContext as Record<string, unknown> | null)?.job_id ?? null,
	created_at: (cliJobContext as Record<string, unknown> | null)?.created_at ?? null,
	_ip_nesting: (cliJobContext as Record<string, unknown> | null)?._ip_nesting ?? null,
	settings: cliJobContext?.settings ?? null,
	sheets: cliJobContext?.sheets ?? null,
	parts: cliJobContext?.parts ?? null,
  };
}

async function writeCliResultJson(
  outputPath: string | undefined,
  payload: Record<string, unknown>
): Promise<void> {
  if (!ipcRenderer) {
    throw new Error("ipcRenderer is not available");
  }

  const result = (await ipcRenderer.invoke(
    "write-cli-result",
    outputPath ?? null,
    payload
  )) as { success: boolean; error?: string; outputPath?: string };

  if (!result?.success) {
    throw new Error(result?.error || "Unknown error while writing result JSON");
  }

  console.log("[cli-output][renderer] Result JSON synced:", result.outputPath);
}



async function bootstrapCliJob(): Promise<void> {
  console.log("[cli-input][renderer] bootstrapCliJob() entered");

  const cliInput = await getCliInput();
  console.log("[cli-input][renderer] bootstrapCliJob() envelope:", cliInput);

  if (!cliInput) {
    console.log("[cli-input][renderer] No CLI envelope returned");
    return;
  }

  if (cliInput.error) {
    console.error("[cli-input][renderer] CLI input error:", cliInput.error);
    return;
  }

  if (!cliInput.data) {
    console.log("[cli-input][renderer] CLI envelope has no data");
    return;
  }

  console.log("[cli-input][renderer] Raw CLI payload:", cliInput.data);

  if (!isCliJobInput(cliInput.data)) {
    console.warn(
      "[cli-input][renderer] CLI JSON is present but not a supported job format:",
      cliInput.data
    );
    return;
  }

  const job = cliInput.data;
  console.log("[cli-input][renderer] Parsed CLI job:", job);
  
  cliJobContext = job;
  cliImportedPartRefs = [];

  if (job.settings) {
    console.log("[cli-input][renderer] Applying settings");
    applyCliSettings(job.settings);
  }

  if (job.sheets && job.sheets.length > 0) {
    console.log("[cli-input][renderer] Loading sheets");
    loadCliSheets(job.sheets);
  }

  if (job.parts && job.parts.length > 0) {
    console.log("[cli-input][renderer] Loading parts");
    await loadCliParts(job.parts);
    console.log("[cli-input][renderer] Applying quantities");
    applyCliQuantities(job.parts);
  }

  console.log("[cli-input][renderer] autoStart:", job.autoStart);

  if (job.autoStart !== false) {
    console.log("[cli-input][renderer] Starting nesting automatically");
    nestingService.startNesting();

    const outputPath = job.output?.resultJson;
	if (outputPath) {
	  (window as unknown as {
		__cliResultSync?: { inputPath: string | null; outputPath?: string };
	  }).__cliResultSync = {
		inputPath: cliInput.path,
		outputPath,
	  };

	  void syncSelectedNestToResultJson(cliInput.path, outputPath).catch((error) => {
		console.error("[cli-output][renderer] Initial result sync failed:", error);
	  });
	}
  }
}

function triggerCliResultSync(): void {
  console.log("[cli-output][renderer] triggerCliResultSync() called");

  const syncState = (window as unknown as {
    __cliResultSync?: { inputPath: string | null; outputPath?: string };
  }).__cliResultSync;

  console.log("[cli-output][renderer] syncState:", syncState);

  if (!syncState) {
    return;
  }

  void syncSelectedNestToResultJson(
    syncState.inputPath,
    syncState.outputPath
  ).catch((error) => {
    console.error("[cli-output][renderer] Result sync failed:", error);
  });
}

/**
 * Electron and Node.js module references
 */
let ipcRenderer: IpcRenderer;
let electronRemote: {
  dialog: { showOpenDialog: unknown; showSaveDialogSync: unknown };
  getGlobal: (name: string) => string | undefined;
};
let fs: unknown;
let FormData: new () => unknown;
let axios: { default: { post: unknown } };
let path: {
  extname: (p: string) => string;
  basename: (p: string) => string;
  dirname: (p: string) => string;
};
let svgPreProcessor: {
  loadSvgString: (svg: string, scale: number) => { success: boolean; result: string };
};

/**
 * Resize function for parts list
 * Adjusts the parts table headers when resizing
 */
function resize(event?: { rect: { width: number } }): void {
  const parts = getElement<HTMLElement>("#parts");

  if (event && parts) {
    parts.style.width = event.rect.width + "px";
  }

  const headers = getElements<HTMLTableCellElement>("#parts table th");
  headers.forEach((th) => {
    const span = th.querySelector("span");
    if (span) {
      (span as HTMLElement).style.width = th.offsetWidth + "px";
    }
  });
}

/**
 * Update the config form UI with current values
 * @param c - The configuration object
 */
function updateForm(c: UIConfig): void {
  // Update unit radio buttons
  let unitInput: HTMLInputElement | null;
  if (c.units === "inch") {
    unitInput = document.querySelector('#configform input[value=inch]');
  } else {
    unitInput = document.querySelector('#configform input[value=mm]');
  }

  if (unitInput) {
    unitInput.checked = true;
  }

  // Update unit labels
  const labels = document.querySelectorAll("span.unit-label");
  labels.forEach((l) => {
    (l as HTMLElement).innerText = c.units;
  });

  // Update scale input
  const scaleInput = document.querySelector<HTMLInputElement>("#inputscale");
  if (scaleInput) {
    if (c.units === "inch") {
      scaleInput.value = String(c.scale);
    } else {
      // mm
      scaleInput.value = String(c.scale / 25.4);
    }
  }

  // Update all other config inputs
  const inputs = document.querySelectorAll("#config input, #config select");
  inputs.forEach((i) => {
    const inputElement = i as HTMLInputElement | HTMLSelectElement;
    const inputId = inputElement.getAttribute("id");

    // Skip preset-related inputs
    if (inputId && ["presetSelect", "presetName"].includes(inputId)) {
      return;
    }

    const key = inputElement.getAttribute("data-config") as keyof UIConfig | null;
    if (!key) {
      return;
    }

    if (key === "units" || key === "scale") {
      return;
    }

    const value = c[key];
	
	if (key === "partToHole" && value === null) {
	  inputElement.value = "";
	  return;
	}

    if (inputElement.getAttribute("data-conversion") === "true") {
      const scaleValue = scaleInput ? Number(scaleInput.value) : c.scale;
      inputElement.value = String((value as number) / scaleValue);
    } else if (BOOLEAN_CONFIG_KEYS.includes(key)) {
      (inputElement as HTMLInputElement).checked = value as boolean;
    } else if (value !== undefined) {
      inputElement.value = String(value);
    }
  });
}

/**
 * Load presets into the dropdown
 */
async function loadPresetList(): Promise<void> {
  const presets = await presetService.loadPresets();
  const presetSelect = getElement<HTMLSelectElement>("#presetSelect");

  if (!presetSelect) {
    return;
  }

  // Clear dropdown (except first option)
  while (presetSelect.options.length > 1) {
    presetSelect.remove(1);
  }

  // Add presets to dropdown
  for (const name in presets) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    presetSelect.appendChild(option);
  }
}

/**
 * Initialize preset modal functionality
 */
function initializePresetModal(): void {
  const savePresetBtn = getElement<HTMLElement>("#savePresetBtn");
  const loadPresetBtn = getElement<HTMLElement>("#loadPresetBtn");
  const deletePresetBtn = getElement<HTMLElement>("#deletePresetBtn");
  const presetSelect = getElement<HTMLSelectElement>("#presetSelect");
  const presetModal = getElement<HTMLElement>("#preset-modal");
  const confirmSavePresetBtn = getElement<HTMLElement>("#confirmSavePreset");
  const presetNameInput = getElement<HTMLInputElement>("#presetName");

  if (!presetModal) {
    return;
  }

  const closeModalBtn = presetModal.querySelector(".close");

  // Save preset button click - opens modal
  if (savePresetBtn) {
    savePresetBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (presetNameInput) {
        presetNameInput.value = "";
      }
      presetModal.style.display = "block";
      document.body.classList.add("modal-open");
      if (presetNameInput) {
        presetNameInput.focus();
      }
    });
  }

  // Close modal when clicking X
  if (closeModalBtn) {
    closeModalBtn.addEventListener("click", (e) => {
      e.preventDefault();
      presetModal.style.display = "none";
      document.body.classList.remove("modal-open");
    });
  }

  // Close modal when clicking outside
  window.addEventListener("click", (event) => {
    if (event.target === presetModal) {
      presetModal.style.display = "none";
      document.body.classList.remove("modal-open");
    }
  });

  // Confirm save preset
  if (confirmSavePresetBtn) {
    confirmSavePresetBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      const name = presetNameInput?.value.trim() || "";
      if (!name) {
        alert("Please enter a preset name");
        return;
      }

      try {
        await presetService.savePreset(name, configService.getSync() as unknown as ConfigResult);
        presetModal.style.display = "none";
        document.body.classList.remove("modal-open");
        await loadPresetList();
        if (presetSelect) {
          presetSelect.value = name;
        }
        message("Preset saved successfully!");
      } catch {
        message("Error saving preset", true);
      }
    });
  }

  // Load preset button click
  if (loadPresetBtn) {
    loadPresetBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      const selectedPreset = presetSelect?.value || "";
      if (!selectedPreset) {
        message("Please select a preset to load");
        return;
      }

      try {
        const presetConfig = await presetService.getPreset(selectedPreset);

        if (presetConfig) {
          // Preserve user profile
          const tempAccess = configService.getSync("access_token") as string | undefined;
          const tempId = configService.getSync("id_token") as string | undefined;

          // Apply preset settings
          configService.setSync(presetConfig);

          // Restore user profile
          if (tempAccess !== undefined) {
            configService.setSync("access_token", tempAccess);
          }
          if (tempId !== undefined) {
            configService.setSync("id_token", tempId);
          }

          // Update UI and notify DeepNest
          const cfgValues = configService.getSync() as unknown as ConfigResult;
          getDeepNest().config(cfgValues);
          updateForm(cfgValues);

          message("Preset loaded successfully!");
        } else {
          message("Selected preset not found", true);
        }
      } catch {
        message("Error loading preset", true);
      }
    });
  }

  // Delete preset button click
  if (deletePresetBtn) {
    deletePresetBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      const selectedPreset = presetSelect?.value || "";
      if (!selectedPreset) {
        message("Please select a preset to delete");
        return;
      }

      if (confirm(`Are you sure you want to delete the preset "${selectedPreset}"?`)) {
        try {
          await presetService.deletePreset(selectedPreset);
          await loadPresetList();
          if (presetSelect) {
            presetSelect.selectedIndex = 0;
          }
          message("Preset deleted successfully!");
        } catch {
          message("Error deleting preset", true);
        }
      }
    });
  }
}

/**
 * Initialize config form change handlers
 */
function initializeConfigForm(): void {
  const inputs = document.querySelectorAll("#config input, #config select");

  inputs.forEach((i) => {
    const inputElement = i as HTMLInputElement | HTMLSelectElement;
    const inputId = inputElement.getAttribute("id");

    // Skip preset-related inputs
    if (inputId && ["presetSelect", "presetName"].includes(inputId)) {
      return;
    }

    inputElement.addEventListener("change", () => {
      let val: string | number | boolean | null = inputElement.value;
      const key = inputElement.getAttribute("data-config") as keyof UIConfig | null;

      if (!key) {
        return;
      }

      // Handle scale conversion
      if (key === "scale") {
        if (configService.getSync("units") === "mm") {
          val = Number(val) * 25.4; // Store scale config in inches
        }
      }

      // Handle boolean inputs (checkboxes)
      if (BOOLEAN_CONFIG_KEYS.includes(key)) {
        val = (inputElement as HTMLInputElement).checked;
      }

      // Handle unit conversion
      if (inputElement.getAttribute("data-conversion") === "true") {
	  if (key === "partToHole" && inputElement.value.trim() === "") {
		// An empty partToHole value means: use partToSheet.
		val = null;
	  } else {
		let conversion = configService.getSync("scale");

		if (configService.getSync("units") === "mm") {
		  conversion /= 25.4;
		}

		val = Number(val) * conversion;
	  }
	}

      // Show spinner during save
      if (inputElement.parentNode) {
        (inputElement.parentNode as HTMLElement).className = "progress";
      }

      // Update config
      configService.setSync(key, val as UIConfig[typeof key]);
      const cfgValues = configService.getSync() as unknown as ConfigResult;
      getDeepNest().config(cfgValues);
      updateForm(cfgValues);

      // Remove spinner
      if (inputElement.parentNode) {
        (inputElement.parentNode as HTMLElement).className = "";
      }

      // Update unit-related Ractive bindings
      if (key === "units" && partsViewService) {
        partsViewService.updateUnits();
      }
    });

    // Config explanation hover handlers
    inputElement.onmouseover = () => {
      const configKey = inputElement.getAttribute("data-config");
      if (configKey) {
        document.querySelectorAll(".config_explain").forEach((el) => {
          el.className = "config_explain";
        });

        const selected = document.querySelector("#explain_" + configKey);
        if (selected) {
          selected.className = "config_explain active";
        }
      }
    };

    inputElement.onmouseleave = () => {
      document.querySelectorAll(".config_explain").forEach((el) => {
        el.className = "config_explain";
      });
    };
  });

  // Reset to defaults button
  const setDefaultBtn = getElement<HTMLElement>("#setdefault");
  if (setDefaultBtn) {
    setDefaultBtn.onclick = (e) => {
      e.preventDefault();

      // Preserve user profile
      const tempAccess = configService.getSync("access_token") as string | undefined;
      const tempId = configService.getSync("id_token") as string | undefined;

      configService.resetToDefaultsSync();

      // Restore user profile
      if (tempAccess !== undefined) {
        configService.setSync("access_token", tempAccess);
      }
      if (tempId !== undefined) {
        configService.setSync("id_token", tempId);
      }

      const cfgValues = configService.getSync() as unknown as ConfigResult;
      getDeepNest().config(cfgValues);
      updateForm(cfgValues);

      return false;
    };
  }

  // Add spinner elements to each form dd
  const ddElements = document.querySelectorAll("#configform dd");
  ddElements.forEach((d) => {
    const spinner = document.createElement("div");
    spinner.className = "spinner";
    d.appendChild(spinner);
  });
}

/**
 * Initialize background progress handler
 */
function initializeBackgroundProgress(): void {
  ipcRenderer.on(IPC_CHANNELS.BACKGROUND_PROGRESS, (_event: unknown, ...args: unknown[]) => {
    const p = args[0] as NestingProgress;
    const bar = getElement<HTMLElement>("#progressbar");
    if (bar) {
      const progress = p.progress;
      const style = `width: ${parseInt(String(progress * 100))}%${progress < 0.01 ? "; transition: none" : ""}`;
      bar.setAttribute("style", style);
    }
  });
}

/**
 * Initialize drag/drop prevention
 */
function initializeDragDropPrevention(): void {
  document.ondragover = document.ondrop = (ev) => {
    ev.preventDefault();
  };

  document.body.ondrop = (ev) => {
    ev.preventDefault();
  };
}

/**
 * Initialize message close handler
 */
function initializeMessageClose(): void {
  const messageClose = getElement<HTMLAnchorElement>("#message a.close");
  if (messageClose) {
    messageClose.onclick = () => {
      const wrapper = getElement<HTMLElement>("#messagewrapper");
      if (wrapper) {
        wrapper.className = "";
      }
      return false;
    };
  }
}

/**
 * Initialize parts list resize functionality
 */
function initializePartsResize(): void {
  interact(".parts-drag")
    .resizable({
      preserveAspectRatio: false,
      edges: { left: false, right: true, bottom: false, top: false },
    })
    .on("resizemove", resize);

  window.addEventListener("resize", () => {
    resize();
  });

  // Initial resize
  resize();
}

/**
 * Initialize version info display
 */
function initializeVersionInfo(): void {
  try {
    const pjson = require("../package.json") as { version: string };
    const versionElement = getElement<HTMLElement>("#package-version");
    if (versionElement) {
      versionElement.innerText = pjson.version;
    }
  } catch {
    // Ignore if package.json is not accessible
  }
}

/**
 * Initialize all services
 */
async function initializeServices(): Promise<void> {
  // Create config service and set up window.config
  configService = await createConfigService(ipcRenderer);
  (window as unknown as { config: unknown; nest: unknown; loginWindow: unknown }).config =
    configService as unknown as ConfigObject;

  // Create preset service
  presetService = createPresetService(ipcRenderer);

  // Get config values and configure DeepNest
  const cfgValues = configService.getSync() as unknown as ConfigResult;
  getDeepNest().config(cfgValues);
  updateForm(cfgValues);
}

/**
 * Initialize all components
 */
function initializeComponents(): void {
  // Initialize navigation with dark mode
  navigationService = createNavigationService({ resizeCallback: resize });
  navigationService.initialize();

  // Initialize parts view
  partsViewService = createPartsViewService({
    deepNest: getDeepNest(),
    config: configService as unknown as ConfigObject,
    resizeCallback: resize,
  });
  partsViewService.initialize();

  // Initialize nest view
  nestViewService = createNestViewService({
    deepNest: getDeepNest(),
    config: configService as unknown as ConfigObject,
  });
  nestViewService.initialize();

  // Set window.nest reference for backward compatibility
  (window as unknown as { config: unknown; nest: unknown; loginWindow: unknown }).nest =
    nestViewService.getRactive();

  // Initialize sheet dialog
  sheetDialogService = createSheetDialogService({
    deepNest: getDeepNest(),
    config: configService as unknown as ConfigObject,
    updatePartsCallback: () => partsViewService.update(),
    resizeCallback: resize,
  });
  sheetDialogService.initialize();

  // Initialize import service
  importService = createImportService({
    dialog: electronRemote.dialog as unknown as {
      showOpenDialog: (
        options: unknown
      ) => Promise<{ canceled: boolean; filePaths: string[] }>;
    },
    remote: electronRemote as unknown as {
      getGlobal: (name: string) => string | undefined;
    },
    fs: fs as unknown as {
      readFileSync: (path: string) => Buffer;
      readFile: (
        path: string,
        encoding: string,
        callback: (err: Error | null, data: string) => void
      ) => void;
      readdirSync: (path: string) => string[];
    },
    path: path,
    httpClient: axios.default as unknown as {
      post: (
        url: string,
        data: Buffer,
        options: { headers: Record<string, string>; responseType: string }
      ) => Promise<{ data: string }>;
    },
    FormData: FormData as unknown as new () => {
      append: (
        name: string,
        value: Buffer | string,
        options?: { filename?: string; contentType?: string }
      ) => void;
      getBuffer: () => Buffer;
      getHeaders: () => Record<string, string>;
    },
    svgPreProcessor: svgPreProcessor,
    config: configService as unknown as {
      getSync: <K extends keyof UIConfig>(
        key?: K
      ) => K extends keyof UIConfig ? UIConfig[K] : UIConfig;
    },
    deepNest: getDeepNest(),
    ractive: partsViewService.getRactive() as unknown as RactiveInstance<PartsViewData>,
    attachSortCallback: () => partsViewService.attachSort(),
    applyZoomCallback: () => partsViewService.applyZoom(),
    resizeCallback: resize,
  });

  // Initialize export service
  exportService = createExportService({
    dialog: electronRemote.dialog as unknown as {
      showSaveDialogSync: (options: {
        title: string;
        filters: { name: string; extensions: string[] }[];
      }) => string | undefined;
    },
    remote: electronRemote as unknown as {
      getGlobal: (name: string) => string | undefined;
    },
    fs: fs as unknown as {
      writeFileSync: (path: string, data: string) => void;
    },
    httpClient: axios.default as unknown as {
      post: (
        url: string,
        data: Buffer,
        options: { headers: Record<string, string>; responseType: string }
      ) => Promise<{ data: string }>;
    },
    FormData: FormData as unknown as new () => {
      append: (
        name: string,
        value: Buffer | string,
        options?: { filename?: string; contentType?: string }
      ) => void;
      getBuffer: () => Buffer;
      getHeaders: () => Record<string, string>;
    },
    config: configService as unknown as {
      getSync: <K extends keyof UIConfig>(
        key?: K
      ) => K extends keyof UIConfig ? UIConfig[K] : UIConfig;
    },
    deepNest: getDeepNest(),
    svgParser: getSvgParser(),
  });

  // Set export button after creation
  const exportButton = getElement<HTMLElement>("#export");
  if (exportButton) {
    exportService.setExportButton(exportButton as HTMLElement & { className: string });
  }

  // Initialize nesting service
  nestingService = createNestingService({
    fs: fs as unknown as {
      existsSync: (path: string) => boolean;
      readdirSync: (path: string) => string[];
      lstatSync: (path: string) => { isDirectory: () => boolean };
      unlinkSync: (path: string) => void;
      rmdirSync: (path: string) => void;
    },
    ipcRenderer: ipcRenderer as unknown as {
      send: (channel: string, ...args: unknown[]) => void;
    },
    deepNest: getDeepNest(),
    displayNestFn: nestViewService.getDisplayNestCallback(),
    saveJsonFn: () => exportService.exportToJson(),
  });

  // Set nestRactive separately to avoid type conflicts
  const nestRactive = nestViewService.getRactive();
  if (nestRactive) {
    nestingService.setNestRactive(
      nestRactive as unknown as RactiveInstance<NestViewData>
    );
  }

  nestingService.bindEventHandlers();
}

/**
 * Initialize import button handler
 */
function initializeImportButton(): void {
  const importButton = getElement<HTMLElement>("#import");
  if (importButton) {
    importButton.onclick = async () => {
      if (
        importButton.className.includes("disabled") ||
        importButton.className.includes("spinner")
      ) {
        return false;
      }

      importButton.className = "button import disabled";

      try {
        importButton.className = "button import spinner";
        await importService.showImportDialog();
      } finally {
        importButton.className = "button import";
      }

      return false;
    };
  }
}

/**
 * Initialize export button handlers
 */
function initializeExportButtons(): void {
  // JSON export
  const exportJsonBtn = getElement<HTMLElement>("#exportjson");
  if (exportJsonBtn) {
    exportJsonBtn.onclick = () => {
      exportService.exportToJson();
      return false;
    };
  }

  // SVG export
  const exportSvgBtn = getElement<HTMLElement>("#exportsvg");
  if (exportSvgBtn) {
    exportSvgBtn.onclick = () => {
      exportService.exportToSvg();
      return false;
    };
  }

  // DXF export
  const exportDxfBtn = getElement<HTMLElement>("#exportdxf");
  if (exportDxfBtn) {
    exportDxfBtn.onclick = async () => {
      await exportService.exportToDxf();
      return false;
    };
  }
}

/**
 * Load initial SVG files from nest directory
 */
async function loadInitialFiles(): Promise<void> {
  await importService.loadNestDirectoryFiles();
}

/**
 * Main initialization function
 * Called when the DOM is ready
 */
async function initialize(): Promise<void> {
  console.log("[init] initialize() start");

  try {
    // Load required Electron and Node.js modules
    const electron = require("electron") as { ipcRenderer: IpcRenderer };
    ipcRenderer = electron.ipcRenderer;
    electronRemote = require("@electron/remote") as typeof electronRemote;
    fs = require("graceful-fs");
    FormData = require("form-data") as typeof FormData;
    axios = require("axios") as typeof axios;
    path = require("path") as typeof path;
    svgPreProcessor = require("@deepnest/svg-preprocessor") as typeof svgPreProcessor;

    // Disable Ractive debug mode
    Ractive.DEBUG = false;

    // Initialize services first
    await initializeServices();

    // Initialize preset list
    await loadPresetList();

    // Initialize UI components
    initializeComponents();
	
	(window as unknown as { triggerCliResultSync?: () => void }).triggerCliResultSync =
  triggerCliResultSync;

    // Initialize UI handlers
    initializePresetModal();
    initializeConfigForm();
    initializeBackgroundProgress();
    initializeDragDropPrevention();
    initializeMessageClose();
    initializePartsResize();
    initializeVersionInfo();
    initializeImportButton();
    initializeExportButtons();

    // Load initial files from nest directory
    await loadInitialFiles();

    // Bootstrap CLI-driven job if provided
    console.log("[cli-input][renderer] About to bootstrap CLI job");
    try {
      await bootstrapCliJob();
      console.log("[cli-input][renderer] CLI bootstrap finished");
    } catch (error) {
      console.error("[cli-input][renderer] CLI bootstrap failed:", error);
    }

    // Set up loginWindow reference
    (window as unknown as { config: unknown; nest: unknown; loginWindow: unknown }).loginWindow =
      null;

    console.log("[init] initialize() done");
  } catch (error) {
    console.error("[init] initialize() failed:", error);
  }
}

// Start initialization when DOM is ready
ready(initialize);

/**
 * Export service instances for external access if needed
 */
export {
  configService,
  presetService,
  importService,
  exportService,
  nestingService,
  navigationService,
  partsViewService,
  nestViewService,
  sheetDialogService,
};