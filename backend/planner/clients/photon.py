"""Place search with Photon (OpenStreetMap data, built for search-as-you-type)."""

from urllib.parse import quote

from django.core.cache import cache

from .http import CACHE_SECONDS, request_json

PHOTON_URL = "https://photon.komoot.io/api/"
PLACE_LAYERS = ["city", "district", "locality", "street", "house"]  # skip counties, states, countries


def search_places(query: str) -> list[dict]:
    def fetch() -> list[dict]:
        params = {"q": query, "limit": 6, "lang": "en", "layer": PLACE_LAYERS}
        data = request_json("GET", PHOTON_URL, "Place search", params=params)
        places = {(place["label"], place["detail"]): place for place in map(_place, data["features"])}
        return list(places.values())  # without duplicates

    return cache.get_or_set(f"places:{quote(query.lower())}", fetch, CACHE_SECONDS)


def _place(feature: dict) -> dict:
    props = feature["properties"]
    lon, lat = feature["geometry"]["coordinates"]
    street = " ".join(filter(None, [props.get("housenumber"), props.get("street")]))
    name = props.get("name") or street
    region = [props.get(key) for key in ("city", "state", "country")]
    detail = ", ".join(dict.fromkeys(part for part in region if part and part != name))
    return {"label": name, "detail": detail, "lat": lat, "lon": lon}
