// -------- NAVEGACIÓN --------
function showTab(tabId) {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.classList.remove("active");
  });
  document.getElementById(tabId).classList.add("active");
}

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
  const noteNames = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const select = document.getElementById("targetNote");

  for (let octave = 0; octave <= 8; octave++) {
    for (let i = 0; i < noteNames.length; i++) {
      const noteName = noteNames[i] + octave;
      const freq = 440 * Math.pow(2, (i + (octave - 4) * 12 - 9) / 12);
      const option = document.createElement("option");
      option.value = freq;
      option.textContent = noteName;
      if (noteName === "A4") option.selected = true;
      select.appendChild(option);
    }
  }
}

// -------- ESTUDIO --------
let mediaRecorder;
let recordedChunks = [];
let studioStream;

document.getElementById("audioFile").addEventListener("change", function(e) {
  const file = e.target.files[0];
  document.getElementById("player").src = URL.createObjectURL(file);
});

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
document.getElementById("lyricsFile").addEventListener("change", function(e) {
  const file = e.target.files[0];
  const reader = new FileReader();
  reader.onload = function(event) {
    document.getElementById("lyricsDisplay").innerText = event.target.result;
  };
  reader.readAsText(file);
});

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

document.getElementById("karaokeTrackFile").addEventListener("change", function(e) {
  const file = e.target.files[0];
  if (!file) return;
  document.getElementById("karaokeTrack").src = URL.createObjectURL(file);
  setKaraokeStatus("✅ Pista cargada — Carga la letra y presiona Iniciar");
});

document.getElementById("karaokeLyricsFile").addEventListener("change", function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(event) {
    processLyrics(event.target.result, file.name);
  };
  reader.readAsText(file);
});

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
  const apiKey = getApiKey();
  if (!apiKey) return;

  const trackFile = document.getElementById("karaokeTrackFile").files[0];
  if (!trackFile) {
    setWhisperStatus("⚠️ Primero carga una pista de audio", "error");
    return;
  }

  if (trackFile.size > 25 * 1024 * 1024) {
    setWhisperStatus("⚠️ El archivo supera los 25MB", "error");
    return;
  }

  const btn = document.getElementById("whisperBtn");
  btn.disabled = true;
  setWhisperStatus("⏳ Enviando audio a Whisper...", "loading");

  try {
    const formData = new FormData();
    formData.append("file", trackFile);
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "segment");

    setWhisperStatus("⏳ Transcribiendo... esto puede tardar unos segundos", "loading");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + apiKey },
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      setWhisperStatus("❌ Error: " + (error.error?.message || "Error desconocido"), "error");
      btn.disabled = false;
      return;
    }

    const data = await response.json();
    const lrc = convertToLRC(data.segments);

    karaokeIsTimed = true;
    karaokeLyricsData = parseLRC(lrc);

    setWhisperStatus(
      "✅ Letra generada con " + data.segments.length + " líneas — Lista para cantar",
      "success"
    );

    updateLyricsDisplay(0);
    document.getElementById("karaokeScreenBox").style.display = "block";

  } catch (err) {
    setWhisperStatus("❌ Error de conexión: " + err.message, "error");
  }

  btn.disabled = false;
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

// ======== EVENT LISTENERS ========
document.getElementById("btnAfinador").addEventListener("click",  () => showTab("afinador"));
document.getElementById("btnEstudio").addEventListener("click",   () => showTab("estudio"));
document.getElementById("btnBiblioteca").addEventListener("click",() => showTab("biblioteca"));
document.getElementById("btnKaraoke").addEventListener("click",   () => showTab("karaoke"));
document.getElementById("btnSplitter").addEventListener("click",  () => showTab("splitter"));
document.getElementById("btnConfig").addEventListener("click",    () => showTab("config"));

document.getElementById("recordBtn").addEventListener("click", toggleRecording);
document.getElementById("startStudioBtn").addEventListener("click", startStudioRecording);
document.getElementById("stopStudioBtn").addEventListener("click", stopStudioRecording);
document.getElementById("startKaraokeBtn").addEventListener("click", toggleKaraokeRecording);
document.getElementById("stopKaraokeBtn").addEventListener("click", stopKaraokeRecording);
document.getElementById("saveKaraokeBtn").addEventListener("click", saveKaraokeToLibrary);
document.getElementById("retryKaraokeBtn").addEventListener("click", retryKaraoke);
document.getElementById("saveApiKeyBtn").addEventListener("click", saveApiKey);
document.getElementById("showApiKeyBtn").addEventListener("click", toggleApiKeyVisibility);
document.getElementById("whisperBtn").addEventListener("click", generateLyricsWithWhisper);

// ======== INICIALIZAR ========
generateNotes();
loadLibrary();
loadApiKey();
