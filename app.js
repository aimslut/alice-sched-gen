const STORAGE_KEY = "stream-schedule-generator";
const CANVAS = { width: 1920, height: 1080 };
const EVENT_DEFAULTS = {
  cdt: "7:00pm",
  pst: "5:00pm",
  twitch: "Twitch @VTalice",
};
const DAY_Y = [246, 356, 466, 576, 686, 796, 906];
const EVENT_TITLE_WIDTH = 440;

const $ = (selector) => document.querySelector(selector);
const form = $("#scheduleForm");
const dayEditors = $("#dayEditors");
const daysLayer = $("#daysLayer");
const previewStage = $("#previewStage");
const previewViewport = $("#previewViewport");
const measureContext = document.createElement("canvas").getContext("2d");
let previewZoom = 1;
let previewPan;
let previousTouchTap;

function isoDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function dateFromIso(value) {
  return new Date(`${value}T12:00:00`);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function followingScheduleMonday() {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  today.setDate(today.getDate() + ((8 - today.getDay()) % 7) + 7);
  return today;
}

function ordinal(day) {
  return `${day}${day % 100 >= 11 && day % 100 <= 13 ? "th" : { 1: "st", 2: "nd", 3: "rd" }[day % 10] || "th"}`;
}

function escapeHtml(value) {
  return String(value || "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character],
  );
}

const defaultWeekStart = followingScheduleMonday();
const defaultSchedule = {
  startDate: isoDate(defaultWeekStart),
  endDate: isoDate(addDays(defaultWeekStart, 6)),
  days: [
    { title: "resting day...", rest: true },
    {
      title: "Uma Pleb meets an Uma Master w/ meiowmaucen!",
      rest: false,
      ...EVENT_DEFAULTS,
    },
    {
      title: "Crab Game Collab! (Will I make it?)",
      rest: false,
      ...EVENT_DEFAULTS,
    },
    { title: "resting day...", rest: true },
    { title: "resting day...", rest: true },
    { title: "resting day...", rest: true },
    { title: "Funnel Runners Collab!", rest: false, ...EVENT_DEFAULTS },
  ],
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return structuredClone(defaultSchedule);
    const state = {
      ...structuredClone(defaultSchedule),
      ...saved,
      days: defaultSchedule.days.map((day, index) => ({
        ...day,
        ...(saved.days?.[index] || {}),
      })),
    };
    if (saved.startDate === "2026-08-17" && saved.endDate === "2026-08-23")
      Object.assign(state, {
        startDate: defaultSchedule.startDate,
        endDate: defaultSchedule.endDate,
      });
    return state;
  } catch {
    return structuredClone(defaultSchedule);
  }
}

const state = loadState();
const saveState = () =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

function applyDateRange(value) {
  const start = dateFromIso(value);
  if (Number.isNaN(start.getTime())) return;
  const end = addDays(start, 6);
  Object.assign(state, {
    startDate: isoDate(start),
    endDate: isoDate(end),
    weekStart: String(start.getDate()),
    weekEnd: String(end.getDate()),
    monthStart: start
      .toLocaleDateString("en-US", { month: "short" })
      .toLowerCase(),
    monthEnd: end.toLocaleDateString("en-US", { month: "short" }).toLowerCase(),
  });
  state.days.forEach((day, index) => {
    const date = addDays(start, index);
    Object.assign(day, {
      dow: date.toLocaleDateString("en-US", { weekday: "short" }).toLowerCase(),
      date: ordinal(date.getDate()),
    });
  });
}

function trackedWidth(text, size) {
  measureContext.font = `400 ${size}px Arimo, Arial, sans-serif`;
  return (
    measureContext.measureText(text).width +
    Math.max(0, [...text].length - 1) * size * 0.2
  );
}

function wrapTitle(text, size, maxWidth) {
  return text
    .trim()
    .split(/\s+/)
    .reduce(
      (lines, word) => {
        const candidate = lines.at(-1) ? `${lines.at(-1)} ${word}` : word;
        if (lines.at(-1) && trackedWidth(candidate, size) > maxWidth)
          lines.push(word);
        else lines[lines.length - 1] = candidate;
        return lines;
      },
      [""],
    );
}

function eventTitleLayout(title) {
  for (const size of [16, 14, 13, 12, 11]) {
    const lines = wrapTitle(title, size, EVENT_TITLE_WIDTH);
    if (lines.length <= 2) return { size, lines };
  }
  const lines = wrapTitle(title, 11, EVENT_TITLE_WIDTH);
  let secondLine = lines.slice(1).join(" ");
  while (secondLine && trackedWidth(`${secondLine}...`, 11) > EVENT_TITLE_WIDTH)
    secondLine = secondLine.slice(0, -1);
  return { size: 11, lines: [lines[0] || "", `${secondLine || ""}...`] };
}

function renderDayRows() {
  const x = 918;
  const markerX = 849;
  daysLayer.innerHTML = state.days
    .map((day, index) => {
      const rest = Boolean(day.rest);
      const row = rest
        ? {
            y: DAY_Y[index] - 66,
            width: 948,
            height: 125,
            titleX: x + 184,
            titleY: DAY_Y[index] + 6,
          }
        : {
            y: DAY_Y[index] - 43,
            width: 924,
            height: 95,
            titleX: x + 178,
            titleY: DAY_Y[index] - 6,
          };
      const title = rest ? "resting day..." : day.title;
      const layout = rest
        ? { size: 16, lines: [title] }
        : eventTitleLayout(title);
      const titleLines = layout.lines
        .slice(0, 2)
        .map(
          (line, lineIndex) =>
            `<text x="${row.titleX}" y="${row.titleY + lineIndex * 16}" class="svg-stream-title" style="font-size:${layout.size}px">${escapeHtml(line)}</text>`,
        )
        .join("");
      const eventDetails = rest
        ? ""
        : `
      <text x="1673" y="${row.y + 38}" class="svg-small" text-anchor="middle">${escapeHtml(day.cdt)}</text>
      <text x="1673" y="${row.y + 65}" class="svg-small" text-anchor="middle">${escapeHtml(day.pst)}</text>
      <text x="1784" y="${row.y + 38}" class="svg-small" text-anchor="middle">cdt</text>
      <text x="1784" y="${row.y + 65}" class="svg-small" text-anchor="middle">pst</text>
      ${day.twitch ? `<text x="${row.titleX}" y="${row.y + 70}" class="svg-credit">${escapeHtml(day.twitch)}</text>` : ""}`;
      return `<g data-day="${index}">
      <image data-export-embed="true" href="assets/images/${rest ? "day-rest.png" : "day-active.png"}" x="${x}" y="${row.y}" width="${row.width}" height="${row.height}" preserveAspectRatio="none" />
      ${titleLines}${eventDetails}
      <g transform="translate(${markerX} ${DAY_Y[index] + index + 3})" text-anchor="middle">
        <text x="0" y="-2" class="svg-day">${escapeHtml(day.dow)}</text>
        <text x="0" y="15" class="svg-date">${escapeHtml(day.date)}</text>
      </g>
    </g>`;
    })
    .join("");
}

function renderEditor() {
  dayEditors.innerHTML = state.days
    .map(
      (day, index) => `<details class="day-card" ${day.rest ? "" : "open"}>
    <summary class="day-card-summary"><span>${escapeHtml(day.dow)} ${escapeHtml(day.date)}</span><span class="rest-summary">Rest day<input aria-label="Rest day" type="checkbox" data-day="${index}" data-field="rest" ${day.rest ? "checked" : ""} /></span></summary>
    <div class="day-card-content">${
      day.rest
        ? ""
        : `
      <label>Title<input data-day="${index}" data-field="title" value="${escapeHtml(day.title)}" /></label>
      <label>Streamers<input data-day="${index}" data-field="twitch" value="${escapeHtml(day.twitch)}" /></label>
      <div class="day-details"><label>CDT<input data-day="${index}" data-field="cdt" value="${escapeHtml(day.cdt)}" /></label><label>PST<input data-day="${index}" data-field="pst" value="${escapeHtml(day.pst)}" /></label></div>`
    }</div>
  </details>`,
    )
    .join("");
}

function render() {
  for (const field of ["startDate", "endDate"])
    form.elements[field].value = state[field];
  for (const field of ["weekStart", "weekEnd", "monthStart", "monthEnd"])
    $(`#${field}`).textContent = state[field];
  renderDayRows();
}

function syncField(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const { day, field } = target.dataset;
  const name = field || target.name;
  if (!name) return;
  if (day !== undefined) {
    const item = state.days[Number(day)];
    item[name] = name === "rest" ? target.checked : target.value;
    if (name === "rest")
      Object.assign(
        item,
        target.checked
          ? { title: "resting day..." }
          : Object.fromEntries(
              Object.entries(EVENT_DEFAULTS).filter(([key]) => !item[key]),
            ),
      );
  } else if (target.value) {
    applyDateRange(
      name === "endDate"
        ? isoDate(addDays(dateFromIso(target.value), -6))
        : target.value,
    );
  }
  saveState();
  if (name === "rest" || name === "startDate" || name === "endDate")
    renderEditor();
  render();
}

function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), {
    href: url,
    download: filename,
  });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function blobAsDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

async function serializedSvg() {
  const svg = $("#scheduleSvg").cloneNode(true);
  await Promise.all(
    [...svg.querySelectorAll("image[data-export-embed]")].map(async (image) => {
      const response = await fetch(
        new URL(image.getAttribute("href"), location.href),
      );
      image.setAttribute("href", await blobAsDataUrl(await response.blob()));
    }),
  );
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("width", CANVAS.width);
  svg.setAttribute("height", CANVAS.height);
  return new XMLSerializer().serializeToString(svg);
}

async function pngBlob() {
  const image = new Image();
  const url = URL.createObjectURL(
    new Blob([await serializedSvg()], { type: "image/svg+xml;charset=utf-8" }),
  );
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = url;
  });
  URL.revokeObjectURL(url);
  const canvas = Object.assign(document.createElement("canvas"), CANVAS);
  canvas.getContext("2d").drawImage(image, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Could not create PNG.")),
      "image/png",
    ),
  );
}

async function exportPng() {
  const png = await pngBlob();
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: "twitch-schedule.png",
        types: [
          { description: "PNG image", accept: { "image/png": [".png"] } },
        ],
      });
      const file = await handle.createWritable();
      await file.write(png);
      return file.close();
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }
  download("twitch-schedule.png", png);
}

async function copyPng() {
  const button = $("#copyPng");
  button.disabled = true;
  button.textContent = "Copying...";
  try {
    if (!navigator.clipboard?.write || !window.ClipboardItem)
      throw new Error("Clipboard image support is unavailable.");
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": await pngBlob() }),
    ]);
    button.textContent = "Copied";
  } catch {
    button.textContent = "Copy failed";
  } finally {
    setTimeout(() => {
      button.disabled = false;
      button.textContent = "Copy as PNG";
    }, 1800);
  }
}

function setPreviewZoom(nextZoom, focus) {
  previewZoom = Math.min(2.5, Math.max(1, nextZoom));
  previewStage.style.width = `${previewZoom * 100}%`;
  if (!focus) return previewZoom === 1 && previewViewport.scrollTo(0, 0);
  void previewStage.offsetWidth;
  requestAnimationFrame(() =>
    requestAnimationFrame(() =>
      previewViewport.scrollTo({
        left: Math.max(
          0,
          focus.x * previewZoom - previewViewport.clientWidth / 2,
        ),
        top: Math.max(
          0,
          focus.y * previewZoom - previewViewport.clientHeight / 2,
        ),
      }),
    ),
  );
}

function previewFocus(event) {
  const bounds = previewViewport.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left + previewViewport.scrollLeft) / previewZoom,
    y: (event.clientY - bounds.top + previewViewport.scrollTop) / previewZoom,
  };
}

function stopPreviewPan(event) {
  if (!previewPan || event.pointerId !== previewPan.id) return;
  const tap = event.pointerType === "touch" && !previewPan.moved;
  if (tap) {
    const now = performance.now();
    const doubleTap =
      previousTouchTap &&
      now - previousTouchTap.time < 350 &&
      Math.hypot(
        event.clientX - previousTouchTap.x,
        event.clientY - previousTouchTap.y,
      ) < 32;
    previousTouchTap = doubleTap
      ? undefined
      : { time: now, x: event.clientX, y: event.clientY };
    if (doubleTap)
      setPreviewZoom(previewZoom === 1 ? 2 : 1, previewFocus(event));
  }
  previewViewport.releasePointerCapture(event.pointerId);
  previewViewport.classList.remove("is-panning");
  previewPan = undefined;
}

applyDateRange(state.startDate);
renderEditor();
render();
document.fonts.ready.then(render);

form.addEventListener(
  "input",
  (event) => event.target.type !== "checkbox" && syncField(event),
);
form.addEventListener(
  "change",
  (event) => event.target.type === "checkbox" && syncField(event),
);
form.addEventListener("click", ({ target }) => {
  if (target instanceof HTMLInputElement && target.type === "date")
    try {
      target.showPicker?.();
    } catch {}
});
$("#downloadPng").addEventListener("click", exportPng);
$("#copyPng").addEventListener("click", copyPng);
$("#zoomOut").addEventListener("click", () =>
  setPreviewZoom(previewZoom - 0.25),
);
$("#zoomReset").addEventListener("click", () => setPreviewZoom(1));
$("#zoomIn").addEventListener("click", () =>
  setPreviewZoom(previewZoom + 0.25),
);
$("#scrollTop").addEventListener("click", () =>
  scrollTo({ top: 0, behavior: "smooth" }),
);
previewViewport.addEventListener("dblclick", (event) => {
  event.preventDefault();
  setPreviewZoom(previewZoom === 1 ? 2 : 1, previewFocus(event));
});
previewViewport.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  previewPan = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    left: previewViewport.scrollLeft,
    top: previewViewport.scrollTop,
    moved: false,
  };
  previewViewport.setPointerCapture(event.pointerId);
  previewViewport.classList.add("is-panning");
});
previewViewport.addEventListener("pointermove", (event) => {
  if (!previewPan || event.pointerId !== previewPan.id) return;
  previewPan.moved ||=
    Math.hypot(event.clientX - previewPan.x, event.clientY - previewPan.y) > 8;
  previewViewport.scrollTo(
    previewPan.left - (event.clientX - previewPan.x),
    previewPan.top - (event.clientY - previewPan.y),
  );
});
previewViewport.addEventListener("pointerup", stopPreviewPan);
previewViewport.addEventListener("pointercancel", stopPreviewPan);
