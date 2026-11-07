import math
from django.db import transaction
from .models import Race, Lap

COMPOUNDS = ['SOFT', 'MEDIUM', 'HARD', 'INTERMEDIATE', 'WET', 'UNKNOWN']

def build_laps(records):
    """Validate (driver, lap, seconds, compound, pit, clean) records into unsaved Lap objects; raise ValueError on bad data."""
    parsed, seen = [], set()
    for driver, number, seconds, compound, pit, clean in records:
        driver, compound = driver.strip().upper(), compound.upper()
        if len(driver) != 3 or not driver.isascii() or not driver.isalpha() or number < 1:
            raise ValueError('Invalid driver code or lap number.')
        if seconds is not None and (not math.isfinite(seconds) or seconds <= 0):
            raise ValueError('Lap time must be finite and positive, or blank.')
        if compound not in COMPOUNDS:
            raise ValueError('Unrecognized tyre compound.')
        if (driver, number) in seen:
            raise ValueError('Duplicate driver/lap.')
        seen.add((driver, number))
        parsed.append(Lap(driver=driver, number=number, seconds=seconds, compound=compound, pit=pit, clean=clean))
    if len({l.driver for l in parsed}) < 2:
        raise ValueError('At least two drivers are required.')
    return parsed

@transaction.atomic
def create_race(name, year, circuit, source, laps, replay=None):
    if not 1950 <= year <= 2100:
        raise ValueError('Year must be between 1950 and 2100.')
    if Race.objects.filter(name=name, year=year).exists():
        raise ValueError('Race already exists; choose a new name or remove it in admin.')
    race = Race.objects.create(name=name, year=year, circuit=circuit, source=source, replay=replay)
    for lap in laps:
        lap.race = race
    Lap.objects.bulk_create(laps)
    return race
