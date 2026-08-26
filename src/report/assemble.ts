/**
 * Ensamblado del día: de datos horarios a informe.
 *
 * **Puro y sin red.** Es la costura donde se prueban días reales desde
 * ficheros: todo lo que hay por encima se ejercita sin tocar la red.
 */

import { m, mps } from "../units/branded.js";
import type { MPerS, Metres } from "../units/branded.js";
import { err, ok } from "../types/result.js";
import type { Result } from "../types/result.js";
import { at } from "../types/array.js";
import type { Site } from "../types/site.js";
import { potentialTemperature } from "../thermo/potential.js";
import { dewpointFromMixingRatio } from "../thermo/saturation.js";
import { kToCelsius } from "../units/convert.js";
import { interpolateAtAgl } from "../sounding/interpolate.js";
import { meanWind, shearBetween } from "../sounding/wind.js";
import type { Sounding, WindVector } from "../sounding/types.js";
import { surfaceHeatFlux } from "../convection/heatFlux.js";
import { convectiveVelocityScale } from "../convection/wstar.js";
import { criticalHeight, meanClimbOverBand } from "../convection/hcrit.js";
import { thermalTop } from "../convection/thermalIndex.js";
import { triggerTemperature } from "../convection/trigger.js";
import { reconcileMixingHeight } from "../convection/mixingHeight.js";
import { buoyancyShearRatio } from "../convection/buoyancyShear.js";
import { SURFACE_DEFAULTS, DEFAULT_SURFACE_TYPE } from "../convection/surfaceDefaults.js";
import { cumulusBase } from "../clouds/cloudBase.js";
import { cumulusDepth, isBlueDay } from "../clouds/cumulus.js";
import { overdevelopmentRisk } from "../clouds/overdevelopment.js";
import { usableCeiling } from "../clouds/ceiling.js";
import { capeRisk } from "../stability/capeRisk.js";
import { kIndex, liftedIndex, totalTotals } from "../stability/indices.js";
import { GLIDER_CLUB } from "../aircraft/profiles.js";
import type { AircraftProfile } from "../aircraft/profiles.js";
import { buildFactor } from "../forecast/factors.js";
import type { Factor, FactorId } from "../forecast/factors.js";
import { evaluateVetoes } from "../forecast/vetoes.js";
import { aggregate } from "../forecast/score.js";
import { resolveScoring } from "../forecast/config.js";
import type { ScoringConfig } from "../forecast/config.js";
import { bestHour, findWindows } from "../forecast/windows.js";
import type { Confidence } from "../forecast/confidence.js";
import { OPEN_METEO_ATTRIBUTION } from "../attribution.js";
import type {
  HourlyObservation,
  HourQuality,
  LiftedIndexSource,
  SoaringDay,
  SoaringHour,
} from "./types.js";

/** Cobertura a partir de la cual se considera cielo roto (BKN). */
export const BROKEN_COVER_FRAC = 0.625;
/** Cobertura total a partir de la cual se considera cubierto (OVC). */
export const OVERCAST_COVER_FRAC = 0.875;
/** Altura sobre el nivel del mar que separa nubosidad baja de media. */
export const LOW_MID_CUTOFF_MSL_M = 3000;

export interface ComputeDayInput {
  readonly site: Site;
  readonly hourly: readonly HourlyObservation[];
  readonly dateLocal: string;
  readonly sunriseUtc: string;
  readonly sunsetUtc: string;
  readonly profile?: AircraftProfile;
  readonly scoring?: ScoringConfig;
  readonly confidence?: Confidence | null;
}

/**
 * Calcula el día completo. No accede a la red.
 *
 * @source docs/SPEC.md §12.
 */
export function computeDay(input: ComputeDayInput): Result<SoaringDay> {
  if (input.hourly.length === 0) {
    return err("MISSING_VARIABLE", "no hourly observations supplied");
  }

  const profile = input.profile ?? GLIDER_CLUB;
  const scoring = resolveScoring(input.scoring);
  const hours = input.hourly.map((observation) =>
    computeHour(observation, profile, scoring),
  );

  const scored = hours.map((hour) => ({
    timeUtc: hour.timeUtc,
    level: hour.score.level,
    usableCeilingAglM: hour.ceiling.aglM,
    climbMs: hour.thermal.meanClimbMs,
    hour,
  }));

  const best = bestHour(scored);

  return ok({
    site: input.site,
    dateLocal: input.dateLocal,
    hours,
    best: best?.hour ?? null,
    windows: findWindows(scored, 3),
    sunriseUtc: input.sunriseUtc,
    sunsetUtc: input.sunsetUtc,
    confidence: input.confidence ?? null,
    attribution: OPEN_METEO_ATTRIBUTION,
  });
}

function computeHour(
  observation: HourlyObservation,
  profile: AircraftProfile,
  scoring: ReturnType<typeof resolveScoring>,
): SoaringHour {
  const sounding = observation.sounding;
  const surface = sounding.surface;
  const surfaceType = sounding.site.surface?.type ?? DEFAULT_SURFACE_TYPE;

  const flux = surfaceHeatFlux({
    shortwaveDownWm2: surface.shortwaveWm2,
    surfaceTempK: surface.tempK,
    surfaceDewpointK: surface.dewpointK,
    surfacePressurePa: surface.pressurePa,
    cloudCoverFrac: surface.cloudCoverFrac,
    surfaceType,
    ...(observation.modelFluxWm2 === undefined
      ? {}
      : { modelFluxWm2: observation.modelFluxWm2 }),
    ...(observation.fluxConvention === undefined
      ? {}
      : { fluxConvention: observation.fluxConvention }),
    ...(observation.soilMoistureFrac === undefined
      ? {}
      : { soilMoistureFrac: observation.soilMoistureFrac }),
    ...(sounding.site.surface?.albedoFrac === undefined
      ? {}
      : { albedoFrac: sounding.site.surface.albedoFrac }),
  });

  const top = thermalTop(sounding, surface.tempK);
  const thermalTopAglM = top.ok ? top.value.topAglM : m(0);
  const mixedLayerTopAglM = top.ok ? top.value.mixedLayerTopAglM : m(0);
  const surfaceExcessK = top.ok ? top.value.surfaceExcessK : 0;

  const mixing = reconcileMixingHeight(
    thermalTopAglM,
    observation.boundaryLayerHeightAglM ?? null,
  );

  const wStar = convectiveVelocityScale({
    virtualHeatFluxKMs: flux.virtualHeatFluxKMs,
    mixingHeightAglM: mixing.chosenAglM,
    surfacePotentialTempK: potentialTemperature(surface.tempK, surface.pressurePa),
    surfaceWindMs: surface.windSpeedMs,
    profile,
  });
  const wStarMs = wStar.ok ? wStar.value.wStarMs : mps(0);
  const suppressedByWind = wStar.ok && wStar.value.suppressedByWind;

  const hcrit = wStarMs > 0 ? criticalHeight(wStarMs, thermalTopAglM, profile) : null;
  const hcritAglM = hcrit?.ok === true ? hcrit.value.hcritAglM : null;

  const climb = wStarMs > 0 ? meanClimbOverBand(wStarMs, thermalTopAglM, profile) : null;
  const meanClimbMs = climb?.ok === true ? climb.value : mps(0);

  const cloud =
    thermalTopAglM > 0
      ? cumulusBase(sounding, thermalTopAglM, surface.tempK, thermalTopAglM)
      : null;
  const cloudBaseAglM = cloud?.ok === true ? cloud.value.baseAglM : null;
  const blue = cloudBaseAglM === null || isBlueDay(cloudBaseAglM, thermalTopAglM);
  const depthM =
    cloudBaseAglM !== null && !blue ? cumulusDepth(cloudBaseAglM, thermalTopAglM) : null;

  const overcast = isOvercast(sounding, cloudBaseAglM);

  const cape = capeRisk(
    observation.capeJkg ?? null,
    observation.convectiveInhibitionJkg ?? null,
  );

  const ceiling = usableCeiling({
    hcritAglM,
    thermalTopAglM,
    cloudBaseAglM: blue ? null : cloudBaseAglM,
    overcast,
    elevationMslM: sounding.site.elevationMslM,
  });

  const bs =
    wStarMs > 0
      ? buoyancyShearRatio({
          wStarMs,
          surfaceWindMs: surface.windSpeedMs,
          roughnessLengthM:
            sounding.site.surface?.roughnessLengthM ??
            SURFACE_DEFAULTS[surfaceType].roughnessLengthM,
        })
      : null;

  const ki = kIndex(sounding);
  const tt = totalTotals(sounding);
  const li = resolveLiftedIndex(sounding, observation);

  const trigger = triggerTemperature(sounding);

  const factors = buildFactors(
    {
      climbMs: meanClimbMs,
      ceilingAglM: ceiling.aglM,
      lapseKPerKm: layerLapseKPerKm(sounding, thermalTopAglM),
      thermalQuality: bs?.ok === true ? bs.value.ratio : 0,
      surfaceWindMs: surface.windSpeedMs,
      dewpointDepressionK: mixedLayerDepressionK(sounding, cloud),
      cloudCoverFrac: surface.cloudCoverFrac,
    },
    scoring.factors,
  );

  const vetoes = evaluateVetoes({
    hasConvection: thermalTopAglM > 0 && wStarMs > 0,
    overcast,
    usableCeilingAglM: ceiling.aglM,
    liftedIndex: li.value,
    cape,
    kIndex: ki.ok ? ki.value : null,
    surfaceWindMs: surface.windSpeedMs,
  });

  const quality: HourQuality = {
    ...sounding.quality,
    heatFluxSource: flux.source,
    heatFluxEstimated: flux.estimated,
  };

  return {
    timeUtc: observation.timeUtc,
    sounding,
    thermal: {
      wStarMs,
      surfaceHeatFluxWm2: flux.sensibleHeatWm2,
      netRadiationWm2: flux.netRadiationWm2,
      meanClimbMs,
      hcritAglM,
      thermalTopAglM,
      mixedLayerTopAglM,
      modelBlhAglM: mixing.modelAglM,
      likelyShearDriven: mixing.likelyShearDriven,
      triggerTempK: trigger.ok ? trigger.value.triggerTempK : null,
      surfaceExcessK,
      suppressedByWind,
    },
    cloud: {
      baseAglM: cloudBaseAglM,
      depthM,
      blue,
      overcast,
      odRisk: overdevelopmentRisk({
        cumulusDepthM: depthM ?? m(0),
        capeBand: cape.band,
        convectiveInhibitionJkg: observation.convectiveInhibitionJkg ?? null,
        cloudCoverMidFrac: surface.cloudCoverMidFrac,
        ...(observation.midLevelHumidityFrac === undefined
          ? {}
          : { midLevelHumidityFrac: observation.midLevelHumidityFrac }),
      }),
    },
    stability: {
      liftedIndex: li.value,
      liftedIndexSource: li.source,
      kIndex: ki.ok ? ki.value : null,
      totalTotalsIndex: tt.ok ? tt.value : null,
      cape,
    },
    wind: {
      surfaceMs: surface.windSpeedMs,
      surfaceFromDeg: surface.windFromDeg,
      blMean: boundaryLayerMeanWind(sounding, thermalTopAglM),
      blTop: windAt(sounding, thermalTopAglM),
      shearMsPerKm: boundaryLayerShear(sounding, thermalTopAglM),
      bs: bs?.ok === true ? bs.value : null,
    },
    ceiling,
    score: aggregate(factors, vetoes, scoring.levelThresholds),
    quality,
  };
}

/** El modelo manda; el cálculo propio es respaldo y se declara. */
function resolveLiftedIndex(
  sounding: Sounding,
  observation: HourlyObservation,
): { value: number | null; source: LiftedIndexSource } {
  if (
    observation.modelLiftedIndex !== undefined &&
    observation.modelLiftedIndex !== null
  ) {
    return { value: observation.modelLiftedIndex, source: "model" };
  }
  const computed = liftedIndex(sounding);
  if (computed.ok) return { value: computed.value, source: "computed" };
  return { value: null, source: "unavailable" };
}

/**
 * Cielo cerrado.
 *
 * **La nubosidad baja cuenta siempre.** Por definición está por debajo de 3 km,
 * es decir entre el sol y el suelo, y corta la convección venga de donde venga
 * la base que calculemos nosotros. El predecesor elegía entre capa baja y media
 * según dónde cayera la base calculada, de modo que un 90 % de nubosidad baja
 * declarado por el modelo no vetaba nada si nuestra base salía alta.
 *
 * La capa media solo se mira cuando la base calculada cae en su banda.
 */
function isOvercast(sounding: Sounding, cloudBaseAglM: Metres | null): boolean {
  const surface = sounding.surface;
  if (surface.cloudCoverLowFrac >= BROKEN_COVER_FRAC) return true;
  if (surface.cloudCoverFrac >= OVERCAST_COVER_FRAC) return true;

  const baseMslM =
    cloudBaseAglM === null ? Infinity : sounding.site.elevationMslM + cloudBaseAglM;
  return (
    baseMslM >= LOW_MID_CUTOFF_MSL_M && surface.cloudCoverMidFrac >= BROKEN_COVER_FRAC
  );
}

function layerLapseKPerKm(sounding: Sounding, topAglM: Metres): number {
  if (topAglM < 100) return 0;
  const top = interpolateAtAgl(sounding, topAglM);
  if (!top.ok) return 0;
  return ((sounding.surface.tempK - top.value.tempK) / topAglM) * 1000;
}

function mixedLayerDepressionK(
  sounding: Sounding,
  cloud: ReturnType<typeof cumulusBase> | null,
): number {
  if (cloud?.ok !== true) {
    return kToCelsius(sounding.surface.tempK) - kToCelsius(sounding.surface.dewpointK);
  }
  const dewpoint = dewpointFromMixingRatio(
    cloud.value.mixedLayerMixingRatioKgKg,
    sounding.surface.pressurePa,
  );
  return sounding.surface.tempK - dewpoint;
}

function windAt(sounding: Sounding, aglM: Metres): WindVector {
  const level = interpolateAtAgl(sounding, aglM);
  if (!level.ok) {
    return {
      speedMs: sounding.surface.windSpeedMs,
      fromDeg: sounding.surface.windFromDeg,
    };
  }
  return { speedMs: level.value.windSpeedMs, fromDeg: level.value.windFromDeg };
}

function boundaryLayerMeanWind(sounding: Sounding, topAglM: Metres): WindVector {
  const topMslM = sounding.site.elevationMslM + topAglM;
  const inside = sounding.levels.filter((l) => l.geopotentialMslM <= topMslM);
  if (inside.length < 2) {
    return {
      speedMs: sounding.surface.windSpeedMs,
      fromDeg: sounding.surface.windFromDeg,
    };
  }
  const samples = inside.map((level, index) => {
    const previous = index === 0 ? level : at(inside, index - 1);
    const next = index === inside.length - 1 ? level : at(inside, index + 1);
    return {
      wind: { speedMs: level.windSpeedMs, fromDeg: level.windFromDeg },
      weight: Math.max(1, (next.geopotentialMslM - previous.geopotentialMslM) / 2),
    };
  });
  return meanWind(samples);
}

function boundaryLayerShear(sounding: Sounding, topAglM: Metres): number {
  if (topAglM < 100) return 0;
  const surfaceWind: WindVector = {
    speedMs: sounding.surface.windSpeedMs,
    fromDeg: sounding.surface.windFromDeg,
  };
  return shearBetween(surfaceWind, windAt(sounding, topAglM), topAglM).shearMsPerKm;
}

interface FactorValues {
  readonly climbMs: MPerS;
  readonly ceilingAglM: Metres;
  readonly lapseKPerKm: number;
  readonly thermalQuality: number;
  readonly surfaceWindMs: MPerS;
  readonly dewpointDepressionK: number;
  readonly cloudCoverFrac: number;
}

function buildFactors(
  values: FactorValues,
  specs: ReturnType<typeof resolveScoring>["factors"],
): readonly Factor[] {
  const raw: Record<FactorId, number> = {
    climb_strength: values.climbMs,
    usable_ceiling: values.ceilingAglM,
    lapse_rate: values.lapseKPerKm,
    thermal_quality: values.thermalQuality,
    surface_wind: values.surfaceWindMs,
    moisture: values.dewpointDepressionK,
    cloud_cover: values.cloudCoverFrac,
  };
  return (Object.keys(raw) as FactorId[]).map((id) =>
    buildFactor(id, raw[id], specs[id]),
  );
}
