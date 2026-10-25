from datetime import UTC, datetime, timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings


def trip(**overrides):
    return {
        "origin": {"lat": 32.8, "lon": -96.8},  # Dallas
        "destination": {"lat": 41.9, "lon": -87.6},  # Chicago
        "departure": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
        "load_lb": 20_000,
        "interval_mi": 25,
        **overrides,
    }


class PlanEndpointTests(SimpleTestCase):
    def setUp(self):
        cache.clear()  # rate-limit counters live in the cache

    def post(self, body, **headers):
        return self.client.post("/api/plan", body, content_type="application/json", **headers)

    def test_rejects_past_departure_and_unknown_interval(self):
        response = self.post(trip(departure="2001-01-01T00:00:00Z", interval_mi=15))

        self.assertEqual(response.status_code, 400)
        self.assertEqual(set(response.json()), {"departure", "interval_mi"})

    def test_rejects_trips_beyond_the_routing_limit(self):
        response = self.post(trip(destination={"lat": 34.05, "lon": -118.24}))  # Los Angeles

        self.assertEqual(response.status_code, 400)
        self.assertIn("930 miles", response.json()["destination"][0])

    def test_rate_limits_each_client(self):
        statuses = [self.post(trip(interval_mi=15)).status_code for _ in range(11)]

        self.assertEqual(statuses, [400] * 10 + [429])

    @patch("planner.views.plan_trip", return_value={})
    def test_caps_valid_plans_across_all_clients(self, _):
        self.post(trip(interval_mi=15))  # invalid requests never count toward the shared cap
        statuses = [self.post(trip(), REMOTE_ADDR=f"10.0.0.{n}").status_code for n in range(31)]

        self.assertEqual(statuses, [200] * 30 + [429])

    @override_settings(CLIENT_IP_HEADER="HTTP_CF_CONNECTING_IP")
    def test_forged_forwarded_for_does_not_reset_the_client_limit(self):
        statuses = [
            self.post(
                trip(interval_mi=15), HTTP_CF_CONNECTING_IP="203.0.113.7", HTTP_X_FORWARDED_FOR=f"10.0.0.{n}"
            ).status_code
            for n in range(11)
        ]

        self.assertEqual(statuses, [400] * 10 + [429])
