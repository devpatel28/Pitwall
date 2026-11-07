from urllib.error import URLError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from racing.importing import build_laps, create_race
from racing.models import Race
from racing import openf1

DEFAULT_CIRCUITS = ['Monte Carlo', 'Silverstone', 'Monza', 'Spa-Francorchamps', 'Las Vegas', 'Yas Marina Circuit']

class Command(BaseCommand):
    help = 'Import Grand Prix race laps and a fastest-lap replay from OpenF1; races already imported are skipped.'
    def add_arguments(self, parser):
        parser.add_argument('circuits', nargs='*', default=DEFAULT_CIRCUITS, help='OpenF1 circuit_short_name values')
        parser.add_argument('--year', type=int, default=2025)
        parser.add_argument('--replace', action='store_true', help='Re-import races that already exist (their bookmarks are removed too)')
    def handle(self, *args, **opts):
        for circuit in opts['circuits']:
            try:
                self.import_one(circuit, opts['year'], opts['replace'])
            except (URLError, OSError, ValueError, KeyError, TypeError) as error:
                raise CommandError(f'{circuit}: {error}') from error
    def import_one(self, circuit, year, replace=False):
        sessions = [s for s in openf1.fetch('sessions', {'year': year, 'session_name': 'Race', 'circuit_short_name': circuit}) if not s.get('is_cancelled')]
        if not sessions:
            raise ValueError('No race session found on OpenF1.')
        session = sessions[0]
        key = session['session_key']
        meeting = openf1.fetch('meetings', {'meeting_key': session['meeting_key']})
        name = meeting[0]['meeting_name'] if meeting else f'{circuit} Grand Prix'
        existing = Race.objects.filter(name=name, year=year)
        if existing.exists() and not replace:
            self.stdout.write(f'{year} {name} already imported; skipping.')
            return
        self.stdout.write(f'Fetching {year} {name} (session {key})')
        drivers = openf1.fetch('drivers', {'session_key': key})
        laps = openf1.fetch('laps', {'session_key': key})
        stints = openf1.fetch('stints', {'session_key': key})
        messages = openf1.fetch('race_control', {'session_key': key})
        results = openf1.fetch('session_result', {'session_key': key})
        lap_objects = build_laps(openf1.build_records(drivers, laps, stints, messages))
        fastest = openf1.fastest_lap(laps)
        replay = None
        if fastest:
            start, end = openf1.lap_window(fastest)
            window = {'session_key': key, 'driver_number': fastest['driver_number'], 'date>=': start, 'date<=': end}
            driver = next(d for d in drivers if d['driver_number'] == fastest['driver_number'])
            codes = {d['driver_number']: d['name_acronym'] for d in drivers if d.get('name_acronym')}
            replay = openf1.build_replay(fastest, openf1.fetch('location', window), openf1.fetch('car_data', window), laps, driver, results, session['circuit_short_name'], codes)
        total = max(l.number for l in lap_objects)
        with transaction.atomic():  # a failed replacement keeps the old race
            existing.delete()
            create_race(name, year, f"{session['circuit_short_name']} · {total} laps", f'OpenF1 session {key} · unofficial timing data', lap_objects, replay)
        self.stdout.write(self.style.SUCCESS(f'Imported {year} {name}: {len(lap_objects)} laps, replay {"ready" if replay else "unavailable"}.'))
