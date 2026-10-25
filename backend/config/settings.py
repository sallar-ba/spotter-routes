"""Django settings. Everything deploy-specific comes from environment variables."""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


DEBUG = os.environ.get("DJANGO_DEBUG", "true").lower() == "true"
# Required in production: the app refuses to start without it.
SECRET_KEY = os.environ["DJANGO_SECRET_KEY"] if not DEBUG else os.environ.get("DJANGO_SECRET_KEY", "dev-only-key")
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")

INSTALLED_APPS = [
    "django.contrib.staticfiles",
    "rest_framework",
    "planner",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",  # above WhiteNoise so the app page gets it too
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

# Stateless API: no database, no auth, no sessions.
DATABASES = {}

# Short-lived cache for third-party responses; it also backs the API rate limits.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "OPTIONS": {"MAX_ENTRIES": 10_000},  # an 11-day forecast for one point is ~10 KB
    }
}

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": [],
    "UNAUTHENTICATED_USER": None,
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    # Per client IP, plus one cap across all clients that keeps plans inside the free weather quota.
    "DEFAULT_THROTTLE_RATES": {"plan": "10/min", "plan_all": "30/min", "places": "120/min"},
}

# Third-party services.
VALHALLA_URL = os.environ.get("VALHALLA_URL", "https://valhalla1.openstreetmap.de/route")
MAX_TRIP_MILES = int(os.environ.get("MAX_TRIP_MILES", 930))  # public Valhalla routes up to 1,500 km
OPEN_METEO_API_KEY = os.environ.get("OPEN_METEO_API_KEY", "")
MAX_WEATHER_POINTS = int(os.environ.get("MAX_WEATHER_POINTS", 550))  # free Open-Meteo: 600 locations/min

# Request header holding the real client IP, set by the proxy in front of the app
# (HTTP_CF_CONNECTING_IP behind Cloudflare). Empty means use the connection address.
CLIENT_IP_HEADER = os.environ.get("CLIENT_IP_HEADER", "")

# The built React app is served from the same origin as the API.
STATIC_URL = "static/"
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"
WHITENOISE_ROOT = FRONTEND_DIST if FRONTEND_DIST.exists() else None
WHITENOISE_INDEX_FILE = True


def WHITENOISE_IMMUTABLE_FILE_TEST(path: str, url: str) -> bool:
    return url.startswith("/assets/")  # Vite fingerprints these file names


# HTTPS is terminated by the hosting proxy.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SILENCED_SYSTEM_CHECKS = ["security.W005", "security.W008", "security.W021"]  # the host redirects to HTTPS
if not DEBUG:
    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30
    CSRF_COOKIE_SECURE = True

USE_TZ = True
TIME_ZONE = "UTC"

LOGGING = {
    "version": 1,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
