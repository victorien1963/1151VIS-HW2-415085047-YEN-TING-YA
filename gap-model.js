const finite = value => typeof value === 'number' && Number.isFinite(value);
const milliseconds = value => Math.round(value * 1000) / 1000;
const validLapNumber = value => Number.isInteger(value) && value > 0;

// Cached lap.t is a lap START on the shared race clock, not a finish time.
// Keep this reconstruction separate from the official classification: source
// timestamps can differ slightly from the official race duration.
function lapEnd(lap) {
  return lap && finite(lap.t) && finite(lap.lap_duration) && lap.lap_duration > 0
    ? milliseconds(lap.t + lap.lap_duration)
    : null;
}

/**
 * Return one series per driver, comparing the completion of the SAME lap.
 * Positive gap = behind the reference; negative gap = ahead of the reference.
 * Missing driver/reference lap data stays null so chart lines can break there.
 * official_gap is supplied only at the classified finish, independently of gap.
 */
export function buildGapSeries(drivers, referenceNumber = 16) {
  const reference = drivers.find(driver => driver.driver_number === referenceNumber);
  if (!reference) throw new RangeError(`Reference driver ${referenceNumber} is missing`);
  const lapNumbers = [...new Set(drivers.flatMap(driver =>
    (driver.laps ?? []).map(lap => lap.lap_number).filter(validLapNumber)
  ))].sort((a, b) => a - b);
  // Include holes between recorded laps, preventing a line from bridging a
  // missing lap and suggesting a measured value at that point.
  const allLaps = lapNumbers.length
    ? Array.from({length: lapNumbers.at(-1) - lapNumbers[0] + 1}, (_, i) => lapNumbers[0] + i)
    : [];
  const referenceLaps = new Map((reference.laps ?? []).map(lap => [lap.lap_number, lap]));
  return drivers.map(driver => {
    const laps = new Map((driver.laps ?? []).map(lap => [lap.lap_number, lap]));
    const points = allLaps.map(lap_number => {
      const lap = laps.get(lap_number), referenceLap = referenceLaps.get(lap_number);
      const end_t = lapEnd(lap), reference_end_t = lapEnd(referenceLap);
      const isCommonFinish = lap_number === driver.result?.number_of_laps
        && lap_number === reference.result?.number_of_laps;
      const officialGap = isCommonFinish && finite(driver.result?.gap_to_leader)
        && finite(reference.result?.gap_to_leader)
        ? milliseconds(driver.result.gap_to_leader - reference.result.gap_to_leader)
        : null;
      return {
        lap_number,
        start_t: finite(lap?.t) ? lap.t : null,
        end_t,
        reference_end_t,
        lap_duration: finite(lap?.lap_duration) && lap.lap_duration > 0 ? lap.lap_duration : null,
        gap: end_t !== null && reference_end_t !== null ? milliseconds(end_t - reference_end_t) : null,
        official_gap: officialGap,
      };
    });
    return {driver, driver_number: driver.driver_number, points};
  });
}

/**
 * Shared-clock replay range covering every displayed driver's selected laps.
 * Input lap bounds are rounded, order-independent and clamped to known laps.
 * A one-lap selection replays that complete lap, rather than only its endpoint.
 * Returns null when either boundary has no usable lap records.
 */
export function lapTimeRange(drivers, startLap, endLap = startLap) {
  if (!finite(startLap) || !finite(endLap)) return null;
  const laps = drivers.flatMap(driver => driver.laps ?? [])
    .filter(lap => validLapNumber(lap.lap_number));
  if (!laps.length) return null;
  const minLap = Math.min(...laps.map(lap => lap.lap_number));
  const maxLap = Math.max(...laps.map(lap => lap.lap_number));
  const clamp = value => Math.max(minLap, Math.min(maxLap, Math.round(value)));
  const a = Math.min(clamp(startLap), clamp(endLap));
  const b = Math.max(clamp(startLap), clamp(endLap));
  const starts = laps.filter(lap => lap.lap_number === a && finite(lap.t)).map(lap => lap.t);
  const ends = laps.filter(lap => lap.lap_number === b).map(lapEnd).filter(finite);
  if (!starts.length || !ends.length) return null;
  const start = Math.max(0, Math.min(...starts)), end = Math.max(...ends);
  return end > start ? [start, end] : null;
}
