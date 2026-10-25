from rest_framework.decorators import api_view, throttle_classes
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, SimpleRateThrottle

from .clients.photon import search_places
from .serializers import PlanRequestSerializer
from .services import plan_trip


class PlacesThrottle(AnonRateThrottle):
    scope = "places"


class PlanThrottle(AnonRateThrottle):
    scope = "plan"


class AllPlansThrottle(SimpleRateThrottle):
    """One bucket shared by every client, so nobody can use up the weather quota for everyone."""

    scope = "plan_all"

    def get_cache_key(self, request: Request, view) -> str:
        return self.cache_format % {"scope": self.scope, "ident": "all"}


@api_view(["GET"])
@throttle_classes([PlacesThrottle])
def places(request: Request) -> Response:
    query = request.query_params.get("q", "").strip()[:100]
    return Response(search_places(query) if len(query) >= 2 else [])


@api_view(["POST"])
@throttle_classes([PlanThrottle, AllPlansThrottle])
def plan(request: Request) -> Response:
    trip = PlanRequestSerializer(data=request.data)
    trip.is_valid(raise_exception=True)
    return Response(plan_trip(**trip.validated_data))
