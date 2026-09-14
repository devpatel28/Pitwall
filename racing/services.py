from statistics import median

def summarize(laps):
    """Clean pace excludes pit laps, flagged laps and missing times."""
    clean = [l.seconds for l in laps if l.clean and not l.pit and l.seconds is not None]
    stints = []
    for lap in laps:
        if not stints or stints[-1]['compound'] != lap.compound or lap.number != stints[-1]['end'] + 1 or stints[-1]['ended_in_pit']:
            stints.append({'compound': lap.compound, 'start': lap.number, 'end': lap.number, 'ended_in_pit': lap.pit})
        else:
            stints[-1].update(end=lap.number, ended_in_pit=lap.pit)
    return {'driver': laps[0].driver, 'laps': [{'lap': l.number, 'seconds': l.seconds, 'pit': l.pit, 'clean': l.clean} for l in laps], 'median': round(median(clean), 3) if clean else None, 'fastest': round(min(clean), 3) if clean else None, 'clean_count': len(clean), 'stints': stints, 'stops': [l.number for l in laps if l.pit]}
