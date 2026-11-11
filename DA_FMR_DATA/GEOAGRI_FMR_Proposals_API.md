# GEOAGRI Public FMR Proposals API Reference

| | |
|---|---|
| **Base URL** | `https://geoagri.bafe.gov.ph/api/fmr-proposals/` |
| **Format** | JSON (`application/json`) |
| **Auth** | Public (none required) |

---

## 1. Overview

The GEOAGRI Farm-to-Market Road (FMR) Proposals Public API provides read-only access to FMR project proposals, location hierarchies, project measurements and counterpart financials, and WGS 84 (EPSG:4326) spatial geometries.

| Endpoint | Method | URL Path | Description |
|---|---|---|---|
| List FMR Proposals | `GET` | `/api/fmr-proposals/` | Paginated list of FMR proposals with search and location/status filters. |
| FMR Project Details | `GET` | `/api/fmr-proposals/{fmr_id}/` | Detailed metadata, location codes, connectivity rating, and geometry for a single FMR project. |

---

## 2. Rate Limiting & HTTP Headers

Both endpoints are publicly accessible and enforce per-IP rate limiting over a 60-second window:

- **List Endpoint** (`/api/fmr-proposals/`): 60 requests per 60 seconds per IP
- **Detail Endpoint** (`/api/fmr-proposals/{fmr_id}/`): 120 requests per 60 seconds per IP

| Response Header | Example Value | Description |
|---|---|---|
| `X-RateLimit-Limit` | `60` | Maximum requests allowed in the current 60-second window. |
| `X-RateLimit-Remaining` | `59` | Remaining requests allowed in the current window. |
| `X-RateLimit-Reset` | `1794288120` | UTC Unix timestamp (seconds) when the current rate limit window resets. |
| `Retry-After` | `42` | Seconds to wait before retrying (included when HTTP 429 is returned). |
| `Cache-Control` | `public, max-age=60` | Successful GET responses may be cached for 60 seconds. |
| `Access-Control-Allow-Origin` | `*` | CORS enabled for browser/web map clients (`GET`, `HEAD`, `OPTIONS`). |

---

## 3. Endpoint 1: List FMR Proposals

```
GET https://geoagri.bafe.gov.ph/api/fmr-proposals/
```

Returns a paginated list of all FMR proposals that have prioritization records, ordered by project ID. Supports keyword search as well as filtering by evaluation status and administrative location.

### 3.1 Query Parameters

| Parameter | Type | Default / Constraints | Description |
|---|---|---|---|
| `page` | integer | Default: `1` (Min: 1) | Page number to retrieve. |
| `page_size` | integer | Default: `50` (1–500) | Number of FMR projects returned per page. |
| `search` | string | Optional (Max: 100 chars) | Case-insensitive keyword search across `road_name`, `fmrcode`, `region`, `province`, `district`, `municipality`, and `barangay`. |
| `status` | string | Optional | Filter by validation status: `'EVALUATED'`, `'FOR EVALUATION'`, or `'All'`. |
| `region` | string | Optional (Max: 100 chars) | Filter by region proper name (e.g. `'Region III'`), short code (e.g. `'rfo3'`), or abbreviation (e.g. `'R3'`). |
| `province` | string | Optional (Max: 100 chars) | Exact case-insensitive match on province name (e.g. `'Nueva Ecija'`). |
| `district` | string | Optional (Max: 100 chars) | Exact case-insensitive match on legislative district. |
| `municipality` | string | Optional (Max: 100 chars) | Exact case-insensitive match on city/municipality name. |
| `barangay` | string | Optional (Max: 100 chars) | Exact case-insensitive match on barangay name. |

### 3.2 Response Fields

| Field | Type | Description |
|---|---|---|
| `count` | integer | Total number of FMR proposals matching the query filters. |
| `page` | integer | Current page number. |
| `page_size` | integer | Number of items per page. |
| `total_pages` | integer | Total number of pages available. |
| `data` | array\<object\> | Array of FMR proposal objects for the current page. |
| `data[].id` | integer | Unique numeric identifier of the FMR proposal. |
| `data[].fmrcode` | string | System-generated FMR code (`<reg_abbreviation>-<location_id>-<id>`). |
| `data[].road_name` | string | Proposed Farm-to-Market Road name. |
| `data[].status` | string | Evaluation status (`'FOR EVALUATION'` or `'EVALUATED'`). |
| `data[].location` | object | Administrative location object containing `region`, `province`, `district`, `municipality`, and `barangay`. |
| `data[].estimate_road_length` | float | Estimated road length in kilometers (km). |
| `data[].road_width` | float | Road width in meters (m). |
| `data[].estimate_project_cost` | float | Estimated project cost in Philippine Pesos (PhP). |
| `data[].counterpart_amount` | float \| null | LGU/proponent counterpart fund amount in PhP (`null` if none). |
| `data[].coordinates` | object | WGS 84 (EPSG:4326) spatial coordinates: `srid`, `first_coordinate`, `last_coordinate`, `centroid`, and `geojson`. |

### 3.3 cURL Request Examples

```bash
# Fetch page 1 (default 50 items per page)
curl -X GET "https://geoagri.bafe.gov.ph/api/fmr-proposals/" \
     -H "Accept: application/json"

# Search by keyword with province, status, and custom pagination
curl -X GET "https://geoagri.bafe.gov.ph/api/fmr-proposals/?province=South+Cotabato&status=FOR+EVALUATION&search=San+Isidro&page=1&page_size=20" \
     -H "Accept: application/json"
```

### 3.4 Example JSON Response (200 OK)

```json
{
  "count": 27870,
  "page": 1,
  "page_size": 50,
  "total_pages": 558,
  "data": [
    {
      "id": 6,
      "fmrcode": "R12-38320-6",
      "road_name": "Concreting of Purok Pag-asa to Sitio Maligaya FMR",
      "status": "FOR EVALUATION",
      "location": {
        "region": "Region XII (SOCCSKSARGEN)",
        "province": "South Cotabato",
        "district": "2nd",
        "municipality": "Koronadal City",
        "barangay": "San Isidro"
      },
      "estimate_road_length": 1.5,
      "road_width": 5.0,
      "estimate_project_cost": 18000000.0,
      "counterpart_amount": 1800000.0,
      "coordinates": {
        "srid": 4326,
        "first_coordinate": {
          "lng": 124.87213412,
          "lat": 6.49123456
        },
        "last_coordinate": {
          "lng": 124.88345123,
          "lat": 6.50112233
        },
        "centroid": {
          "lng": 124.87779267,
          "lat": 6.49617844
        },
        "geojson": {
          "type": "MultiLineString",
          "coordinates": [
            [
              [124.87213412, 6.49123456],
              [124.87779267, 6.49617844],
              [124.88345123, 6.50112233]
            ]
          ]
        }
      }
    }
  ]
}
```

---

## 4. Endpoint 2: Single FMR Project Details

```
GET https://geoagri.bafe.gov.ph/api/fmr-proposals/{fmr_id}/
```

Retrieves details for a single FMR proposal by its numeric ID, including extended location identifiers and road connectivity rating.

### 4.1 Path Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `fmr_id` | integer | Yes | Unique numeric ID of the FMR project (e.g. `6`). |

### 4.2 Response Fields

| Field | Type | Description |
|---|---|---|
| `id` | integer | Unique numeric identifier of the FMR proposal. |
| `fmrcode` | string | System-generated FMR code (`<reg_abbreviation>-<location_id>-<id>`). |
| `road_name` | string | Proposed Farm-to-Market Road name. |
| `status` | string | Evaluation status (`'FOR EVALUATION'` or `'EVALUATED'`). |
| `location.location_id` | integer | Internal database ID of the administrative location. |
| `location.reg_abbreviation` | string | Regional abbreviation code (e.g. `'R12'`, `'R3'`, `'CAR'`). |
| `location.reg_short_name` | string | Regional short identifier (e.g. `'rfu12'`, `'rfo3'`, `'car'`). |
| `location.region` | string | Full region proper name. |
| `location.province` | string | Province name. |
| `location.district` | string | Legislative district. |
| `location.municipality` | string | City or municipality name. |
| `location.barangay` | string | Barangay name. |
| `estimate_road_length` | float | Estimated road length in kilometers (km). |
| `road_width` | float | Road width in meters (m). |
| `estimate_project_cost` | float | Estimated project cost in Philippine Pesos (PhP). |
| `counterpart_amount` | float \| null | LGU/proponent counterpart fund amount in PhP (`null` if none). |
| `connectivity_rating` | string | Traffic connectivity classification (`'Local'` or `'Through'`). |
| `coordinates` | object | WGS 84 (EPSG:4326) spatial coordinates: `srid`, `first_coordinate`, `last_coordinate`, `centroid`, and `geojson`. |

### 4.3 cURL Request Example

```bash
curl -X GET "https://geoagri.bafe.gov.ph/api/fmr-proposals/6/" \
     -H "Accept: application/json"
```

### 4.4 Example JSON Response (200 OK)

```json
{
  "id": 6,
  "fmrcode": "R12-38320-6",
  "road_name": "Concreting of Purok Pag-asa to Sitio Maligaya FMR",
  "status": "FOR EVALUATION",
  "location": {
    "location_id": 38320,
    "reg_abbreviation": "R12",
    "reg_short_name": "rfu12",
    "region": "Region XII (SOCCSKSARGEN)",
    "province": "South Cotabato",
    "district": "2nd",
    "municipality": "Koronadal City",
    "barangay": "San Isidro"
  },
  "estimate_road_length": 1.5,
  "road_width": 5.0,
  "estimate_project_cost": 18000000.0,
  "counterpart_amount": 1800000.0,
  "connectivity_rating": "Local",
  "coordinates": {
    "srid": 4326,
    "first_coordinate": {
      "lng": 124.87213412,
      "lat": 6.49123456
    },
    "last_coordinate": {
      "lng": 124.88345123,
      "lat": 6.50112233
    },
    "centroid": {
      "lng": 124.87779267,
      "lat": 6.49617844
    },
    "geojson": {
      "type": "MultiLineString",
      "coordinates": [
        [
          [124.87213412, 6.49123456],
          [124.87779267, 6.49617844],
          [124.88345123, 6.50112233]
        ]
      ]
    }
  }
}
```

---

## 5. HTTP Status Codes & Error Responses

All error responses return a JSON object with an `error` key explaining the failure:

```json
{
  "error": "Invalid 'page_size': must be between 1 and 500."
}
```

| Status Code | Meaning | Common Cause |
|---|---|---|
| `200 OK` | Success | Request succeeded and returned JSON payload. |
| `204 No Content` | CORS Preflight | Returned for `OPTIONS` preflight requests. |
| `400 Bad Request` | Validation Error | Invalid `page`/`page_size`, invalid status value, or filter parameter > 100 characters. |
| `404 Not Found` | Not Found | Requested `fmr_id` does not exist. |
| `405 Method Not Allowed` | Invalid HTTP Method | Only `GET`, `HEAD`, and `OPTIONS` methods are permitted. |
| `429 Too Many Requests` | Rate Limit Exceeded | Client exceeded 60 req/min (list) or 120 req/min (detail). Check `Retry-After` header. |
| `500 Internal Server Error` | Server Error | Unexpected database error occurred while processing the request. |

---

## 6. Geometry samples: documented valid vs live invalid

The API documentation only shows a **valid** WGS 84 GeoJSON sample. It does **not** document invalid geometry payloads (HTTP `400` covers bad query params only). Live responses for NEP/HGAB-matched projects can still return syntactically valid GeoJSON whose vertices are geographically wrong.

### 6.1 Valid (from this API doc / vendor examples)

WGS 84 `MultiLineString`, `[lng, lat]` order — South Cotabato–plausible coords:

```json
{
  "type": "MultiLineString",
  "coordinates": [
    [
      [124.87213412, 6.49123456],
      [124.87779267, 6.49617844],
      [124.88345123, 6.50112233]
    ]
  ]
}
```

Wrapped as returned under `coordinates`:

```json
{
  "srid": 4326,
  "first_coordinate": { "lng": 124.87213412, "lat": 6.49123456 },
  "last_coordinate": { "lng": 124.88345123, "lat": 6.50112233 },
  "centroid": { "lng": 124.87779267, "lat": 6.49617844 },
  "geojson": {
    "type": "MultiLineString",
    "coordinates": [
      [
        [124.87213412, 6.49123456],
        [124.87779267, 6.49617844],
        [124.88345123, 6.50112233]
      ]
    ]
  }
}
```

### 6.2 Invalid (not in the vendor doc — from live match samples)

Observed for title-matched NEP/HGAB rows (see `geoagri_nep_sample_matches.json`, `geo_coords_ok: false`). Shape is still valid GeoJSON, but vertices sit near the equator (~lat `0.001`), not the project LGU:

```json
{
  "centroid": { "lng": 118.51141993, "lat": 0.001088 },
  "first": { "lng": 118.51141993, "lat": 0.00108797 },
  "last": { "lng": 118.51141995, "lat": 0.00108799 },
  "geo_coords_ok": false
}
```

**Example:** `R1-44-45123` (Bacarra, Ilocos Norte) — expected ~`18.28°N` / ~`120.63°E` from the NEP annex; live API returns ~`0.001°N` / ~`118.51°E` with a dense MultiLineString (often hundreds–thousands of verts) collapsed in that null region.

| Check | Documented sample | Live matched sample (`R1-44-45123`) |
|---|---|---|
| GeoJSON type | `MultiLineString` | `MultiLineString` |
| `[lng, lat]` order | Yes | Yes |
| Inside PH bbox | Yes (~South Cotabato) | No (near equator) |
| Usable for mapping | Yes | No — use NEP START/END instead |

Presentation artifacts with flags: `geoagri_validity_presentation.{html,json,geojson,md}`.
