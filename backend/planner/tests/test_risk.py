from django.test import SimpleTestCase

from planner.risk import (
    Risk,
    RouteRisk,
    Weather,
    assess,
    checkpoint_miles,
    rain_risk,
    recommend,
    snow_risk,
    wind_risk,
)


class RiskRulesTests(SimpleTestCase):
    def test_wind_bands(self):
        cases = {
            24.9: Risk.LOW,
            25: Risk.MODERATE,
            34.9: Risk.MODERATE,
            35: Risk.HIGH,
            45: Risk.SEVERE,
            54.9: Risk.SEVERE,
            55: Risk.NO_TRAVEL,
        }
        for mph, expected in cases.items():
            self.assertEqual(wind_risk(mph, load_lb=0), expected, mph)

    def test_load_rules(self):
        self.assertEqual(wind_risk(55, load_lb=0), Risk.NO_TRAVEL)  # any load
        self.assertEqual(wind_risk(45, load_lb=30_000), Risk.SEVERE)
        self.assertEqual(wind_risk(45, load_lb=30_001), Risk.NO_TRAVEL)
        self.assertEqual(wind_risk(35, load_lb=40_000), Risk.HIGH)
        self.assertEqual(wind_risk(35, load_lb=40_001), Risk.SEVERE)
        self.assertEqual(wind_risk(30, load_lb=80_000), Risk.MODERATE)  # load only matters from 35 mph

    def test_rain_bands(self):
        cases = {
            0.09: Risk.LOW,
            0.10: Risk.MODERATE,
            0.25: Risk.HIGH,
            0.50: Risk.SEVERE,
            1.00: Risk.SEVERE,
            1.01: Risk.NO_TRAVEL,
        }
        for rate, expected in cases.items():
            self.assertEqual(rain_risk(rate), expected, rate)

    def test_snow_bands(self):
        cases = {
            0.4: Risk.LOW,
            0.5: Risk.MODERATE,
            1.0: Risk.HIGH,
            2.0: Risk.SEVERE,
            3.0: Risk.SEVERE,
            3.1: Risk.NO_TRAVEL,
        }
        for rate, expected in cases.items():
            self.assertEqual(snow_risk(rate), expected, rate)

    def test_worst_condition_wins(self):
        self.assertEqual(assess(Weather(30, 0.3, 0), load_lb=0), (Risk.HIGH, "rain"))
        self.assertEqual(assess(Weather(5, 0, 0), load_lb=0), (Risk.LOW, None))


class RecommendationTests(SimpleTestCase):
    @staticmethod
    def route(no_travel=0.0, severe=0.0, high=0.0, average=0.0, hours=10.0):
        return RouteRisk((0.0, 0.0, high, severe, no_travel), average, hours * 3600)

    def test_ranking_order(self):
        routes = [
            self.route(severe=10, hours=8),  # fastest, but has severe miles
            self.route(high=50, hours=9),
            self.route(high=20, average=0.9, hours=12),
        ]
        order, reason = recommend(routes)
        self.assertEqual(order, [2, 1, 0])
        self.assertEqual(reason, "Fewest high-risk miles")

    def test_no_travel_outranks_severe(self):
        order, reason = recommend([self.route(no_travel=5), self.route(severe=100)])
        self.assertEqual(order[0], 1)
        self.assertEqual(reason, "Fewest no-travel miles")

    def test_equal_risk_falls_back_to_travel_time(self):
        order, reason = recommend([self.route(average=0.5, hours=11), self.route(average=0.5, hours=10)])
        self.assertEqual(order[0], 1)
        self.assertEqual(reason, "Fastest at equal risk")

    def test_checkpoint_miles_cover_the_route_once(self):
        self.assertEqual(checkpoint_miles([0, 25, 50, 60]), [12.5, 25, 17.5, 5])
