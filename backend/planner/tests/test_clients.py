from datetime import UTC, datetime, timedelta
from unittest.mock import Mock, patch

from django.core.cache import cache
from django.test import SimpleTestCase

from planner.clients.http import ProviderError, ProviderRejected, request_json
from planner.clients.open_meteo import fetch_hourly_weather, parse_hourly
from planner.clients.valhalla import parse_trip
from planner.risk import Weather


@patch("planner.clients.http.session.request")
class RequestJsonTests(SimpleTestCase):
    def test_refused_input_is_a_client_error(self, request):
        request.return_value = Mock(status_code=400, ok=False)
        with self.assertRaises(ProviderRejected) as error:
            request_json("POST", "https://example.test", "Routing service", rejected="No route.")
        self.assertEqual(error.exception.status_code, 422)

    def test_unreadable_body_is_an_upstream_error(self, request):
        request.return_value = Mock(status_code=200, ok=True, json=Mock(side_effect=ValueError))
        with self.assertRaises(ProviderError) as error:
            request_json("GET", "https://example.test", "Weather service")
        self.assertEqual(error.exception.status_code, 502)


class OpenMeteoTests(SimpleTestCase):
    def test_precipitation_is_read_for_the_hour_it_falls_in(self):
        # The 11:00 rain value is the total from 10:00 to 11:00.
        hourly = {
            "wind_speed_10m": [10, 20, None],
            "rain": [0, 0.3, 0],
            "showers": [0, 0.1, 0],
            "snowfall": [0, 0, 0.6],
        }
        self.assertEqual(parse_hourly(hourly), [Weather(10, 0.4, 0), Weather(20, 0, 0.6)])

    @patch("planner.clients.open_meteo._fetch")
    def test_plans_with_different_departures_share_one_download(self, fetch):
        cache.clear()
        fetch.side_effect = lambda points, start, hours: [[Weather(h, 0, 0) for h in range(hours)] for _ in points]
        today = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)

        first = fetch_hourly_weather([(1.0, 2.0)], today, hours=5)
        later = fetch_hourly_weather([(1.0, 2.0)], today + timedelta(hours=3), hours=5)

        self.assertEqual(fetch.call_count, 1)
        self.assertEqual(later[1.0, 2.0][0].wind_mph, first[1.0, 2.0][3].wind_mph)  # sliced from the same series


class ValhallaTests(SimpleTestCase):
    def test_drive_time_is_spread_along_the_shape_by_distance(self):
        trip = {
            "summary": {"time": 300},
            "legs": [
                {
                    "shape": "???_c`|@?_gayB",  # (0, 0) -> (0, 1) -> (0, 3)
                    "maneuvers": [
                        {
                            "begin_shape_index": 0,
                            "end_shape_index": 2,
                            "time": 300,
                            "length": 207,
                            "street_names": ["I 35 North"],
                        },
                        {"begin_shape_index": 2, "end_shape_index": 2, "time": 0, "length": 0},
                    ],
                }
            ],
        }

        route = parse_trip(trip)

        self.assertEqual(route.coords, [(0, 0), (0, 1), (0, 3)])
        self.assertEqual([round(s) for s in route.seconds], [0, 100, 300])  # 1 of 3 degrees takes 1/3 of the time
        self.assertEqual(route.name, "via I 35")
