/* Pyrate Dial station directory — the same 27 stations on desktop and phone.
 * Keep stable IDs when renaming a station or moving its frequency.
 * YouTube playlist IDs are copied from the owner's updated playlist list.
 * Song additions/removals still happen in YouTube, not in this file.
 * Live feeds: no proxy, recording, caching, pre-roll suppression or random seek.
 * Published feed references:
 * https://www.kexp.org/streaming-urls/
 * https://wfuv.org/options
 * https://www.cpr.org/streaming-help/
 * CPR publishes the MP3 endpoint with HTTP; this build uses its HTTPS form.
 */
window.PYRATE_DIRECTORY_BUILD = '20260916-live1';
window.PYRATE_STATIONS = Object.freeze(
[
  {
    "frequency": 88.3,
    "name": "Wilt Josey",
    "playlistId": "PLtJfKjV02nK5zvGMYE_m1PTvX2v1ykTTm",
    "id": "wilt-josey",
    "sourceType": "youtube"
  },
  {
    "frequency": 89.1,
    "name": "Poet Row",
    "playlistId": "PLf4jefl9i4GE",
    "id": "poet-row",
    "sourceType": "youtube"
  },
  {
    "frequency": 89.9,
    "name": "NIGHT WIRE",
    "playlistId": "PLCj9bDJRH4R4",
    "id": "night-wire",
    "sourceType": "youtube"
  },
  {
    "id": "kexp",
    "frequency": 90.3,
    "name": "KEXP",
    "sourceType": "live",
    "location": "SEATTLE",
    "streams": [
      {
        "url": "https://kexp.streamguys1.com/kexp160.aac",
        "type": "audio/aac"
      },
      {
        "url": "https://kexp.streamguys1.com/kexp64.aac",
        "type": "audio/aac"
      }
    ]
  },
  {
    "id": "wfuv",
    "frequency": 90.7,
    "name": "WFUV",
    "sourceType": "live",
    "location": "NEW YORK CITY",
    "streams": [
      {
        "url": "https://onair.wfuv.org/onair-hi",
        "type": "audio/mpeg"
      },
      {
        "url": "https://onair.wfuv.org/onair-aacplus",
        "type": "audio/aac"
      }
    ]
  },
  {
    "frequency": 91.1,
    "name": "Little Red Songbook",
    "playlistId": "PLCcf-gNtNssc",
    "id": "little-red-songbook",
    "sourceType": "youtube"
  },
  {
    "frequency": 91.7,
    "name": "Test Pattern",
    "playlistId": "PLEZbyDYLyoeg",
    "id": "test-pattern",
    "sourceType": "youtube"
  },
  {
    "frequency": 92.1,
    "name": "Basement Tapes",
    "playlistId": "PLtJfKjV02nK47AU54zBeTv3Xq-RmmW_E3",
    "id": "basement-tapes",
    "sourceType": "youtube"
  },
  {
    "frequency": 92.5,
    "name": "The Epidemic",
    "playlistId": "PLPPUTf_kY4p4",
    "id": "the-epidemic",
    "sourceType": "youtube"
  },
  {
    "frequency": 93.1,
    "name": "THE HAYLOFT",
    "playlistId": "PLaLkCxAuqOxw",
    "id": "the-hayloft",
    "sourceType": "youtube"
  },
  {
    "frequency": 93.9,
    "name": "Atomic Hits",
    "playlistId": "PLtJfKjV02nK7H_fNgiYZSwF8wAilPBOcC",
    "id": "atomic-hits",
    "sourceType": "youtube"
  },
  {
    "frequency": 94.7,
    "name": "FIELD NOTES",
    "playlistId": "PLQUHC3DmiKi8",
    "id": "field-notes",
    "sourceType": "youtube"
  },
  {
    "frequency": 95.7,
    "name": "Martin's Corner",
    "playlistId": "PLtJfKjV02nK5zLBM_-OF4FH46GGVtEYz-",
    "id": "martins-corner",
    "sourceType": "youtube"
  },
  {
    "frequency": 96.9,
    "name": "Dead Air",
    "playlistId": "PLOG7V5TNJmjI",
    "id": "dead-air",
    "sourceType": "youtube"
  },
  {
    "frequency": 97.1,
    "name": "DRAGNET",
    "playlistId": "PLcvsb7f4aYgc",
    "id": "dragnet",
    "sourceType": "youtube"
  },
  {
    "frequency": 98.3,
    "name": "Tivel Hour",
    "playlistId": "PLtJfKjV02nK6PLkS4mVlWNOiD-q2tIUxe",
    "id": "tivel-hour",
    "sourceType": "youtube"
  },
  {
    "frequency": 99.9,
    "name": "Sleepy Mountain",
    "playlistId": "PLtJfKjV02nK5iUqUFnSQvqucBBfg93twL",
    "id": "sleepy-mountain",
    "sourceType": "youtube"
  },
  {
    "frequency": 100.7,
    "name": "Joshua's Barstool",
    "playlistId": "PLtJfKjV02nK6_nR9NkG1JuiRPWP_IANjY",
    "id": "joshuas-barstool",
    "sourceType": "youtube"
  },
  {
    "frequency": 101.5,
    "name": "Sentimental Hits",
    "playlistId": "PLtJfKjV02nK70xTDAe9HERw9vdoFS4sjf",
    "id": "sentimental-hits",
    "sourceType": "youtube"
  },
  {
    "id": "indie",
    "frequency": 102.3,
    "name": "Indie",
    "sourceType": "live",
    "location": "COLORADO",
    "streams": [
      {
        "url": "https://stream1.cprnetwork.org/cpr3_lo",
        "type": "audio/mpeg"
      }
    ]
  },
  {
    "frequency": 102.7,
    "name": "Bird Song",
    "playlistId": "PLtJfKjV02nK4esMJ3uDBL5Zy2-mCEykui",
    "id": "bird-song",
    "sourceType": "youtube"
  },
  {
    "frequency": 103.1,
    "name": "The Lowlands",
    "playlistId": "PLtJfKjV02nK7uOl7VZ7EwpLk9pfBXOw6P",
    "id": "the-lowlands",
    "sourceType": "youtube"
  },
  {
    "frequency": 103.7,
    "name": "BACKWATER",
    "playlistId": "PLZ30awzhOASc",
    "id": "backwater",
    "sourceType": "youtube"
  },
  {
    "frequency": 104.9,
    "name": "Helles Welles",
    "playlistId": "PLtJfKjV02nK7ZhssFluZx_bsEAya0DqtP",
    "id": "helles-welles",
    "sourceType": "youtube"
  },
  {
    "frequency": 105.7,
    "name": "Jurado Way",
    "playlistId": "PLtJfKjV02nK4m5iHY8-6wOGed8wb3pxGe",
    "id": "jurado-way",
    "sourceType": "youtube"
  },
  {
    "frequency": 106.9,
    "name": "Calibration",
    "playlistId": "PLTsu7Jw8TppY",
    "id": "calibration",
    "sourceType": "youtube"
  },
  {
    "frequency": 107.9,
    "name": "Ultimate Endless",
    "playlistId": "PLtJfKjV02nK7EiGIkgk8QYFhA1wZRAlSc",
    "id": "ultimate-endless",
    "sourceType": "youtube"
  }
].map(station => Object.freeze({
  ...station,
  ...(station.streams ? { streams: Object.freeze(station.streams.map(stream => Object.freeze(stream))) } : {})
})));

// Old ?s= bookmarks retain their original station, not their new array position.
window.PYRATE_LEGACY_APP_FREQUENCIES = Object.freeze([88.3, 89.1, 90.7, 91.1, 91.7, 92.5, 93.9, 94.7, 95.7, 96.9, 98.3, 99.9, 100.7, 101.5, 102.3, 103.1, 104.9, 105.7, 106.9, 107.9]);
// Legacy frequency-only bookmarks predate the real stations. New links use ?station=.
window.PYRATE_PREVIOUS_FREQUENCIES = Object.freeze({ '90.7': 92.1, '102.3': 102.7 });
