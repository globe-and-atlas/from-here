/* From Here: your location is the start; at H:M the dot sits H degrees M arcminutes away along
 * the chosen map direction. The phone (src/pkjs) sends 2-bit map frames, the route in screen
 * coordinates and the day's place timeline; this file draws them and handles the flick. */
#include <pebble.h>

#define SCREEN_W 200
#define MAP_Y 34
#define MAP_W 200
#define MAP_H 152
#define PANEL_Y (MAP_Y + MAP_H)
#define INSET 44
#define CHUNK 2000
#define ROUTE_SAMPLES 289
#define OFFSCREEN (-32768)
#define MAX_RUNS 96
#define LABEL_LEN 41
#define OVERRIDE_MS 60000
#define REQUEST_TIMEOUT_S 30

enum { ZOOM_NOW, ZOOM_HOUR, ZOOM_DAY, ZOOM_GLOBE, ZOOM_INSET, ZOOM_COUNT };
enum { KIND_MAP, KIND_GLOBE };

typedef struct {
  bool ready;       /* every part received */
  uint8_t kind, w, h, land, corner;
  int16_t base, valid_to;
  uint8_t parts, got;
  GBitmap *bitmap;
  int16_t route[ROUTE_SAMPLES * 2];
  char towns[360];
} Frame;

typedef struct { int16_t minute; uint8_t flags; char label[LABEL_LEN]; } Run;

static Window *s_window;
static Layer *s_canvas;
static Layer *s_map; /* own layer so the route and labels are clipped to the map */
static Frame s_frames[ZOOM_COUNT];
static Run s_runs[MAX_RUNS];
static int s_run_count;
static bool s_have_origin;
static int32_t s_origin_lat, s_origin_lon; /* arcminutes */
static int s_direction = 1, s_default_zoom = ZOOM_HOUR;
static bool s_override;
static int s_user_zoom = ZOOM_HOUR;
static AppTimer *s_override_timer;
static int s_pending = -1;
static time_t s_pending_since, s_last_timeline_ask;

enum { PERSIST_ORIGIN_LAT = 1, PERSIST_ORIGIN_LON, PERSIST_DIRECTION, PERSIST_DEFAULT_ZOOM };

static const int8_t STEPS[8][2] = {{1, 0}, {1, 1}, {0, 1}, {-1, 1}, {-1, 0}, {-1, -1}, {0, -1}, {1, -1}};
static GColor s_map_palette[4], s_globe_palette[4];

/* ---------------- time and position ---------------- */

static int minute_of_day(void) {
#ifdef FH_TEST_MINUTE
  return FH_TEST_MINUTE;
#else
  time_t now = time(NULL);
  struct tm *t = localtime(&now);
  return t->tm_hour * 60 + t->tm_min;
#endif
}

/* Same arithmetic as route.js: integer arcminutes, over the pole to the far side, wrap longitude. */
static void point_at(int minute, int32_t *lat, int32_t *lon) {
  int32_t la = s_origin_lat + STEPS[s_direction][0] * minute;
  int32_t lo = s_origin_lon + STEPS[s_direction][1] * minute;
  if (la > 5400) { la = 10800 - la; lo += 10800; }
  else if (la < -5400) { la = -10800 - la; lo += 10800; }
  lo = ((lo + 10800) % 21600 + 21600) % 21600 - 10800;
  *lat = la; *lon = lo;
}

static void format_coord(int32_t arcmin, char pos, char neg, char *out, size_t size) {
  int32_t a = arcmin < 0 ? -arcmin : arcmin;
  snprintf(out, size, "%d\xc2\xb0%02d'%c", (int)(a / 60), (int)(a % 60), arcmin < 0 ? neg : pos);
}

/* ---------------- frames ---------------- */

static bool fresh(const Frame *f, int minute) {
  return f->ready && minute >= f->base && minute <= f->valid_to;
}

static int effective_zoom(int minute) {
  if (s_override) return s_user_zoom;
  int z = s_default_zoom;
  const Frame *f = &s_frames[z];
  /* Open water: under 5% land in the default local frame shows the whole day instead. */
  if ((z == ZOOM_HOUR || z == ZOOM_NOW) && fresh(f, minute) && f->land < 5) return ZOOM_DAY;
  return z;
}

static void send_request(int zoom, int minute) {
  DictionaryIterator *out;
  if (app_message_outbox_begin(&out) != APP_MSG_OK) return;
  if (zoom < 0) {
    dict_write_int32(out, MESSAGE_KEY_ReqTimeline, 1);
  } else {
    dict_write_int32(out, MESSAGE_KEY_ReqZoom, zoom);
    dict_write_int32(out, MESSAGE_KEY_ReqMinute, minute);
  }
  if (app_message_outbox_send() == APP_MSG_OK) {
    s_pending = zoom;
    s_pending_since = time(NULL);
  }
}

/* Ask for whatever the current view needs, one request at a time. */
static void request_needed(void) {
  time_t now = time(NULL);
  if (s_pending != -1 && now - s_pending_since < REQUEST_TIMEOUT_S) return;
  s_pending = -1;
  if (!s_have_origin || s_run_count == 0) {
    if (now - s_last_timeline_ask >= 60) { s_last_timeline_ask = now; send_request(-1, 0); }
    return;
  }
  int minute = minute_of_day();
  int view = effective_zoom(minute);
  int wanted[3] = {view, -1, -1};
  if (view == ZOOM_NOW || view == ZOOM_HOUR) wanted[1] = ZOOM_INSET;
  if (!s_override && s_default_zoom != view) wanted[2] = s_default_zoom; /* keep its land share current */
  for (int i = 0; i < 3; i++) {
    if (wanted[i] >= 0 && !fresh(&s_frames[wanted[i]], minute)) { send_request(wanted[i], minute); return; }
  }
}

static void store_part(DictionaryIterator *iter, Tuple *zoom_t) {
  int zoom = zoom_t->value->int32;
  if (zoom < 0 || zoom >= ZOOM_COUNT) return;
  Frame *f = &s_frames[zoom];
  Tuple *part_t = dict_find(iter, MESSAGE_KEY_FramePart);
  Tuple *data_t = dict_find(iter, MESSAGE_KEY_FrameData);
  if (!part_t || !data_t) return;
  int part = part_t->value->int32;
  if (part == 0) {
    Tuple *t;
    f->ready = false;
    f->got = 0;
    f->parts = (t = dict_find(iter, MESSAGE_KEY_FrameParts)) ? t->value->int32 : 1;
    f->kind = (t = dict_find(iter, MESSAGE_KEY_FrameKind)) ? t->value->int32 : KIND_MAP;
    uint8_t w = (t = dict_find(iter, MESSAGE_KEY_FrameW)) ? t->value->int32 : MAP_W;
    uint8_t h = (t = dict_find(iter, MESSAGE_KEY_FrameH)) ? t->value->int32 : MAP_H;
    f->valid_to = (t = dict_find(iter, MESSAGE_KEY_FrameValidTo)) ? t->value->int32 : 0;
    f->land = (t = dict_find(iter, MESSAGE_KEY_FrameLand)) ? t->value->int32 : 100;
    f->corner = (t = dict_find(iter, MESSAGE_KEY_FrameCorner)) ? t->value->int32 : 0;
    f->base = minute_of_day();
    if (f->bitmap && (f->w != w || f->h != h)) { gbitmap_destroy(f->bitmap); f->bitmap = NULL; }
    f->w = w; f->h = h;
    if (!f->bitmap) {
      f->bitmap = gbitmap_create_blank(GSize(w, h), GBitmapFormat2BitPalette);
      if (!f->bitmap) return;
      gbitmap_set_palette(f->bitmap, f->kind == KIND_GLOBE ? s_globe_palette : s_map_palette, false);
    } else {
      gbitmap_set_palette(f->bitmap, f->kind == KIND_GLOBE ? s_globe_palette : s_map_palette, false);
    }
    if ((t = dict_find(iter, MESSAGE_KEY_FrameRoute))) {
      int count = t->length / 2;
      const uint8_t *bytes = (const uint8_t *)t->value;
      for (int i = 0; i < ROUTE_SAMPLES * 2; i++) {
        f->route[i] = i < count ? (int16_t)(bytes[2 * i] | (bytes[2 * i + 1] << 8)) : OFFSCREEN;
      }
    }
    f->towns[0] = '\0';
    if ((t = dict_find(iter, MESSAGE_KEY_FrameTowns))) {
      strncpy(f->towns, t->value->cstring, sizeof(f->towns) - 1);
      f->towns[sizeof(f->towns) - 1] = '\0';
    }
  }
  if (!f->bitmap) return;
  /* Phone packs rows tightly (w/4 bytes); the bitmap may pad its rows. */
  int packed = (f->w + 3) / 4;
  int stride = gbitmap_get_bytes_per_row(f->bitmap);
  uint8_t *pixels = gbitmap_get_data(f->bitmap);
  const uint8_t *bytes = (const uint8_t *)data_t->value;
  for (int k = 0; k < (int)data_t->length; k++) {
    int g = part * CHUNK + k;
    int row = g / packed;
    if (row >= f->h) break;
    pixels[row * stride + g % packed] = bytes[k];
  }
  f->got += 1;
  if (f->got >= f->parts) {
    f->ready = true;
    if (s_pending == zoom) s_pending = -1;
  }
}

static void store_timeline(DictionaryIterator *iter) {
  Tuple *t;
  Tuple *lat_t = dict_find(iter, MESSAGE_KEY_OriginLat), *lon_t = dict_find(iter, MESSAGE_KEY_OriginLon);
  if (lat_t && lon_t) {
    s_origin_lat = lat_t->value->int32;
    s_origin_lon = lon_t->value->int32;
    s_have_origin = true;
    /* Remembered so the coordinates keep moving with no phone. */
    persist_write_int(PERSIST_ORIGIN_LAT, s_origin_lat);
    persist_write_int(PERSIST_ORIGIN_LON, s_origin_lon);
  }
  if ((t = dict_find(iter, MESSAGE_KEY_Direction))) {
    int d = t->value->int32;
    if (d != s_direction) for (int z = 0; z < ZOOM_COUNT; z++) s_frames[z].ready = false;
    s_direction = d & 7;
    persist_write_int(PERSIST_DIRECTION, s_direction);
  }
  if ((t = dict_find(iter, MESSAGE_KEY_DefaultZoom))) {
    s_default_zoom = t->value->int32 & 3;
    persist_write_int(PERSIST_DEFAULT_ZOOM, s_default_zoom);
  }
  if (!(t = dict_find(iter, MESSAGE_KEY_Timeline))) return;
  s_run_count = 0;
  const char *p = t->value->cstring;
  while (*p && s_run_count < MAX_RUNS) {
    Run *r = &s_runs[s_run_count];
    r->minute = atoi(p);
    while (*p && *p != '|') p++;
    if (*p) p++;
    r->flags = atoi(p);
    while (*p && *p != '|') p++;
    if (*p) p++;
    int n = 0;
    while (*p && *p != '\n') { if (n < LABEL_LEN - 1) r->label[n++] = *p; p++; }
    r->label[n] = '\0';
    if (*p) p++;
    s_run_count++;
  }
}

static void inbox(DictionaryIterator *iter, void *context) {
  Tuple *zoom_t = dict_find(iter, MESSAGE_KEY_FrameZoom);
  if (zoom_t) store_part(iter, zoom_t);
  else store_timeline(iter);
  layer_mark_dirty(s_canvas);
  request_needed();
}

static void outbox_failed(DictionaryIterator *iter, AppMessageResult reason, void *context) {
  s_pending = -1;
}

/* ---------------- drawing ---------------- */

static void outlined_text(GContext *ctx, const char *text, GFont font, GRect box, GColor color, GTextAlignment align) {
  graphics_context_set_text_color(ctx, GColorBlack);
  static const int8_t offsets[4][2] = {{-1, 0}, {1, 0}, {0, -1}, {0, 1}};
  for (int i = 0; i < 4; i++) {
    GRect b = GRect(box.origin.x + offsets[i][0], box.origin.y + offsets[i][1], box.size.w, box.size.h);
    graphics_draw_text(ctx, text, font, b, GTextOverflowModeTrailingEllipsis, align, NULL);
  }
  graphics_context_set_text_color(ctx, color);
  graphics_draw_text(ctx, text, font, box, GTextOverflowModeTrailingEllipsis, align, NULL);
}

static bool sample(const Frame *f, int i, GPoint origin, GPoint *out) {
  if (i < 0 || i >= ROUTE_SAMPLES || f->route[2 * i] == OFFSCREEN) return false;
  *out = GPoint(origin.x + f->route[2 * i], origin.y + f->route[2 * i + 1]);
  return true;
}

static void draw_route(GContext *ctx, const Frame *f, GPoint origin, int minute, bool thin) {
  int now = minute / 5;
  GPoint a, b;
  graphics_context_set_antialiased(ctx, false);
  graphics_context_set_stroke_width(ctx, thin ? 1 : 2);
  graphics_context_set_stroke_color(ctx, GColorYellow);
  for (int i = 0; i < now; i++) {
    if (sample(f, i, origin, &a) && sample(f, i + 1, origin, &b)) graphics_draw_line(ctx, a, b);
  }
  graphics_context_set_stroke_color(ctx, GColorChromeYellow);
  for (int i = now; i < ROUTE_SAMPLES - 1; i += 2) { /* dotted: the day still ahead */
    if (sample(f, i, origin, &a) && sample(f, i + 1, origin, &b)) graphics_draw_line(ctx, a, b);
  }
}

static bool dot_position(const Frame *f, GPoint origin, int minute, GPoint *out) {
  GPoint a, b;
  int i = minute / 5, frac = minute % 5;
  if (!sample(f, i, origin, &a)) return false;
  if (!sample(f, i + 1, origin, &b)) { *out = a; return true; }
  *out = GPoint(a.x + (b.x - a.x) * frac / 5, a.y + (b.y - a.y) * frac / 5);
  return true;
}

static void draw_towns(GContext *ctx, const Frame *f, GPoint origin) {
  GFont font = fonts_get_system_font(FONT_KEY_GOTHIC_14);
  const char *p = f->towns;
  while (*p) {
    int x = atoi(p); while (*p && *p != '|') p++; if (*p) p++;
    int y = atoi(p); while (*p && *p != '|') p++; if (*p) p++;
    int left = atoi(p); while (*p && *p != '|') p++; if (*p) p++;
    char text[48]; int n = 0;
    while (*p && *p != '\n') { if (n < (int)sizeof(text) - 1) text[n++] = *p; p++; }
    text[n] = '\0';
    if (*p) p++;
    graphics_context_set_fill_color(ctx, GColorWhite);
    graphics_fill_rect(ctx, GRect(origin.x + x - 1, origin.y + y - 1, 3, 3), 0, GCornerNone);
    outlined_text(ctx, text, font, GRect(origin.x + left, origin.y + y - 10, 120, 18), GColorWhite, GTextAlignmentLeft);
  }
}

static const char *current_label(int minute, char *next, size_t next_size) {
  const char *label = "";
  next[0] = '\0';
  for (int i = 0; i < s_run_count; i++) {
    if (s_runs[i].minute <= minute) { label = s_runs[i].label; continue; }
    if (s_runs[i].flags & 2) {
      char town[LABEL_LEN];
      int n = 0;
      while (s_runs[i].label[n] && s_runs[i].label[n] != ',' && n < LABEL_LEN - 1) { town[n] = s_runs[i].label[n]; n++; }
      town[n] = '\0';
      snprintf(next, next_size, "next %s %02d:%02d", town, s_runs[i].minute / 60, s_runs[i].minute % 60);
      break;
    }
  }
  return label;
}

static void map_update(Layer *layer, GContext *ctx) {
  int minute = minute_of_day();
  graphics_context_set_fill_color(ctx, GColorBlack);
  graphics_fill_rect(ctx, layer_get_bounds(layer), 0, GCornerNone);
  int view = effective_zoom(minute);
  Frame *f = &s_frames[view];
  GPoint map_origin = GPoint(0, 0);
  if (f->ready && f->bitmap) {
    graphics_draw_bitmap_in_rect(ctx, f->bitmap, GRect(0, 0, f->w, f->h));
    draw_route(ctx, f, map_origin, minute, view == ZOOM_GLOBE);
    if (view == ZOOM_DAY) {
      static const char *hours[] = {"06", "12", "18"};
      for (int k = 0; k < 3; k++) {
        GPoint p;
        if (sample(f, (k + 1) * 72, map_origin, &p)) {
          outlined_text(ctx, hours[k], fonts_get_system_font(FONT_KEY_GOTHIC_14), GRect(p.x + 4, p.y - 9, 30, 16), GColorLightGray, GTextAlignmentLeft);
        }
      }
    }
    if (view == ZOOM_NOW || view == ZOOM_HOUR) draw_towns(ctx, f, map_origin);
    GPoint dot;
    if (dot_position(f, map_origin, minute, &dot)) {
      int r = view == ZOOM_GLOBE ? 3 : 4;
      graphics_context_set_fill_color(ctx, GColorBlack);
      graphics_fill_circle(ctx, dot, r + 1);
      graphics_context_set_fill_color(ctx, GColorWhite);
      graphics_fill_circle(ctx, dot, r);
    }
    Frame *inset = &s_frames[ZOOM_INSET];
    if ((view == ZOOM_NOW || view == ZOOM_HOUR) && inset->ready && inset->bitmap) {
      int x = (inset->corner & 1) ? MAP_W - INSET - 4 : 4;
      int y = (inset->corner & 2) ? MAP_H - INSET - 4 : 4;
      graphics_draw_bitmap_in_rect(ctx, inset->bitmap, GRect(x, y, INSET, INSET));
      graphics_context_set_stroke_color(ctx, GColorLightGray);
      graphics_context_set_stroke_width(ctx, 1);
      graphics_draw_circle(ctx, GPoint(x + INSET / 2, y + INSET / 2), INSET / 2 - 1);
      GPoint here;
      if (dot_position(inset, GPoint(x, y), minute, &here)) {
        graphics_context_set_fill_color(ctx, GColorWhite);
        graphics_fill_rect(ctx, GRect(here.x - 1, here.y - 1, 3, 3), 0, GCornerNone);
      }
    }
    static const char *scale[] = {"240 km", "600 km", "DAY", "GLOBE"};
    outlined_text(ctx, scale[view], fonts_get_system_font(FONT_KEY_GOTHIC_14), GRect(MAP_W - 64, MAP_H - 18, 60, 16), GColorWhite, GTextAlignmentRight);
  }
}

static void canvas_update(Layer *layer, GContext *ctx) {
  int minute = minute_of_day();
  graphics_context_set_fill_color(ctx, GColorBlack);
  graphics_fill_rect(ctx, layer_get_bounds(layer), 0, GCornerNone);

  /* Time bar: 24-hour on purpose; the hour is the degree. */
  char time_text[12];
  snprintf(time_text, sizeof(time_text), "%02d:%02d", (minute / 60) % 24, minute % 60);
  graphics_context_set_text_color(ctx, GColorWhite);
  graphics_draw_text(ctx, time_text, fonts_get_system_font(FONT_KEY_LECO_26_BOLD_NUMBERS_AM_PM), GRect(6, 2, 96, 30), GTextOverflowModeFill, GTextAlignmentLeft, NULL);
  char lat_text[16] = "--", lon_text[16] = "--";
  if (s_have_origin) {
    int32_t lat, lon;
    point_at(minute, &lat, &lon);
    format_coord(lat, 'N', 'S', lat_text, sizeof(lat_text));
    format_coord(lon, 'E', 'W', lon_text, sizeof(lon_text));
  }
  GFont small = fonts_get_system_font(FONT_KEY_GOTHIC_14);
  graphics_context_set_text_color(ctx, GColorLightGray);
  graphics_draw_text(ctx, lat_text, small, GRect(110, 0, 86, 16), GTextOverflowModeFill, GTextAlignmentRight, NULL);
  graphics_draw_text(ctx, lon_text, small, GRect(110, 15, 86, 16), GTextOverflowModeFill, GTextAlignmentRight, NULL);

  /* Place panel */
  char next[64];
  const char *label = current_label(minute, next, sizeof(next));
  graphics_context_set_text_color(ctx, GColorWhite);
  graphics_draw_text(ctx, s_run_count ? label : "", fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD), GRect(6, PANEL_Y + 1, 190, 22), GTextOverflowModeTrailingEllipsis, GTextAlignmentLeft, NULL);
  graphics_context_set_text_color(ctx, GColorYellow);
  graphics_draw_text(ctx, next, small, GRect(6, PANEL_Y + 22, 190, 18), GTextOverflowModeTrailingEllipsis, GTextAlignmentLeft, NULL);
}

/* ---------------- input and lifecycle ---------------- */

static void override_done(void *data) {
  s_override_timer = NULL;
  s_override = false;
  layer_mark_dirty(s_canvas);
  request_needed();
}

static void tapped(AccelAxisType axis, int32_t direction) {
  int minute = minute_of_day();
  s_user_zoom = (effective_zoom(minute) + 1) % ZOOM_INSET; /* Now -> Hour -> Day -> Globe -> Now */
  s_override = true;
  if (s_override_timer) app_timer_reschedule(s_override_timer, OVERRIDE_MS);
  else s_override_timer = app_timer_register(OVERRIDE_MS, override_done, NULL);
  layer_mark_dirty(s_canvas);
  request_needed();
}

static void ticked(struct tm *t, TimeUnits changed) {
  layer_mark_dirty(s_canvas);
  request_needed();
}

static void window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  s_canvas = layer_create(layer_get_bounds(root));
  layer_set_update_proc(s_canvas, canvas_update);
  layer_add_child(root, s_canvas);
  s_map = layer_create(GRect(0, MAP_Y, MAP_W, MAP_H));
  layer_set_update_proc(s_map, map_update);
  layer_add_child(s_canvas, s_map);
}

static void window_unload(Window *window) {
  layer_destroy(s_map);
  layer_destroy(s_canvas);
}

static void init(void) {
  if (persist_exists(PERSIST_ORIGIN_LAT) && persist_exists(PERSIST_ORIGIN_LON)) {
    s_origin_lat = persist_read_int(PERSIST_ORIGIN_LAT);
    s_origin_lon = persist_read_int(PERSIST_ORIGIN_LON);
    s_have_origin = true;
  }
  if (persist_exists(PERSIST_DIRECTION)) s_direction = persist_read_int(PERSIST_DIRECTION) & 7;
  if (persist_exists(PERSIST_DEFAULT_ZOOM)) s_default_zoom = persist_read_int(PERSIST_DEFAULT_ZOOM) & 3;
  s_map_palette[0] = GColorOxfordBlue;
  s_map_palette[1] = GColorDarkGreen;
  s_map_palette[2] = GColorIslamicGreen;
  s_map_palette[3] = GColorMayGreen;
  s_globe_palette[0] = GColorBlack;
  s_globe_palette[1] = GColorOxfordBlue;
  s_globe_palette[2] = GColorDarkGreen;
  s_globe_palette[3] = GColorDukeBlue;
  s_window = window_create();
  window_set_background_color(s_window, GColorBlack);
  window_set_window_handlers(s_window, (WindowHandlers){.load = window_load, .unload = window_unload});
  window_stack_push(s_window, true);
  app_message_register_inbox_received(inbox);
  app_message_register_outbox_failed(outbox_failed);
  app_message_open(app_message_inbox_size_maximum(), 128);
  tick_timer_service_subscribe(MINUTE_UNIT, ticked);
  accel_tap_service_subscribe(tapped);
}

static void deinit(void) {
  accel_tap_service_unsubscribe();
  tick_timer_service_unsubscribe();
  for (int z = 0; z < ZOOM_COUNT; z++) if (s_frames[z].bitmap) gbitmap_destroy(s_frames[z].bitmap);
  window_destroy(s_window);
}

int main(void) {
  init();
  app_event_loop();
  deinit();
}
