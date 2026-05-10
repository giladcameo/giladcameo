#!/usr/bin/env python3
"""
Flight price search: Berlin → Tel Aviv
Uses the Amadeus for Developers API (free test tier).

Setup:
1. Sign up at https://developers.amadeus.com (free)
2. Create an app → copy API Key and API Secret
3. Run:  export AMADEUS_API_KEY=... AMADEUS_API_SECRET=...
4. pip install requests
5. python flight_search.py
"""

import os
import sys
import json
import argparse
from datetime import date, timedelta

try:
    import requests
except ImportError:
    sys.exit("Missing dependency: pip install requests")

# ── Amadeus endpoints ──────────────────────────────────────────────────────────
AUTH_URL   = "https://test.api.amadeus.com/v1/security/oauth2/token"
SEARCH_URL = "https://test.api.amadeus.com/v2/shopping/flight-offers"

ORIGIN      = "BER"   # Berlin (all airports)
DESTINATION = "TLV"   # Tel Aviv Ben Gurion

CURRENCY    = "EUR"
MAX_RESULTS = 10


def get_token(api_key: str, api_secret: str) -> str:
    resp = requests.post(
        AUTH_URL,
        data={
            "grant_type":    "client_credentials",
            "client_id":     api_key,
            "client_secret": api_secret,
        },
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def search_flights(token: str, departure_date: str, adults: int = 1) -> list[dict]:
    resp = requests.get(
        SEARCH_URL,
        headers={"Authorization": f"Bearer {token}"},
        params={
            "originLocationCode":      ORIGIN,
            "destinationLocationCode": DESTINATION,
            "departureDate":           departure_date,
            "adults":                  adults,
            "currencyCode":            CURRENCY,
            "nonStop":                 "false",
            "max":                     MAX_RESULTS,
        },
        timeout=20,
    )
    resp.raise_for_status()
    return resp.json().get("data", [])


def format_duration(iso: str) -> str:
    """PT3H25M → 3h 25m"""
    iso = iso.replace("PT", "")
    h = m = 0
    if "H" in iso:
        h, iso = iso.split("H")
        h = int(h)
    if "M" in iso:
        m = int(iso.replace("M", ""))
    return f"{h}h {m:02d}m" if h else f"{m}m"


def print_offer(i: int, offer: dict) -> None:
    price     = offer["price"]["grandTotal"]
    currency  = offer["price"]["currency"]
    itins     = offer["itineraries"]

    print(f"\n{'─'*55}")
    print(f"  #{i+1}  {price} {currency}")
    print(f"{'─'*55}")

    for leg_idx, itin in enumerate(itins):
        direction = "✈  outbound" if leg_idx == 0 else "✈  return"
        print(f"  {direction}  (total: {format_duration(itin['duration'])})")
        for seg in itin["segments"]:
            dep = seg["departure"]
            arr = seg["arrival"]
            carrier = seg.get("carrierCode", "?")
            flight  = seg.get("number", "")
            stops   = "direct" if len(itin["segments"]) == 1 else f"stop {itin['segments'].index(seg)+1}/{len(itin['segments'])}"
            print(
                f"    {dep['iataCode']} {dep['at'][11:16]}  →"
                f"  {arr['iataCode']} {arr['at'][11:16]}"
                f"  │  {carrier}{flight}  [{stops}]"
            )


def upcoming_weekends(n: int = 4) -> list[str]:
    """Return the next n Friday departure dates (YYYY-MM-DD)."""
    today = date.today()
    days_until_friday = (4 - today.weekday()) % 7
    if days_until_friday == 0:
        days_until_friday = 7
    first_friday = today + timedelta(days=days_until_friday)
    return [(first_friday + timedelta(weeks=k)).isoformat() for k in range(n)]


def main() -> None:
    parser = argparse.ArgumentParser(description="Search cheap flights BER → TLV")
    parser.add_argument("--date",    help="Departure date YYYY-MM-DD (default: next 4 Fridays)")
    parser.add_argument("--adults",  type=int, default=1, help="Number of passengers (default: 1)")
    parser.add_argument("--json",    action="store_true", help="Dump raw JSON instead of formatted output")
    args = parser.parse_args()

    api_key    = os.getenv("AMADEUS_API_KEY")
    api_secret = os.getenv("AMADEUS_API_SECRET")
    if not api_key or not api_secret:
        sys.exit(
            "Set environment variables:\n"
            "  export AMADEUS_API_KEY=<your_key>\n"
            "  export AMADEUS_API_SECRET=<your_secret>\n\n"
            "Get free credentials at https://developers.amadeus.com"
        )

    dates = [args.date] if args.date else upcoming_weekends(4)

    print(f"\n🔍  Berlin (BER) → Tel Aviv (TLV)")
    print(f"    Passengers : {args.adults}")
    print(f"    Dates      : {', '.join(dates)}")
    print(f"    Currency   : {CURRENCY}\n")

    try:
        token = get_token(api_key, api_secret)
    except requests.HTTPError as e:
        sys.exit(f"Auth failed: {e}")

    all_offers: list[dict] = []

    for dep_date in dates:
        print(f"\n{'═'*55}")
        print(f"  Departure: {dep_date}")
        print(f"{'═'*55}")
        try:
            offers = search_flights(token, dep_date, args.adults)
        except requests.HTTPError as e:
            print(f"  Search error for {dep_date}: {e}")
            continue

        if not offers:
            print("  No flights found.")
            continue

        all_offers.extend(offers)

        if args.json:
            print(json.dumps(offers, indent=2, ensure_ascii=False))
        else:
            for i, offer in enumerate(offers):
                print_offer(i, offer)

    if all_offers and not args.json:
        prices = sorted(
            all_offers,
            key=lambda o: float(o["price"]["grandTotal"]),
        )
        best = prices[0]
        dep  = best["itineraries"][0]["segments"][0]["departure"]
        print(f"\n{'═'*55}")
        print(f"  💶  Cheapest found: {best['price']['grandTotal']} {CURRENCY}")
        print(f"      Departs: {dep['iataCode']} on {dep['at'][:10]} at {dep['at'][11:16]}")
        print(f"{'═'*55}\n")


if __name__ == "__main__":
    main()
