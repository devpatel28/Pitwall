import csv
from django.core.management.base import BaseCommand, CommandError
from racing.importing import build_laps, create_race

class Command(BaseCommand):
    help = 'Import validated race CSV atomically; existing races are not overwritten.'
    def add_arguments(self, parser):
        parser.add_argument('file')
        parser.add_argument('--name', required=True)
        parser.add_argument('--year', required=True, type=int)
        parser.add_argument('--circuit', required=True)
        parser.add_argument('--source', required=True)
    def handle(self, *args, **opts):
        try:
            with open(opts['file'], newline='', encoding='utf-8-sig') as stream:
                reader = csv.DictReader(stream)
                if set(reader.fieldnames or []) != {'driver', 'lap', 'seconds', 'compound', 'pit', 'clean'}:
                    raise ValueError('Expected columns: driver,lap,seconds,compound,pit,clean')
                records = []
                for row in reader:
                    if row['pit'] not in ['0', '1'] or row['clean'] not in ['0', '1']:
                        raise ValueError('pit and clean must be 0 or 1.')
                    records.append((row['driver'], int(row['lap']), float(row['seconds']) if row['seconds'].strip() else None, row['compound'], row['pit'] == '1', row['clean'] == '1'))
            laps = build_laps(records)
            create_race(opts['name'], opts['year'], opts['circuit'], opts['source'], laps)
        except (OSError, ValueError, TypeError, KeyError) as error:
            raise CommandError(str(error)) from error
        self.stdout.write(self.style.SUCCESS(f'Imported {len(laps)} laps.'))
