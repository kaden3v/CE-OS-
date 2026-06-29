# track-shipments

Confirms real package delivery via the **USPS Tracking API** and flips orders
from "In transit" → "Delivered" only when the carrier actually delivered.

Etsy never reports delivery, so the Etsy sync lands orders as `shipped`
(in transit). This function closes the loop: it reads in-transit shipments that
carry a USPS tracking number, asks USPS for each one's status, and stamps the
shipment `delivered` when USPS says so. The `shipments_status_sync` DB trigger
then propagates `delivered` to the parent order.

## Setup

1. **Get USPS API credentials** (free):
   - Sign in at <https://developers.usps.com> → **Apps** → **Add App**.
   - Ensure the app includes the **Tracking** API (in the default product set).
   - Copy the **Consumer Key** (client_id) and **Consumer Secret** (client_secret).

2. **Store them** in `integration_config` (same table the Etsy sync uses):

   | key                  | value                          |
   | -------------------- | ------------------------------ |
   | `usps_client_id`     | Consumer Key                   |
   | `usps_client_secret` | Consumer Secret                |
   | `usps_sync_token`    | a long random string (cron gate) |

   Until all three are set, the function and its cron no-op safely.

3. **Deploy** the function and apply the cron migration
   (`20260628000000_track_shipments_cron.sql`, runs every 4 hours).

## Endpoints (all POST, gated by `?token=<usps_sync_token>`)

- **`?inspect=<trackingNumber>`** — dry run. Returns USPS's raw JSON plus how we
  parsed it. **Run this first** after adding credentials to confirm field names
  against live data before trusting the writer.
- *(default)* — check in-transit shipments (`delivered_at is null`, status in
  pending/ready/held/shipped) and mark the delivered ones. Processes up to 150
  per run; a backlog drains over consecutive runs.
- **`?reconcile=1`** — re-evaluate **every** tracked shipment, including ones
  previously marked delivered on an *estimate*. Corrects historical rows to their
  true USPS state (and downgrades a falsely-delivered order back to in transit).
  USPS ages out old tracking numbers (~120 days); those return 404 and are left
  untouched. Intended as a one-time backfill after first enabling the integration.

## Notes

- USPS OAuth uses the `client_credentials` grant; a fresh token is minted per run.
- Response parsing keys off `statusCategory` ("Delivered") with a fallback to the
  detailed `status` string, and reads the delivery timestamp from the matching
  `trackingEvents[]` entry (falling back to `deliveryDate`).
