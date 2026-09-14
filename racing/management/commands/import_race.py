import csv
import math
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from racing.models import Race, Lap

class Command(BaseCommand):
    help = 'Import validated race CSV atomically; existing races are not overwritten.'
    def add_arguments(self, parser):
        parser.add_argument('file')
        parser.add_argument('--name', required=True)
        parser.add_argument('--year', required=True, type=int)
        parser.add_argument('--circuit', required=True)
        parser.add_argument('--source', required=True)
    @transaction.atomic
    def handle(self, *args, **opts):
        if not 1950 <= opts['year'] <= 2100:
            raise CommandError('Year must be between 1950 and 2100.')
        if Race.objects.filter(name=opts['name'], year=opts['year']).exists():
            raise CommandError('Race already exists; choose a new name or remove it in admin.')
        parsed, seen = [], set()
        try:
            with open(opts['file'], newline='', encoding='utf-8-sig') as stream:
                reader = csv.DictReader(stream)
                if set(reader.fieldnames or []) != {'driver', 'lap', 'seconds', 'compound', 'pit', 'clean'}:
                    raise ValueError('Expected columns: driver,lap,seconds,compound,pit,clean')
                for row in reader:
                    driver = row['driver'].strip().upper()
                    number = int(row['lap'])
                    seconds = float(row['seconds']) if row['seconds'].strip() else None
                    compound = row['compound'].upper()
                    if len(driver) != 3 or not driver.isascii() or not driver.isalpha() or number < 1:
                        raise ValueError('Invalid driver code or lap number.')
                    if seconds is not None and (not math.isfinite(seconds) or seconds <= 0):
                        raise ValueError('Lap time must be finite and positive, or blank.')
                    if compound not in ['SOFT', 'MEDIUM', 'HARD', 'INTERMEDIATE', 'WET', 'UNKNOWN']:
                        raise ValueError('Unrecognized tyre compound.')
                    if row['pit'] not in ['0', '1'] or row['clean'] not in ['0', '1']:
                        raise ValueError('pit and clean must be 0 or 1.')
                    if (driver, number) in seen:
                        raise ValueError('Duplicate driver/lap.')
                    seen.add((driver, number))
                    parsed.append(Lap(driver=driver, number=number, seconds=seconds, compound=compound, pit=row['pit'] == '1', clean=row['clean'] == '1'))
            if len({l.driver for l in parsed}) < 2:
                raise ValueError('At least two drivers are required.')
        except (OSError, ValueError, TypeError, KeyError) as error:
            raise CommandError(str(error)) from error
        race = Race.objects.create(name=opts['name'], year=opts['year'], circuit=opts['circuit'], source=opts['source'])
        for lap in parsed:
            lap.race = race
        Lap.objects.bulk_create(parsed)
        self.stdout.write(self.style.SUCCESS(f'Imported {len(parsed)} laps.'))
