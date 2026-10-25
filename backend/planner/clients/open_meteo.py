"""Hourly forecasts from Open-Meteo, fetched in parallel batches and cached per point."""

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

from django.conf import settings
from django.core.cache import cache

from ..geo import LatLon
from ..risk import Weather
from .http import CACHE_SECONDS, ProviderError, request_json

FREE_URL = "https://api.open-meteo.com/v1/forecast"
CUSTOMER_URL = "https://customer-api.open-meteo.com/v1/forecast"
BATCH_SIZE = 200  # locations per request
WINDOW_HOURS = 11 * 24  # every departure the API accepts (up to 7 days out), plus the trip and heatmap


def fetch_hourly_weather(points: list[LatLon], start: datetime, hours: int) -> dict[LatLon, list[Weather]]:
    """Hourly weather for each point, from `start` (UTC, on the hour) for `hours` hours.

    Each point is fetched once per UTC day for a fixed window, so plans with different
    departure times share the same cached forecasts.
    """
    day = min(start, datetime.now(UTC)).replace(hour=0, minute=0, second=0, microsecond=0)
    offset = (start - day) // timedelta(hours=1)
    window = max(WINDOW_HOURS, offset + hours)

    keys = {(lat, lon): f"weather:{lat},{lon}:{day:%Y%m%d}:{window}" for lat, lon in points}
    found = cache.get_many(keys.values())
    missing = [point for point in points if keys[point] not in found]
    batches = [missing[i : i + BATCH_SIZE] for i in range(0, len(missing), BATCH_SIZE)]

    with ThreadPoolExecutor(max_workers=4) as pool:
        for batch, forecasts in zip(batches, pool.map(lambda b: _fetch(b, day, window), batches)):
            fresh = {keys[point]: forecast for point, forecast in zip(batch, forecasts)}
            cache.set_many(fresh, CACHE_SECONDS)
            found.update(fresh)

    return {point: found[keys[point]][offset : offset + hours] for point in points}


def _fetch(points: list[LatLon], start: datetime, hours: int) -> list[list[Weather]]:
    params = {
        "latitude": ",".join(f"{lat:.2f}" for lat, _ in points),
        "longitude": ",".join(f"{lon:.2f}" for _, lon in points),
        "hourly": "wind_speed_10m,rain,showers,snowfall",
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",  # also switches snowfall to inches
        "timezone": "GMT",
        "start_hour": f"{start:%Y-%m-%dT%H:%M}",
        "end_hour": f"{start + timedelta(hours=hours):%Y-%m-%dT%H:%M}",  # one extra hour, see parse_hourly
    }
    url = FREE_URL
    if settings.OPEN_METEO_API_KEY:
        url, params["apikey"] = CUSTOMER_URL, settings.OPEN_METEO_API_KEY

    data = request_json("GET", url, "Weather service", params=params)
    locations = data if isinstance(data, list) else [data]  # a single location comes back unwrapped
    forecasts = [parse_hourly(location["hourly"]) for location in locations]
    if len(forecasts) != len(points) or any(len(forecast) != hours for forecast in forecasts):
        raise ProviderError("Weather service returned an incomplete forecast.")
    return forecasts


def parse_hourly(hourly: dict) -> list[Weather]:
    """Entry i describes the hour from i to i+1: wind at its start, rain and snow over the hour.

    Open-Meteo reports precipitation as the total of the preceding hour, so it is read from i+1.
    Missing values (null) count as calm weather.
    """
    wind, rain, showers, snow = (hourly[key] for key in ("wind_speed_10m", "rain", "showers", "snowfall"))
    return [
        Weather(
            wind_mph=wind[i] or 0.0,
            rain_in_hr=(rain[i + 1] or 0.0) + (showers[i + 1] or 0.0),
            snow_in_hr=snow[i + 1] or 0.0,
        )
        for i in range(len(wind) - 1)
    ]
