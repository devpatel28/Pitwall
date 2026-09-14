from django.contrib.auth import login
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import UserCreationForm
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_GET, require_POST
from .models import Bookmark, Race
from .services import summarize

def selection(params):
    try:
        race_id = int(params.get('race', ''))
    except (TypeError, ValueError):
        raise ValueError('Choose a valid race.')
    race = get_object_or_404(Race, pk=race_id)
    drivers = list(race.laps.order_by('driver').values_list('driver', flat=True).distinct())
    a, b = params.get('a'), params.get('b')
    if a not in drivers or b not in drivers or a == b:
        raise ValueError('Choose two different drivers from this race.')
    return race, a, b

@require_GET
def dashboard(request):
    races = list(Race.objects.all())
    catalog = [{'id': r.id, 'name': str(r), 'circuit': r.circuit, 'source': r.source, 'drivers': list(r.laps.order_by('driver').values_list('driver', flat=True).distinct())} for r in races]
    saved = Bookmark.objects.filter(user=request.user).select_related('race') if request.user.is_authenticated else []
    return render(request, 'dashboard.html', {'catalog': catalog, 'saved': saved})

@require_GET
def comparison(request):
    try:
        race, a, b = selection(request.GET)
    except ValueError as error:
        return JsonResponse({'error': str(error)}, status=400)
    return JsonResponse({'race': str(race), 'source': race.source, 'drivers': [summarize(list(race.laps.filter(driver=d))) for d in (a, b)]})

@login_required
@require_POST
def bookmark(request):
    try:
        race, a, b = selection(request.POST)
    except ValueError as error:
        return JsonResponse({'error': str(error)}, status=400)
    Bookmark.objects.get_or_create(user=request.user, race=race, driver_a=a, driver_b=b)
    return redirect(f'/?race={race.pk}&a={a}&b={b}')

def signup(request):
    form = UserCreationForm(request.POST or None)
    if request.method == 'POST' and form.is_valid():
        login(request, form.save())
        return redirect('dashboard')
    return render(request, 'registration/signup.html', {'form': form})
