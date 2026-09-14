import math
from django.core.management.base import BaseCommand
from django.db import transaction
from racing.models import Race, Lap

class Command(BaseCommand):
    help = 'Create deterministic fictional race data; never overwrites an existing race.'
    @transaction.atomic
    def handle(self, *args, **options):
        for name, circuit, count, base in [('Bahrain Demo Grand Prix', 'Sakhir · 57 laps', 57, 94), ('Italian Demo Grand Prix', 'Monza · 53 laps', 53, 83)]:
            race, created = Race.objects.get_or_create(name=name, year=2024, defaults={'circuit': circuit})
            if not created:
                continue
            laps = []
            for index, driver in enumerate(['VER', 'NOR', 'LEC', 'HAM']):
                stops = [18 + index * 2, 38 + index] if count == 57 else [22 + index * 2]
                for number in range(1, count + 1):
                    stint = sum(number > stop for stop in stops)
                    age = number - max([0] + [s for s in stops if s < number])
                    pit = number in stops
                    seconds = base + index * .17 + age * .045 - number * .025 + math.sin(number * 1.7 + index) * .35 + (22 if pit else 0) + (5 if number == 1 else 0)
                    laps.append(Lap(race=race, driver=driver, number=number, seconds=round(seconds, 3), compound=['MEDIUM', 'HARD', 'SOFT'][stint], pit=pit, clean=number != 1))
            Lap.objects.bulk_create(laps)
        self.stdout.write(self.style.SUCCESS('Demo races ready (all lap times are simulated).'))
