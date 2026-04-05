console.log("🚀 El archivo script.js se ha cargado correctamente");
// ==========================================
// 1. VARIABLES GLOBALES DE CONEXIÓN (PÉGALO AQUÍ)
// ==========================================
let instrumentalUrlGlobal = null;
let letraLrcGlobal = "";
// 1. DEFINICIÓN DE LA HERRAMIENTA (INDISPENSABLE)
function safeAddEvent(id, event, handler) {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener(event, handler);
  } else {
    // Si no encuentra el botón, te avisará en la consola sin romper el código
    console.warn(`Aviso: No se encontró el botón con ID "${id}" en el HTML.`);
  }
}

// 2. FUNCIÓN PARA MOSTRAR PESTAÑAS
function showTab(tabId) {
  console.log("Cambiando a pestaña:", tabId);
  document.querySelectorAll(".tab").forEach(tab => {
    tab.classList.remove("active");
  });

  const target = document.getElementById(tabId);
  if (target) {
    target.classList.add("active");
  } else {
    console.error("No se encontró la sección con ID:", tabId);
  }
}

// 3. CONEXIÓN DE BOTONES (Usando la herramienta definida arriba)
document.addEventListener("DOMContentLoaded", () => {
  safeAddEvent("btnAfinador", "click", () => showTab("afinador"));
  safeAddEvent("btnEstudio", "click", () => showTab("estudio"));
  safeAddEvent("btnBiblioteca", "click", () => showTab("biblioteca"));
  safeAddEvent("btnKaraoke", "click", () => showTab("karaoke"));
  safeAddEvent("btnSplitter", "click", () => showTab("splitter"));
  safeAddEvent("btnConfig", "click", () => showTab("config"));
  console.log("✅ Todos los botones de navegación han sido vinculados.");
});
// -------- AFINADOR --------
let audioContext;
let analyser;
let microphone;
let isRecording = false;
let stream;
let lastCents = 0;

async function toggleRecording() {
  const btn = document.getElementById("recordBtn");
  if (!isRecording) {
    isRecording = true;
    await startAfinador();
    btn.textContent = "Detener";
  } else {
    stopAfinador();
    isRecording = false;
    btn.textContent = "Grabar";
  }
}

async function startAfinador() {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  microphone = audioContext.createMediaStreamSource(stream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  microphone.connect(analyser);
  detectPitch();
}

function stopAfinador() {
  if (stream) stream.getTracks().forEach(track => track.stop());
  if (audioContext) audioContext.close();
}

function detectPitch() {
  if (!isRecording) return;

  const buffer = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buffer);

  let volume = 0;
  for (let i = 0; i < buffer.length; i++) volume += Math.abs(buffer[i]);
  volume = volume / buffer.length;

  if (volume < 0.02) {
    requestAnimationFrame(detectPitch);
    return;
  }

  const pitch = autoCorrelate(buffer, audioContext.sampleRate);

  if (pitch !== -1) {
    const note = getNoteFromFrequency(pitch);
    document.getElementById("note").innerText = "Nota: " + note;

    const target = parseFloat(document.getElementById("targetNote").value);
    let cents = getCents(pitch, target);
    cents = lastCents * 0.8 + cents * 0.2;
    lastCents = cents;

    document.getElementById("status").innerText =
      cents > 0 ? "Más agudo ↑" : "Más grave ↓";

    updateIndicator(cents);
  }

  requestAnimationFrame(detectPitch);
}

function autoCorrelate(buf, sampleRate) {
  let SIZE = buf.length;
  let bestOffset = -1;
  let bestCorrelation = 0;

  for (let offset = 8; offset < 1000; offset++) {
    let correlation = 0;
    for (let i = 0; i < SIZE - offset; i++) {
      correlation += Math.abs(buf[i] - buf[i + offset]);
    }
    correlation = 1 - (correlation / SIZE);
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestOffset = offset;
    }
  }

  return bestCorrelation > 0.01 ? sampleRate / bestOffset : -1;
}

function getNoteFromFrequency(freq) {
  const noteNames = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const A4 = 440;
  const semitones = 12 * Math.log2(freq / A4);
  const index = Math.round(semitones) + 9;
  const octave = Math.floor(index / 12) + 4;
  const note = noteNames[(index % 12 + 12) % 12];
  return note + octave;
}

function getCents(freq, target) {
  return 1200 * Math.log2(freq / target);
}

function updateIndicator(cents) {
  const indicator = document.getElementById("indicator");
  let position = cents * 2;
  position = Math.max(-120, Math.min(120, position));
  indicator.style.left = "calc(50% + " + position + "px)";

  let absCents = Math.abs(cents);
  indicator.style.background =
    absCents < 5  ? "#22c55e" :
    absCents < 20 ? "#eab308" : "#ef4444";
}

function generateNotes() {
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const select = document.getElementById("targetNote");

  if (!select) {
    console.error('No se encontró el select con id "targetNote"');
    return;
  }

  select.innerHTML = "";

  for (let octave = 0; octave <= 8; octave++) {
    for (let i = 0; i < noteNames.length; i++) {
      const noteName = noteNames[i] + octave;
      const semitoneDistance = (octave - 4) * 12 + i - 9;
      const freq = 440 * Math.pow(2, semitoneDistance / 12);

      const option = document.createElement("option");
      option.value = freq.toFixed(2);
      option.textContent = noteName;

      if (noteName === "A4") {
        option.selected = true;
      }

      select.appendChild(option);
    }
  }
}

// -------- ESTUDIO --------
let mediaRecorder;
let recordedChunks = [];
let studioStream;

// Creamos esta función para que la lógica no se pierda
function cargarAudioEstudio(e) {
  const file = e.target.files[0];
  if (!file) return;

  const player = document.getElementById("player");
  if (player) {
    player.src = URL.createObjectURL(file);
  }
}

async function startStudioRecording() {
  studioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(studioStream);
  recordedChunks = [];

  mediaRecorder.ondataavailable = function(event) {
    if (event.data.size > 0) recordedChunks.push(event.data);
  };

  mediaRecorder.onstop = function() {
    const blob = new Blob(recordedChunks, { type: "audio/webm" });
    document.getElementById("studioRecording").src = URL.createObjectURL(blob);
    saveToLibrary(blob);
  };

  mediaRecorder.start();
  const player = document.getElementById("player");
  player.currentTime = 0;
  player.play();
}

function stopStudioRecording() {
  if (mediaRecorder) mediaRecorder.stop();
  if (studioStream) studioStream.getTracks().forEach(track => track.stop());
  document.getElementById("player").pause();
}

// -------- LETRAS ESTUDIO --------
function cargarLetrasEstudio(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    const display = document.getElementById("lyricsDisplay");
    if (display) {
      display.innerText = event.target.result;
    }
  };
  reader.readAsText(file);
}

// -------- BIBLIOTECA --------
function saveToLibrary(blob) {
  const reader = new FileReader();
  reader.onloadend = function() {
    const base64data = reader.result;
    let library = JSON.parse(localStorage.getItem("library")) || [];
    library.push({
      name: "Grabación " + (library.length + 1),
      audio: base64data
    });
    localStorage.setItem("library", JSON.stringify(library));
    loadLibrary();
  };
  reader.readAsDataURL(blob);
}

function loadLibrary() {
  const container = document.getElementById("libraryList");
  if (!container) return;

  let library = JSON.parse(localStorage.getItem("library")) || [];
  container.innerHTML = "";

  library.forEach(function(item, index) {
    const div = document.createElement("div");
    div.style.marginBottom = "20px";

    const title = document.createElement("input");
    title.value = item.name;
    title.style.width = "60%";
    title.style.marginBottom = "10px";
    title.onchange = function() {
      library[index].name = title.value;
      localStorage.setItem("library", JSON.stringify(library));
    };

    const audio = document.createElement("audio");
    audio.controls = true;
    audio.src = item.audio;

    const deleteBtn = document.createElement("button");
    deleteBtn.innerText = "🗑️ Eliminar";
    deleteBtn.style.cssText = `
      margin-top:10px; background:#ef4444; color:white;
      border:none; padding:8px; border-radius:6px; cursor:pointer;
    `;
    deleteBtn.onclick = function() {
      library.splice(index, 1);
      localStorage.setItem("library", JSON.stringify(library));
      loadLibrary();
    };

    div.appendChild(title);
    div.appendChild(audio);
    div.appendChild(deleteBtn);
    container.appendChild(div);
  });
}

// ======== KARAOKE ========
let karaokeAudioContext = null;
let karaokeAnalyser = null;
let karaokeMic = null;
let karaokeStream = null;
let karaokeMediaRec = null;
let karaokeChunks = [];
let karaokeRecording = false;
let karaokeLyricsData = [];
let karaokeLyricsRaw = [];
let karaokeIsTimed = false;
let karaokeBlob = null;
let lyricInterval = null;
let lyricLineIndex = 0;

// -------- KARAOKE: FUNCIONES DE CARGA --------

function cargarPistaKaraoke(e) {
  const file = e.target.files[0];
  if (!file) return;
  document.getElementById("karaokeTrack").src = URL.createObjectURL(file);
  setKaraokeStatus("✅ Pista cargada — Carga la letra y presiona Iniciar");
}

function cargarLetrasKaraoke(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(event) {
    processLyrics(event.target.result, file.name);
  };
  reader.readAsText(file);
}

function processLyrics(text, filename) {
  if (filename.endsWith(".lrc") || /$$\d+:\d+/.test(text)) {
    karaokeIsTimed = true;
    karaokeLyricsData = parseLRC(text);
    setKaraokeStatus("✅ Letra sincronizada cargada");
  } else {
    karaokeIsTimed = false;
    karaokeLyricsRaw = text.split("\n").filter(l => l.trim() !== "");
    setKaraokeStatus("✅ Letra cargada — Avance automático activado");
  }
}

function parseLRC(text) {
  const lines = text.split("\n");
  const result = [];
  const timeReg = /\[(\d+):(\d+[\.,]\d+)$$(.*)/;

  lines.forEach(function(line) {
    const match = line.match(timeReg);
    if (match) {
      const mins = parseInt(match[1]);
      const secs = parseFloat(match[2].replace(",", "."));
      const lyric = match[3].trim();
      if (lyric !== "") result.push({ time: mins * 60 + secs, text: lyric });
    }
  });

  return result.sort((a, b) => a.time - b.time);
}

function updateLyricsDisplay(index) {
  const lines = karaokeIsTimed
    ? karaokeLyricsData.map(l => l.text)
    : karaokeLyricsRaw;

  if (!lines || lines.length === 0) return;

  document.getElementById("lyricsPrev").textContent    = lines[index - 1] || "";
  document.getElementById("lyricsCurrent").textContent = lines[index]     || "";
  document.getElementById("lyricsNext").textContent    = lines[index + 1] || "";
}

function startLyricSync() {
  const player = document.getElementById("karaokeTrack");

  if (karaokeIsTimed) {
    lyricInterval = setInterval(function() {
      const t = player.currentTime;
      let idx = 0;
      for (let i = 0; i < karaokeLyricsData.length; i++) {
        if (t >= karaokeLyricsData[i].time) idx = i;
      }
      updateLyricsDisplay(idx);
    }, 100);
  } else {
    lyricLineIndex = 0;
    updateLyricsDisplay(0);
    const duration = player.duration || 180;
    const secPerLine = Math.max(2, duration / (karaokeLyricsRaw.length || 1));

    lyricInterval = setInterval(function() {
      lyricLineIndex++;
      if (lyricLineIndex < karaokeLyricsRaw.length) {
        updateLyricsDisplay(lyricLineIndex);
      } else {
        clearInterval(lyricInterval);
      }
    }, secPerLine * 1000);
  }
}

function stopLyricSync() {
  if (lyricInterval) {
    clearInterval(lyricInterval);
    lyricInterval = null;
  }
}

async function toggleKaraokeRecording() {
  if (!karaokeRecording) await startKaraokeRecording();
}

async function startKaraokeRecording() {
  const player = document.getElementById("karaokeTrack");

  if (!player.src || player.src === window.location.href) {
    setKaraokeStatus("⚠️ Primero carga una pista de audio");
    return;
  }

  document.getElementById("karaokeRecordingBox").style.display = "none";
  document.getElementById("karaokeScreenBox").style.display = "block";
  document.getElementById("karaokeTunerBox").style.display = "block";

  karaokeStream = await navigator.mediaDevices.getUserMedia({ audio: true });

  const shouldRecord = document.getElementById("recordMix").checked;

  if (shouldRecord) {
    karaokeMediaRec = new MediaRecorder(karaokeStream);
    karaokeChunks = [];

    karaokeMediaRec.ondataavailable = function(e) {
      if (e.data.size > 0) karaokeChunks.push(e.data);
    };

    karaokeMediaRec.onstop = function() {
      karaokeBlob = new Blob(karaokeChunks, { type: "audio/webm" });
      document.getElementById("karaokeMixRecording").src = URL.createObjectURL(karaokeBlob);
      document.getElementById("karaokeRecordingBox").style.display = "block";
      setKaraokeStatus("✅ Listo — ¿Guardas o repites?");
    };

    karaokeMediaRec.start();
  }

  startKaraokeTuner();
  player.currentTime = 0;
  player.play();
  startLyricSync();

  karaokeRecording = true;
  setKaraokeStatus("🔴 Grabando...", true);
  document.getElementById("startKaraokeBtn").disabled = true;
  document.getElementById("stopKaraokeBtn").disabled = false;
}

function stopKaraokeRecording() {
  if (karaokeMediaRec && karaokeMediaRec.state !== "inactive") karaokeMediaRec.stop();
  if (karaokeStream) karaokeStream.getTracks().forEach(t => t.stop());

  document.getElementById("karaokeTrack").pause();
  stopLyricSync();
  stopKaraokeTuner();

  karaokeRecording = false;
  document.getElementById("startKaraokeBtn").disabled = false;
  document.getElementById("stopKaraokeBtn").disabled = true;

  if (!document.getElementById("recordMix").checked) {
    setKaraokeStatus("⏹ Detenido");
  }
}

function retryKaraoke() {
  document.getElementById("karaokeRecordingBox").style.display = "none";
  document.getElementById("karaokeScreenBox").style.display = "none";
  document.getElementById("karaokeTunerBox").style.display = "none";
  karaokeBlob = null;
  setKaraokeStatus("🔄 Listo para repetir — Presiona Iniciar");
}

async function startKaraokeTuner() {
  karaokeAudioContext = new (window.AudioContext || window.webkitAudioContext)();
  const tunStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  karaokeMic = karaokeAudioContext.createMediaStreamSource(tunStream);
  karaokeAnalyser = karaokeAudioContext.createAnalyser();
  karaokeAnalyser.fftSize = 2048;
  karaokeMic.connect(karaokeAnalyser);
  detectKaraokePitch();
}

function stopKaraokeTuner() {
  if (karaokeAudioContext) {
    karaokeAudioContext.close();
    karaokeAudioContext = null;
  }
}

function detectKaraokePitch() {
  if (!karaokeAudioContext || !karaokeRecording) return;

  const buffer = new Float32Array(karaokeAnalyser.fftSize);
  karaokeAnalyser.getFloatTimeDomainData(buffer);

  let vol = 0;
  for (let i = 0; i < buffer.length; i++) vol += Math.abs(buffer[i]);
  vol /= buffer.length;

  if (vol < 0.02) {
    requestAnimationFrame(detectKaraokePitch);
    return;
  }

  const pitch = autoCorrelate(buffer, karaokeAudioContext.sampleRate);

  if (pitch !== -1) {
    const note = getNoteFromFrequency(pitch);
    document.getElementById("karaokeNoteDisplay").textContent = "🎵 " + note;

    const cents = getCents(pitch, 440);
    const absCents = Math.abs(cents);

    document.getElementById("karaokeTunerStatus").textContent =
      absCents < 5  ? "✅ Afinado" :
      absCents < 20 ? "🟡 Cerca"  :
      cents > 0     ? "↑ Más grave" : "↓ Más agudo";

    updateKaraokeIndicator(cents);
  }

  requestAnimationFrame(detectKaraokePitch);
}

function updateKaraokeIndicator(cents) {
  const indicator = document.getElementById("karaokeIndicator");
  const pos = Math.max(-120, Math.min(120, cents * 2));
  indicator.style.left = "calc(50% + " + pos + "px)";

  const abs = Math.abs(cents);
  indicator.style.background =
    abs < 5  ? "#22c55e" :
    abs < 20 ? "#eab308" : "#ef4444";
}

function saveKaraokeToLibrary() {
  if (!karaokeBlob) return;
  saveToLibrary(karaokeBlob);
  setKaraokeStatus("💾 Guardado en Biblioteca ✅");
}

function setKaraokeStatus(msg, isRec) {
  const el = document.getElementById("karaokeStatus");
  el.textContent = msg;
  el.className = "karaoke-status" + (isRec ? " recording" : "");
}

// ======== CONFIGURACIÓN ========
function loadApiKey() {
  const saved = localStorage.getItem("openaiApiKey");
  if (saved) {
    document.getElementById("openaiApiKey").value = saved;
    document.getElementById("apiKeyStatus").textContent = "✅ Clave guardada";
    document.getElementById("apiKeyStatus").style.color = "#22c55e";
  }
}

function saveApiKey() {
  const key = document.getElementById("openaiApiKey").value.trim();
  if (!key || !key.startsWith("sk-")) {
    document.getElementById("apiKeyStatus").textContent = "⚠️ La clave debe empezar con sk-";
    document.getElementById("apiKeyStatus").style.color = "#ef4444";
    return;
  }
  localStorage.setItem("openaiApiKey", key);
  document.getElementById("apiKeyStatus").textContent = "✅ Clave guardada correctamente";
  document.getElementById("apiKeyStatus").style.color = "#22c55e";
}

function toggleApiKeyVisibility() {
  const input = document.getElementById("openaiApiKey");
  const btn = document.getElementById("showApiKeyBtn");
  if (input.type === "password") {
    input.type = "text";
    btn.textContent = "🙈 Ocultar";
  } else {
    input.type = "password";
    btn.textContent = "👁 Ver";
  }
}

function getApiKey() {
  const key = localStorage.getItem("openaiApiKey");
  if (!key) {
    alert("⚠️ Primero guarda tu API Key en Configuración");
    showTab("config");
    return null;
  }
  return key;
}

// ======== WHISPER ========
async function generateLyricsWithWhisper() {
  // 1. Obtener y limpiar la API Key
  const rawKey = typeof getApiKey === 'function' ? getApiKey() : localStorage.getItem('config_openai');
  const apiKey = rawKey ? rawKey.trim() : null;
  
  if (!apiKey) {
    setWhisperStatus("⚠️ No hay API Key en Configuración", "error");
    return;
  }

  const trackFile = document.getElementById("karaokeTrackFile").files[0];
  if (!trackFile) {
    setWhisperStatus("⚠️ Primero carga una pista de audio", "error");
    return;
  }

  const btn = document.getElementById("whisperBtn");
  if (btn) btn.disabled = true;
  setWhisperStatus("⏳ Preparando envío a OpenAI...", "loading");

  try {
    const formData = new FormData();
    formData.append("file", trackFile);
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");

    setWhisperStatus("⏳ Transcribiendo... (esto puede tardar un poco)", "loading");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { 
        "Authorization": "Bearer " + apiKey 
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.text(); 
      console.error("Detalle del error:", errorData);
      setWhisperStatus("❌ Error de API: Revisa tus créditos o la llave", "error");
      if (btn) btn.disabled = false;
      return;
    }

    const data = await response.json();
    
    if (data.segments) {
      // Aquí usamos tus funciones originales para procesar la letra
      const lrc = convertToLRC(data.segments);
      // === PÉGALA AQUÍ (Línea de conexión) ===
      letraLrcGlobal = lrc; 
      // ======================================
      karaokeIsTimed = true;
      karaokeLyricsData = parseLRC(lrc);
      
      // Actualizar el área de texto de la letra si existe
      const lyricsArea = document.getElementById("karaokeLyricsInput");
      if (lyricsArea) lyricsArea.value = lrc;

      setWhisperStatus(`✅ ¡Listo! ${data.segments.length} líneas generadas.`, "success");
    }

  } catch (err) {
    console.error("Error de red o conexión:", err);
    setWhisperStatus("❌ Error de conexión: Revisa tu internet o la API Key", "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

function convertToLRC(segments) {
  if (!segments || segments.length === 0) return "";
  let lrc = "";
  segments.forEach(function(segment) {
    const start = segment.start;
    const mins = Math.floor(start / 60);
    const secs = (start % 60).toFixed(2).padStart(5, "0");
    const text = segment.text.trim();
    if (text !== "") {
      lrc += "[" + String(mins).padStart(2, "0") + ":" + secs + "] " + text + "\n";
    }
  });
  return lrc;
}

function setWhisperStatus(msg, type) {
  const el = document.getElementById("whisperStatus");
  el.style.display = "block";
  el.textContent = msg;
  el.style.color =
    type === "error"   ? "#ef4444" :
    type === "success" ? "#22c55e" : "#94a3b8";
}

// ======== LALAL.AI CONFIG ========
function loadLalalKey() {
  const saved = localStorage.getItem("lalalApiKey");
  if (saved) {
    document.getElementById("lalalApiKey").value = saved;
    document.getElementById("lalalKeyStatus").textContent = "✅ Clave guardada";
    document.getElementById("lalalKeyStatus").style.color = "#22c55e";
  }
}

function saveLalalKey() {
  const key = document.getElementById("lalalApiKey").value.trim();
  if (!key) {
    document.getElementById("lalalKeyStatus").textContent = "⚠️ Ingresa una clave válida";
    document.getElementById("lalalKeyStatus").style.color = "#ef4444";
    return;
  }
  localStorage.setItem("lalalApiKey", key);
  document.getElementById("lalalKeyStatus").textContent = "✅ Clave guardada correctamente";
  document.getElementById("lalalKeyStatus").style.color = "#22c55e";
}

function toggleLalalKeyVisibility() {
  const input = document.getElementById("lalalApiKey");
  const btn = document.getElementById("showLalalKeyBtn");
  if (input.type === "password") {
    input.type = "text";
    btn.textContent = "🙈 Ocultar";
  } else {
    input.type = "password";
    btn.textContent = "👁 Ver";
  }
}

function getLalalKey() {
  const key = localStorage.getItem("lalalApiKey");
  if (!key) {
    alert("⚠️ Primero guarda tu API Key de Lalal.ai en Configuración");
    showTab("config");
    return null;
  }
  return key;
}

// ======== SPLITTER ========
async function splitAudio() {
  const apiKey = getLalalKey();
  if (!apiKey) return;

  const file = document.getElementById("splitterFile").files[0];
  if (!file) {
    setSplitterStatus("⚠️ Primero selecciona un archivo de audio", "error");
    return;
  }

  if (file.size > 200 * 1024 * 1024) {
    setSplitterStatus("⚠️ El archivo supera los 200MB", "error");
    return;
  }

  const stemType = document.querySelector('input[name="stemType"]:checked').value;
  const btn = document.getElementById("splitBtn");
  btn.disabled = true;
  document.getElementById("splitterResults").style.display = "none";

  setSplitterStatus("⏳ Subiendo audio a Lalal.ai...", "loading");

  try {
    const formData = new FormData();
    formData.append("file", file);

    const uploadResponse = await fetch("https://www.lalal.ai/api/upload/?v=2", {
      method: "POST",
      headers: { 
        "Authorization": apiKey.trim() 
      },
      body: formData
    });

    if (!uploadResponse.ok) {
      const err = await uploadResponse.json();
      setSplitterStatus("❌ Error al subir: " + (err.error || "Error desconocido"), "error");
      btn.disabled = false;
      return;
    }

    const uploadData = await uploadResponse.json();
    const fileId = uploadData.id;

    setSplitterStatus("⏳ Procesando separación... esto puede tardar 1-2 minutos", "loading");

  const splitResponse = await fetch("https://www.lalal.ai/api/split/?v=2", {
      method: "POST",
      headers: {
        "Authorization": apiKey.trim(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        "id": fileId,
        "stem": "vocals" // O el que tengas configurado
      })
    });
    if (!splitResponse.ok) {
      const err = await splitResponse.json();
      setSplitterStatus("❌ Error al procesar: " + (err.error || "Error desconocido"), "error");
      btn.disabled = false;
      return;
    }

    setSplitterStatus("⏳ Esperando resultado...", "loading");
    await pollSplitterResult(fileId, apiKey, stemType);

  } catch (err) {
    setSplitterStatus("❌ Error de conexión: " + err.message, "error");
    btn.disabled = false;
  }
}

async function pollSplitterResult(fileId, apiKey, stemType) {
  const btn = document.getElementById("splitBtn");
  let attempts = 0;
  // 120 intentos de 5 segundos = 10 minutos de paciencia
  const maxAttempts = 120; 

  const interval = setInterval(async function() {
    attempts++;

    try {
      const checkResponse = await fetch("https://www.lalal.ai/api/check/?id=" + fileId + "&v=2", {
        headers: { "Authorization": apiKey.trim() }
      });

      if (!checkResponse.ok) return; // Si hay un micro-corte de internet, seguimos intentando

      const checkData = await checkResponse.json();
      const task = checkData.task;

      if (task && task.state === "success") {
        clearInterval(interval);
        showSplitterResults(task, stemType);
        btn.disabled = false;

      } else if (task && task.state === "error") {
        clearInterval(interval);
        setSplitterStatus("❌ Error en el procesamiento: " + (task.error || ""), "error");
        btn.disabled = false;

      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        setSplitterStatus("❌ El servidor de Lalal está tardando demasiado. Revisa tu internet.", "error");
        btn.disabled = false;

      } else {
        // --- LA MEJORA VISUAL ---
        // Si Lalal nos da el progreso, lo mostramos. Si no, mostramos los segundos.
        const progressInfo = (task && task.progress) ? `${task.progress}%` : `${attempts * 5}s`;
        setSplitterStatus("⏳ IA trabajando... " + progressInfo, "loading");
      }

    } catch (err) {
      console.warn("Reintentando conexión...", err);
    }

  }, 5000);
}

function showSplitterResults(task, stemType) {
  const resultsBox = document.getElementById("splitterResults");
  resultsBox.style.display = "block";

  const vocalsUrl       = task.stem?.vocals?.url       || null;
  const instrumentalUrl = task.stem?.instrumental?.url || null;

  // --- CONEXIÓN GLOBAL ---
  // Guardamos la pista instrumental en nuestra "caja" de la Línea 1
  if (instrumentalUrl) {
    instrumentalUrlGlobal = instrumentalUrl; 
  }

  const vocalsBox = document.getElementById("vocalsResult");
  if ((stemType === "vocals" || stemType === "both") && vocalsUrl) {
    document.getElementById("vocalsAudio").src = vocalsUrl;
    document.getElementById("vocalsDownload").href = vocalsUrl;
    vocalsBox.style.display = "block";
  } else {
    vocalsBox.style.display = "none";
  }

  const instBox = document.getElementById("instrumentalResult");
  if ((stemType === "instrumental" || stemType === "both") && instrumentalUrl) {
    document.getElementById("instrumentalAudio").src = instrumentalUrl;
    document.getElementById("instrumentalDownload").href = instrumentalUrl;
    instBox.style.display = "block";
  } else {
    instBox.style.display = "none";
  }

  // --- BOTÓN MÁGICO PARA IR AL KARAOKE ---
  // Solo lo creamos si no existe ya uno en pantalla
  if (!document.getElementById("btnMagicoKaraoke")) {
    const btn = document.createElement("button");
    btn.id = "btnMagicoKaraoke";
    btn.innerHTML = "🎤 ¡Todo listo! Ir al Karaoke";
    btn.style.marginTop = "20px";
    btn.style.padding = "12px 24px";
    btn.style.backgroundColor = "#6a11cb";
    btn.style.color = "white";
    btn.style.border = "none";
    btn.style.borderRadius = "8px";
    btn.style.cursor = "pointer";
    btn.style.fontWeight = "bold";
    
    btn.onclick = function() {
       // Llamamos al puente que pusiste al final del archivo
       enviarAKaraoke(instrumentalUrl, letraLrcGlobal);
    };
    resultsBox.appendChild(btn);
  }

  // Tu mensaje original de éxito
  setSplitterStatus("✅ Separación completa", "success");
}

function setSplitterStatus(msg, type) {
  const el = document.getElementById("splitterStatus");
  el.style.display = "block";
  el.textContent = msg;
  el.style.color =
    type === "error"   ? "#ef4444" :
    type === "success" ? "#22c55e" : "#94a3b8";
}

// ======== FINAL DEL ARCHIVO: EL GRAN CONECTOR ========
document.addEventListener("DOMContentLoaded", function () {
  
  // NAVEGACIÓN (Sidebar)
  safeAddEvent("btnAfinador", "click", () => showTab("afinador"));
  safeAddEvent("btnEstudio", "click", () => showTab("estudio"));
  safeAddEvent("btnBiblioteca", "click", () => showTab("biblioteca"));
  safeAddEvent("btnKaraoke", "click", () => showTab("karaoke"));
  safeAddEvent("btnSplitter", "click", () => showTab("splitter"));
  safeAddEvent("btnConfig", "click", () => showTab("config"));

  // CARGA DE ARCHIVOS (Inputs)
  safeAddEvent("audioFile", "change", cargarAudioEstudio);
  safeAddEvent("lyricsFile", "change", cargarLetrasEstudio);
  safeAddEvent("karaokeTrackFile", "change", cargarPistaKaraoke);
  safeAddEvent("karaokeLyricsFile", "change", cargarLetrasKaraoke);
  // Nota: El splitter no necesita evento 'change' porque validas al hacer click en splitBtn

  // BOTONES DE ACCIÓN
  safeAddEvent("recordBtn", "click", toggleRecording);
  safeAddEvent("startStudioBtn", "click", startStudioRecording);
  safeAddEvent("stopStudioBtn", "click", stopStudioRecording);
  safeAddEvent("whisperBtn", "click", generateLyricsWithWhisper);
  safeAddEvent("startKaraokeBtn", "click", toggleKaraokeRecording);
  safeAddEvent("stopKaraokeBtn", "click", stopKaraokeRecording);
  safeAddEvent("saveKaraokeBtn", "click", saveKaraokeToLibrary);
  safeAddEvent("retryKaraokeBtn", "click", retryKaraoke);
  safeAddEvent("splitBtn", "click", splitAudio);

  // CONFIGURACIÓN (API Keys)
  safeAddEvent("saveApiKeyBtn", "click", saveApiKey);
  safeAddEvent("showApiKeyBtn", "click", toggleApiKeyVisibility);
  safeAddEvent("saveLalalKeyBtn", "click", saveLalalKey);
  safeAddEvent("showLalalKeyBtn", "click", toggleLalalKeyVisibility);

  // INICIALIZADORES DE DATOS
  generateNotes();
  loadLibrary();
  loadApiKey();
  loadLalalKey();
});
// ==========================================
// NUEVA FUNCIÓN DE CONEXIÓN (PÉGALO AQUÍ)
// ==========================================
function enviarAKaraoke(urlInstrumental, textoLrc) {
    // 1. Guardamos los datos en las "cajas" globales que pusiste en la línea 1
    instrumentalUrlGlobal = urlInstrumental;
    letraLrcGlobal = textoLrc;

    // 2. Buscamos el cuadro de texto del Karaoke para poner la letra
    const lyricsInput = document.getElementById("karaokeLyricsInput");
    if (lyricsInput) {
        lyricsInput.value = textoLrc;
    }

    // 3. Saltamos a la pestaña de Karaoke
    if (typeof showTab === 'function') {
        showTab('karaoke');
    }

    alert("✨ ¡Pista y letra enviadas! Ya puedes iniciar el Karaoke.");
}

console.log("🏁 He llegado al final del archivo sin errores");
