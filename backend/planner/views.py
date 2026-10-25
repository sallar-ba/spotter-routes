from django.conf import settings
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.exceptions import Throttled
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, SimpleRateThrottle

from .clients.photon import search_places
from .serializers import PlanRequestSerializer
from .services import plan_trip


class ClientThrottle(AnonRateThrottle):
    """Per-client limit. Behind a proxy that sets a client-IP header, that header is the identity."""

    def get_ident(self, request: Request) -> str:
        header = settings.CLIENT_IP_HEADER
        return (header and request.META.get(header)) or super().get_ident(request)


class PlacesThrottle(ClientThrottle):
    scope = "places"


class PlanThrottle(ClientThrottle):
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
@throttle_classes([PlanThrottle])
def plan(request: Request) -> Response:
    trip = PlanRequestSerializer(data=request.data)
    trip.is_valid(raise_exception=True)
    # Only valid requests within their client's limit count here, so one client can't block everyone.
    everyone = AllPlansThrottle()
    if not everyone.allow_request(request, None):
        raise Throttled(everyone.wait())
    return Response(plan_trip(**trip.validated_data))
