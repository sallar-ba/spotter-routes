from datetime import UTC, datetime, timedelta
from unittest.mock import patch

from django.test import SimpleTestCase

from planner.clients.valhalla import Route
from planner.risk import Risk, Weather
from planner.services import plan_trip

CALM = Weather(5, 0, 0)
GALE = Weather(50, 0, 0)


def fake_weather(points, start, hours):
    """A gale sits on a small box around (40.0, -99.5); everywhere else is calm."""

    def at(lat, lon):
        return GALE if lat < 40.5 and -99.7 < lon < -99.3 else CALM

    return {(lat, lon): [at(lat, lon)] * hours for lat, lon in points}


@patch("planner.services.fetch_hourly_weather", side_effect=fake_weather)
@patch("planner.services.fetch_routes")
class PlanTripTests(SimpleTestCase):
    # The fast route drives straight through the gale; the slow one loops north around it.
    straight = Route(coords=[(40.0, -100.0), (40.0, -99.0)], seconds=[0, 3600], duration_s=3600, name="via Gale Rd")
    detour = Route(
        coords=[(40.0, -100.0), (41.0, -100.0), (41.0, -99.0), (40.0, -99.0)],
        seconds=[0, 3600, 7200, 10800],
        duration_s=10800,
        name="via North Loop",
    )
    departure = datetime(2030, 1, 1, 10, tzinfo=UTC)

    def plan(self, fetch_routes, load_lb):
        fetch_routes.return_value = [self.straight, self.detour]
        return plan_trip((40.0, -100.0), (40.0, -99.0), self.departure, load_lb=load_lb, interval_mi=10)

    def test_heavy_load_avoids_the_gale(self, fetch_routes, _):
        result = self.plan(fetch_routes, load_lb=35_000)

        straight, detour = result["routes"]
        self.assertEqual(result["recommended"], detour["id"])
        self.assertEqual(result["reason"], "Fewest no-travel miles")
        self.assertGreater(straight["miles_by_risk"][Risk.NO_TRAVEL], 0)
        self.assertEqual({stop["factor"] for stop in straight["checkpoints"]}, {None, "wind"})

    def test_light_load_still_avoids_severe_wind(self, fetch_routes, _):
        result = self.plan(fetch_routes, load_lb=20_000)

        straight, detour = result["routes"]
        self.assertEqual(result["recommended"], detour["id"])
        self.assertEqual(result["reason"], "Fewest severe-risk miles")
        self.assertEqual(straight["miles_by_risk"][Risk.NO_TRAVEL], 0)

    def test_checkpoint_eta_follows_the_route_pace(self, fetch_routes, _):
        straight = self.plan(fetch_routes, load_lb=0)["routes"][0]

        stop = straight["checkpoints"][1]  # 10 of ~53 miles, driven in one hour
        expected = self.departure + timedelta(hours=stop["mile"] / straight["distance_mi"])
        self.assertAlmostEqual(stop["eta"].timestamp(), expected.timestamp(), delta=1)

    def test_heatmap_has_every_hour_from_0_to_48(self, fetch_routes, _):
        heatmap = self.plan(fetch_routes, load_lb=0)["heatmap"]

        self.assertTrue(all(len(point["risk"]) == 49 for point in heatmap["points"]))
