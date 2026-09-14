from django.conf import settings
from django.db import models

class Race(models.Model):
    name = models.CharField(max_length=100)
    year = models.PositiveIntegerField()
    circuit = models.CharField(max_length=100)
    source = models.CharField(max_length=250, default='Simulated demo data')
    class Meta:
        constraints = [models.UniqueConstraint(fields=['name', 'year'], name='unique_race')]
        ordering = ['-year', 'name']
    def __str__(self):
        return f'{self.year} {self.name}'

class Lap(models.Model):
    race = models.ForeignKey(Race, on_delete=models.CASCADE, related_name='laps')
    driver = models.CharField(max_length=3)
    number = models.PositiveIntegerField()
    seconds = models.FloatField(null=True, blank=True)
    compound = models.CharField(max_length=12)
    pit = models.BooleanField(default=False)
    clean = models.BooleanField(default=True)
    class Meta:
        ordering = ['driver', 'number']
        constraints = [models.UniqueConstraint(fields=['race', 'driver', 'number'], name='unique_driver_lap'), models.CheckConstraint(condition=models.Q(number__gte=1), name='positive_lap'), models.CheckConstraint(condition=models.Q(seconds__gt=0) | models.Q(seconds__isnull=True), name='positive_time')]

class Bookmark(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    race = models.ForeignKey(Race, on_delete=models.CASCADE)
    driver_a = models.CharField(max_length=3)
    driver_b = models.CharField(max_length=3)
    class Meta:
        constraints = [models.UniqueConstraint(fields=['user', 'race', 'driver_a', 'driver_b'], name='unique_bookmark')]
