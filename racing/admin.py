from django.contrib import admin
from .models import Race, Lap, Bookmark
admin.site.register([Race, Lap, Bookmark])
