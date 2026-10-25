"""Weather risk rules and route recommendation. Pure functions, no I/O."""

from dataclasses import dataclass
from enum import IntEnum


class Risk(IntEnum):
    LOW = 0
    MODERATE = 1
    HIGH = 2
    SEVERE = 3
    NO_TRAVEL = 4


@dataclass(frozen=True)
class Weather:
    wind_mph: float
    rain_in_hr: float
    snow_in_hr: float


def wind_risk(mph: float, load_lb: float) -> Risk:
    """Wind thresholds with the load rules folded in."""
    if mph >= 55:
        return Risk.NO_TRAVEL
    if mph >= 45:
        return Risk.NO_TRAVEL if load_lb > 30_000 else Risk.SEVERE
    if mph >= 35:
        return Risk.SEVERE if load_lb > 40_000 else Risk.HIGH
    if mph >= 25:
        return Risk.MODERATE
    return Risk.LOW


def _precip_risk(rate: float, moderate: float, high: float, severe: float, no_travel: float) -> Risk:
    # Each band includes its lower bound; "No Travel" starts strictly above the Severe band.
    if rate > no_travel:
        return Risk.NO_TRAVEL
    if rate >= severe:
        return Risk.SEVERE
    if rate >= high:
        return Risk.HIGH
    if rate >= moderate:
        return Risk.MODERATE
    return Risk.LOW


def rain_risk(in_per_hr: float) -> Risk:
    return _precip_risk(in_per_hr, moderate=0.10, high=0.25, severe=0.50, no_travel=1.00)


def snow_risk(in_per_hr: float) -> Risk:
    return _precip_risk(in_per_hr, moderate=0.5, high=1.0, severe=2.0, no_travel=3.0)


def assess(weather: Weather, load_lb: float) -> tuple[Risk, str | None]:
    """Overall risk is the worst condition. Also returns which condition caused it."""
    levels = {
        "wind": wind_risk(weather.wind_mph, load_lb),
        "rain": rain_risk(weather.rain_in_hr),
        "snow": snow_risk(weather.snow_in_hr),
    }
    factor = max(levels, key=levels.__getitem__)
    level = levels[factor]
    return level, (factor if level > Risk.LOW else None)


def checkpoint_miles(marks: list[float]) -> list[float]:
    """Miles of road each checkpoint represents: half the gap to each neighbour.

    The result always sums to the route length, so every mile is counted exactly once.
    """
    previous = [marks[0], *marks[:-1]]
    following = [*marks[1:], marks[-1]]
    return [(after - before) / 2 for before, after in zip(previous, following)]


@dataclass(frozen=True)
class RouteRisk:
    miles_by_risk: tuple[float, ...]  # indexed by Risk
    average_risk: float  # distance-weighted, 0 (Low) .. 4 (No Travel)
    duration_s: float


def summarize(levels: list[Risk], miles: list[float], duration_s: float) -> RouteRisk:
    by_risk = [0.0] * len(Risk)
    for level, distance in zip(levels, miles):
        by_risk[level] += distance
    total = sum(miles)
    average = sum(level * distance for level, distance in zip(levels, miles)) / total if total else 0.0
    return RouteRisk(tuple(by_risk), average, duration_s)


# Ranking rules, most important first.
RANKING_REASONS = (
    "Fewest no-travel miles",
    "Fewest severe-risk miles",
    "Fewest high-risk miles",
    "Lowest average risk",
    "Fastest at equal risk",
)


def rank_key(route: RouteRisk) -> tuple[float, ...]:
    # Rounded to the precision the UI shows.
    return (
        round(route.miles_by_risk[Risk.NO_TRAVEL], 1),
        round(route.miles_by_risk[Risk.SEVERE], 1),
        round(route.miles_by_risk[Risk.HIGH], 1),
        round(route.average_risk, 2),
        route.duration_s,
    )


def recommend(routes: list[RouteRisk]) -> tuple[list[int], str]:
    """Route indices from best to worst, plus the rule that decided the winner."""
    order = sorted(range(len(routes)), key=lambda i: rank_key(routes[i]))
    if len(order) == 1:
        return order, "Only route available"
    best, runner_up = rank_key(routes[order[0]]), rank_key(routes[order[1]])
    reason = next(
        (why for why, a, b in zip(RANKING_REASONS, best, runner_up) if a != b),
        RANKING_REASONS[-1],
    )
    return order, reason
