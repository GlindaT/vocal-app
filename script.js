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
  const btn = document.getElementById("recordBtn");
  if (!state.isRecording) {
    state.isRecording = true;
    btn.textContent = "Detener";
    btn.classList.add("recording");
    await startAfinador();
  } else {
    state.isRecording = false;
    btn.textContent = "Iniciar";
    btn.classList.remove("recording");
    stopAfinador();
    document.getElementById("noteDisplay").textContent = "--";
    document.getElementById("guideText").textContent = "";
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
  
  const display = document.getElementById("noteDisplay");
  const guide = document.getElementById("guideText");
  const targetNote = document.getElementById("targetNote").value;

  if (display && guide) {
    if (pitch !== -1) {
      // 1. Obtnemos la nota detectada (ej: "C4")
      const noteFull = getNoteFromFrequency(pitch); 
      // 2. Extraemos el nombre de la nota sin octava (ej: "C")
      const noteName = noteFull.replace(/[0-9]/g, ''); 
      
      // 3. Calculamos la octava actual para ajustar el objetivo
      const currentOctave = parseInt(noteFull.replace(/[^0-9]/g, ''));
      const targetFreqBase = getNoteFrequency(targetNote); // Retorna freq para Octava 4
      const targetFreqInCurrentOctave = targetFreqBase * Math.pow(2, currentOctave - 4);

      // 4. Medimos la desviación en Cents
      const cents = 1200 * Math.log2(pitch / targetFreqInCurrentOctave);

      display.textContent = noteFull;
      
      // Margen de tolerancia (30 cents es cómodo)
      const maxDesviation = 30;

      // 5. Lógica de mensajes visuales
      if (noteName === targetNote) {
        if (Math.abs(cents) < maxDesviation) {
          display.style.color = "#22c55e"; // Verde
          guide.textContent = "¡Perfecto! ✅";
          guide.style.color = "#22c55e";
        } else if (cents > maxDesviation) {
          display.style.color = "#f59e0b"; // Naranja
          guide.textContent = `⬇️ Baja un poco`;
          guide.style.color = "#f59e0b";
        } else {
          display.style.color = "#f59e0b"; // Naranja
          guide.textContent = `⬆️ Sube un poco`;
          guide.style.color = "#f59e0b";
        }
      } else {
        display.style.color = "white";
        guide.textContent = `Buscando ${targetNote}...`;
        guide.style.color = "white";
      }
    } else {
      guide.textContent = "Cantando...";
    }
  }
  requestAnimationFrame(detectPitch);
}

function getNoteFromFrequency(freq) {
  const notes = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const A4 = 440;
  const n = Math.round(12 * Math.log2(freq / A4));
  const index = (n + 9) % 12;
  const octave = 4 + Math.floor((n + 9) / 12);
  return notes[(index + 12) % 12] + octave;
}

function getNoteFrequency(note) {
  const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const A4 = 440;
  const index = notes.indexOf(note);
  const n = index - 9; 
  return A4 * Math.pow(2, n / 12);
}

function autoCorrelate(buf, sampleRate) {
  let bestOffset = -1;
  let bestCorrelation = 0;
  for (let offset = 8; offset < 1000; offset++) {
    let correlation = 0;
    for (let i = 0; i < buf.length - offset; i++) {
      correlation += Math.abs(buf[i] - buf[i + offset]);
    }
    correlation = 1 - (correlation / buf.length);
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestOffset = offset;
    }
  }
  return bestCorrelation > 0.05 ? sampleRate / bestOffset : -1;
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

