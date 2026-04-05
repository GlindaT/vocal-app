// ==========================================
// CONFIG GLOBAL
// ==========================================
const state = {
  instrumentalUrl: null,
  letraLrc: "",
  isRecording: false
};

function $(id) {
  return document.getElementById(id);
}

function safeAdd(id, event, handler) {
  const el = $(id);
  if (el) el.addEventListener(event, handler);
}

// ==========================================
// NAVEGACIÓN
// ==========================================
function showTab(tabId) {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.classList.remove("active");
  });

  const target = $(tabId);
  if (target) target.classList.add("active");

  // botón activo
  document.querySelectorAll(".sidebar button").forEach(btn => {
    btn.classList.remove("active");
  });

  const btnMap = {
    afinador: "btnAfinador",
    estudio: "btnEstudio",
    biblioteca: "btnBiblioteca",
    karaoke: "btnKaraoke",
    splitter: "btnSplitter",
    config: "btnConfig"
  };

  const activeBtn = $(btnMap[tabId]);
  if (activeBtn) activeBtn.classList.add("active");
}

// ==========================================
// AFINADOR
// ==========================================
let audioContext, analyser, stream;

async function toggleRecording() {
  const btn = $("recordBtn");

  if (!state.isRecording) {
    state.isRecording = true;
    btn.textContent = "Detener";
    await startAfinador();
  } else {
    state.isRecording = false;
    btn.textContent = "Grabar";
    stopAfinador();
  }
}

async function startAfinador() {
  audioContext = new AudioContext();
  stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  const mic = audioContext.createMediaStreamSource(stream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;

  mic.connect(analyser);
  detectPitch();
}

function stopAfinador() {
  if (stream) stream.getTracks().forEach(t => t.stop());
  if (audioContext) audioContext.close();
}

function detectPitch() {
  if (!state.isRecording) return;

  const buffer = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buffer);

  const pitch = autoCorrelate(buffer, audioContext.sampleRate);

  if (pitch !== -1) {
    const note = getNoteFromFrequency(pitch);
    $("note").textContent = "Nota: " + note;
  }

  requestAnimationFrame(detectPitch);
}

function autoCorrelate(buf, sampleRate) {
  let bestOffset = -1;
  let bestCorrelation = 0;

  for (let offset = 8; offset < 1000; offset++) {
    let correlation = 0;
    for (let i = 0; i < buf.length - offset; i++) {
      correlation += Math.abs(buf[i] - buf[i + offset]);
    }
    correlation = 1 - correlation / buf.length;

    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestOffset = offset;
    }
  }

  return bestCorrelation > 0.01 ? sampleRate / bestOffset : -1;
}

function getNoteFromFrequency(freq) {
  const notes = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const A4 = 440;
  const n = Math.round(12 * Math.log2(freq / A4));
  const index = (n + 9) % 12;
  const octave = 4 + Math.floor((n + 9) / 12);
  return notes[(index + 12) % 12] + octave;
}

// ==========================================
// ESTUDIO
// ==========================================
function cargarAudioEstudio(e) {
  const file = e.target.files[0];
  if (file) $("player").src = URL.createObjectURL(file);
}

// ==========================================
// BIBLIOTECA
// ==========================================
function saveToLibrary(blob) {
  const reader = new FileReader();

  reader.onloadend = function () {
    const library = JSON.parse(localStorage.getItem("library")) || [];

    library.push({
      name: "Grabación " + (library.length + 1),
      audio: reader.result
    });

    localStorage.setItem("library", JSON.stringify(library));
    loadLibrary();
  };

  reader.readAsDataURL(blob);
}

function loadLibrary() {
  const container = $("libraryList");
  if (!container) return;

  const library = JSON.parse(localStorage.getItem("library")) || [];
  container.innerHTML = "";

  library.forEach((item, i) => {
    const div = document.createElement("div");

    const audio = document.createElement("audio");
    audio.controls = true;
    audio.src = item.audio;

    div.appendChild(audio);
    container.appendChild(div);
  });
}

// ==========================================
// KARAOKE (BÁSICO LIMPIO)
// ==========================================
function cargarPistaKaraoke(e) {
  const file = e.target.files[0];
  if (file) $("karaokeTrack").src = URL.createObjectURL(file);
}

// ==========================================
// SPLITTER (SIMPLIFICADO)
// ==========================================
async function splitAudio() {
  const file = $("splitterFile")?.files[0];
  if (!file) return alert("Carga un archivo");

  alert("Aquí iría la API (backend recomendado)");
}

// ==========================================
// CONFIG
// ==========================================
function saveApiKey() {
  const key = $("openaiApiKey").value.trim();
  localStorage.setItem("openaiApiKey", key);
  alert("Guardada");
}

// ==========================================
// INIT
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  // navegación
  safeAdd("btnAfinador", "click", () => showTab("afinador"));
  safeAdd("btnEstudio", "click", () => showTab("estudio"));
  safeAdd("btnBiblioteca", "click", () => showTab("biblioteca"));
  safeAdd("btnKaraoke", "click", () => showTab("karaoke"));
  safeAdd("btnSplitter", "click", () => showTab("splitter"));
  safeAdd("btnConfig", "click", () => showTab("config"));

  // afinador
  safeAdd("recordBtn", "click", toggleRecording);

  // estudio
  safeAdd("audioFile", "change", cargarAudioEstudio);

  // karaoke
  safeAdd("karaokeTrackFile", "change", cargarPistaKaraoke);

  // splitter
  safeAdd("splitBtn", "click", splitAudio);

  // config
  safeAdd("saveApiKeyBtn", "click", saveApiKey);

  // init
  loadLibrary();
});
