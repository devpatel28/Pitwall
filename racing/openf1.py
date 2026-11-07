"""OpenF1 (https://openf1.org) client and pure transforms into Pitwall laps and fastest-lap replays.

OpenF1 is an unofficial, community-run API. Network access lives in `fetch`; everything else is
pure so it can be tested with fixtures.
"""
import json
import math
import time
from datetime import datetime, timedelta
from statistics import median
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

BASE_URL = 'https://api.openf1.org/v1'
VIEWBOX = (480, 290)
_last_call = 0.0

def fetch(endpoint, params, spacing=2.1, retries=4):
    """GET an OpenF1 endpoint. Keys may carry operators, e.g. {'date>=': ...}. Spaced to respect the free-tier rate limit."""
    global _last_call
    # Operator keys such as 'date>=' already end in '='; OpenF1 also needs ':' left unescaped in timestamps.
    query = '&'.join((key if key.endswith('=') else key + '=') + quote(str(value), safe=':') for key, value in params.items())
    request = Request(f'{BASE_URL}/{endpoint}?{query}', headers={'User-Agent': 'pitwall-portfolio/1.0', 'Accept': 'application/json'})
    for attempt in range(retries + 1):
        wait = spacing - (time.monotonic() - _last_call)
        if wait > 0:
            time.sleep(wait)
        _last_call = time.monotonic()
        try:
            with urlopen(request, timeout=60) as response:
                data = json.load(response)
            # OpenF1 answers some empty queries with an object such as {"detail": "No results found."}.
            return data if isinstance(data, list) else []
        except HTTPError as error:
            if error.code == 404:
                return []
            if error.code not in (429, 500, 502, 503, 504) or attempt == retries:
                raise
        except URLError:
            if attempt == retries:
                raise
        time.sleep(5 * 2 ** attempt)

def parse_time(value):
    return datetime.fromisoformat(value)

def neutralised_laps(messages):
    """Lap numbers run under a safety car, virtual safety car or red flag, plus each restart lap."""
    laps, start = set(), None
    for message in sorted(messages, key=lambda m: m.get('date') or ''):
        lap, text = message.get('lap_number'), (message.get('message') or '').upper()
        if lap is None:
            continue
        if message.get('category') == 'SafetyCar':
            if 'DEPLOYED' in text and start is None:
                start = lap
            elif ('ENDING' in text or 'IN THIS LAP' in text) and start is not None:
                laps.update(range(start, lap + 2))
                start = None
        if message.get('flag') == 'RED':
            laps.add(lap)
    if start is not None:
        laps.update(range(start, start + 200))
    return laps

def build_records(drivers, laps, stints, messages, outlier=1.10):
    """Turn OpenF1 drivers/laps/stints/race-control rows into (driver, lap, seconds, compound, pit, clean) records.

    Pit is marked on the in-lap (the last lap of every stint but the final one). A lap is clean when it is not
    lap 1, a pit in-lap or out-lap, neutralised, missing, or more than `outlier` times the driver's median.
    """
    codes = {d['driver_number']: d['name_acronym'] for d in drivers if d.get('name_acronym')}
    neutral = neutralised_laps(messages)
    by_driver = {}
    for stint in stints:
        by_driver.setdefault(stint['driver_number'], []).append(stint)
    rows = {}
    for lap in laps:
        number, code = lap.get('lap_number'), codes.get(lap['driver_number'])
        if not code or not number:
            continue
        own = sorted(by_driver.get(lap['driver_number'], []), key=lambda s: s['stint_number'])
        compound = next((s['compound'] for s in own if s.get('lap_start') and s.get('lap_end') and s['lap_start'] <= number <= s['lap_end']), None)
        pit = number in {s['lap_end'] for s in own[:-1] if s.get('lap_end')}
        seconds = lap.get('lap_duration')
        seconds = float(seconds) if seconds and seconds > 0 else None
        candidate = number > 1 and seconds is not None and not pit and not lap.get('is_pit_out_lap') and number not in neutral
        rows[(code, number)] = [code, number, seconds, (compound or 'UNKNOWN').upper(), pit, candidate]
    for code in {c for c, _ in rows}:
        times = [r[2] for r in rows.values() if r[0] == code and r[5]]
        if times:
            limit = median(times) * outlier
            for row in rows.values():
                if row[0] == code and row[5] and row[2] > limit:
                    row[5] = False
    return [tuple(row) for _, row in sorted(rows.items())]

def fastest_lap(laps):
    complete = [l for l in laps if l.get('lap_duration') and all(l.get(f'duration_sector_{i}') for i in (1, 2, 3))]
    return min(complete, key=lambda l: l['lap_duration']) if complete else None

def fit_track(points, width=VIEWBOX[0], height=VIEWBOX[1], pad=24):
    """Rotate (5° steps) and scale raw x/y into the viewbox, y flipped for SVG, picking the rotation that fills it best.

    Returns the fitted points and the scale, so elevation can be expressed in the same units."""
    best = None
    for degrees in range(0, 180, 5):
        a = math.radians(degrees)
        turned = [(x * math.cos(a) - y * math.sin(a), -(x * math.sin(a) + y * math.cos(a))) for x, y in points]
        xs, ys = [p[0] for p in turned], [p[1] for p in turned]
        span_x, span_y = (max(xs) - min(xs)) or 1, (max(ys) - min(ys)) or 1
        scale = min((width - 2 * pad) / span_x, (height - 2 * pad) / span_y)
        if best is None or scale > best[0]:
            best = (scale, turned, min(xs), min(ys), span_x, span_y)
    scale, turned, min_x, min_y, span_x, span_y = best
    off_x, off_y = (width - span_x * scale) / 2, (height - span_y * scale) / 2
    return [(round(off_x + (x - min_x) * scale, 1), round(off_y + (y - min_y) * scale, 1)) for x, y in turned], scale

def build_replay(lap, locations, car_data, all_laps, driver, results, circuit, codes):
    """Fastest-lap replay: track outline with lap-fraction timestamps, telemetry, sector splits and timing colours."""
    start, duration = parse_time(lap['date_start']), lap['lap_duration']
    frac = lambda value: (parse_time(value) - start).total_seconds() / duration
    samples = sorted((frac(p['date']), p['x'], p['y'], p.get('z') or 0) for p in locations if p.get('x') is not None)
    samples = [s for s in samples if -.01 <= s[0] <= 1.01]
    if len(samples) < 20:
        raise ValueError('Not enough position samples to draw the circuit.')
    track, scale = fit_track([(x, y) for _, x, y, _ in samples])
    ground = min(z for *_, z in samples)
    sectors = [lap[f'duration_sector_{i}'] for i in (1, 2, 3)]
    colours = []
    for i, value in enumerate(sectors, 1):
        overall = min(l[f'duration_sector_{i}'] for l in all_laps if l.get(f'duration_sector_{i}'))
        personal = min(l[f'duration_sector_{i}'] for l in all_laps if l.get(f'duration_sector_{i}') and l['driver_number'] == lap['driver_number'])
        colours.append('purple' if value <= overall else 'green' if value <= personal else 'yellow')
    telemetry = sorted([round(frac(c['date']), 4), c.get('speed') or 0, c.get('throttle') or 0, 1 if (c.get('brake') or 0) > 0 else 0, c.get('n_gear') or 0] for c in car_data)
    podium = [codes[r['driver_number']] for r in sorted((r for r in results if r.get('position') and r['driver_number'] in codes), key=lambda r: r['position'])[:3]]
    return {
        'circuit': circuit, 'driver': driver['name_acronym'], 'name': f"{driver.get('first_name', '')} {driver.get('last_name', '')}".strip(),
        'team': driver.get('team_name') or '', 'colour': f"#{driver['team_colour']}" if driver.get('team_colour') else '#d7ff62',
        'lap': lap['lap_number'], 'time': duration, 'sectors': sectors, 'sector_colours': colours,
        'splits': [round(sectors[0] / duration, 4), round((sectors[0] + sectors[1]) / duration, 4)],
        # [lap fraction, x, y, elevation above the lowest point], all in viewbox units.
        'track': [[round(min(1, max(0, t)), 4), x, y, round((z - ground) * scale, 2)] for (t, _, _, z), (x, y) in zip(samples, track)],
        'telemetry': [row for row in telemetry if 0 <= row[0] <= 1], 'podium': podium, 'viewbox': list(VIEWBOX),
    }

def lap_window(lap, margin=1.5):
    start = parse_time(lap['date_start'])
    end = start + timedelta(seconds=lap['lap_duration'])
    fmt = lambda t: t.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]
    return fmt(start - timedelta(seconds=margin)), fmt(end + timedelta(seconds=margin))
