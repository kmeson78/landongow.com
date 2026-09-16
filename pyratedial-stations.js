/* Pyrate Dial station directory — shared by desktop and phone.
 * Add/remove songs in YouTube: no counts or individual video IDs live here.
 * Only edit this file when adding/removing/renaming a station or changing its playlist.
 * Keep the playlist Public or Unlisted and allow embedding of its individual videos.
 */
window.PYRATE_STATIONS = Object.freeze(
[
  {
    "frequency": 88.3,
    "name": "Wilt Josey",
    "playlistId": "PLtJfKjV02nK5zvGMYE_m1PTvX2v1ykTTm"
  },
  {
    "frequency": 89.1,
    "name": "Poet Row",
    "playlistId": "PLf4jefl9i4GE"
  },
  {
    "frequency": 89.9,
    "name": "NIGHT WIRE",
    "playlistId": "PLCj9bDJRH4R4"
  },
  {
    "frequency": 90.7,
    "name": "Basement Tapes",
    "playlistId": "PLtJfKjV02nK47AU54zBeTv3Xq-RmmW_E3"
  },
  {
    "frequency": 91.1,
    "name": "Little Red Songbook",
    "playlistId": "PLCcf-gNtNssc"
  },
  {
    "frequency": 91.7,
    "name": "Test Pattern",
    "playlistId": "PLEZbyDYLyoeg"
  },
  {
    "frequency": 92.5,
    "name": "The Epidemic",
    "playlistId": "PLPPUTf_kY4p4"
  },
  {
    "frequency": 93.1,
    "name": "THE HAYLOFT",
    "playlistId": "PLaLkCxAuqOxw"
  },
  {
    "frequency": 93.9,
    "name": "Atomic Hits",
    "playlistId": "PLtJfKjV02nK7H_fNgiYZSwF8wAilPBOcC"
  },
  {
    "frequency": 94.7,
    "name": "FIELD NOTES",
    "playlistId": "PLQUHC3DmiKi8"
  },
  {
    "frequency": 95.7,
    "name": "Martin's Corner",
    "playlistId": "PLtJfKjV02nK5zLBM_-OF4FH46GGVtEYz-"
  },
  {
    "frequency": 96.9,
    "name": "Dead Air",
    "playlistId": "PLOG7V5TNJmjI"
  },
  {
    "frequency": 97.1,
    "name": "DRAGNET",
    "playlistId": "PLcvsb7f4aYgc"
  },
  {
    "frequency": 98.3,
    "name": "Tivel Hour",
    "playlistId": "PLtJfKjV02nK6PLkS4mVlWNOiD-q2tIUxe"
  },
  {
    "frequency": 99.9,
    "name": "Sleepy Mountain",
    "playlistId": "PLtJfKjV02nK5iUqUFnSQvqucBBfg93twL"
  },
  {
    "frequency": 100.7,
    "name": "Joshua's Barstool",
    "playlistId": "PLtJfKjV02nK6_nR9NkG1JuiRPWP_IANjY"
  },
  {
    "frequency": 101.5,
    "name": "Sentimental Hits",
    "playlistId": "PLtJfKjV02nK70xTDAe9HERw9vdoFS4sjf"
  },
  {
    "frequency": 102.3,
    "name": "Bird Song",
    "playlistId": "PLtJfKjV02nK4esMJ3uDBL5Zy2-mCEykui"
  },
  {
    "frequency": 103.1,
    "name": "H.C. Catalog",
    "playlistId": "PLtJfKjV02nK7uOl7VZ7EwpLk9pfBXOw6P"
  },
  {
    "frequency": 103.7,
    "name": "BACKWATER",
    "playlistId": "PLZ30awzhOASc"
  },
  {
    "frequency": 104.9,
    "name": "Helles Welles",
    "playlistId": "PLtJfKjV02nK7ZhssFluZx_bsEAya0DqtP"
  },
  {
    "frequency": 105.7,
    "name": "Jurado Way",
    "playlistId": "PLtJfKjV02nK4m5iHY8-6wOGed8wb3pxGe"
  },
  {
    "frequency": 106.9,
    "name": "Calibration",
    "playlistId": "PLTsu7Jw8TppY"
  },
  {
    "frequency": 107.9,
    "name": "Ultimate Endless",
    "playlistId": "PLtJfKjV02nK7EiGIkgk8QYFhA1wZRAlSc"
  }
].map(station => Object.freeze(station)));

// Preserve the meaning of old phone bookmarks using ?s=0 through ?s=19.
// New bookmarks use ?f=94.7, which remains stable when stations are inserted.
window.PYRATE_LEGACY_APP_FREQUENCIES = Object.freeze([88.3, 89.1, 90.7, 91.1, 91.7, 92.5, 93.9, 94.7, 95.7, 96.9, 98.3, 99.9, 100.7, 101.5, 102.3, 103.1, 104.9, 105.7, 106.9, 107.9]);
