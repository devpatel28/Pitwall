import tempfile
from pathlib import Path
from django.contrib.auth.models import User
from django.core.management import call_command, CommandError
from django.test import TestCase, Client
from .models import Race, Lap, Bookmark
from .services import summarize

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
