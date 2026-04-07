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

// Nueva función para obtener la diferencia en cents
function getCentsOff(freq, noteFreq) {
  return Math.floor(1200 * Math.log2(freq / noteFreq));
}

// Actualizamos esta para devolver también la frecuencia exacta de la nota objetivo
function getNoteFrequency(note) {
  const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  // Calculamos la frecuencia aproximada de la nota base (ej: C4)
  const A4 = 440;
  const index = notes.indexOf(note);
  const n = index - 9; // Distancia desde A4
  return A4 * Math.pow(2, n / 12);
}

// Y actualizamos la lógica dentro de detectPitch para mostrar si subir o bajar:
function detectPitch() {
  if (!state.isRecording) return;

  const buffer = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buffer);
  const pitch = autoCorrelate(buffer, audioContext.sampleRate);
  
  const display = $("noteDisplay");
  const targetNote = $("targetNote").value; // Lo que el usuario eligió (ej: "C")

  if (pitch !== -1 && display) {
    // 1. Obtenemos la nota y la frecuencia
    const noteFull = getNoteFromFrequency(pitch); // "C4"
    const noteName = noteFull.replace(/[0-9]/g, ''); // "C"
    
    // 2. Calculamos la diferencia en "cents" (centésimas de semitono)
    // Usamos una fórmula estándar de afinación
    const targetFreq = 440 * Math.pow(2, (getNoteIndex(targetNote) - 9) / 12);
    const cents = 1200 * Math.log2(pitch / targetFreq);

    // 3. Lógica de visualización
    if (noteName === targetNote) {
      if (Math.abs(cents) < 15) { // Margen de error pequeño (está afinado)
        display.textContent = `${noteFull} ✅`;
        display.style.color = "#22c55e"; // Verde
      } else if (cents > 15) {
        display.textContent = `${noteFull} ⬇️ (Baja)`;
        display.style.color = "#ef4444"; // Rojo (muy alta)
      } else {
        display.textContent = `${noteFull} ⬆️ (Sube)`;
        display.style.color = "#ef4444"; // Rojo (muy baja)
      }
    } else {
      display.textContent = `${noteFull} 🎯 (${targetNote})`;
      display.style.color = "white";
    }
  }

  requestAnimationFrame(detectPitch);
}

// Helper adicional: necesitamos esta función para convertir la nota a número
function getNoteIndex(note) {
  const notes = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  return notes.indexOf(note);
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

// Nueva función para obtener la diferencia en cents
function getCentsOff(freq, noteFreq) {
  return Math.floor(1200 * Math.log2(freq / noteFreq));
}

// Actualizamos esta para devolver también la frecuencia exacta de la nota objetivo
function getNoteFrequency(note) {
  const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  // Calculamos la frecuencia aproximada de la nota base (ej: C4)
  const A4 = 440;
  const index = notes.indexOf(note);
  const n = index - 9; // Distancia desde A4
  return A4 * Math.pow(2, n / 12);
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
  const fileInput = $("splitterFile");
  const file = fileInput?.files[0];

  if (!file) {
    alert("⚠️ Selecciona un archivo primero");
    return;
  }

  const btn = $("splitBtn");
  btn.disabled = true;
  btn.textContent = "Procesando...";

  try {
    const formData = new FormData();
    formData.append("inputFile", file);

    const response = await fetch("https://api.cloudmersive.com/video/convert/to/mp3", {
      method: "POST",
      headers: {
        "Apikey": localStorage.getItem("cloudmersiveApiKey") || ""
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(errorText);
      alert("❌ Error de API (revisa la clave o saldo)");
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    showResult(url);

  } catch (err) {
    console.error(err);
    alert("❌ Error de conexión");
  } finally {
    btn.disabled = false;
    btn.textContent = "Separar audio";
  }
}

function showResult(url) {
  let container = document.getElementById("splitResult");

  if (!container) {
    container = document.createElement("div");
    container.id = "splitResult";
    container.style.marginTop = "20px";
    document.getElementById("splitter").appendChild(container);
  }

  container.innerHTML = `
    <p>✅ API respondió correctamente</p>
    <audio controls src="${url}"></audio>
    <br><br>
    <a href="${url}" download="resultado.mp3">
      <button>Descargar</button>
    </a>
  `;
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
