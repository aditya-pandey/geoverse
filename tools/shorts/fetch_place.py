"""Download real aerial photos (and the exact outline) of a small place for a story video. Run on your Mac.

    pip3 install pillow numpy certifi          # once
    python3 fetch_place.py stories/pheasant-island.json

Reads the story's "place" (lat, lon, slug, osm name pattern) and writes assets/places/<slug>/:
  outline.geojson   the place's exact shape from OpenStreetMap (also re-centres everything on it)
  wide.jpg, regional.jpg   Sentinel-2 cloudless 2016 (EOX, CC BY 4.0) or aerial photos, ~250 and ~40 km wide
  local.jpg         official aerial photo, ~2.4 km wide
  close.jpg         official aerial photo, ~0.55 km wide
  manifest.json     where each image sits on the map (the video page reads this)
Aerial photos: Spain's PNOA (IGN España, CC BY 4.0) with France's BD ORTHO (IGN France, Licence Ouverte)
filling in wherever the Spanish mosaic has no data, so border places come out seamless.
All free to use with credit; the credit line is in the story JSON and goes in the video description.
"""
import io, json, math, pathlib, ssl, sys, urllib.parse, urllib.request

HERE = pathlib.Path(__file__).parent
R = 6378137.0
W, H = 1620, 2880                       # 1.5× the video frame, so the camera can push in without blur

try:
    import certifi; CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    CTX = None


def get(url, data=None, timeout=90):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": "bhoogol-shorts/1.0 (geography videos)"})
    with urllib.request.urlopen(req, context=CTX, timeout=timeout) as r:
        return r.read(), r.headers.get("content-type", "")


def merc(lon, lat):
    return R * math.radians(lon), R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def unmerc(x, y):
    return math.degrees(x / R), math.degrees(math.atan(math.sinh(y / R)))


def bbox(lon, lat, width_m):
    """A 9:16 box `width_m` wide on the ground, in Web Mercator metres."""
    x, y = merc(lon, lat); k = 1 / math.cos(math.radians(lat))
    w, h = width_m * k, width_m * k * H / W
    return (x - w / 2, y - h / 2, x + w / 2, y + h / 2)


def wms(base, layer, box, version="1.3.0", fmt="image/jpeg"):
    crs = "CRS" if version == "1.3.0" else "SRS"
    q = {"SERVICE": "WMS", "VERSION": version, "REQUEST": "GetMap", "LAYERS": layer, "STYLES": "", crs: "EPSG:3857",
         "BBOX": ",".join(f"{v:.2f}" for v in box), "WIDTH": W, "HEIGHT": H, "FORMAT": fmt}
    body, ctype = get(base + ("&" if "?" in base else "?") + urllib.parse.urlencode(q))
    if not ctype.startswith("image"):
        raise RuntimeError(body[:300].decode("utf8", "replace"))
    from PIL import Image
    return Image.open(io.BytesIO(body)).convert("RGB")


def aerial(box):
    """Spain's PNOA where it has data, France's BD ORTHO everywhere else."""
    import numpy as np
    from PIL import Image
    es = fr = None
    try: es = wms("https://www.ign.es/wms-inspire/pnoa-ma", "OI.OrthoimageCoverage", box)
    except Exception as e: print("   PNOA (Spain) failed:", str(e)[:160])
    try: fr = wms("https://data.geopf.fr/wms-r/wms", "ORTHOIMAGERY.ORTHOPHOTOS", box)
    except Exception as e: print("   BD ORTHO (France) failed:", str(e)[:160])
    if es is None and fr is None: raise RuntimeError("no aerial source answered")
    if es is None or fr is None: return es or fr
    a, b = np.asarray(es).astype(np.int16), np.asarray(fr).astype(np.int16)
    def empty(img):                      # "no data" shows up as flat white or flat black
        return (img.min(2) > 247) | (img.max(2) < 6)
    e, f = empty(a), empty(b)
    use_fr = e & ~f
    # soften the seam a little
    out = np.where(use_fr[..., None], b, a).astype(np.uint8)
    print(f"   combined: {100 * use_fr.mean():.0f}% from France, {100 * (1 - use_fr.mean()):.0f}% from Spain")
    return Image.fromarray(out)


def outline(place):
    """The place's exact shape from OpenStreetMap: a closed outline whose name matches, within 2 km of the given point."""
    lat, lon, d = place["lat"], place["lon"], 0.03
    q = f"""[out:json][timeout:30];
(way["name"~"{place['osm']}",i]({lat - d},{lon - d},{lat + d},{lon + d});
 way["name:en"~"{place['osm']}",i]({lat - d},{lon - d},{lat + d},{lon + d});
 way["place"="islet"]({lat - d},{lon - d},{lat + d},{lon + d}););
out geom;"""
    body, _ = get("https://overpass-api.de/api/interpreter", data=urllib.parse.urlencode({"data": q}).encode())
    best = None
    for el in json.loads(body)["elements"]:
        g = el.get("geometry") or []
        ring = [[p["lon"], p["lat"]] for p in g]
        if len(ring) < 4 or ring[0] != ring[-1]: continue
        cx, cy = sum(p[0] for p in ring[:-1]) / (len(ring) - 1), sum(p[1] for p in ring[:-1]) / (len(ring) - 1)
        km = math.hypot((cx - lon) * 111.3 * math.cos(math.radians(lat)), (cy - lat) * 110.5)
        tags = el.get("tags", {}); named = any(__import__("re").search(place["osm"], tags.get(k, ""), __import__("re").I) for k in ("name", "name:en", "name:es", "name:fr", "name:eu"))
        if km > 2: continue
        score = (2 if named else 0) + (1 if tags.get("place") == "islet" else 0) - km / 10
        if best is None or score > best["score"]: best = {"ring": ring, "name": tags.get("name", ""), "score": score, "km": km}
    if not best: raise RuntimeError(f"no outline named like {place['osm']!r} within 2 km of {lat},{lon}")
    return best


def main(path):
    story = json.loads(pathlib.Path(path).read_text()); place = story["place"]
    out = HERE / "assets" / "places" / place["slug"]; out.mkdir(parents=True, exist_ok=True)
    man = {"layers": [], "credit": story.get("credit", "")}
    lon, lat = place["lon"], place["lat"]
    print("1/5 outline from OpenStreetMap…")
    try:
        o = outline(place); ring = o["ring"]
        lon = sum(p[0] for p in ring[:-1]) / (len(ring) - 1); lat = sum(p[1] for p in ring[:-1]) / (len(ring) - 1)
        (out / "outline.geojson").write_text(json.dumps({"type": "Feature", "properties": {"name": o["name"]}, "geometry": {"type": "Polygon", "coordinates": [ring]}}))
        print(f"   found “{o['name']}” {o['km']:.2f} km from the given point · centre {lat:.5f}, {lon:.5f}")
    except Exception as e:
        print("   outline failed, using the story's coordinates:", str(e)[:200])
        (out / "outline.geojson").unlink(missing_ok=True)
    man["center"] = [lon, lat]
    def sat_or_aerial(box):                 # Sentinel-2 cloudless when EOX answers, otherwise the official aerial photos
        try: return wms("https://tiles.maps.eox.at/wms", "s2cloudless", box, "1.1.1")
        except Exception as e: print("   Sentinel-2 failed, using aerial photos:", str(e)[:120]); return aerial(box)
    for i, (name, width, fn) in enumerate([("wide", 250000, sat_or_aerial), ("regional", 40000, sat_or_aerial), ("local", 2400, aerial), ("close", 550, aerial)]):
        print(f"{i + 2}/5 {name} ({width / 1000:g} km wide)…")
        try:
            box = bbox(lon, lat, width); img = fn(box)
            img.save(out / f"{name}.jpg", quality=90)
            (x0, y0, x1, y1) = box; a, b = unmerc(x0, y0), unmerc(x1, y1)
            man["layers"].append({"name": name, "file": f"{name}.jpg", "widthM": width, "west": a[0], "south": a[1], "east": b[0], "north": b[1]})
            print("   saved", name + ".jpg")
        except Exception as e:
            print(f"   {name} failed:", str(e)[:200])
    (out / "manifest.json").write_text(json.dumps(man, indent=1))
    print(f"\n✓ {out}  ·  {len(man['layers'])} of 4 images" + ("" if len(man["layers"]) == 4 else "  (the video draws an illustrated map where one is missing)"))


if __name__ == "__main__":
    main(sys.argv[1])
