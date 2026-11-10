from statistics import median

MIN_TREND_LAPS = 5


def stint_trend(laps):
    """Least-squares slope of clean lap times against lap number, in seconds per lap.

    Positive means the driver got slower as the tyres aged. Fuel burn makes cars faster
    through a stint, so this understates pure tyre degradation; it is not fuel-corrected.
    Returns None when the stint has fewer than MIN_TREND_LAPS clean laps.
    """
    points = [(l.number, l.seconds) for l in laps if l.clean and not l.pit and l.seconds is not None]
    if len(points) < MIN_TREND_LAPS:
        return None
    n = len(points)
    mean_x = sum(x for x, _ in points) / n
    mean_y = sum(y for _, y in points) / n
    spread = sum((x - mean_x) ** 2 for x, _ in points)
    if spread == 0:
        return None
    slope = sum((x - mean_x) * (y - mean_y) for x, y in points) / spread
    return {'per_lap': round(slope, 3), 'laps': n, 'intercept': round(mean_y - slope * mean_x, 3)}

def summarize(laps):
    """Clean pace excludes pit laps, flagged laps and missing times."""
    clean = [l.seconds for l in laps if l.clean and not l.pit and l.seconds is not None]
    stints = []
    for lap in laps:
        if not stints or stints[-1]['compound'] != lap.compound or lap.number != stints[-1]['end'] + 1 or stints[-1]['ended_in_pit']:
            stints.append({'compound': lap.compound, 'start': lap.number, 'end': lap.number, 'ended_in_pit': lap.pit})
        else:
            stints[-1].update(end=lap.number, ended_in_pit=lap.pit)
    for stint in stints:
        stint['trend'] = stint_trend([l for l in laps if stint['start'] <= l.number <= stint['end']])
    return {'driver': laps[0].driver, 'laps': [{'lap': l.number, 'seconds': l.seconds, 'pit': l.pit, 'clean': l.clean} for l in laps], 'median': round(median(clean), 3) if clean else None, 'fastest': round(min(clean), 3) if clean else None, 'clean_count': len(clean), 'stints': stints, 'stops': [l.number for l in laps if l.pit]}
