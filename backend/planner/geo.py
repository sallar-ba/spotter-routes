"""Geometry helpers on (lat, lon) tuples. Distances are in miles."""

from bisect import bisect_right
from itertools import accumulate, pairwise
from math import asin, cos, hypot, radians, sin, sqrt

LatLon = tuple[float, float]

EARTH_RADIUS_MI = 3958.8


def decode_polyline6(encoded: str) -> list[LatLon]:
    """Decode an encoded polyline with 6-digit precision (Valhalla's shape format)."""
    deltas, value, shift = [], 0, 0
    for char in encoded:
        chunk = ord(char) - 63
        value |= (chunk & 0x1F) << shift
        shift += 5
        if chunk < 0x20:  # last chunk of this number
            deltas.append(~(value >> 1) if value & 1 else value >> 1)
            value, shift = 0, 0
    lats, lons = accumulate(deltas[0::2]), accumulate(deltas[1::2])
    return [(lat / 1e6, lon / 1e6) for lat, lon in zip(lats, lons)]


def miles_between(a: LatLon, b: LatLon) -> float:
    lat1, lon1, lat2, lon2 = map(radians, (*a, *b))
    h = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_MI * asin(sqrt(h))


def cumulative_miles(coords: list[LatLon]) -> list[float]:
    return list(accumulate((miles_between(a, b) for a, b in pairwise(coords)), initial=0.0))


def locate(coords: list[LatLon], miles: list[float], seconds: list[float], at_mile: float) -> tuple[LatLon, float]:
    """Position and elapsed time at `at_mile` along a route, interpolated within its segment."""
    i = min(max(bisect_right(miles, at_mile), 1), len(miles) - 1)
    span = miles[i] - miles[i - 1]
    t = (at_mile - miles[i - 1]) / span if span else 0.0
    (lat0, lon0), (lat1, lon1) = coords[i - 1], coords[i]
    position = (lat0 + (lat1 - lat0) * t, lon0 + (lon1 - lon0) * t)
    return position, seconds[i - 1] + (seconds[i] - seconds[i - 1]) * t


def checkpoint_marks(total_miles: float, interval: int) -> list[float]:
    """Origin, then every `interval` miles, then the destination.

    A mark within a mile of the destination is dropped, so the last stretch is never a sliver.
    """
    return [float(mile) for mile in range(0, max(int(total_miles), 1), interval)] + [total_miles]


def simplify(coords: list[LatLon], tolerance_deg: float) -> list[int]:
    """Ramer-Douglas-Peucker: indices of the vertices to keep so the line stays within `tolerance_deg`."""
    keep = [False] * len(coords)
    keep[0] = keep[-1] = True
    spans = [(0, len(coords) - 1)]
    while spans:
        first, last = spans.pop()
        farthest, distance = first, 0.0
        for i in range(first + 1, last):
            d = _distance_to_segment(coords[i], coords[first], coords[last])
            if d > distance:
                farthest, distance = i, d
        if distance > tolerance_deg:
            keep[farthest] = True
            spans += [(first, farthest), (farthest, last)]
    return [i for i, kept in enumerate(keep) if kept]


def _distance_to_segment(point: LatLon, a: LatLon, b: LatLon) -> float:
    """Planar distance in degrees from `point` to the segment a-b."""
    (y, x), (y1, x1), (y2, x2) = point, a, b
    dx, dy = x2 - x1, y2 - y1
    t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy or 1e-12)))
    return hypot(x - (x1 + t * dx), y - (y1 + t * dy))


def corridor_grid(lines: list[list[LatLon]], step_deg: float, radius: int = 1) -> list[LatLon]:
    """Points of a regular lat/lon grid lying within `radius` cells of any line.

    Cells sit on a global lattice, so overlapping routes share points (fewer weather calls).
    """
    cells: set[tuple[int, int]] = set()
    offsets = range(-radius, radius + 1)
    for line in lines:
        for lat, lon in line:
            row, col = round(lat / step_deg), round(lon / step_deg)
            cells.update((row + dr, col + dc) for dr in offsets for dc in offsets)
    return [(round(row * step_deg, 2), round(col * step_deg, 2)) for row, col in sorted(cells)]
