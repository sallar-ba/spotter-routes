from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework import serializers

from .geo import miles_between

MAX_DAYS_AHEAD = 7  # keeps the trip plus the 48 h heatmap inside the forecast range
INTERVALS_MI = (10, 25, 50)


class PlaceSerializer(serializers.Serializer):
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lon = serializers.FloatField(min_value=-180, max_value=180)


class PlanRequestSerializer(serializers.Serializer):
    origin = PlaceSerializer()
    destination = PlaceSerializer()
    departure = serializers.DateTimeField()
    load_lb = serializers.IntegerField(min_value=0, max_value=80_000)
    interval_mi = serializers.ChoiceField(choices=INTERVALS_MI)

    def validate_departure(self, value):
        now = timezone.now()
        if value < now - timedelta(hours=1):
            raise serializers.ValidationError("Departure can't be in the past.")
        if value > now + timedelta(days=MAX_DAYS_AHEAD):
            raise serializers.ValidationError(f"Forecasts only reach {MAX_DAYS_AHEAD} days ahead.")
        return value

    def validate(self, data):
        origin = (data["origin"]["lat"], data["origin"]["lon"])
        destination = (data["destination"]["lat"], data["destination"]["lon"])
        distance = miles_between(origin, destination)
        if distance < 1:
            raise serializers.ValidationError({"destination": ["Pick a destination away from the origin."]})
        if distance > settings.MAX_TRIP_MILES:
            raise serializers.ValidationError(
                {"destination": [f"Pick a destination within {settings.MAX_TRIP_MILES} miles in a straight line."]}
            )
        return {**data, "origin": origin, "destination": destination}
