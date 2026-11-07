import math
import tempfile
from pathlib import Path
from django.contrib.auth.models import User
from django.core.management import call_command, CommandError
from django.test import TestCase, Client
from .importing import build_laps, create_race
from .models import Race, Lap, Bookmark
from .services import summarize
from . import openf1

class RacingTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_demo', verbosity=0)
        cls.race = Race.objects.first()
        cls.user = User.objects.create_user('dev', password='Strong-test-pass-2026')

    def params(self):
        return {'race': self.race.pk, 'a': 'VER', 'b': 'NOR'}

    def test_dashboard_and_api(self):
        self.assertContains(self.client.get('/'), 'Every lap tells')
        response = self.client.get('/api/comparison/', self.params())
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data['drivers']), 2)
        self.assertEqual(data['source'], 'Simulated demo data')

    def test_invalid_selection(self):
        for params in [{}, {**self.params(), 'a': 'NOR'}, {**self.params(), 'a': 'XXX'}, {**self.params(), 'race': 'bad'}]:
            self.assertEqual(self.client.get('/api/comparison/', params).status_code, 400)
        self.assertEqual(self.client.get('/api/comparison/', {**self.params(), 'race': 99999}).status_code, 404)

    def test_clean_pace_and_same_compound_stop(self):
        laps = [Lap(driver='AAA', number=1, seconds=90, compound='HARD'), Lap(driver='AAA', number=2, seconds=115, compound='HARD', pit=True), Lap(driver='AAA', number=3, seconds=91, compound='HARD'), Lap(driver='AAA', number=4, seconds=None, compound='HARD'), Lap(driver='AAA', number=5, seconds=80, compound='HARD', clean=False)]
        result = summarize(laps)
        self.assertEqual(result['median'], 90.5)
        self.assertEqual(result['fastest'], 90)
        self.assertEqual(result['clean_count'], 2)
        self.assertEqual(len(result['stints']), 2)
        self.assertEqual(result['stints'][1]['start'], 3)

    def test_missing_times_and_gaps(self):
        result = summarize([Lap(driver='AAA', number=1, seconds=None, compound='SOFT'), Lap(driver='AAA', number=3, seconds=None, compound='SOFT')])
        self.assertIsNone(result['median'])
        self.assertEqual(len(result['stints']), 2)

    def test_seed_is_idempotent(self):
        before = Lap.objects.count()
        call_command('seed_demo', verbosity=0)
        self.assertEqual(Lap.objects.count(), before)

    def test_bookmark_auth_and_isolation(self):
        self.assertEqual(self.client.post('/bookmarks/', self.params()).status_code, 302)
        self.assertFalse(Bookmark.objects.exists())
        self.client.force_login(self.user)
        for _ in range(2):
            self.assertEqual(self.client.post('/bookmarks/', self.params()).status_code, 302)
        self.assertEqual(Bookmark.objects.filter(user=self.user).count(), 1)
        self.assertEqual(self.client.get('/bookmarks/').status_code, 405)
        other = User.objects.create_user('other')
        self.client.force_login(other)
        self.assertContains(self.client.get('/'), 'Your saved comparisons will appear here.')

    def test_csrf_enforced(self):
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.user)
        self.assertEqual(client.post('/bookmarks/', self.params()).status_code, 403)

    def test_signup_login_logout(self):
        self.assertEqual(self.client.get('/signup/').status_code, 200)
        response = self.client.post('/signup/', {'username': 'newdev', 'password1': 'Test-racing-9082-pass', 'password2': 'Test-racing-9082-pass'})
        self.assertEqual(response.status_code, 302)
        self.assertContains(self.client.get('/'), 'newdev')
        self.client.post('/accounts/logout/')
        self.assertContains(self.client.get('/'), 'Sign in')

    def test_import_atomic_validation(self):
        count = Race.objects.count()
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / 'laps.csv'
            file.write_text('driver,lap,seconds,compound,pit,clean\nAAA,1,90,HARD,0,1\nBBB,1,nan,HARD,0,1\n')
            with self.assertRaises(CommandError):
                call_command('import_race', str(file), name='Test', year=2024, circuit='Test', source='Test fixture')
            self.assertEqual(Race.objects.count(), count)
            file.write_text('driver,lap,seconds,compound,pit,clean\nAAA,1,90,HARD,0,1\nBBB,1,,HARD,0,1\n')
            call_command('import_race', str(file), name='Test', year=2024, circuit='Test', source='Test fixture')
            self.assertEqual(Race.objects.get(name='Test').laps.count(), 2)
            with self.assertRaises(CommandError):
                call_command('import_race', str(file), name='Test', year=2024, circuit='Test', source='Test fixture')

class OpenF1TransformTests(TestCase):
    drivers = [{'driver_number': 4, 'name_acronym': 'NOR', 'first_name': 'Lando', 'last_name': 'Norris', 'team_name': 'McLaren', 'team_colour': 'F47600'}, {'driver_number': 16, 'name_acronym': 'LEC'}]
    stints = [{'driver_number': 4, 'stint_number': 1, 'lap_start': 1, 'lap_end': 3, 'compound': 'MEDIUM'}, {'driver_number': 4, 'stint_number': 2, 'lap_start': 4, 'lap_end': 8, 'compound': 'HARD'}, {'driver_number': 16, 'stint_number': 1, 'lap_start': 1, 'lap_end': 8, 'compound': 'SOFT'}]
    messages = [{'date': '2025-05-25T13:10:00', 'lap_number': 5, 'category': 'SafetyCar', 'message': 'VIRTUAL SAFETY CAR DEPLOYED'}, {'date': '2025-05-25T13:12:00', 'lap_number': 5, 'category': 'SafetyCar', 'message': 'VIRTUAL SAFETY CAR ENDING'}]

    def laps(self):
        times = {1: 80, 2: 75, 3: 90, 4: 76, 5: 95, 6: 75.5, 7: 99, 8: None}
        return [{'driver_number': n, 'lap_number': lap, 'lap_duration': t, 'is_pit_out_lap': n == 4 and lap == 4} for n in (4, 16) for lap, t in times.items()]

    def test_records_flag_pits_neutralised_laps_and_outliers(self):
        records = {(r[0], r[1]): r for r in openf1.build_records(self.drivers, self.laps(), self.stints, self.messages)}
        self.assertEqual(records[('NOR', 3)][3:], ('MEDIUM', True, False))   # in-lap: pit, not clean
        self.assertEqual(records[('NOR', 4)][3:], ('HARD', False, False))    # out-lap
        self.assertFalse(records[('NOR', 5)][5])                             # under VSC
        self.assertFalse(records[('NOR', 6)][5])                             # restart lap after VSC
        self.assertFalse(records[('LEC', 7)][5])                             # >110% of median
        self.assertTrue(records[('LEC', 2)][5])
        self.assertIsNone(records[('NOR', 8)][2])
        self.assertFalse(records[('NOR', 1)][5])
        self.assertEqual(len(build_laps(records.values())), 16)

    def test_unclosed_safety_car_runs_to_the_end(self):
        self.assertIn(40, openf1.neutralised_laps([{'date': 'a', 'lap_number': 30, 'category': 'SafetyCar', 'message': 'SAFETY CAR DEPLOYED'}]))

    def test_replay_fits_viewbox_and_colours_sectors(self):
        lap = {'driver_number': 4, 'lap_number': 2, 'date_start': '2025-05-25T13:00:00+00:00', 'lap_duration': 72.0, 'duration_sector_1': 20.0, 'duration_sector_2': 30.0, 'duration_sector_3': 22.0}
        others = [lap, {'driver_number': 16, 'duration_sector_1': 19.5, 'duration_sector_2': 31.0, 'duration_sector_3': 22.5}, {'driver_number': 4, 'duration_sector_1': 21.0, 'duration_sector_2': 30.5, 'duration_sector_3': 21.5}]
        locations = [{'date': f'2025-05-25T13:00:{i * 2:02d}+00:00', 'x': 1000 * math.cos(i / 5), 'y': 400 * math.sin(i / 5), 'z': 500 + i} for i in range(30)]
        car = [{'date': '2025-05-25T13:00:36+00:00', 'speed': 280, 'throttle': 100, 'brake': 0, 'n_gear': 8}]
        replay = openf1.build_replay(lap, locations, car, others, self.drivers[0], [{'position': 2, 'driver_number': 16}, {'position': 1, 'driver_number': 4}], 'Monte Carlo', {4: 'NOR', 16: 'LEC'})
        self.assertEqual(replay['sector_colours'], ['green', 'purple', 'yellow'])
        self.assertEqual(replay['podium'], ['NOR', 'LEC'])
        self.assertEqual(replay['telemetry'], [[0.5, 280, 100, 0, 8]])
        for _, x, y, z in replay['track']:
            self.assertTrue(0 <= x <= 480 and 0 <= y <= 290 and z >= 0)
        self.assertEqual(replay['track'][0][3], 0)
        self.assertGreater(replay['track'][-1][3], 0)
        self.assertEqual(replay['colour'], '#F47600')

    def test_replay_endpoint(self):
        race = create_race('Fixture Grand Prix', 2025, 'Test', 'Fixture', build_laps([('AAA', 1, 90.0, 'SOFT', False, True), ('BBB', 1, 91.0, 'SOFT', False, True)]), {'track': [], 'podium': ['AAA']})
        self.assertEqual(self.client.get(f'/api/races/{race.pk}/replay/').json()['podium'], ['AAA'])
        plain = create_race('Plain Grand Prix', 2025, 'Test', 'Fixture', build_laps([('AAA', 1, 90.0, 'SOFT', False, True), ('BBB', 1, 91.0, 'SOFT', False, True)]))
        self.assertEqual(self.client.get(f'/api/races/{plain.pk}/replay/').status_code, 404)
