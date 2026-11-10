import json
import shutil
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.test import Client, override_settings

from racing.models import Race
from racing.services import summarize


class Command(BaseCommand):
    help = 'Write a read-only static copy of the race explorer (for GitHub Pages) to an output folder.'

    def add_arguments(self, parser):
        parser.add_argument('output', nargs='?', default='_site', help='Folder to write the site to (default: _site)')

    def handle(self, *args, **options):
        out = Path(options['output']).resolve()
        races = list(Race.objects.all())
        if not races:
            raise CommandError('No races in the database. Run import_openf1 or seed_demo first.')
        if out.exists():
            shutil.rmtree(out)
        (out / 'data' / 'races').mkdir(parents=True)
        (out / 'data' / 'replays').mkdir(parents=True)

        with override_settings(STATIC_EXPORT=True, ALLOWED_HOSTS=['localhost']):
            response = Client().get('/', HTTP_HOST='localhost')
        if response.status_code != 200:
            raise CommandError(f'Rendering the dashboard failed (HTTP {response.status_code}).')
        html = response.content.decode('utf-8')
        html = html.replace('"/static/', '"./static/').replace("'/static/", "'./static/")
        (out / 'index.html').write_text(html, encoding='utf-8')

        replays = 0
        for race in races:
            drivers = race.laps.order_by('driver').values_list('driver', flat=True).distinct()
            data = {
                'race': str(race),
                'source': race.source,
                'drivers': {d: summarize(list(race.laps.filter(driver=d))) for d in drivers},
            }
            (out / 'data' / 'races' / f'{race.pk}.json').write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8')
            if race.replay:
                (out / 'data' / 'replays' / f'{race.pk}.json').write_text(json.dumps(race.replay, separators=(',', ':')), encoding='utf-8')
                replays += 1

        for folder in settings.STATICFILES_DIRS:
            shutil.copytree(folder, out / 'static', dirs_exist_ok=True)
        (out / '.nojekyll').touch()
        self.stdout.write(self.style.SUCCESS(f'Static site written to {out}: {len(races)} races, {replays} replays.'))
