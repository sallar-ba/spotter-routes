"""Shared plumbing for the third-party API clients."""

import requests
from rest_framework.exceptions import APIException

CACHE_SECONDS = 15 * 60

session = requests.Session()
session.headers["User-Agent"] = "spotter-routes/1.0"


class ProviderError(APIException):
    """An upstream API failed. DRF renders it as a 502 with a readable message."""

    status_code = 502
    default_code = "provider_error"


class ProviderRejected(ProviderError):
    """The provider refused this input, e.g. no road connects the two places."""

    status_code = 422
    default_code = "provider_rejected"


def request_json(method: str, url: str, provider: str, rejected: str | None = None, **kwargs) -> dict | list:
    """Call a provider and return its JSON. `rejected` is shown when it refuses our input (HTTP 4xx)."""
    try:
        response = session.request(method, url, timeout=20, **kwargs)
    except requests.RequestException as exc:
        raise ProviderError(f"{provider} is unreachable right now. Try again shortly.") from exc
    if response.status_code == 429:
        raise ProviderError(f"{provider} rate limit reached. Try again in a minute.")
    if rejected and 400 <= response.status_code < 500:
        raise ProviderRejected(rejected)
    if not response.ok:
        raise ProviderError(f"{provider} returned an error ({response.status_code}).")
    try:
        return response.json()
    except ValueError as exc:
        raise ProviderError(f"{provider} returned an unreadable response.") from exc
