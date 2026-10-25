"""Truck routing with Valhalla: route options with the drive time at every point along them."""

import re
from collections import Counter
from dataclasses import dataclass

from django.conf import settings
from django.core.cache import cache

from ..geo import LatLon, decode_polyline6, miles_between
from .http import CACHE_SECONDS, ProviderError, request_json

ROUTE_OPTIONS = 3
NO_ROUTE = "No truck route found between these places."
DIRECTION_SUFFIX = re.compile(r" (North|South|East|West)$")  # "I 35 North" -> "I 35"


@dataclass(frozen=True)
class Route:
    coords: list[LatLon]
    seconds: list[float]  # elapsed driving time at each vertex
    duration_s: float
    name: str


def fetch_routes(origin: LatLon, destination: LatLon) -> list[Route]:
    """Up to three distinct truck routes, fastest first."""
    key = "routes:{:.5f},{:.5f}:{:.5f},{:.5f}".format(*origin, *destination)
    return cache.get_or_set(key, lambda: _fetch_routes(origin, destination), CACHE_SECONDS)


def _fetch_routes(origin: LatLon, destination: LatLon) -> list[Route]:
    routes = _valhalla([origin, destination], alternates=ROUTE_OPTIONS - 1)

    # Valhalla sometimes finds fewer alternatives than asked. Force variety by routing via
    # the nearest highway to a point pushed sideways from the midpoint, alternating sides.
    similar: list[Route] = []
    for via in _detour_points(origin, destination):
        if len(routes) >= ROUTE_OPTIONS:
            break
        try:
            candidates = _valhalla([origin, via, destination])
        except ProviderError:
            continue  # no highway near this detour point
        for route in candidates:
            if any(_overlap(route, kept) > 0.85 for kept in similar):
                continue  # already have this one as a near-duplicate
            is_copy = any(_overlap(route, kept) > 0.85 for kept in routes)
            (similar if is_copy else routes).append(route)

    # Still short: fill up with the near-duplicates.
    routes += sorted(similar, key=lambda route: route.duration_s)
    return sorted(routes[:ROUTE_OPTIONS], key=lambda route: route.duration_s)


def _detour_points(origin: LatLon, destination: LatLon) -> list[LatLon]:
    (lat1, lon1), (lat2, lon2) = origin, destination
    mid_lat, mid_lon = (lat1 + lat2) / 2, (lon1 + lon2) / 2
    # Perpendicular to the straight line, as a fraction of the trip's length.
    return [(mid_lat - (lon2 - lon1) * f, mid_lon + (lat2 - lat1) * f) for f in (0.2, -0.2, 0.35, -0.35)]


def _overlap(a: Route, b: Route) -> float:
    """Share of route a's vertices that also lie on route b (compared on a ~1 km grid)."""
    on_b = {(round(lat * 100), round(lon * 100)) for lat, lon in b.coords}
    return sum((round(lat * 100), round(lon * 100)) in on_b for lat, lon in a.coords) / len(a.coords)


def _valhalla(stops: list[LatLon], alternates: int = 0) -> list[Route]:
    origin, *vias, destination = stops
    locations = [
        {"lat": origin[0], "lon": origin[1]},
        # Detour points snap to highways (primary roads or bigger).
        *(
            {"lat": lat, "lon": lon, "type": "through", "search_filter": {"min_road_class": "primary"}}
            for lat, lon in vias
        ),
        {"lat": destination[0], "lon": destination[1]},
    ]
    body = {
        "locations": locations,
        "costing": "truck",
        "alternates": alternates,
        "units": "miles",
        "directions_type": "maneuvers",  # timings and road names, without narrative text
    }
    data = request_json("POST", settings.VALHALLA_URL, "Routing service", NO_ROUTE, json=body)
    trips = [data["trip"], *(alt["trip"] for alt in data.get("alternates", []))]
    return [parse_trip(trip) for trip in trips]


def parse_trip(trip: dict) -> Route:
    """A Valhalla trip as a Route, with the elapsed drive time at every vertex."""
    coords: list[LatLon] = []
    seconds: list[float] = []
    road_miles: Counter[str] = Counter()

    for leg in trip["legs"]:
        shape = decode_polyline6(leg["shape"])
        elapsed = [seconds[-1] if seconds else 0.0] * len(shape)
        for maneuver in leg["maneuvers"]:
            # Spread each maneuver's drive time over its segments in proportion to length.
            start, end = maneuver["begin_shape_index"], maneuver["end_shape_index"]
            lengths = [miles_between(shape[i], shape[i + 1]) for i in range(start, end)]
            total = sum(lengths) or 1.0
            for i, length in zip(range(start, end), lengths):
                elapsed[i + 1] = elapsed[i] + maneuver["time"] * length / total
            for street in maneuver.get("street_names", [])[:1]:
                road_miles[DIRECTION_SUFFIX.sub("", street)] += maneuver["length"]
        skip = 1 if coords else 0  # each leg starts where the previous one ended
        coords += shape[skip:]
        seconds += elapsed[skip:]

    main_roads = [road for road, _ in road_miles.most_common(2)]
    return Route(
        coords=coords,
        seconds=seconds,
        duration_s=trip["summary"]["time"],
        name=f"via {' and '.join(main_roads)}" if main_roads else "Direct route",
    )
