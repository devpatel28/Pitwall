# Pitwall — F1 Race Strategy Explorer

**[Live demo → devpatel28.github.io/Pitwall](https://devpatel28.github.io/Pitwall/)**

Pitwall compares two Formula 1 drivers across a race using real 2025 timing data: who was faster, how their tyre strategies differed, how quickly each set of tyres wore out, and where the race was won. Built by Dev Patel with Django, PostgreSQL and dependency-free JavaScript.

## What you can do

- **Compare lap pace:** both drivers' lap times on one chart, with pit, safety-car, first-lap and outlier laps filtered out, plus median and fastest clean pace.
- **Follow the gap:** the cumulative time between the two drivers lap by lap, with pit stops marked, the largest lead each way and the final margin.
- **Read the tyre strategy:** each stint's compound and length, and its **degradation**: the seconds lost per lap as the tyres aged.
- **Watch the fastest lap:** a replay on the real circuit outline with sector times and speed, throttle, brake and gear telemetry.
- **Save comparisons** to an account (full app only; the live demo is read-only).

Races: the 2025 Monaco, British, Belgian, Italian, Las Vegas and Abu Dhabi Grands Prix, imported from [OpenF1](https://openf1.org), an unofficial, community-run timing API. Other races can be imported with the same command or from a validated CSV. There is no prediction engine or live timing.

## How the live demo is built

GitHub Pages only serves static files, so on every push to `main` the *Deploy demo to GitHub Pages* workflow imports the races from OpenF1, runs `python manage.py export_site _site` to pre-render the dashboard and write each race's driver data and replay as JSON, and publishes the result. If the import fails, nothing is deployed and the previous version stays live. Build the same copy locally with `python manage.py export_site`.

## Start with Docker

Install Docker Desktop, start it, then open a terminal in this directory:

```sh
docker compose up --build
```

Open http://localhost:8000. Compose starts PostgreSQL, applies migrations, imports the 2025 races from OpenF1 (about two minutes on first start, needs internet; falls back to simulated demo races), collects static assets and starts Gunicorn. Create an account in the app to save comparisons. No shared demo password is provided.

```sh
docker compose exec web python manage.py test
docker compose exec web python manage.py createsuperuser
docker compose down
```

Database records persist in a Docker volume when containers stop.

## Run locally without Docker

Python 3.12 recommended. SQLite is used when POSTGRES_HOST is unset.

```sh
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py import_openf1   # 2025 Monaco, Silverstone, Spa, Monza, Las Vegas, Abu Dhabi; or: python manage.py seed_demo (offline)
python manage.py runserver
```

Visit http://127.0.0.1:8000. To stop the local server, press Ctrl+C. Gunicorn is used inside Linux Docker containers; the local development server works on Windows.

## Run in GitHub Codespaces

On the repository page, click **Code → Codespaces → Create codespace on main**. The first launch takes a few minutes: it installs dependencies, migrates, imports the OpenF1 races (falling back to simulated demo races if OpenF1 is unreachable) and opens the app. The forwarded port is private to your GitHub account; keep it that way, because sign-up is open.

## What is implemented

- Responsive dashboard with real 2025 races and every classified driver; defaults to Monaco, comparing the winner and runner-up.
- 3D background (`static/scene.js`, dependency-free canvas projection): perspective grid floor and the selected circuit with real elevation from car position data, with the replayed car; the camera orbits slowly, follows the pointer and tilts toward a plan view on scroll.
- Hero replay of each race's fastest lap: circuit drawn from car position data, real sector times in F1 timing colours, and speed/throttle/brake telemetry synced to the car. It follows the race selected in the explorer.
- Motion layer (`static/motion.js`, `static/motion.css`): start-light sequence, page view transitions, scroll reveals, animated chart, metrics and stints, and a lap scrubber. All of it respects `prefers-reduced-motion`.
- Custom SVG lap-time chart, clean-lap filter, tyre-stint timeline, accessible lap table.
- Gap-over-race chart and per-stint tyre degradation cards, each with a one-line written summary.
- Account creation, login, POST-only logout, CSRF-protected user-specific bookmarks.
- Race/lap database models and Django admin.
- JSON comparison endpoint with selection validation.
- OpenF1 importer (`racing/openf1.py`) with rate limiting and retries; shared validation (`racing/importing.py`) for OpenF1 and atomic CSV imports; idempotent demo seeding.
- Django tests and a GitHub Actions workflow configured to test with PostgreSQL.
- Static export (`export_site`) and a GitHub Actions workflow that publishes the read-only demo to GitHub Pages.
- Docker Compose with PostgreSQL health checks and a non-root web container.

## Analysis definitions

Median and fastest pace use only laps with a positive time, `clean=1` and `pit=0`. Missing times remain missing; they are never replaced with zero. Chart lines break across missing or excluded laps. Stints split at compound changes, after pit laps, and at gaps in recorded lap numbers. The importer expects a pit marker on the **in-lap**, with the new stint starting on the following lap. Same-compound tyre changes are supported.

**Tyre degradation** is the slope of a least-squares line through a stint's clean lap times, in seconds per lap; positive means the driver got slower as the tyres aged. Stints with fewer than 5 clean laps are not rated. Cars get lighter as fuel burns, which makes them faster through a stint, so the figure understates pure tyre wear; it is best compared between stints of the same race.

**Gap over the race** sums both drivers' lap times from the first lap they both have a time, so grid position and the standing start are not included. If either driver has a missing lap time later on, the line stops there rather than guessing.

Median pace is descriptive. It is not adjusted for fuel, traffic, safety cars, weather or tyre age. A faster median does not prove a better strategy or predict the race result. Data importers must mark safety-car laps, out-laps and other unsuitable laps as `clean=0` where appropriate.

## Import race data

### From OpenF1

```sh
python manage.py import_openf1                         # default 2025 races
python manage.py import_openf1 Suzuka "Las Vegas" --year 2025
```

Arguments are OpenF1 `circuit_short_name` values. Races already imported are skipped. Requests are spaced to respect OpenF1's free rate limit. For each race the importer marks the pit marker on each stint's in-lap and flags lap 1, pit in- and out-laps, safety car, virtual safety car and red flag laps (plus the restart lap), and laps slower than 110% of that driver's median as not clean. It also stores a replay of the fastest lap: track outline and elevation from car positions, telemetry, sector splits, timing colours (purple: best of the race; green: driver's best; yellow: slower) and the podium. OpenF1 data is unofficial; check its terms before any commercial use.

### From CSV

CSV columns must be exactly:

```csv
driver,lap,seconds,compound,pit,clean
AAA,1,94.125,MEDIUM,0,0
AAA,2,91.732,MEDIUM,0,1
BBB,1,95.230,HARD,0,0
BBB,2,,HARD,0,0
```

```sh
python manage.py import_race path/to/laps.csv --name "Race name" --year 2024 --circuit "Circuit name" --source "Provider and dataset reference"
```

Driver codes are three ASCII letters. Lap numbers are positive integers. Times are positive finite seconds or blank. Compounds: SOFT, MEDIUM, HARD, INTERMEDIATE, WET, UNKNOWN. Boolean columns use 0 or 1. Duplicate driver/lap rows and races are rejected. The complete file is validated before writing, and an error rolls back the import. At least two drivers are required. Use data you have permission to use and retain its source attribution.

## API

`GET /api/comparison/?race=1&a=VER&b=NOR`

Returns `race`, `source`, and two `drivers` entries containing lap records, `median`, `fastest`, `clean_count`, `stops`, and `stints`. Each stint has a `trend` (`per_lap`, `laps`, `intercept`) when it has at least 5 clean laps, otherwise `null`. Invalid selections return 400; unknown races return 404. The race catalog is embedded in the dashboard using Django's safe JSON script mechanism.

## Project structure

```text
config/                  Django settings and routes
racing/models.py         Races, laps and bookmarks
racing/services.py       Pace, stint and degradation calculations
racing/views.py          Dashboard, comparison API and accounts
racing/management/       OpenF1 and CSV import, demo seed, static export
racing/tests.py          Data, calculation and account tests
templates/               Django pages
static/                  CSS and dependency-free chart JavaScript
```

## Validation

```sh
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py test
```

The local Compose configuration is for development. Before public deployment, set DEBUG=0, generate a strong SECRET_KEY, configure ALLOWED_HOSTS and HTTPS/cookie settings, use managed secrets and add login throttling. Do not deploy the example credentials. Password reset email delivery is not configured.

## Next milestones

1. Fuel-corrected degradation, with the assumed fuel effect shown and adjustable.
2. A pit-stop scenario simulator ("what if they had pitted two laps earlier?") with explicit assumptions and uncertainty.
3. Safety-car and VSC periods shaded on the gap and lap charts.

Official references: [Django](https://docs.djangoproject.com/en/5.2/), [Docker Compose](https://docs.docker.com/compose/).

Independent educational portfolio project; not affiliated with Formula 1 or its teams.
