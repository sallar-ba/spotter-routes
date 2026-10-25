"""Turns a trip request into scored route options plus a weather heatmap of the trip corridor.

Flow: routes -> checkpoints with ETAs -> one batched weather fetch -> risk per checkpoint
-> route summaries -> recommendation. The same weather data also feeds the heatmap.
"""

from datetime import datetime, timedelta
from math import ceil

from django.conf import settings
from rest_framework.exceptions import ValidationError

from . import geo
from .clients.open_meteo import fetch_hourly_weather
from .clients.valhalla import Route, fetch_routes
from .risk import Risk, RouteRisk, Weather, assess, checkpoint_miles, recommend, summarize

HEATMAP_HOURS = 48
HEATMAP_CELLS_ACROSS = 20  # grid resolution along the trip's longest side
ROUTE_IDS = "ABC"

Checkpoint = tuple[float, geo.LatLon, float]  # (mile, position, elapsed seconds)


def plan_trip(origin: geo.LatLon, destination: geo.LatLon, departure: datetime, load_lb: int, interval_mi: int) -> dict:
    # 1. Route options, and checkpoints along each one with the truck's elapsed time there.
    routes = fetch_routes(origin, destination)
    checkpoints = [_checkpoints(route, interval_mi) for route in routes]
    cell_deg = _cell_size(routes)
    grid = geo.corridor_grid([route.coords for route in routes], cell_deg)

    # 2. One batched weather fetch covers every checkpoint ETA and the whole heatmap window.
    start = departure.replace(minute=0, second=0, microsecond=0)  # forecasts are hourly
    trip_hours = ceil(((departure - start).total_seconds() + max(r.duration_s for r in routes)) / 3600)
    points = {_snap(position) for marks in checkpoints for _, position, _ in marks} | set(grid)
    if len(points) > settings.MAX_WEATHER_POINTS:
        raise ValidationError({"interval_mi": ["This trip needs too many weather samples. Pick a wider interval."]})
    weather = fetch_hourly_weather(sorted(points), start, max(HEATMAP_HOURS, trip_hours) + 1)

    # 3. Risk at each checkpoint, using the forecast for the hour the truck gets there.
    payloads, scores = [], []
    for route_id, route, marks in zip(ROUTE_IDS, routes, checkpoints):
        stops = []
        for mile, position, elapsed_s in marks:
            eta = departure + timedelta(seconds=round(elapsed_s))
            hour = int((eta - start).total_seconds() // 3600)  # the forecast hour the truck is in
            conditions = weather[_snap(position)][hour]
            stops.append(_stop(mile, position, eta, conditions, *assess(conditions, load_lb)))

        miles = checkpoint_miles([mile for mile, _, _ in marks])
        score = summarize([stop["risk"] for stop in stops], miles, route.duration_s)
        scores.append(score)
        payloads.append(_route(route_id, route, departure, stops, score))

    # 4. Rank the routes and explain the pick.
    order, reason = recommend(scores)
    for rank, index in enumerate(order, start=1):
        payloads[index]["rank"] = rank

    return {
        "departure": departure,
        "recommended": payloads[order[0]]["id"],
        "reason": reason,
        "routes": payloads,
        "heatmap": {
            "start": start,
            "cell_deg": cell_deg,
            "points": [
                {
                    "lat": lat,
                    "lon": lon,
                    "risk": [assess(w, load_lb)[0] for w in weather[lat, lon][: HEATMAP_HOURS + 1]],
                }
                for lat, lon in grid
            ],
        },
    }


def _checkpoints(route: Route, interval_mi: int) -> list[Checkpoint]:
    """The origin, every `interval_mi` miles, and the destination."""
    miles = geo.cumulative_miles(route.coords)
    marks = geo.checkpoint_marks(miles[-1], interval_mi)
    return [(mark, *geo.locate(route.coords, miles, route.seconds, mark)) for mark in marks]


def _stop(mile: float, position: geo.LatLon, eta: datetime, weather: Weather, risk: Risk, factor: str | None) -> dict:
    return {
        "mile": round(mile, 1),
        "lat": round(position[0], 4),
        "lon": round(position[1], 4),
        "eta": eta,
        "risk": risk,
        "factor": factor,
        "wind_mph": round(weather.wind_mph, 1),
        "rain_in_hr": round(weather.rain_in_hr, 3),  # the forecast's own precision
        "snow_in_hr": round(weather.snow_in_hr, 3),
    }


def _route(route_id: str, route: Route, departure: datetime, stops: list[dict], score: RouteRisk) -> dict:
    shape = geo.simplify(route.coords, tolerance_deg=0.0002)  # ~20 m
    return {
        "id": route_id,
        "name": route.name,
        "distance_mi": stops[-1]["mile"],
        "duration_s": round(route.duration_s),
        "arrival": departure + timedelta(seconds=round(route.duration_s)),
        "miles_by_risk": [round(miles, 1) for miles in score.miles_by_risk],
        "average_risk": round(score.average_risk, 2),
        "geometry": [[round(route.coords[i][1], 5), round(route.coords[i][0], 5)] for i in shape],  # GeoJSON order
        "seconds": [round(route.seconds[i]) for i in shape],  # elapsed drive time at each vertex
        "checkpoints": stops,
    }


def _cell_size(routes: list[Route]) -> float:
    """Heatmap cell size in degrees, scaled to the trip: 0.1 (short hops) to 0.5 (cross-country)."""
    lats = [lat for route in routes for lat, _ in route.coords]
    lons = [lon for route in routes for _, lon in route.coords]
    span = max(max(lats) - min(lats), max(lons) - min(lons))
    return min(max(round(span / HEATMAP_CELLS_ACROSS * 20) / 20, 0.1), 0.5)


def _snap(position: geo.LatLon) -> geo.LatLon:
    """Round to ~1 km so nearby samples share one forecast lookup."""
    return round(position[0], 2), round(position[1], 2)
