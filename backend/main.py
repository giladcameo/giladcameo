"""
Backend proxy server for giladcameo.github.io apps.

Proxies external APIs (VBB, DB, Overpass, Nominatim, OSRM, Valhalla),
adds server-side caching, and fixes CORS for local development.

Deploy on Railway / Render (free tier).  Set FRONTEND_ORIGIN env var
to the production URL (e.g. https://giladcameo.github.io) so the CORS
allow-list stays tight.
"""

import os
import hashlib
import time
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ── Config ────────────────────────────────────────────────────────────────────

FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "*")

VBB_API = "https://v6.vbb.transport.rest"
DB_API  = "https://v6.db.transport.rest"
OVERPASS_API  = "https://overpass-api.de/api/interpreter"
NOMINATIM_API = "https://nominatim.openstreetmap.org"
OSRM_API      = "https://routing.openstreetmap.de/routed-foot/route/v1/foot"
VALHALLA_API  = "https://valhalla1.openstreetmap.de/isochrone"

HEADERS = {"User-Agent": "giladcameo-backend/1.0 (contact: see github.com/giladcameo)"}

# ── Simple in-memory cache ─────────────────────────────────────────────────────
# Each entry: { "data": ..., "expires": float }
_cache: dict[str, dict[str, Any]] = {}


def _cache_key(prefix: str, *args: str) -> str:
    raw = prefix + "|" + "|".join(args)
    return hashlib.sha256(raw.encode()).hexdigest()


def _get(key: str) -> Any | None:
    entry = _cache.get(key)
    if entry and entry["expires"] > time.time():
        return entry["data"]
    return None


def _set(key: str, data: Any, ttl: int) -> None:
    _cache[key] = {"data": data, "expires": time.time() + ttl}
    # Evict expired entries lazily to prevent unbounded growth
    if len(_cache) > 2000:
        now = time.time()
        expired = [k for k, v in _cache.items() if v["expires"] <= now]
        for k in expired:
            del _cache[k]


# ── App setup ─────────────────────────────────────────────────────────────────

app = FastAPI(title="giladcameo API proxy", version="1.0.0")

origins = ["*"] if FRONTEND_ORIGIN == "*" else [
    FRONTEND_ORIGIN,
    "http://localhost:8080",
    "http://127.0.0.1:8080",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _proxy_get(url: str, params: dict | None = None, ttl: int = 30) -> Any:
    key = _cache_key(url, str(sorted((params or {}).items())))
    cached = _get(key)
    if cached is not None:
        return cached

    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(url, params=params, headers=HEADERS)
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text[:400])
        data = r.json()

    _set(key, data, ttl)
    return data


async def _proxy_post(url: str, body: Any, ttl: int = 30) -> Any:
    key = _cache_key(url, str(body))
    cached = _get(key)
    if cached is not None:
        return cached

    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(url, json=body, headers=HEADERS)
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text[:400])
        data = r.json()

    _set(key, data, ttl)
    return data


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "cache_entries": len(_cache)}


# ── VBB (U-Bahn) ──────────────────────────────────────────────────────────────

@app.get("/api/vbb/locations")
async def vbb_locations(query: str, results: int = 7):
    return await _proxy_get(
        f"{VBB_API}/locations",
        {"query": query, "results": results, "stops": "true",
         "addresses": "false", "poi": "false"},
        ttl=3600,
    )


@app.get("/api/vbb/stops/nearby")
async def vbb_stops_nearby(
    latitude: float, longitude: float, results: int = 8, distance: int = 2000
):
    return await _proxy_get(
        f"{VBB_API}/stops/nearby",
        {"latitude": latitude, "longitude": longitude,
         "results": results, "distance": distance,
         "suburban": "true", "subway": "true",
         "bus": "false", "tram": "false", "regional": "false"},
        ttl=300,
    )


@app.get("/api/vbb/stops/{stop_id}")
async def vbb_stop(stop_id: str):
    return await _proxy_get(f"{VBB_API}/stops/{stop_id}", ttl=3600)


@app.get("/api/vbb/stops/{stop_id}/departures")
async def vbb_departures(stop_id: str, request: Request):
    params = dict(request.query_params)
    params.setdefault("duration", "90")
    params.setdefault("results", "40")
    return await _proxy_get(
        f"{VBB_API}/stops/{stop_id}/departures", params, ttl=30
    )


@app.get("/api/vbb/stops/{stop_id}/arrivals")
async def vbb_arrivals(stop_id: str, request: Request):
    params = dict(request.query_params)
    params.setdefault("duration", "90")
    params.setdefault("results", "40")
    return await _proxy_get(
        f"{VBB_API}/stops/{stop_id}/arrivals", params, ttl=30
    )


@app.get("/api/vbb/trips/{trip_id}")
async def vbb_trip(trip_id: str, stopovers: bool = True,
                   remarks: bool = False, polyline: bool = False):
    return await _proxy_get(
        f"{VBB_API}/trips/{trip_id}",
        {"stopovers": str(stopovers).lower(),
         "remarks": str(remarks).lower(),
         "polyline": str(polyline).lower()},
        ttl=60,
    )


# ── DB (S-Bahn) ───────────────────────────────────────────────────────────────

@app.get("/api/db/stops/{stop_id}/departures")
async def db_departures(stop_id: str, request: Request):
    params = dict(request.query_params)
    params.setdefault("duration", "90")
    params.setdefault("results", "40")
    return await _proxy_get(
        f"{DB_API}/stops/{stop_id}/departures", params, ttl=30
    )


@app.get("/api/db/trips/{trip_id}")
async def db_trip(trip_id: str, stopovers: bool = True, remarks: bool = False):
    return await _proxy_get(
        f"{DB_API}/trips/{trip_id}",
        {"stopovers": str(stopovers).lower(), "remarks": str(remarks).lower()},
        ttl=60,
    )


# ── Overpass ──────────────────────────────────────────────────────────────────

@app.get("/api/overpass")
async def overpass(data: str = Query(..., description="Overpass QL query")):
    key = _cache_key("overpass", data)
    cached = _get(key)
    if cached is not None:
        return JSONResponse(cached)

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(OVERPASS_API, data={"data": data}, headers=HEADERS)
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text[:400])
        result = r.json()

    _set(key, result, ttl=600)
    return JSONResponse(result)


# ── Nominatim ─────────────────────────────────────────────────────────────────

@app.get("/api/nominatim/search")
async def nominatim_search(q: str, limit: int = 5):
    return await _proxy_get(
        f"{NOMINATIM_API}/search",
        {"q": q, "format": "json", "limit": limit,
         "addressdetails": "1", "accept-language": "en"},
        ttl=3600,
    )


@app.get("/api/nominatim/reverse")
async def nominatim_reverse(lat: float, lon: float):
    return await _proxy_get(
        f"{NOMINATIM_API}/reverse",
        {"lat": lat, "lon": lon, "format": "json", "accept-language": "en"},
        ttl=3600,
    )


# ── OSRM (walking routes) ─────────────────────────────────────────────────────

@app.get("/api/osrm/{coords}")
async def osrm_route(coords: str, overview: str = "full", geometries: str = "geojson"):
    return await _proxy_get(
        f"{OSRM_API}/{coords}",
        {"overview": overview, "geometries": geometries},
        ttl=300,
    )


# ── Valhalla (isochrones) ─────────────────────────────────────────────────────

@app.post("/api/valhalla/isochrone")
async def valhalla_isochrone(body: dict):
    return await _proxy_post(VALHALLA_API, body, ttl=600)
