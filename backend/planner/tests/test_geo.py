from django.test import SimpleTestCase

from planner import geo


class GeoTests(SimpleTestCase):
    def test_decode_polyline6(self):
        # Two points: (38.5, -120.2) and (40.7, -120.95), encoded at 1e6 precision.
        self.assertEqual(geo.decode_polyline6("_izlhA~rlgdF_{geC~ywl@"), [(38.5, -120.2), (40.7, -120.95)])

    def test_checkpoint_marks(self):
        self.assertEqual(geo.checkpoint_marks(60.4, 25), [0, 25, 50, 60.4])
        self.assertEqual(geo.checkpoint_marks(50.0, 25), [0, 25, 50.0])

    def test_locate_interpolates_position_and_time(self):
        coords = [(0.0, 0.0), (0.0, 1.0)]
        miles = geo.cumulative_miles(coords)
        (lat, lon), seconds = geo.locate(coords, miles, [0, 3600], miles[-1] / 4)
        self.assertAlmostEqual(lon, 0.25)
        self.assertAlmostEqual(seconds, 900)

    def test_simplify_keeps_corners_and_drops_straight_points(self):
        line = [(0.0, 0.0), (0.0, 1.0), (0.0, 2.0), (1.0, 2.0)]
        self.assertEqual(geo.simplify(line, tolerance_deg=0.001), [0, 2, 3])

    def test_simplify_keeps_a_road_that_doubles_back(self):
        line = [(0.0, 0.0), (0.0, 1.0), (0.0, 3.0), (0.0, 2.0)]
        self.assertEqual(geo.simplify(line, tolerance_deg=0.001), [0, 2, 3])

    def test_corridor_grid_covers_cells_around_the_line(self):
        cells = geo.corridor_grid([[(0.0, 0.0)]], step_deg=0.5)
        self.assertEqual(len(cells), 9)  # the cell itself and its 8 neighbours
        self.assertIn((0.5, -0.5), cells)
