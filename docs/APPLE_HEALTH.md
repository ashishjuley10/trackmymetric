# Apple Health transfer

## What is implemented

The web app supports **user-run Shortcut → copy → paste → preview → save**. It does not read HealthKit directly or collect background data. `/health` contains a step-by-step recipe for creating the Shortcut on an iPhone. No signed downloadable Shortcut or native HealthKit module is included.

The user must build the Shortcut, grant Health permissions, select the appropriate source and validate it on their device. The button named “Run shortcut” opens a Shortcut named `TrackMyMetric Health`; it cannot install one that does not exist.

## Supported readings

| Metric | Accepted units | Stored unit |
| --- | --- | --- |
| Steps | `count` | count |
| Body weight | `kg`, `lb` | kg |
| Sleep | `hours`, `minutes` | hours |
| Water | `ml`, `L` | ml |

### Single-reading text

Synthetic example:

```text
TMM_HEALTH_V1
date=2020-09-16
metric=steps
unit=count
value=12000
source=Example iPhone
```

### Versioned JSON

```json
{
  "version": 1,
  "date": "2020-09-16",
  "readings": [
    { "metric": "weight", "value": 70, "unit": "kg", "source": "Example scale" },
    { "metric": "water", "value": 2, "unit": "L", "source": "Example app" }
  ]
}
```

The parser accepts one to four distinct readings for the same UK date. It rejects future or invalid dates, unsupported fields, duplicate metrics, invalid units and values outside the allowed ranges. Missing values stay missing.

## Avoiding double counting

For steps and water, choose one source before summing. Adding every iPhone and Watch sample can count overlapping activity twice. This recipe does not reproduce Apple's merged daily totals.

For weight, select the latest reading on the measurement date. Do not label an old weigh-in as today's measurement.

Sleep can be supplied as timezone-qualified intervals:

```text
TMM_SLEEP_V1
date=2020-09-16
source=Example Watch
2020-09-15T22:00:00+01:00|2020-09-16T06:00:00+01:00|Asleep
```

The parser unions overlapping Asleep/Core/Deep/REM intervals and ignores Awake/In Bed intervals. It clips to the UK noon-before to noon-of-wake-date window, with daylight saving transitions handled by the date logic. Naps in that window are included, so its total can differ from Apple Health's display. Raw intervals are processed in the browser; only the daily total is sent to the server.

## Review and save

The screen displays existing values beside proposed ones. Existing values are unselected initially; equal values cannot be selected. Only chosen readings are submitted, as absolute replacements. Study, meals, workouts, habits and notes are preserved.

`GET /api/health?date=YYYY-MM-DD` returns the revision and supported Health values. `POST /api/health` accepts a UUID request ID, expected revision and validated transfer. The write and import receipt are atomic. On a conflict, refresh the preview. On a lost response, retry with the same request ID. `GET /api/health` returns the five most recent receipts.

No Health values are placed in URLs or browser storage. Clipboard access is initiated by a tap, with manual paste as a fallback. Source labels are user-supplied provenance, not proof that Apple generated the data.

## Device acceptance check

Before calling the integration complete: run the Shortcut on an iPhone, compare its chosen-source readings, import into a test account, reopen the tracker and verify persistence. Repeat with a denied permission, an empty sample set, an overlapping sleep session and an attempted overwrite of an existing value. These device checks remain outstanding.
