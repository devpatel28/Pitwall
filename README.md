# Pitwall — F1 Race Strategy Explorer

A Django application by Dev Patel for comparing lap pace and tyre strategy. Explore two drivers side by side, filter unrepresentative laps, inspect tyre stints, and save comparisons to your account.

**Status:** working first version. Included race times and strategies are entirely simulated, including the driver comparisons. They are not historical F1 results. Real data can be imported through a validated CSV command. No prediction engine or live timing integration is included yet.

## Start with Docker

Install Docker Desktop, start it, then open a terminal in this directory:

```sh
docker compose up --build
```

Open http://localhost:8000. Compose starts PostgreSQL, applies migrations, loads two demo races, collects static assets and starts Gunicorn. Create an account in the app to save comparisons. No shared demo password is provided.

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
python manage.py seed_demo
python manage.py runserver
```

Visit http://127.0.0.1:8000. To stop the local server, press Ctrl+C. Gunicorn is used inside Linux Docker containers; the local development server works on Windows.

## What is implemented

- Responsive dashboard with two demo races and four driver codes per race.
- Custom SVG lap-time chart, clean-lap filter, tyre-stint timeline, accessible lap table.
- Account creation, login, POST-only logout, CSRF-protected user-specific bookmarks.
- Race/lap database models and Django admin.
- JSON comparison endpoint with selection validation.
- Atomic, validated CSV import; idempotent demo seeding.
- Django tests and a GitHub Actions workflow configured to test with PostgreSQL.
- Docker Compose with PostgreSQL health checks and a non-root web container.

## Analysis definitions

Median and fastest pace use only laps with a positive time, `clean=1` and `pit=0`. Missing times remain missing; they are never replaced with zero. Chart lines break across missing or excluded laps. Stints split at compound changes, after pit laps, and at gaps in recorded lap numbers. The importer expects a pit marker on the **in-lap**, with the new stint starting on the following lap. Same-compound tyre changes are supported.

Median pace is descriptive. It is not adjusted for fuel, traffic, safety cars, weather or tyre age. A faster median does not prove a better strategy or predict the race result. Data importers must mark safety-car laps, out-laps and other unsuitable laps as `clean=0` where appropriate.

## Import race data

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

Returns `race`, `source`, and two `drivers` entries containing lap records, `median`, `fastest`, `clean_count`, `stops`, and `stints`. Invalid selections return 400; unknown races return 404. The race catalog is embedded in the dashboard using Django's safe JSON script mechanism.

## Project structure

```text
config/                  Django settings and routes
racing/models.py         Races, laps and bookmarks
racing/services.py       Pace and stint calculations
racing/views.py          Dashboard, comparison API and accounts
racing/management/       Demo seed and CSV import commands
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

1. Add a provider adapter for historical race data with provenance and caching.
2. Add a pit-stop scenario simulator with explicit assumptions and uncertainty.
3. Deploy a public demo and add screenshots plus measured engineering outcomes to the portfolio.

Official references: [Django](https://docs.djangoproject.com/en/5.2/), [Docker Compose](https://docs.docker.com/compose/).

Independent educational portfolio project; not affiliated with Formula 1 or its teams.
